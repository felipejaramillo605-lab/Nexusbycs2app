"""Resend delivery webhooks (Svix-signed): bounces, complaints and suppressions.

* `POST /webhooks/resend` is public but accepts only requests whose Svix signature verifies against
  `RESEND_WEBHOOK_SECRET` (and whose timestamp is fresh); without the secret it refuses everything (503).
* Events are stored once (idempotent on `svix-id`) with the recipient masked + hashed, never in clear.
* Hard bounces, complaints and suppressions add the recipient to `email_suppressions` (hash only) so the
  Owner can see which addresses stopped receiving mail.
* `GET /owner/email-events` gives an approved Owner a read-only summary of the last 7 days.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import time
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Cookie, Header, HTTPException, Request

logger = logging.getLogger(__name__)

TOLERANCE_SECONDS = 5 * 60
MAX_BODY_BYTES = 256 * 1024
TRACKED_EVENTS = {
    "email.sent",
    "email.delivered",
    "email.delivery_delayed",
    "email.bounced",
    "email.complained",
    "email.suppressed",
    "email.failed",
}
SUPPRESSING_EVENTS = {"email.bounced", "email.complained", "email.suppressed"}
RETENTION_DAYS = 90


def _fingerprint(address: str) -> str:
    return hashlib.sha256(str(address or "").strip().lower().encode()).hexdigest()[:24]


def _mask(address: str) -> str:
    local, _, domain = str(address or "").partition("@")
    return f"{local[:1]}***@{domain}" if domain else "***"


def verify_signature(
    secret: str, svix_id: str, svix_timestamp: str, svix_signature: str, body: bytes, now=None
) -> bool:
    """Svix scheme: HMAC-SHA256(base64-decoded secret, "id.timestamp.body"), compared in constant time."""
    if not (secret and svix_id and svix_timestamp and svix_signature):
        return False
    try:
        sent_at = int(svix_timestamp)
        key = base64.b64decode(secret.split("_", 1)[1] if secret.startswith("whsec_") else secret)
    except (ValueError, IndexError):
        return False
    if abs((now if now is not None else time.time()) - sent_at) > TOLERANCE_SECONDS:
        return False
    signed = f"{svix_id}.{svix_timestamp}.".encode() + body
    expected = base64.b64encode(hmac.new(key, signed, hashlib.sha256).digest()).decode()
    candidates = [part.split(",", 1)[1] for part in svix_signature.split() if part.startswith("v1,") and "," in part]
    return any(hmac.compare_digest(expected, candidate) for candidate in candidates)


async def ensure_email_event_indexes(db):
    await db.email_events.create_index("event_id", unique=True, name="email_events_event_id_unique")
    await db.email_events.create_index(
        "created_at_dt", expireAfterSeconds=RETENTION_DAYS * 86400, name="email_events_ttl"
    )
    await db.email_suppressions.create_index("address_hash", unique=True, name="email_suppressions_address_unique")


def build_resend_webhook_router(db, get_current_user):
    router = APIRouter()

    @router.post("/webhooks/resend", tags=["webhooks"])
    async def resend_webhook(
        request: Request,
        svix_id: str | None = Header(None, alias="svix-id"),
        svix_timestamp: str | None = Header(None, alias="svix-timestamp"),
        svix_signature: str | None = Header(None, alias="svix-signature"),
    ):
        secret = os.getenv("RESEND_WEBHOOK_SECRET", "").strip()
        if not secret:
            raise HTTPException(status_code=503, detail="Webhook not configured")
        body = await request.body()
        if len(body) > MAX_BODY_BYTES:
            raise HTTPException(status_code=413, detail="Payload too large")
        if not verify_signature(secret, svix_id or "", svix_timestamp or "", svix_signature or "", body):
            raise HTTPException(status_code=401, detail="Invalid signature")
        try:
            event = json.loads(body)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid JSON")
        event_type = str(event.get("type") or "")
        if event_type not in TRACKED_EVENTS:
            return {"received": True, "stored": False}
        data = event.get("data") if isinstance(event.get("data"), dict) else {}
        recipients = data.get("to") if isinstance(data.get("to"), list) else []
        address = str(recipients[0]) if recipients else ""
        now = datetime.now(timezone.utc)
        document = {
            "event_id": svix_id,
            "type": event_type,
            "email_id": str(data.get("email_id") or "")[:100],
            "address_hash": _fingerprint(address) if address else None,
            "address_masked": _mask(address) if address else None,
            "bounce_type": str((data.get("bounce") or {}).get("type") or "")[:40] or None,
            "created_at": now.isoformat(),
            "created_at_dt": now,
        }
        from pymongo.errors import DuplicateKeyError

        try:
            await db.email_events.insert_one(document)
        except DuplicateKeyError:
            return {"received": True, "stored": False, "duplicate": True}
        hard_bounce = event_type != "email.bounced" or (document["bounce_type"] or "").lower() in {"permanent", ""}
        if event_type in SUPPRESSING_EVENTS and document["address_hash"] and hard_bounce:
            await db.email_suppressions.update_one(
                {"address_hash": document["address_hash"]},
                {
                    "$set": {
                        "address_masked": document["address_masked"],
                        "reason": event_type,
                        "updated_at": now.isoformat(),
                    },
                    "$setOnInsert": {"created_at": now.isoformat()},
                },
                upsert=True,
            )
        logger.info("resend_event type=%s", event_type)
        return {"received": True, "stored": True}

    @router.get("/owner/email-events", tags=["owner-email"])
    async def email_events_summary(authorization: str | None = Header(None), session_token: str | None = Cookie(None)):
        user = await get_current_user(authorization, session_token)
        if user.role != "owner" or user.access_status != "approved":
            raise HTTPException(status_code=403, detail="Owner access required")
        since = datetime.now(timezone.utc) - timedelta(days=7)
        rows = await db.email_events.find(
            {"created_at_dt": {"$gte": since}},
            {"_id": 0, "type": 1, "address_masked": 1, "bounce_type": 1, "created_at": 1},
        ).to_list(5000)
        counts: dict[str, int] = {}
        for row in rows:
            counts[row["type"]] = counts.get(row["type"], 0) + 1
        suppressed = await db.email_suppressions.find(
            {}, {"_id": 0, "address_masked": 1, "reason": 1, "updated_at": 1}
        ).to_list(200)
        recent = sorted(rows, key=lambda row: row.get("created_at") or "", reverse=True)[:50]
        return {
            "configured": bool(os.getenv("RESEND_WEBHOOK_SECRET", "").strip()),
            "window_days": 7,
            "counts": counts,
            "recent_problems": [
                r for r in recent if r["type"] in SUPPRESSING_EVENTS | {"email.delivery_delayed", "email.failed"}
            ],
            "suppressed": suppressed,
        }

    return router
