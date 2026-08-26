# NEXUS_8A7G1B1D_PERSISTENT_REMINDER_EXECUTOR_V1
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from appointment_email_delivery import execute_compatibility_delivery, recipient_fingerprint, recover_expired_claims
from email_service import email_service


def tomorrow_utc(at=None):
    current = at or datetime.now(timezone.utc)
    return (current + timedelta(days=1)).strftime("%Y-%m-%d")


async def process_appointment_reminders(db, *, worker_id, at=None, limit=1000):
    now = at or datetime.now(timezone.utc)
    target_date = tomorrow_utc(now)
    await recover_expired_claims(db, now)
    appointments = await db.appointments.find(
        {
            "date": target_date,
            "status": {"$in": ["confirmed", "pending"]},
            "reminder_sent": {"$ne": True},
            "client_email": {"$type": "string", "$ne": ""},
        },
        {"_id": 0},
    ).sort([("appointment_id", 1)]).to_list(max(1, min(int(limit), 5000)))
    summary = {"target_date": target_date, "eligible": len(appointments), "accepted": 0, "failed": 0, "skipped": 0}
    for appointment in appointments:
        appointment_id = appointment.get("appointment_id")
        organization_id = appointment.get("organization_id")
        fingerprint = recipient_fingerprint(appointment.get("client_email"))
        try:
            organization = await db.organizations.find_one(
                {"organization_id": organization_id}, {"_id": 0}
            ) or {}
            if not organization.get("notification_settings", {}).get("appointment_reminder", True):
                summary["skipped"] += 1
                print(f"reminder_skipped appointment_id={appointment_id} reason=disabled")
                continue
            professional = await db.barbers.find_one(
                {"barber_id": appointment.get("barber_id"), "organization_id": organization_id},
                {"_id": 0},
            ) or {}
            service = await db.services.find_one(
                {"service_id": appointment.get("service_id"), "organization_id": organization_id},
                {"_id": 0},
            ) or {}
            professional_name = professional.get("display_name") or professional.get("name") or "Profesional"
            service_name = service.get("name") or "Servicio"
            organization_name = organization.get("name") or "Nexus"
            payload = {
                "customer_name": appointment.get("client_name") or "Cliente",
                "professional_name": professional_name,
                "service_name": service_name,
                "service_duration": service.get("duration"),
                "date": appointment.get("date"),
                "time": appointment.get("time"),
                "organization_name": organization_name,
                "organization_phone": organization.get("phone"),
            }
            result = await execute_compatibility_delivery(
                db,
                organization_id=organization_id,
                appointment_id=appointment_id,
                event_type="reminder_24h",
                recipient=appointment.get("client_email"),
                payload=payload,
                sender=lambda: email_service.send_appointment_reminder(
                    to_email=appointment.get("client_email"),
                    customer_name=payload["customer_name"],
                    barber_name=professional_name,
                    service_name=service_name,
                    date=payload["date"],
                    time=payload["time"],
                    organization_name=organization_name,
                    organization_phone=organization.get("phone"),
                ),
                worker_id=worker_id,
            )
            if result.get("accepted"):
                update = await db.appointments.update_one(
                    {
                        "appointment_id": appointment_id,
                        "organization_id": organization_id,
                        "status": {"$in": ["confirmed", "pending"]},
                        "reminder_sent": {"$ne": True},
                    },
                    {"$set": {"reminder_sent": True, "reminder_sent_at": now.isoformat(), "reminder_delivery_id": result.get("delivery_id")}},
                )
                summary["accepted"] += 1
                print(f"reminder_provider_accepted appointment_id={appointment_id} recipient_fingerprint={fingerprint} appointment_marked={int(update.modified_count == 1)}")
            else:
                summary["failed"] += 1
                print(f"reminder_not_accepted appointment_id={appointment_id} recipient_fingerprint={fingerprint} status={result.get('status')}")
        except Exception as exc:
            summary["failed"] += 1
            print(f"reminder_processing_failed appointment_id={appointment_id} recipient_fingerprint={fingerprint} diagnostic_code={type(exc).__name__}")
    print("reminder_cycle_summary " + " ".join(f"{key}={summary[key]}" for key in ("target_date", "eligible", "accepted", "failed", "skipped")))
    return summary
