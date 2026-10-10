# NEXUS_LOW_STOCK_ALERT_DAEMON_V1
"""
Alerta mensual de bajo stock por organización.

Se ejecuta 1 vez al mes (día configurable) por organización, pero el envío se
distribuye a lo largo de una ventana horaria (offset determinístico por
organization_id) para no disparar todos los emails/WhatsApp al mismo minuto.

Canales:
- Email: real, vía email_service (SMTP ya configurado).
- WhatsApp: real vía whatsapp_service.py (WhatsApp Cloud API) una vez estén
  configuradas WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID y
  WHATSAPP_GENERIC_TEMPLATE_NAME; mockeado (registrado en
  whatsapp_mock_outbox) mientras falte cualquiera de las tres. No hay nada
  que cambiar aquí para pasar de un modo a otro.
"""
from __future__ import annotations

import hashlib
import os
from datetime import datetime, timezone

from inventory_reorder import load_suggestions
from email_service import email_service
from premium_messaging import organization_has_premium, whatsapp_setting_enabled
from whatsapp_service import send_whatsapp_message

DEFAULT_SEND_DAY = 1
DEFAULT_WINDOW_START_HOUR = 8
DEFAULT_WINDOW_MINUTES = 600  # 8:00am -> 6:00pm


def _org_offset_minutes(organization_id: str, window_minutes: int) -> int:
    digest = hashlib.sha256(organization_id.encode()).hexdigest()
    return int(digest, 16) % max(window_minutes, 1)


async def ensure_low_stock_alert_indexes(db):
    await db.low_stock_alert_runs.create_index(
        [("organization_id", 1), ("period", 1)], unique=True, name="low_stock_alert_run_period_unique"
    )


async def process_low_stock_alerts(db, *, at=None):
    now = at or datetime.now(timezone.utc)
    send_day = int(os.environ.get("LOW_STOCK_ALERT_DAY", DEFAULT_SEND_DAY))
    window_start_hour = int(os.environ.get("LOW_STOCK_ALERT_WINDOW_START_HOUR", DEFAULT_WINDOW_START_HOUR))
    window_minutes = int(os.environ.get("LOW_STOCK_ALERT_WINDOW_MINUTES", DEFAULT_WINDOW_MINUTES))
    period = now.strftime("%Y-%m")
    summary = {"period": period, "eligible_orgs": 0, "sent_email": 0, "sent_whatsapp": 0, "skipped": 0, "empty": 0}

    if now.day != send_day:
        return summary

    minute_of_window = (now.hour - window_start_hour) * 60 + now.minute
    if minute_of_window < 0:
        return summary

    orgs = await db.organizations.find(
        {
            "$or": [
                {"notification_settings.low_stock_alert_enabled": True},
                {"notification_settings.low_stock_alert_whatsapp_enabled": True},
            ],
            "deleted_at": None,
        },
        {"_id": 0, "organization_id": 1, "name": 1, "notification_settings": 1},
    ).to_list(10000)

    for org in orgs:
        org_id = org["organization_id"]
        offset = _org_offset_minutes(org_id, window_minutes)
        if minute_of_window < offset:
            continue  # todavía no le toca hoy, dentro de la ventana horaria
        summary["eligible_orgs"] += 1
        try:
            await db.low_stock_alert_runs.insert_one(
                {"organization_id": org_id, "period": period, "claimed_at": now.isoformat()}
            )
        except Exception:
            summary["skipped"] += 1
            continue  # ya se envió (o se intentó) esta organización este período

        settings = org.get("notification_settings") or {}
        email_enabled = bool(settings.get("low_stock_alert_enabled"))
        whatsapp_enabled = bool(settings.get("low_stock_alert_whatsapp_enabled"))
        try:
            alerts = await load_suggestions(db, org_id)
        except Exception as exc:
            print(f"low_stock_alert_load_failed organization_id={org_id} diagnostic_code={type(exc).__name__}")
            continue
        if not alerts:
            summary["empty"] += 1
            continue

        recipient = await db.users.find_one(
            {
                "organization_id": org_id,
                "role": {"$in": ["owner", "manager", "admin"]},
                "access_status": "approved",
                "active": {"$ne": False},
                "deleted_at": {"$exists": False},
            },
            {"_id": 0, "email": 1, "phone": 1},
            sort=[("role", 1), ("created_at", 1)],
        )
        if not recipient:
            continue

        organization_name = org.get("name") or "Nexus"
        if email_enabled and recipient.get("email"):
            try:
                sent = email_service.send_low_stock_alert_email(
                    to_email=recipient["email"], organization_name=organization_name, items=alerts
                )
                if sent:
                    summary["sent_email"] += 1
            except Exception as exc:
                print(f"low_stock_alert_email_failed organization_id={org_id} diagnostic_code={type(exc).__name__}")

        # A stale database flag must never turn a Standard account into a
        # WhatsApp sender.  Check the current entitlement at send time as the
        # appointment confirmation/reminder paths do.
        if whatsapp_enabled and recipient.get("phone"):
            premium = await organization_has_premium(db, org_id)
            if whatsapp_setting_enabled(
                settings, "low_stock_alert_whatsapp_enabled", premium=premium
            ):
                message = (
                    f"⚠️ *{organization_name}* tiene {len(alerts)} producto(s) con bajo stock. "
                    "Revisa tus alertas de reorden en Nexus."
                )
                result = await send_whatsapp_message(
                    db, to_phone=recipient["phone"], message=message, organization_id=org_id, context="low_stock_alert"
                )
                if result.get("accepted"):
                    summary["sent_whatsapp"] += 1

    print(
        "low_stock_alert_cycle_summary "
        + " ".join(f"{key}={summary[key]}" for key in ("period", "eligible_orgs", "sent_email", "sent_whatsapp", "skipped", "empty"))
    )
    return summary
