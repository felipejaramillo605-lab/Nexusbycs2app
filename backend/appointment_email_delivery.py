# NEXUS_8A7G1A_APPOINTMENT_EMAIL_DELIVERY_FOUNDATION_V1
from __future__ import annotations

import hashlib
import os
import re
import secrets
from datetime import datetime, timedelta, timezone

DELIVERY_STATUSES = {"queued", "processing", "provider_accepted", "failed", "cancelled"}
RECOVERABLE_STATUSES = {"queued", "failed"}
EVENT_TYPES = {"confirmation", "reminder_24h", "cancelled", "completed", "admin_new_booking"}
SAFE_ERROR = re.compile(r"[^A-Za-z0-9_.:-]+")


def now_utc():
    return datetime.now(timezone.utc)


def iso(value=None):
    return (value or now_utc()).isoformat()


def recipient_fingerprint(value):
    return hashlib.sha256(str(value or "").strip().lower().encode()).hexdigest()[:16]


def clean_error_code(value):
    cleaned = SAFE_ERROR.sub("_", str(value or "delivery_failed"))[:120].strip("_")
    return cleaned or "delivery_failed"


def delivery_key(appointment_id, event_type, template_version="v1"):
    if event_type not in EVENT_TYPES:
        raise ValueError("unsupported appointment email event")
    return f"appointment:{appointment_id}:{event_type}:{template_version}"


def max_attempts():
    return max(1, min(int(os.getenv("APPOINTMENT_EMAIL_MAX_ATTEMPTS", "3")), 10))


def processing_lease_seconds():
    return max(30, min(int(os.getenv("APPOINTMENT_EMAIL_PROCESSING_LEASE_SECONDS", "300")), 1800))


def retry_delay_seconds(attempt_count):
    base = max(30, min(int(os.getenv("APPOINTMENT_EMAIL_RETRY_BASE_SECONDS", "300")), 3600))
    return min(base * (2 ** max(0, int(attempt_count) - 1)), 86400)


async def ensure_appointment_email_delivery_indexes(db):
    await db.appointment_email_deliveries.create_index("delivery_id", unique=True, name="appointment_email_delivery_id_unique")
    await db.appointment_email_deliveries.create_index("delivery_key", unique=True, name="appointment_email_delivery_key_unique")
    await db.appointment_email_deliveries.create_index([("organization_id", 1), ("status", 1), ("next_attempt_at", 1)], name="appointment_email_queue")
    await db.appointment_email_deliveries.create_index([("appointment_id", 1), ("event_type", 1), ("created_at", -1)], name="appointment_email_appointment_event")
    await db.appointment_email_deliveries.create_index("processing_expires_at", name="appointment_email_processing_expiry")
    await db.appointment_email_attempts.create_index("attempt_id", unique=True, name="appointment_email_attempt_id_unique")
    await db.appointment_email_attempts.create_index([("delivery_id", 1), ("created_at", -1)], name="appointment_email_attempt_delivery_created")


async def enqueue_delivery(db, *, organization_id, appointment_id, event_type, recipient, template_version="v1", payload=None, scheduled_for=None):
    normalized = str(recipient or "").strip().lower()
    if not normalized:
        return {"created": False, "reason": "missing_recipient", "delivery": None}
    key = delivery_key(appointment_id, event_type, template_version)
    existing = await db.appointment_email_deliveries.find_one({"delivery_key": key}, {"_id": 0})
    if existing:
        return {"created": False, "reason": "idempotent_replay", "delivery": existing}
    now = now_utc()
    row = {
        "delivery_id": "aptdel_" + secrets.token_hex(8),
        "delivery_key": key,
        "organization_id": organization_id,
        "appointment_id": appointment_id,
        "event_type": event_type,
        "template_version": template_version,
        "recipient": normalized,
        "recipient_fingerprint": recipient_fingerprint(normalized),
        "payload": payload or {},
        "status": "queued",
        "attempt_count": 0,
        "max_attempts": max_attempts(),
        "next_attempt_at": scheduled_for or now,
        "created_at": now,
        "updated_at": now,
    }
    try:
        await db.appointment_email_deliveries.insert_one(row.copy())
        return {"created": True, "reason": "queued", "delivery": row}
    except Exception:
        existing = await db.appointment_email_deliveries.find_one({"delivery_key": key}, {"_id": 0})
        if existing:
            return {"created": False, "reason": "idempotent_replay", "delivery": existing}
        raise


