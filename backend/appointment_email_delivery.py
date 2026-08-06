# NEXUS_8A7G1A_APPOINTMENT_EMAIL_DELIVERY_FOUNDATION_V1
from __future__ import annotations

import hashlib
import os
import re
import secrets
from datetime import datetime, timedelta, timezone

DELIVERY_STATUSES = {"queued", "processing", "provider_accepted", "failed", "cancelled"}
# NEXUS_8A7G1B2A_RETRY_POLICY_V1
RECOVERABLE_STATUSES = {"queued", "failed"}
TERMINAL_STATUSES = {"provider_accepted", "permanent_failure", "exhausted", "cancelled"}
RETRYABLE_ERROR_CODES = {
    "timeouterror", "connectionerror", "connectionreseterror",
    "smtpexception", "smtpserverdisconnected", "smtpconnecterror",
    "smtpdataerror", "smtp_send_failed", "processing_lease_expired",
}
PERMANENT_ERROR_CODES = {
    "smtpauthenticationerror", "smtprecipientsrefused",
    "smtpsenderrefused", "invalid_recipient", "missing_recipient",
}
RETRYABLE_SMTP_CODES = {"421", "450", "451", "452", "454"}
PERMANENT_SMTP_CODES = {"530", "534", "535", "550", "551", "552", "553", "554"}

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


def retry_base_seconds():
    return max(30, min(int(os.getenv("APPOINTMENT_EMAIL_RETRY_BASE_SECONDS", "300")), 86400))


def retry_max_seconds():
    return max(retry_base_seconds(), min(int(os.getenv("APPOINTMENT_EMAIL_RETRY_MAX_SECONDS", "86400")), 604800))


def deterministic_jitter_seconds(delivery_key_value, attempt_count, delay):
    material = f"{delivery_key_value}:{int(attempt_count)}".encode()
    bucket = int(hashlib.sha256(material).hexdigest()[:8], 16)
    ceiling = max(1, min(int(delay * 0.20), 300))
    return bucket % (ceiling + 1)


def retry_delay_seconds(attempt_count, delivery_key_value=""):
    attempts = max(1, int(attempt_count))
    raw = min(retry_base_seconds() * (2 ** (attempts - 1)), retry_max_seconds())
    return min(raw + deterministic_jitter_seconds(delivery_key_value, attempts, raw), retry_max_seconds())


def smtp_response_prefix(value):
    normalized = clean_error_code(value or "").lower()
    return normalized[:3] if len(normalized) >= 3 and normalized[:3].isdigit() else None


def classify_failure(error_code=None, provider_response_code=None):
    error = clean_error_code(error_code or "").lower()
    response = clean_error_code(provider_response_code or "").lower()
    combined = {error, response}
    response_codes = {smtp_response_prefix(code) for code in combined}
    if combined & PERMANENT_ERROR_CODES or response_codes & PERMANENT_SMTP_CODES:
        return "permanent"
    if combined & RETRYABLE_ERROR_CODES or response_codes & RETRYABLE_SMTP_CODES:
        return "retryable"
    if any(code.startswith(("timeout", "connection")) for code in combined if code):
        return "retryable"
    return "retryable"


def queue_metrics(rows, at=None):
    at = at or now_utc()
    metrics = {"total": 0, "queued": 0, "failed": 0, "processing": 0, "provider_accepted": 0, "permanent_failure": 0, "exhausted": 0, "cancelled": 0, "ready": 0, "overdue_processing": 0}
    for row in rows:
        status = str(row.get("status") or "unknown")
        metrics["total"] += 1
        metrics[status] = metrics.get(status, 0) + 1
        if status in RECOVERABLE_STATUSES and row.get("next_attempt_at") is not None and row.get("next_attempt_at") <= at and int(row.get("attempt_count") or 0) < int(row.get("max_attempts") or max_attempts()):
            metrics["ready"] += 1
        if status == "processing" and row.get("processing_expires_at") is not None and row.get("processing_expires_at") <= at:
            metrics["overdue_processing"] += 1
    return metrics

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
    rows = await db.appointment_email_deliveries.find(
        {"status": "processing", "processing_expires_at": {"$lte": at}},
        {"_id": 0, "delivery_id": 1, "delivery_key": 1, "attempt_count": 1, "max_attempts": 1},
    ).to_list(10000)
    recovered = 0
    for row in rows:
        attempts = int(row.get("attempt_count") or 0)
        maximum = int(row.get("max_attempts") or max_attempts())
        terminal = attempts >= maximum
        status = "exhausted" if terminal else "failed"
        next_attempt = None if terminal else at + timedelta(seconds=retry_delay_seconds(attempts, row.get("delivery_key") or row.get("delivery_id") or ""))
        result = await db.appointment_email_deliveries.update_one(
            {"delivery_id": row["delivery_id"], "status": "processing", "processing_expires_at": {"$lte": at}},
            {"$set": {"status": status, "next_attempt_at": next_attempt, "last_error_code": "processing_lease_expired", "failure_class": "retryable", "updated_at": at, **({"exhausted_at": at} if terminal else {})}, "$unset": {"processing_worker_id": "", "processing_started_at": "", "processing_expires_at": ""}},
        )
        recovered += int(bool(result.modified_count))
    return recovered


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
        update["failure_class"] = None
    else:
        attempts = int(delivery.get("attempt_count") or 0)
        maximum = int(delivery.get("max_attempts") or max_attempts())
        failure_class = classify_failure(attempt["error_code"], attempt["provider_response_code"])
        exhausted = attempts >= maximum
        if failure_class == "permanent":
            update["status"] = "permanent_failure"
            update["permanent_failure_at"] = at
            update["next_attempt_at"] = None
        elif exhausted:
            update["status"] = "exhausted"
            update["exhausted_at"] = at
            update["next_attempt_at"] = None
        else:
            update["status"] = "failed"
            update["next_attempt_at"] = at + timedelta(seconds=retry_delay_seconds(attempts, delivery.get("delivery_key") or delivery.get("delivery_id") or ""))
        update["failure_class"] = failure_class
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


