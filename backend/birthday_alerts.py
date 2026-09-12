# NEXUS_BIRTHDAY_REMINDER_DAEMON_V1
"""
Recordatorio de cumpleaños próximos, para el manager de cada organización.

Corre 1 vez al día por organización, pero -- igual que
low_stock_alerts.py -- el chequeo se distribuye a lo largo de una ventana
horaria (offset determinístico por organization_id) para no evaluar todas
las organizaciones en el mismo minuto.

Por cada cliente cuyo cumpleaños caiga exactamente a N días (configurable,
default 7) se escribe una notificación in-app (subscription_notifications,
event_type="birthday_upcoming"), mismo patrón que
nexus_ai._send_manager_reminder. No hay envío de correo/WhatsApp al cliente
todavía -- eso es Fase 2 (recompensa + plantilla), este daemon solo avisa
al manager.
"""
from __future__ import annotations

import hashlib
import os
import uuid
from datetime import datetime, timezone

DEFAULT_DAYS_BEFORE = 7
DEFAULT_WINDOW_START_HOUR = 8
DEFAULT_WINDOW_MINUTES = 600  # 8:00am -> 6:00pm


def _org_offset_minutes(organization_id: str, window_minutes: int) -> int:
    digest = hashlib.sha256(organization_id.encode()).hexdigest()
    return int(digest, 16) % max(window_minutes, 1)


async def ensure_birthday_alert_indexes(db):
    await db.birthday_alert_runs.create_index(
        [("organization_id", 1), ("period", 1)], unique=True, name="birthday_alert_run_period_unique"
    )


def _days_until_next_birthday(birthday: str, today) -> int | None:
    try:
        month, day = (int(part) for part in birthday.split("-")[1:])
        next_birthday = datetime(today.year, month, day).date()
        if next_birthday < today:
            next_birthday = datetime(today.year + 1, month, day).date()
    except Exception:
        return None
    return (next_birthday - today).days


async def process_birthday_alerts(db, *, at=None):
    now = at or datetime.now(timezone.utc)
    days_before = int(os.environ.get("NEXUS_BIRTHDAY_REMINDER_DAYS_BEFORE", DEFAULT_DAYS_BEFORE))
    window_start_hour = int(os.environ.get("NEXUS_BIRTHDAY_ALERT_WINDOW_START_HOUR", DEFAULT_WINDOW_START_HOUR))
    window_minutes = int(os.environ.get("NEXUS_BIRTHDAY_ALERT_WINDOW_MINUTES", DEFAULT_WINDOW_MINUTES))
    period = now.strftime("%Y-%m-%d")
    summary = {"period": period, "eligible_orgs": 0, "reminders_sent": 0, "skipped": 0, "empty": 0}

    minute_of_window = (now.hour - window_start_hour) * 60 + now.minute
    if minute_of_window < 0:
        return summary

    orgs = await db.organizations.find(
        {"notification_settings.birthday_reminders_enabled": {"$ne": False}},
        {"_id": 0, "organization_id": 1, "name": 1},
    ).to_list(10000)

    today = now.date()
    for org in orgs:
        org_id = org["organization_id"]
        offset = _org_offset_minutes(org_id, window_minutes)
        if minute_of_window < offset:
            continue  # todavía no le toca hoy, dentro de la ventana horaria
        summary["eligible_orgs"] += 1
        try:
            await db.birthday_alert_runs.insert_one(
                {"organization_id": org_id, "period": period, "claimed_at": now.isoformat()}
            )
        except Exception:
            summary["skipped"] += 1
            continue  # ya se evaluó esta organización hoy

        clients = await db.clients.find(
            {"organization_id": org_id, "birthday": {"$type": "string", "$ne": None}},
            {"_id": 0, "client_id": 1, "name": 1, "birthday": 1},
        ).to_list(10000)

        due_today = []
        for client in clients:
            days_until = _days_until_next_birthday(client["birthday"], today)
            if days_until == days_before:
                due_today.append(client)

        if not due_today:
            summary["empty"] += 1
            continue

        for client in due_today:
            month, day = client["birthday"].split("-")[1:]
            dedupe_key = f"birthday_reminder:{client['client_id']}:{today.year}-{month}-{day}"
            row = {
                "notification_id": f"snot_{uuid.uuid4().hex[:16]}",
                "organization_id": org_id,
                "event_type": "birthday_upcoming",
                "severity": "info",
                "title": "Cumpleaños próximo",
                "message": f"{client['name']} cumple años en {days_before} día(s). Es buen momento para enviarle un saludo o una promoción.",
                "related_entity_type": "client",
                "related_entity_id": client["client_id"],
                "dedupe_key": dedupe_key,
                "created_by": None,
                "created_at": now.isoformat(),
                "read_by": [],
            }
            try:
                await db.subscription_notifications.insert_one(row)
                summary["reminders_sent"] += 1
            except Exception:
                continue  # ya se había enviado este recordatorio (dedupe_key duplicado)

    print(
        "birthday_alert_cycle_summary "
        + " ".join(
            f"{key}={summary[key]}"
            for key in ("period", "eligible_orgs", "reminders_sent", "skipped", "empty")
        )
    )
    return summary
