# NEXUS_CLASS_RECURRING_SCHEDULE_V1
"""
Generación de ClassSession a partir de un ClassScheduleTemplate.

Se llama dos veces: (a) una vez, inline, al crear/actualizar un template
(server.py) para que el manager vea las clases aparecer al instante, y
(b) una vez al día desde class_schedule_daemon.py para mantener la ventana
móvil de NEXUS_CLASS_SCHEDULE_HORIZON_DAYS (default 30) siempre llena.

Idempotente por diseño: busca por (template_id, date) antes de crear, así
que una fecha que el manager ya canceló a mano nunca se regenera -- es el
mecanismo de "saltar una sola ocurrencia" sin necesitar un modelo aparte.
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta, timezone

DEFAULT_HORIZON_DAYS = 30


def _nexus_weekday(value) -> int:
    # Mismo mapeo que server.py::_nexus_weekday (1=lunes...7=domingo,
    # ISO weekday ya usa esa convención).
    return value.isoweekday()


def _minutes(value: str) -> int:
    hour, minute = value.split(":")
    return int(hour) * 60 + int(minute)


async def _instructor_has_conflict(db, organization_id: str, barber_id: str, date_value: str, start_minutes: int, duration: int) -> bool:
    end_minutes = start_minutes + duration
    blocked_times = await db.blocked_times.find(
        {"organization_id": organization_id, "barber_id": barber_id, "date": date_value},
        {"_id": 0, "start_time": 1, "end_time": 1},
    ).to_list(1000)
    for item in blocked_times:
        try:
            block_start = _minutes(item["start_time"])
            block_end = _minutes(item["end_time"])
        except Exception:
            continue
        if block_start < end_minutes and start_minutes < block_end:
            return True
    return False


async def _notify_schedule_conflict(db, template: dict, date_value: str, service_name: str, barber_name: str):
    dedupe_key = f"class_schedule_conflict:{template['template_id']}:{date_value}"
    row = {
        "notification_id": f"snot_{uuid.uuid4().hex[:16]}",
        "organization_id": template["organization_id"],
        "event_type": "class_schedule_conflict",
        "severity": "warning",
        "title": "Clase sin instructor disponible",
        "message": (
            f"{barber_name} no está disponible el {date_value} {template['time']} para '{service_name}'. "
            "Asigna un sustituto en el horario recurrente o reprograma manualmente."
        ),
        "related_entity_type": "class_schedule_template",
        "related_entity_id": template["template_id"],
        "dedupe_key": dedupe_key,
        "created_by": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "read_by": [],
    }
    try:
        await db.subscription_notifications.insert_one(row)
    except Exception:
        pass  # ya se había avisado de este mismo conflicto (dedupe_key duplicado)


async def ensure_sessions_for_template(db, template: dict, *, horizon_days: int | None = None, today=None) -> int:
    if not template.get("active", True):
        return 0
    horizon_days = horizon_days or int(os.environ.get("NEXUS_CLASS_SCHEDULE_HORIZON_DAYS", DEFAULT_HORIZON_DAYS))
    today = today or datetime.now(timezone.utc).date()
    start_date = datetime.strptime(template["start_date"], "%Y-%m-%d").date()
    end_date = datetime.strptime(template["end_date"], "%Y-%m-%d").date() if template.get("end_date") else None

    service = await db.services.find_one({"service_id": template["service_id"]}, {"_id": 0, "name": 1, "duration": 1, "group_capacity": 1})
    if not service:
        return 0
    duration = int(service.get("duration") or 60)
    start_minutes = _minutes(template["time"])
    capacity = template.get("capacity") or service.get("group_capacity") or 2

    created = 0
    for offset in range(horizon_days):
        candidate = today + timedelta(days=offset)
        if candidate < start_date:
            continue
        if end_date and candidate > end_date:
            break
        if _nexus_weekday(candidate) not in template["days_of_week"]:
            continue

        date_str = candidate.isoformat()
        existing = await db.class_sessions.find_one({"template_id": template["template_id"], "date": date_str})
        if existing:
            continue  # ya generada (o ya cancelada a mano) -- no se regenera

        barber_id = template["barber_id"]
        substitute_applied = False
        original_barber_id = None

        if await _instructor_has_conflict(db, template["organization_id"], barber_id, date_str, start_minutes, duration):
            substitute_id = template.get("substitute_barber_id")
            if substitute_id and not await _instructor_has_conflict(
                db, template["organization_id"], substitute_id, date_str, start_minutes, duration
            ):
                original_barber_id = barber_id
                barber_id = substitute_id
                substitute_applied = True
            else:
                barber = await db.barbers.find_one({"barber_id": template["barber_id"]}, {"_id": 0, "display_name": 1, "name": 1})
                barber_name = (barber or {}).get("display_name") or (barber or {}).get("name") or "El instructor"
                await _notify_schedule_conflict(db, template, date_str, service.get("name") or "la clase", barber_name)
                continue  # no se genera esta fecha

        await db.class_sessions.insert_one(
            {
                "class_session_id": f"class_{uuid.uuid4().hex[:12]}",
                "organization_id": template["organization_id"],
                "service_id": template["service_id"],
                "barber_id": barber_id,
                "date": date_str,
                "time": template["time"],
                "capacity": capacity,
                "booked_count": 0,
                "status": "scheduled",
                "template_id": template["template_id"],
                "substitute_applied": substitute_applied,
                "original_barber_id": original_barber_id,
                "created_by": template["created_by"],
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        created += 1
    return created


async def process_class_schedule_generation(db, *, at=None) -> dict:
    templates = await db.class_schedule_templates.find({"active": True}, {"_id": 0}).to_list(10000)
    summary = {"templates": len(templates), "sessions_created": 0}
    for template in templates:
        try:
            summary["sessions_created"] += await ensure_sessions_for_template(db, template, today=at)
        except Exception as exc:
            print(f"class_schedule_generation_failed template_id={template.get('template_id')} diagnostic_code={type(exc).__name__}")
    print(
        "class_schedule_generation_summary "
        + " ".join(f"{key}={summary[key]}" for key in ("templates", "sessions_created"))
    )
    return summary