async def claim_delivery(db, worker_id, at=None):
    at = at or now_utc()
    lease_until = at + timedelta(seconds=processing_lease_seconds())
    query = {
        "status": {"$in": list(RECOVERABLE_STATUSES)},
        "next_attempt_at": {"$lte": at},
        "$expr": {"$lt": ["$attempt_count", "$max_attempts"]},
    }
    update = {"$set": {"status": "processing", "processing_worker_id": worker_id, "processing_started_at": at, "processing_expires_at": lease_until, "updated_at": at}, "$inc": {"attempt_count": 1}}
    return await db.appointment_email_deliveries.find_one_and_update(query, update, sort=[("next_attempt_at", 1), ("created_at", 1)], return_document=True, projection={"_id": 0})


async def recover_expired_claims(db, at=None):
    at = at or now_utc()
    result = await db.appointment_email_deliveries.update_many({"status": "processing", "processing_expires_at": {"$lte": at}}, {"$set": {"status": "failed", "next_attempt_at": at, "last_error_code": "processing_lease_expired", "updated_at": at}, "$unset": {"processing_worker_id": "", "processing_started_at": "", "processing_expires_at": ""}})
    return int(result.modified_count)


async def record_attempt(db, delivery, *, status, provider="smtp", provider_response_code=None, error_code=None, at=None):
    if status not in {"provider_accepted", "failed"}:
        raise ValueError("invalid attempt result")
    at = at or now_utc()
    attempt = {
        "attempt_id": "aptatt_" + secrets.token_hex(8),
        "delivery_id": delivery["delivery_id"],
        "organization_id": delivery["organization_id"],
        "appointment_id": delivery["appointment_id"],
        "event_type": delivery["event_type"],
        "recipient_fingerprint": delivery["recipient_fingerprint"],
        "attempt_number": int(delivery.get("attempt_count") or 0),
        "status": status,
        "provider": provider,
        "provider_response_code": str(provider_response_code or "")[:80] or None,
        "error_code": clean_error_code(error_code) if error_code else None,
        "created_at": at,
    }
    await db.appointment_email_attempts.insert_one(attempt.copy())
    update = {"status": status, "updated_at": at, "last_attempt_at": at, "provider": provider, "provider_response_code": attempt["provider_response_code"], "last_error_code": attempt["error_code"]}
    unset = {"processing_worker_id": "", "processing_started_at": "", "processing_expires_at": ""}
    if status == "provider_accepted":
        update["accepted_at"] = at
        update["next_attempt_at"] = None
    else:
        attempts = int(delivery.get("attempt_count") or 0)
        exhausted = attempts >= int(delivery.get("max_attempts") or max_attempts())
        update["next_attempt_at"] = None if exhausted else at + timedelta(seconds=retry_delay_seconds(attempts))
        update["failed_at"] = at
    result = await db.appointment_email_deliveries.update_one({"delivery_id": delivery["delivery_id"], "status": "processing", "processing_worker_id": delivery.get("processing_worker_id")}, {"$set": update, "$unset": unset})
    if result.modified_count != 1:
        raise RuntimeError("appointment email delivery claim changed")
    return attempt


async def cancel_pending_deliveries(db, *, appointment_id, event_types=None, reason="appointment_cancelled", at=None):
    at = at or now_utc()
    query = {"appointment_id": appointment_id, "status": {"$in": ["queued", "failed"]}}
    if event_types:
        query["event_type"] = {"$in": list(event_types)}
    result = await db.appointment_email_deliveries.update_many(query, {"$set": {"status": "cancelled", "cancelled_at": at, "cancellation_reason": clean_error_code(reason), "updated_at": at, "next_attempt_at": None}})
    return int(result.modified_count)
