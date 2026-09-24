# NEXUS_AI_V1
"""
Nexus AI: business copilot for OWNER/MANAGER (never STAFF), gated by an
organization-level entitlement (nexus_ai_contracted + nexus_ai_enabled).

Data access is restricted to a fixed set of read-only "tools" that always take
organization_id from the authenticated session (never from the model or the
client payload) -- the model can never choose which tenant to query.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Cookie, Header, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from emergentintegrations.llm.chat import (
    LlmChat,
    StreamDone,
    TextDelta,
    ToolCallReady,
    UserMessage,
)

from inventory_reorder import load_suggestions

EMERGENT_LLM_KEY = None  # set lazily from os.environ on first use (loaded after dotenv)


def _key():
    import os

    global EMERGENT_LLM_KEY
    if EMERGENT_LLM_KEY is None:
        EMERGENT_LLM_KEY = os.environ["EMERGENT_LLM_KEY"]
    return EMERGENT_LLM_KEY


# In-memory session cache (single-process deployment). Full transcript is
# durably stored in Mongo regardless -- this cache only preserves the model's
# live conversational context between turns without reloading it every call.
_ACTIVE_CHATS: dict = {}

GUIDE_TOPICS = [
    {"id": "dashboard", "title": "Inicio", "keywords": ["inicio", "dashboard", "resumen"]},
    {"id": "agenda", "title": "Agenda y citas", "keywords": ["cita", "agenda", "reserva", "reservar", "calendario"]},
    {"id": "clientes", "title": "Clientes", "keywords": ["cliente"]},
    {"id": "servicios", "title": "Servicios", "keywords": ["servicio", "precio", "duracion", "duración"]},
    {"id": "equipo", "title": "Equipo", "keywords": ["equipo", "profesional", "staff", "barbero"]},
    {"id": "ingresos", "title": "Ingresos", "keywords": ["ingreso", "finanza", "venta"]},
]

TOOL_DEFINITIONS = [
    {"type": "function", "function": {"name": "get_top_customers", "description": "Clientes más frecuentes (más visitas) de esta organización.", "parameters": {"type": "object", "properties": {"limit": {"type": "integer", "description": "Cantidad de clientes a devolver (default 5)"}}}}},
    {"type": "function", "function": {"name": "get_inactive_customers", "description": "Clientes que no han vuelto hace más de N días.", "parameters": {"type": "object", "properties": {"min_days": {"type": "integer"}, "limit": {"type": "integer"}}}}},
    {"type": "function", "function": {"name": "get_customer_retention_risk", "description": "Detecta clientes con posible riesgo de no regresar, comparando su intervalo habitual de visitas contra el tiempo que llevan sin reservar.", "parameters": {"type": "object", "properties": {"limit": {"type": "integer"}}}}},
    {"type": "function", "function": {"name": "get_upcoming_birthdays", "description": "Clientes cuyo cumpleaños cae dentro de los próximos N días.", "parameters": {"type": "object", "properties": {"days": {"type": "integer"}}}}},
    {"type": "function", "function": {"name": "get_top_services", "description": "Servicios más solicitados/con más ingresos en un período reciente.", "parameters": {"type": "object", "properties": {"days": {"type": "integer"}, "limit": {"type": "integer"}}}}},
    {"type": "function", "function": {"name": "get_inventory_alerts", "description": "Productos/insumos con bajo stock que necesitan reabastecimiento.", "parameters": {"type": "object", "properties": {}}}},
    {"type": "function", "function": {"name": "get_revenue_summary", "description": "Resumen financiero (ingresos, comisiones, comparación con el período anterior). Solo para Owner/Manager.", "parameters": {"type": "object", "properties": {"days": {"type": "integer"}}}}},
    {"type": "function", "function": {"name": "get_staff_performance", "description": "Desempeño de cada profesional: reservas, ingresos generados y reseña promedio.", "parameters": {"type": "object", "properties": {"days": {"type": "integer"}, "limit": {"type": "integer"}}}}},
    {"type": "function", "function": {"name": "get_active_campaigns", "description": "Campañas de marketing activas o recientes.", "parameters": {"type": "object", "properties": {}}}},
    {"type": "function", "function": {"name": "search_guides", "description": "Busca en las guías de uso de Nexus (cómo usar una función de la app).", "parameters": {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]}}},
    {"type": "function", "function": {"name": "send_manager_reminder", "description": "Crea un recordatorio para el equipo de ESTA organización, visible en la campanita de notificaciones de la app. Úsala solo cuando el usuario pida explícitamente que le recuerdes algo a su equipo/manager, nunca por iniciativa propia.", "parameters": {"type": "object", "properties": {"title": {"type": "string", "description": "Título corto del recordatorio (máx. 120 caracteres)"}, "message": {"type": "string", "description": "Detalle del recordatorio (máx. 500 caracteres)"}}, "required": ["title", "message"]}}},
]


def _iso_to_dt(value):
    if not value:
        return None
    try:
        if isinstance(value, datetime):
            return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except Exception:
        return None


async def _get_top_customers(db, org, limit=5, **_):
    limit = max(1, min(int(limit or 5), 20))
    clients = await db.clients.find(
        {"organization_id": org}, {"_id": 0, "name": 1, "total_visits": 1, "loyalty_points": 1, "last_visit": 1}
    ).sort("total_visits", -1).limit(limit).to_list(limit)
    return {"clients": clients}


async def _get_inactive_customers(db, org, min_days=45, limit=10, **_):
    min_days = max(1, int(min_days or 45))
    limit = max(1, min(int(limit or 10), 30))
    now = datetime.now(timezone.utc)
    clients = await db.clients.find(
        {"organization_id": org}, {"_id": 0, "name": 1, "total_visits": 1, "last_visit": 1}
    ).to_list(10000)
    out = []
    for c in clients:
        last = _iso_to_dt(c.get("last_visit"))
        if not last:
            continue
        days = (now - last).days
        if days >= min_days:
            out.append({"name": c["name"], "total_visits": c.get("total_visits", 0), "days_since_last_visit": days})
    out.sort(key=lambda x: -x["days_since_last_visit"])
    return {"clients": out[:limit]}


async def _get_customer_retention_risk(db, org, limit=10, **_):
    limit = max(1, min(int(limit or 10), 30))
    now = datetime.now(timezone.utc)
    clients = await db.clients.find(
        {"organization_id": org, "total_visits": {"$gte": 2}},
        {"_id": 0, "name": 1, "total_visits": 1, "last_visit": 1, "created_at": 1},
    ).to_list(10000)
    out = []
    for c in clients:
        last, first = _iso_to_dt(c.get("last_visit")), _iso_to_dt(c.get("created_at"))
        if not last or not first:
            continue
        visits = c["total_visits"]
        avg_interval = max((last - first).days, 1) / max(visits - 1, 1)
        gap = (now - last).days
        if gap > avg_interval * 1.4 + 7:
            out.append({
                "name": c["name"],
                "days_since_last_visit": gap,
                "usual_interval_days": round(avg_interval, 1),
                "risk_reason": f"Lleva {gap} días sin reservar, {round(gap - avg_interval)} más de lo habitual (~{round(avg_interval)} días).",
            })
    out.sort(key=lambda x: -x["days_since_last_visit"])
    return {"clients_at_risk": out[:limit]}


async def _get_upcoming_birthdays(db, org, days=30, **_):
    days = max(1, min(int(days or 30), 365))
    today = datetime.now(timezone.utc).date()
    clients = await db.clients.find(
        {"organization_id": org, "birthday": {"$type": "string", "$ne": None}}, {"_id": 0, "name": 1, "birthday": 1}
    ).to_list(10000)
    out = []
    for c in clients:
        try:
            month, day = (int(p) for p in c["birthday"].split("-")[1:])
            next_bday = datetime(today.year, month, day).date()
            if next_bday < today:
                next_bday = datetime(today.year + 1, month, day).date()
        except Exception:
            continue
        days_until = (next_bday - today).days
        if days_until <= days:
            out.append({"name": c["name"], "days_until": days_until})
    out.sort(key=lambda x: x["days_until"])
    return {"upcoming_birthdays": out}


async def _get_top_services(db, org, days=90, limit=5, **_):
    days = max(1, min(int(days or 90), 365))
    limit = max(1, min(int(limit or 5), 20))
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    pipeline = [
        {"$match": {"organization_id": org, "status": "confirmed", "created_at": {"$gte": since}}},
        {"$group": {"_id": "$service_id", "name": {"$first": "$service_name_snapshot"}, "bookings": {"$sum": 1}, "revenue": {"$sum": "$net_service_amount"}}},
        {"$sort": {"bookings": -1}},
        {"$limit": limit},
    ]
    rows = await db.transactions.aggregate(pipeline).to_list(limit)
    return {"top_services": [{"name": r.get("name"), "bookings": r["bookings"], "revenue": round(r.get("revenue", 0) or 0, 2)} for r in rows]}


async def _get_inventory_alerts(db, org, **_):
    alerts = await load_suggestions(db, org)
    return {"low_stock_items": [{"name": a["name"], "quantity": a["quantity"], "min_stock": a["min_stock"], "severity": a["severity"]} for a in alerts]}


async def _get_revenue_summary(db, org, days=30, **_):
    days = max(1, min(int(days or 30), 365))
    now = datetime.now(timezone.utc)
    since, prev_since = (now - timedelta(days=days)).isoformat(), (now - timedelta(days=days * 2)).isoformat()
    current = await db.transactions.find({"organization_id": org, "status": "confirmed", "created_at": {"$gte": since}}, {"_id": 0, "total_received": 1, "staff_commission_amount": 1}).to_list(100000)
    previous = await db.transactions.find({"organization_id": org, "status": "confirmed", "created_at": {"$gte": prev_since, "$lt": since}}, {"_id": 0, "total_received": 1}).to_list(100000)
    total = round(sum(t.get("total_received", 0) or 0 for t in current), 2)
    prev_total = round(sum(t.get("total_received", 0) or 0 for t in previous), 2)
    change_pct = round((total - prev_total) / prev_total * 100, 1) if prev_total else None
    return {
        "period_days": days,
        "total_received": total,
        "transaction_count": len(current),
        "total_staff_commissions": round(sum(t.get("staff_commission_amount", 0) or 0 for t in current), 2),
        "previous_period_total_received": prev_total,
        "change_pct_vs_previous_period": change_pct,
    }


async def _get_staff_performance(db, org, days=90, limit=10, **_):
    days = max(1, min(int(days or 90), 365))
    limit = max(1, min(int(limit or 10), 30))
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    pipeline = [
        {"$match": {"organization_id": org, "status": "confirmed", "created_at": {"$gte": since}}},
        {"$group": {"_id": "$barber_id", "name": {"$first": "$barber_name_snapshot"}, "bookings": {"$sum": 1}, "revenue": {"$sum": "$net_service_amount"}}},
        {"$sort": {"revenue": -1}},
        {"$limit": limit},
    ]
    rows = await db.transactions.aggregate(pipeline).to_list(limit)
    out = []
    for r in rows:
        reviews = await db.internal_reviews.find({"organization_id": org, "barber_id": r["_id"]}, {"_id": 0, "professional_rating": 1}).to_list(5000)
        avg = round(sum(x["professional_rating"] for x in reviews) / len(reviews), 2) if reviews else None
        out.append({"name": r.get("name"), "bookings": r["bookings"], "revenue": round(r.get("revenue", 0) or 0, 2), "average_rating": avg, "total_reviews": len(reviews)})
    return {"staff_performance": out}


async def _get_active_campaigns(db, org, **_):
    return {"note": "Nexus todavía no guarda las campañas de Marketing como registros históricos; se envían directamente y no quedan almacenadas. No tengo un historial de campañas para consultar."}


async def _search_guides(db, org, query="", **_):
    q = (query or "").lower()
    matches = [t for t in GUIDE_TOPICS if any(k in q for k in t["keywords"])]
    return {"guides": [{"title": m["title"], "route": "/manager/guia"} for m in matches]}


async def _send_manager_reminder(db, org, user_id=None, title="", message="", **_):
    title = (title or "").strip()[:120]
    message = (message or "").strip()[:500]
    if not title or not message:
        return {"error": "El recordatorio necesita un título y un mensaje."}
    row = {
        "notification_id": f"snot_{uuid.uuid4().hex[:16]}",
        "organization_id": org,
        "event_type": "ai_reminder",
        "severity": "info",
        "title": title,
        "message": message,
        "created_by": user_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "read_by": [],
    }
    await db.subscription_notifications.insert_one(row)
    return {"ok": True, "notification_id": row["notification_id"]}


TOOL_DISPATCH = {
    "get_top_customers": _get_top_customers,
    "get_inactive_customers": _get_inactive_customers,
    "get_customer_retention_risk": _get_customer_retention_risk,
    "get_upcoming_birthdays": _get_upcoming_birthdays,
    "get_top_services": _get_top_services,
    "get_inventory_alerts": _get_inventory_alerts,
    "get_revenue_summary": _get_revenue_summary,
    "get_staff_performance": _get_staff_performance,
    "get_active_campaigns": _get_active_campaigns,
    "search_guides": _search_guides,
    "send_manager_reminder": _send_manager_reminder,
}


async def _dispatch_tool(db, org, name, arguments, user_id=None):
    fn = TOOL_DISPATCH.get(name)
    if not fn:
        return {"error": f"Herramienta desconocida: {name}"}
    try:
        return await fn(db, org, user_id=user_id, **(arguments or {}))
    except Exception as exc:
        print(f"nexus_ai_tool_failed tool={name} diagnostic_code={type(exc).__name__}")
        return {"error": "No fue posible consultar esa información en este momento."}


SYSTEM_MESSAGE_TEMPLATE = """Eres Nexus AI, el copiloto de negocio de "{org_name}" ({vertical}) dentro de Nexus by CS2.

