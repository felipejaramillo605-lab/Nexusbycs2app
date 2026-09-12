# NEXUS_BIRTHDAY_REMINDER_DAEMON_V1
"""
Recordatorio de cumpleaños próximos, para el manager de cada organización.

Corre 1 vez al día por organización, pero -- igual que
low_stock_alerts.py -- el chequeo se distribuye a lo largo de una ventana
horaria (offset determinístico por organization_id) para no evaluar todas
las organizaciones en el mismo minuto.

Por cada cliente cuyo cumpleaños caiga exactamente a N días (default 7,
configurable por organización vía Organization.birthday_campaign.days_before
-- NEXUS_BIRTHDAY_CAMPAIGN_V1 -- o globalmente vía
NEXUS_BIRTHDAY_REMINDER_DAYS_BEFORE para orgs sin ese campo aún) se escribe
una notificación in-app (subscription_notifications,
event_type="birthday_upcoming"), mismo patrón que
nexus_ai._send_manager_reminder.

Si además Organization.birthday_campaign.enabled es true, también se genera
un código de recompensa canjeable (birthday_rewards.create_birthday_reward)
y su código se incluye en la notificación para que el manager lo comparta
manualmente -- el envío real por correo/WhatsApp con plantilla es Fase 3.
"""
from __future__ import annotations

import hashlib
import os
import uuid
from datetime import datetime, timezone

from birthday_rewards import create_birthday_reward

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
    default_days_before = int(os.environ.get("NEXUS_BIRTHDAY_REMINDER_DAYS_BEFORE", DEFAULT_DAYS_BEFORE))
    window_start_hour = int(os.environ.get("NEXUS_BIRTHDAY_ALERT_WINDOW_START_HOUR", DEFAULT_WINDOW_START_HOUR))
    window_minutes = int(os.environ.get("NEXUS_BIRTHDAY_ALERT_WINDOW_MINUTES", DEFAULT_WINDOW_MINUTES))
    period = now.strftime("%Y-%m-%d")
    summary = {"period": period, "eligible_orgs": 0, "reminders_sent": 0, "rewards_issued": 0, "skipped": 0, "empty": 0}

    minute_of_window = (now.hour - window_start_hour) * 60 + now.minute
    if minute_of_window < 0:
        return summary

    orgs = await db.organizations.find(
        {"notification_settings.birthday_reminders_enabled": {"$ne": False}},
        {"_id": 0, "organization_id": 1, "name": 1, "birthday_campaign": 1},
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

        campaign = org.get("birthday_campaign") or {}
        days_before = int(campaign.get("days_before") or default_days_before)

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

            message = f"{client['name']} cumple años en {days_before} día(s)."
            if campaign.get("enabled"):
                reward = await create_birthday_reward(
                    db,
                    organization_id=org_id,
                    client_id=client["client_id"],
                    campaign=campaign,
                    birthday_year=today.year,
                    now=now,
                )
                if reward:
                    summary["rewards_issued"] += 1
                    message += f" Código de regalo listo para compartir: {reward['code']}."
            else:
                message += " Es buen momento para enviarle un saludo o una promoción."

            row = {
                "notification_id": f"snot_{uuid.uuid4().hex[:16]}",
                "organization_id": org_id,
                "event_type": "birthday_upcoming",
                "severity": "info",
                "title": "Cumpleaños próximo",
                "message": message,
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
            for key in ("period", "eligible_orgs", "reminders_sent", "rewards_issued", "skipped", "empty")
        )
    )
    return summary