# NEXUS_8A7G1B1A_COMPATIBILITY_TRACE_EXECUTOR_V1
import asyncio


async def claim_delivery_by_key(db, delivery_key_value, worker_id, at=None):
    at = at or now_utc()
    lease_until = at + timedelta(seconds=processing_lease_seconds())
    query = {
        "delivery_key": delivery_key_value,
        "status": {"$in": list(RECOVERABLE_STATUSES)},
        "next_attempt_at": {"$lte": at},
        "$expr": {"$lt": ["$attempt_count", "$max_attempts"]},
    }
    update = {
        "$set": {
            "status": "processing",
            "processing_worker_id": worker_id,
            "processing_started_at": at,
            "processing_expires_at": lease_until,
            "updated_at": at,
        },
        "$inc": {"attempt_count": 1},
    }
    return await db.appointment_email_deliveries.find_one_and_update(
        query,
        update,
        return_document=True,
        projection={"_id": 0},
    )


def normalize_sender_result(result):
    if isinstance(result, dict):
        accepted = bool(result.get("accepted"))
        return {
            "accepted": accepted,
            "provider": str(result.get("provider") or "smtp")[:40],
            "provider_response_code": str(result.get("provider_response_code") or ("accepted" if accepted else "failed"))[:80],
            "error_code": clean_error_code(result.get("error_code")) if result.get("error_code") else None,
        }
    accepted = bool(result)
    return {
        "accepted": accepted,
        "provider": "smtp",
        "provider_response_code": "accepted" if accepted else "failed",
        "error_code": None if accepted else "smtp_send_failed",
    }


async def execute_compatibility_delivery(
    db,
    *,
    organization_id,
    appointment_id,
    event_type,
    recipient,
    payload,
    sender,
    template_version="v1",
    worker_id="compatibility_bridge",
):
    queued = await enqueue_delivery(
        db,
        organization_id=organization_id,
        appointment_id=appointment_id,
        event_type=event_type,
        recipient=recipient,
        template_version=template_version,
        payload=payload,
    )
    delivery = queued.get("delivery")
    if not delivery:
        return {"status": "missing_recipient", "accepted": False, "created": False}
    if delivery.get("status") == "provider_accepted":
        return {"status": "provider_accepted", "accepted": True, "created": False, "idempotent_replay": True, "delivery_id": delivery["delivery_id"]}
    claimed = await claim_delivery_by_key(db, delivery["delivery_key"], worker_id)
    if not claimed:
        refreshed = await db.appointment_email_deliveries.find_one({"delivery_key": delivery["delivery_key"]}, {"_id": 0})
        return {"status": (refreshed or delivery).get("status"), "accepted": (refreshed or delivery).get("status") == "provider_accepted", "created": queued.get("created", False), "idempotent_replay": True, "delivery_id": delivery["delivery_id"]}
    try:
        raw = await asyncio.to_thread(sender)
        result = normalize_sender_result(raw)
    except Exception as exc:
        result = {"accepted": False, "provider": "smtp", "provider_response_code": "exception", "error_code": clean_error_code(type(exc).__name__)}
    status = "provider_accepted" if result["accepted"] else "failed"
    await record_attempt(
        db,
        claimed,
        status=status,
        provider=result["provider"],
        provider_response_code=result["provider_response_code"],
        error_code=result["error_code"],
    )
    return {"status": status, "accepted": result["accepted"], "created": queued.get("created", False), "idempotent_replay": False, "delivery_id": claimed["delivery_id"], "recipient_fingerprint": claimed["recipient_fingerprint"]}
