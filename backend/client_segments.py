"""Segmentos calculados de clientes para campañas y re-reserva.

Los segmentos se calculan al consultar (no se guardan), con datos que ya existen: visitas, ultima visita, cumpleaños,
no-show de clases grupales y membresia activa. Un cliente puede estar en varios segmentos. Para enviar una campaña se
sigue exigiendo ``accepts_marketing`` (el segmento solo informa cuantos de sus clientes lo aceptaron).
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Dict, List, Optional

from fastapi import APIRouter, Cookie, Header, HTTPException

HIGH_VALUE_VISITS = 8
RECURRING_VISITS = 3
BIRTHDAY_WINDOW_DAYS = 30

SEGMENTS = [
    {
        "key": "first_visit",
        "label": "Primera visita",
        "description": "Vinieron una sola vez: buen momento para invitarlos a volver.",
    },
    {"key": "recurring", "label": "Recurrentes", "description": f"{RECURRING_VISITS} o más visitas."},
    {"key": "inactive_30", "label": "Inactivos 30 días", "description": "Su última visita fue hace 30 a 59 días."},
    {"key": "inactive_60", "label": "Inactivos 60 días", "description": "Su última visita fue hace 60 a 89 días."},
    {"key": "inactive_90", "label": "Inactivos 90+ días", "description": "Su última visita fue hace 90 días o más."},
    {"key": "high_value", "label": "Alto valor", "description": f"{HIGH_VALUE_VISITS} o más visitas."},
    {
        "key": "birthday_soon",
        "label": "Cumpleaños próximo",
        "description": f"Cumplen años en los próximos {BIRTHDAY_WINDOW_DAYS} días.",
    },
    {"key": "no_show", "label": "No asistieron", "description": "Faltaron a una clase reservada."},
    {"key": "member", "label": "Miembros", "description": "Tienen una membresía activa."},
]
SEGMENT_KEYS = {s["key"] for s in SEGMENTS}


def _as_date(value) -> Optional[date]:
    if isinstance(value, datetime):
        return value.date()
    try:
        return date.fromisoformat(str(value)[:10])
    except (TypeError, ValueError):
        return None


def days_until_birthday(birthday, today: date) -> Optional[int]:
    parsed = _as_date(birthday)
    if not parsed:
        return None
    try:
        upcoming = date(today.year, parsed.month, parsed.day)
        if upcoming < today:
            upcoming = date(today.year + 1, parsed.month, parsed.day)
    except ValueError:  # 29 de febrero en año no bisiesto
        upcoming = date(today.year, 3, 1) if today <= date(today.year, 3, 1) else date(today.year + 1, 3, 1)
    return (upcoming - today).days


def segments_for_client(client: dict, today: date, no_show_ids: set, member_ids: set) -> List[str]:
    keys = []
    visits = int(client.get("total_visits") or 0)
    last = _as_date(client.get("last_visit"))
    if visits == 1:
        keys.append("first_visit")
    if visits >= RECURRING_VISITS:
        keys.append("recurring")
    if visits >= HIGH_VALUE_VISITS:
        keys.append("high_value")
    if last:
        idle = (today - last).days
        if 30 <= idle < 60:
            keys.append("inactive_30")
        elif 60 <= idle < 90:
            keys.append("inactive_60")
        elif idle >= 90:
            keys.append("inactive_90")
    until = days_until_birthday(client.get("birthday"), today)
    if until is not None and until <= BIRTHDAY_WINDOW_DAYS:
        keys.append("birthday_soon")
    if client.get("client_id") in no_show_ids:
        keys.append("no_show")
    if client.get("client_id") in member_ids:
        keys.append("member")
    return keys


def build_segment_router(db, get_current_user, require_management_role, resolve_team_organization):
    router = APIRouter()

    async def load(user, organization_id):
        require_management_role(user)
        org_id = await resolve_team_organization(user, organization_id)
        clients = await db.clients.find({"organization_id": org_id, "deletion_requested_at": None}, {"_id": 0}).to_list(
            50000
        )
        bookings = await db.class_bookings.find(
            {"organization_id": org_id, "no_show": True}, {"_id": 0, "client_id": 1}
        ).to_list(50000)
        members = await db.client_memberships.find(
            {"organization_id": org_id, "status": "active"}, {"_id": 0, "client_id": 1}
        ).to_list(50000)
        return clients, {b.get("client_id") for b in bookings}, {m.get("client_id") for m in members}

    def membership_map(clients, no_show_ids, member_ids) -> Dict[str, List[dict]]:
        today = datetime.now(timezone.utc).date()
        grouped: Dict[str, List[dict]] = {key: [] for key in SEGMENT_KEYS}
        for client in clients:
            for key in segments_for_client(client, today, no_show_ids, member_ids):
                grouped[key].append(client)
        return grouped

    @router.get("/marketing/segments", tags=["marketing"])
    async def list_segments(
        organization_id: Optional[str] = None,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        user = await get_current_user(authorization, session_token)
        grouped = membership_map(*await load(user, organization_id))
        return {
            "segments": [
                {
                    **segment,
                    "count": len(grouped[segment["key"]]),
                    "marketable_count": sum(1 for c in grouped[segment["key"]] if c.get("accepts_marketing")),
                }
                for segment in SEGMENTS
            ]
        }

    @router.get("/marketing/segments/{key}", tags=["marketing"])
    async def segment_clients(
        key: str,
        organization_id: Optional[str] = None,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        if key not in SEGMENT_KEYS:
            raise HTTPException(status_code=404, detail="Segmento no encontrado")
        user = await get_current_user(authorization, session_token)
        grouped = membership_map(*await load(user, organization_id))
        today = datetime.now(timezone.utc).date()
        rows = []
        for client in grouped[key]:
            last = _as_date(client.get("last_visit"))
            rows.append(
                {
                    "client_id": client["client_id"],
                    "name": client.get("name"),
                    "phone": client.get("phone"),
                    "email": client.get("email"),
                    "total_visits": int(client.get("total_visits") or 0),
                    "last_visit": client.get("last_visit"),
                    "days_since_visit": (today - last).days if last else None,
                    "accepts_marketing": bool(client.get("accepts_marketing")),
                }
            )
        rows.sort(key=lambda r: (not r["accepts_marketing"], r["name"] or ""))
        return {
            "key": key,
            "clients": rows,
            "count": len(rows),
            "marketable_count": sum(1 for r in rows if r["accepts_marketing"]),
        }

    return router