Reglas estrictas:
- SOLO puedes hablar de datos de ESTA organización. Usa siempre las herramientas provistas para obtener cifras reales -- nunca inventes clientes, ingresos, servicios, reseñas ni porcentajes.
- Si una herramienta no tiene suficiente información para responder, dilo explícitamente: "No tengo suficiente información registrada en Nexus para calcularlo." Nunca completes el vacío con una suposición.
- Cuando detectes clientes en riesgo de no volver, usa lenguaje prudente ("muestra señales de riesgo"), nunca una afirmación determinista.
- Cuando sea relevante, sugiere una acción concreta dentro de Nexus: crear una campaña desde Marketing, revisar la Guía (/manager/guia), o generar una orden de compra desde Inventario.
- También puedes explicar cómo usar Nexus (crear un profesional, un servicio, etc.) usando la herramienta search_guides.
- Puedes crear un recordatorio en la campanita de notificaciones con send_manager_reminder, pero SOLO cuando el usuario te lo pida explícitamente (ej. "recuérdale a mi equipo que..."). Nunca la uses por iniciativa propia, y nunca la uses más de una vez para el mismo pedido. Confirma al usuario cuando el recordatorio quedó creado.
- Responde siempre en español, con un tono cercano, profesional y conciso (evita párrafos largos innecesarios).
- Hoy es {today}.
"""

VERTICAL_LABELS = {"barbershop": "barbería", "hair_salon": "peluquería", "nail_spa": "spa de uñas", "lash_spa": "spa de pestañas", "beauty_salon": "salón de belleza"}


def _get_or_create_chat(conversation_id, org):
    chat = _ACTIVE_CHATS.get(conversation_id)
    if chat is None:
        system_message = SYSTEM_MESSAGE_TEMPLATE.format(
            org_name=org.get("name") or "tu negocio",
            vertical=VERTICAL_LABELS.get(org.get("business_type"), "negocio de belleza"),
            today=datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        )
        chat = (
            LlmChat(api_key=_key(), session_id=conversation_id, system_message=system_message)
            .with_model("gemini", "gemini-3-flash-preview")
            .with_tools(TOOL_DEFINITIONS, tool_choice="auto")
        )
        _ACTIVE_CHATS[conversation_id] = chat
    return chat


class NexusAiEntitlementUpdate(BaseModel):
    contracted: Optional[bool] = None
    enabled: Optional[bool] = None


class NexusAiMessageIn(BaseModel):
    message: str


def build_nexus_ai_router(db, get_current_user, require_management_role, resolve_team_organization):
    router = APIRouter()

    def _deny_staff(user):
        if user.role not in ("owner", "manager", "admin") or user.access_status != "approved":
            raise HTTPException(status_code=403, detail="Nexus AI no está disponible para tu rol")

    async def _entitled_org(user, organization_id):
        _deny_staff(user)
        org_id = await resolve_team_organization(user, organization_id)
        org = await db.organizations.find_one({"organization_id": org_id}, {"_id": 0})
        if not org or not (org.get("nexus_ai_contracted") and org.get("nexus_ai_enabled")):
            raise HTTPException(status_code=403, detail={"code": "nexus_ai_not_contracted", "message": "Nexus AI no contratado"})
        return org_id, org

    @router.get("/nexus-ai/status")
    async def status(organization_id: Optional[str] = None, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
        user = await get_current_user(authorization, session_token)
        _deny_staff(user)
        org_id = await resolve_team_organization(user, organization_id)
        org = await db.organizations.find_one({"organization_id": org_id}, {"_id": 0, "nexus_ai_contracted": 1, "nexus_ai_enabled": 1}) or {}
        return {"contracted": bool(org.get("nexus_ai_contracted")), "enabled": bool(org.get("nexus_ai_enabled"))}

    @router.put("/owner/nexus-ai/{organization_id}", tags=["owner"])
    async def set_entitlement(organization_id: str, data: NexusAiEntitlementUpdate, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
        # Retain the route during the compatibility window, but fail closed. This
        # legacy endpoint independently changed Nexus AI flags and would bypass the
        # unified Premium package, paid-manual-invoice check, and capability ledger.
        user = await get_current_user(authorization, session_token)
        if user.role != "owner" or user.access_status != "approved":
            raise HTTPException(status_code=403, detail="Approved Owner access required")
        raise HTTPException(
            status_code=410,
            detail="Nexus AI entitlement is managed with the Premium package workflow",
        )

    @router.get("/nexus-ai/conversations")
    async def list_conversations(organization_id: Optional[str] = None, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
        user = await get_current_user(authorization, session_token)
        org_id, _ = await _entitled_org(user, organization_id)
        return await db.nexus_ai_conversations.find({"organization_id": org_id, "user_id": user.user_id}, {"_id": 0}).sort("updated_at", -1).to_list(200)

    @router.post("/nexus-ai/conversations")
    async def create_conversation(organization_id: Optional[str] = None, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
        user = await get_current_user(authorization, session_token)
        org_id, _ = await _entitled_org(user, organization_id)
        now = datetime.now(timezone.utc).isoformat()
        conv = {"conversation_id": f"nxc_{uuid.uuid4().hex[:12]}", "organization_id": org_id, "user_id": user.user_id, "title": "Nueva conversación", "created_at": now, "updated_at": now}
        await db.nexus_ai_conversations.insert_one(conv.copy())
        return conv

    @router.get("/nexus-ai/conversations/{conversation_id}/messages")
    async def list_messages(conversation_id: str, organization_id: Optional[str] = None, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
        user = await get_current_user(authorization, session_token)
        org_id, _ = await _entitled_org(user, organization_id)
        conv = await db.nexus_ai_conversations.find_one({"conversation_id": conversation_id, "organization_id": org_id, "user_id": user.user_id})
        if not conv:
            raise HTTPException(status_code=404, detail="Conversation not found")
        return await db.nexus_ai_messages.find({"conversation_id": conversation_id, "organization_id": org_id}, {"_id": 0}).sort("created_at", 1).to_list(500)

    @router.post("/nexus-ai/conversations/{conversation_id}/messages")
    async def send_message(conversation_id: str, data: NexusAiMessageIn, organization_id: Optional[str] = None, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
        user = await get_current_user(authorization, session_token)
        org_id, org = await _entitled_org(user, organization_id)
        conv = await db.nexus_ai_conversations.find_one({"conversation_id": conversation_id, "organization_id": org_id, "user_id": user.user_id})
        if not conv:
            raise HTTPException(status_code=404, detail="Conversation not found")
        user_text = data.message.strip()[:2000]
        if not user_text:
            raise HTTPException(status_code=400, detail="Message is required")
        now = datetime.now(timezone.utc).isoformat()
        await db.nexus_ai_messages.insert_one({"message_id": f"nxm_{uuid.uuid4().hex[:12]}", "conversation_id": conversation_id, "organization_id": org_id, "role": "user", "content": user_text, "created_at": now})

        async def event_generator():
            chat = _get_or_create_chat(conversation_id, org)
            full_text = ""
            user_msg = UserMessage(text=user_text)
            try:
                while True:
                    pending = []
                    async for ev in chat.stream_message(user_msg):
                        if isinstance(ev, TextDelta):
                            full_text += ev.content
                            yield f"data: {json.dumps({'delta': ev.content})}\n\n"
                        elif isinstance(ev, ToolCallReady):
                            pending.append(ev.tool_call)
                            yield f"data: {json.dumps({'tool_call': ev.tool_call.name})}\n\n"
                        elif isinstance(ev, StreamDone):
                            break
                    if not pending:
                        break
                    for tc in pending:
                        result = await _dispatch_tool(db, org_id, tc.name, tc.arguments or {}, user_id=user.user_id)
                        chat.add_tool_result(tc.id, json.dumps(result, default=str, ensure_ascii=False))
                    user_msg = None
            except Exception as exc:
                print(f"nexus_ai_stream_failed diagnostic_code={type(exc).__name__}")
                yield f"data: {json.dumps({'error': 'No fue posible generar la respuesta. Intenta de nuevo.'})}\n\n"

            final_text = full_text.strip() or "No tengo suficiente información registrada en Nexus para responder eso."
            finished_at = datetime.now(timezone.utc).isoformat()
            await db.nexus_ai_messages.insert_one({"message_id": f"nxm_{uuid.uuid4().hex[:12]}", "conversation_id": conversation_id, "organization_id": org_id, "role": "assistant", "content": final_text, "created_at": finished_at})
            new_title = user_text[:60] if conv.get("title") == "Nueva conversación" else conv.get("title")
            await db.nexus_ai_conversations.update_one({"conversation_id": conversation_id}, {"$set": {"updated_at": finished_at, "title": new_title}})
            yield f"data: {json.dumps({'done': True})}\n\n"

        return StreamingResponse(event_generator(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

    return router
