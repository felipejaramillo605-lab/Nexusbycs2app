# NEXUS_8A7G1B1D_PERSISTENT_REMINDER_EXECUTOR_V1
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from appointment_email_delivery import execute_compatibility_delivery, recipient_fingerprint, recover_expired_claims
from email_labels import resolve_email_labels
from email_service import email_service
from country_profiles import profile_for
from messaging_consent import messaging_status, stop_footer
from premium_messaging import organization_has_premium, whatsapp_enabled
import whatsapp_service


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
                "email_labels": resolve_email_labels(organization),
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
                    labels=payload["email_labels"],
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
                # WhatsApp is an additional Premium channel. Its failure must never
                # make an already accepted email reminder look failed or retried.
                premium = await organization_has_premium(db, organization_id)
                if whatsapp_enabled(
                    organization.get("notification_settings"), "reminder", premium=premium
                ) and appointment.get("client_phone"):
                    client = await db.clients.find_one(
                        {"organization_id": organization_id, "phone": appointment["client_phone"]},
                        {"_id": 0, "messaging_consent": 1, "messaging_opt_out_at": 1},
                    )
                    allowed, reason = messaging_status(client, organization)
                    if not allowed:
                        print(f"reminder_whatsapp_skipped appointment_id={appointment_id} reason={reason}")
                    else:
                        language = profile_for(organization)["portal_language"]
                        if language == "en":
                            message = (
                                f"Hi {payload['customer_name']}, this is a reminder of your appointment at "
                                f"{organization_name}: {payload['date']} at {payload['time']}. Service: {service_name}."
                            )
                        else:
                            message = (
                                f"Hola {payload['customer_name']}, te recordamos tu cita en {organization_name}: "
                                f"{payload['date']} a las {payload['time']}. Servicio: {service_name}."
                            )
                        if profile_for(organization)["messaging_consent_required"]:
                            message = f"{message} {stop_footer(language)}"
                        whatsapp = await whatsapp_service.send_whatsapp_message(
                            db,
                            to_phone=appointment["client_phone"],
                            message=message,
                            organization_id=organization_id,
                            context="appointment_reminder",
                            language=language,
                        )
                        print(
                            "reminder_whatsapp_result "
                            f"appointment_id={appointment_id} accepted={int(bool(whatsapp.get('accepted')))}"
                        )
            else:
                summary["failed"] += 1
                print(f"reminder_not_accepted appointment_id={appointment_id} recipient_fingerprint={fingerprint} status={result.get('status')}")
        except Exception as exc:
            summary["failed"] += 1
            print(f"reminder_processing_failed appointment_id={appointment_id} recipient_fingerprint={fingerprint} diagnostic_code={type(exc).__name__}")
    print("reminder_cycle_summary " + " ".join(f"{key}={summary[key]}" for key in ("target_date", "eligible", "accepted", "failed", "skipped")))
    return summary
