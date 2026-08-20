# NEXUS_REVIEW_REQUEST_V1
"""
Solicitud automática de reseña — scheduling y entrega.

Diseño: colección propia `review_requests` con una máquina de estados simple
(pending -> sent / failed) por canal (email/whatsapp), en vez de conectarse
al sistema genérico de entrega con leasing/reintentos exponenciales de
`appointment_email_delivery.py` (usado por confirmaciones/recordatorios).
Se hace así a propósito: mantiene esto desacoplado de esa ruta más crítica y
de mayor volumen. Si un envío falla, el registro sigue "pending" y se
reintenta en el siguiente ciclo del daemon (corre cada hora), hasta un
máximo de intentos.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from appointment_email_delivery import recipient_fingerprint
from email_service import email_service
from whatsapp_service import send_whatsapp_message

REVIEW_REQUEST_DELAY_MINUTES = 60
MAX_ATTEMPTS = 5


async def schedule_review_request(db, *, appointment: dict, organization: dict) -> str | None:
    """Llamar justo después de que una cita quede marcada como 'completed'."""
    settings = organization.get("review_request_settings") or {}
    if not settings.get("enabled"):
        return None
    channels = settings.get("channels") or {}
    wants_email = bool(channels.get("email"))
    wants_whatsapp = bool(channels.get("whatsapp"))
    if not (wants_email or wants_whatsapp):
        return None
    review_link = organization.get("review_link")
    if not review_link:
        return None

    now = datetime.now(timezone.utc)
    review_request_id = f"revreq_{appointment.get('appointment_id')}"
    doc = {
        "review_request_id": review_request_id,
        "organization_id": appointment.get("organization_id"),
        "appointment_id": appointment.get("appointment_id"),
        "client_name": appointment.get("client_name"),
        "client_email": appointment.get("client_email"),
        "client_phone": appointment.get("client_phone"),
        "review_link": review_link,
        "organization_name": organization.get("name") or "Nexus",
        "channels": {"email": wants_email, "whatsapp": wants_whatsapp},
        "scheduled_send_at": (now + timedelta(minutes=REVIEW_REQUEST_DELAY_MINUTES)).isoformat(),
        "status": "pending",
        "email_status": "pending" if (wants_email and appointment.get("client_email")) else "not_applicable",
        "whatsapp_status": "pending" if (wants_whatsapp and appointment.get("client_phone")) else "not_applicable",
        "attempts": 0,
        "created_at": now.isoformat(),
        "sent_at": None,
    }
    # Idempotente: una sola solicitud de reseña por cita, sin importar
    # cuántas veces se llame (ej. reintentos del propio checkout).
    await db.review_requests.update_one(
        {"review_request_id": review_request_id},
        {"$setOnInsert": doc},
        upsert=True,
    )
    return review_request_id


async def process_due_review_requests(db, *, worker_id: str, at=None, limit: int = 500) -> dict:
    now = at or datetime.now(timezone.utc)
    due = await db.review_requests.find(
        {
            "scheduled_send_at": {"$lte": now.isoformat()},
            "$or": [{"email_status": "pending"}, {"whatsapp_status": "pending"}],
        },
        {"_id": 0},
    ).to_list(max(1, min(int(limit), 2000)))

    summary = {"eligible": len(due), "sent": 0, "partial": 0, "failed": 0}

    for req in due:
        fingerprint = recipient_fingerprint(req.get("client_email") or req.get("client_phone"))
        attempts = int(req.get("attempts", 0)) + 1
        give_up = attempts >= MAX_ATTEMPTS
        updates: dict = {"attempts": attempts}

        email_status = req.get("email_status")
        if email_status == "pending":
            try:
                email_service.send_review_request(
                    to_email=req["client_email"],
                    customer_name=req.get("client_name") or "Cliente",
                    organization_name=req.get("organization_name"),
                    review_link=req["review_link"],
                )
                email_status = "sent"
            except Exception as exc:
                print(f"review_request_email_failed id={req['review_request_id']} recipient_fingerprint={fingerprint} diagnostic_code={type(exc).__name__}")
                email_status = "failed" if give_up else "pending"
        updates["email_status"] = email_status

        whatsapp_status = req.get("whatsapp_status")
        if whatsapp_status == "pending":
            try:
                message = (
                    f"¡Gracias por tu visita a {req.get('organization_name')}! "
                    f"Nos ayudarías mucho dejando una reseña en Instagram: {req['review_link']}"
                )
                result = await send_whatsapp_message(
                    db,
                    to_phone=req["client_phone"],
                    message=message,
                    organization_id=req["organization_id"],
                    context="review_request",
                )
                whatsapp_status = "sent" if result.get("accepted") else ("failed" if give_up else "pending")
            except Exception as exc:
                print(f"review_request_whatsapp_failed id={req['review_request_id']} recipient_fingerprint={fingerprint} diagnostic_code={type(exc).__name__}")
                whatsapp_status = "failed" if give_up else "pending"
        updates["whatsapp_status"] = whatsapp_status

        still_pending = "pending" in (email_status, whatsapp_status)
        if still_pending:
            updates["status"] = "pending"
        else:
            resolved_ok = all(s in ("sent", "not_applicable") for s in (email_status, whatsapp_status))
            updates["status"] = "sent" if resolved_ok else "failed"
            updates["sent_at"] = now.isoformat()

        await db.review_requests.update_one(
            {"review_request_id": req["review_request_id"]},
            {"$set": updates},
        )

        if updates["status"] == "sent":
            summary["sent"] += 1
        elif updates["status"] == "failed":
            summary["failed"] += 1
        else:
            summary["partial"] += 1

        print(f"review_request_processed id={req['review_request_id']} recipient_fingerprint={fingerprint} status={updates['status']} attempts={attempts}")

    print("review_request_cycle_summary " + " ".join(f"{key}={summary[key]}" for key in ("eligible", "sent", "partial", "failed")))
    return summary
