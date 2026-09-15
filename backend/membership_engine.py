# NEXUS_GROUP_SERVICES_MEMBERSHIPS_V1
"""
Vencimiento de membresías de clases grupales (Fase 3 de servicios grupales).

Una membresía vencida no bloquea al cliente -- server.py ya recalcula el
estado "expired" al vuelo cada vez que se consulta (_get_client_membership_with_plan).
Este módulo solo se encarga de la parte que SÍ necesita un barrido periódico:
notificarle al cliente que venció, para que sepa que puede renovar o seguir
asistiendo pagando el día.

Idempotente por diseño: solo notifica memberships con status=="active" y
period_end vencido; al marcarlas "expired" en el mismo paso, una corrida
posterior nunca las vuelve a tocar.
"""
from __future__ import annotations

from datetime import datetime, timezone
from html import escape as html_escape

from appointment_email_templates import DEFAULT_ACCENT, render_email_shell
from email_service import email_service
from message_templates import get_or_seed_templates, render_template

_FALLBACK_SUBJECT = "Tu membresía {{nombre_plan}} venció"
_FALLBACK_BODY = (
    "Hola {{nombre_cliente}}, tu membresía {{nombre_plan}} en {{nombre_negocio}} venció el {{fecha_vencimiento}}. "
    "Puedes seguir reservando clases pagando el día, o renovar cuando quieras."
)


async def _notify_membership_expired(db, membership: dict, client: dict, plan: dict, org: dict):
    if not client.get("email"):
        return
    org_name = (org or {}).get("name") or "Nexus"
    try:
        templates = await get_or_seed_templates(db, membership["organization_id"])
        template = next((t for t in templates if t.get("purpose") == "membership_expired"), None)
    except Exception:
        template = None
    subject_raw = (template or {}).get("subject") or _FALLBACK_SUBJECT
    body_raw = (template or {}).get("body") or _FALLBACK_BODY
    context = {
        "nombre_cliente": client.get("name") or "cliente",
        "nombre_negocio": org_name,
        "nombre_plan": (plan or {}).get("name") or "tu plan",
        "fecha_vencimiento": membership.get("period_end") or "",
    }
    subject = render_template(subject_raw, context)
    body = render_template(body_raw, context)
    html_body = render_email_shell(
        organization_name=org_name,
        eyebrow="Membresía",
        title=subject,
        body_html=f'<p style="white-space:pre-wrap;line-height:1.6;color:#1F2937;">{html_escape(body)}</p>',
        accent_color=DEFAULT_ACCENT,
    )
    try:
        email_service._send_email(client["email"], subject, html_body, body)
    except Exception:
        pass


async def process_membership_expirations(db, *, at=None) -> dict:
    today = (at or datetime.now(timezone.utc)).date().isoformat()
    expired = await db.client_memberships.find(
        {"status": "active", "period_end": {"$lt": today}}, {"_id": 0}
    ).to_list(1000)
    notified = 0
    for membership in expired:
        await db.client_memberships.update_one(
            {"membership_id": membership["membership_id"], "status": "active"}, {"$set": {"status": "expired"}}
        )
        client = await db.clients.find_one({"client_id": membership["client_id"]}, {"_id": 0})
        plan = await db.membership_plans.find_one({"plan_id": membership["plan_id"]}, {"_id": 0})
        org = await db.organizations.find_one({"organization_id": membership["organization_id"]}, {"_id": 0})
        if client:
            await _notify_membership_expired(db, membership, client, plan or {}, org or {})
            notified += 1
    return {"expired": len(expired), "notified": notified}
