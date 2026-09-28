import hashlib
import hmac
import logging
import math
import os
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Cookie, Header, HTTPException, Query

logger = logging.getLogger(__name__)
_db = None
_ID_SEGMENT = re.compile(r"^(?:[a-z]+_[a-f0-9]{6,}|[a-f0-9]{24}|[0-9a-f]{8}-[0-9a-f-]{27,}|\d+)$", re.I)


def configure_security_observability(db):
    global _db
    _db = db


def _key():
    value = os.getenv("SECURITY_OBSERVABILITY_KEY", "")
    if len(value) < 32:
        raise RuntimeError("SECURITY_OBSERVABILITY_KEY must contain at least 32 characters")
    return value.encode("utf-8")


def fingerprint(value):
    if value is None or value == "":
        return None
    return hmac.new(_key(), str(value).encode("utf-8"), hashlib.sha256).hexdigest()[:24]


def normalize_path(path):
    clean = str(path or "/").split("?", 1)[0]
    segments = []
    for segment in clean.split("/"):
        if not segment:
            continue
        segments.append(":id" if _ID_SEGMENT.match(segment) else segment[:80])
    return "/" + "/".join(segments)


def diagnostic_code(event_type, material):
    labels = {
        "origin_blocked": "ORG",
        "cross_site_request_blocked": "SITE",
        "authentication_rate_limited": "RATE",
        "cross_tenant_access_blocked": "TENANT",
    }
    digest = hmac.new(_key(), f"{event_type}:{material}".encode("utf-8"), hashlib.sha256).hexdigest()[:8].upper()
    return f"SEC-{labels.get(event_type, 'EVENT')}-{digest}"


async def ensure_security_observability_indexes(db):
    await db.security_events.create_index("security_event_id", unique=True, name="security_event_id_unique")
    await db.security_events.create_index("expires_at", expireAfterSeconds=0, name="security_event_ttl")
    await db.security_events.create_index([("event_type", 1), ("last_seen_at", -1)], name="security_event_type_seen")
    await db.security_events.create_index([("source_fingerprint", 1), ("event_type", 1), ("last_seen_at", -1)], name="security_source_event_seen")
    await db.security_events.create_index([("severity", 1), ("last_seen_at", -1)], name="security_severity_seen")
    await db.security_events.create_index("diagnostic_code", name="security_diagnostic_code")


async def record_security_event(*, event_type, severity="warning", request_method=None, path=None, source=None, actor=None, organization=None, metadata=None):
    if _db is None:
        return None
    try:
        now = datetime.now(timezone.utc)
        retention = max(1, min(int(os.getenv("SECURITY_EVENT_RETENTION_DAYS", "90")), 365))
        normalized = normalize_path(path)
        source_fp = fingerprint(source)
        actor_fp = fingerprint(actor)
        organization_fp = fingerprint(organization)
        bucket = int(now.timestamp()) // 600
        material = "|".join(str(value or "") for value in (event_type, source_fp, actor_fp, organization_fp, normalized, bucket))
        digest = hmac.new(_key(), material.encode("utf-8"), hashlib.sha256).hexdigest()
        event_id = "sevt_" + digest[:24]
        code = diagnostic_code(event_type, digest)
        safe_metadata = {}
        for key, value in (metadata or {}).items():
            if key in {"limit", "window_seconds", "fetch_site", "reason_code"} and isinstance(value, (str, int, float, bool)):
                safe_metadata[key] = value
        await _db.security_events.update_one(
            {"security_event_id": event_id},
            {
                "$setOnInsert": {
                    "security_event_id": event_id,
                    "event_type": event_type,
                    "severity": severity,
                    "diagnostic_code": code,
                    "request_method": str(request_method or "").upper()[:12] or None,
                    "normalized_path": normalized,
                    "source_fingerprint": source_fp,
                    "actor_fingerprint": actor_fp,
                    "organization_fingerprint": organization_fp,
                    "first_seen_at": now,
                    "expires_at": now + timedelta(days=retention),
                    "metadata": safe_metadata,
                },
                "$set": {"last_seen_at": now},
                "$inc": {"occurrence_count": 1},
            },
            upsert=True,
        )
        return code
    except Exception as exc:
        logger.warning("Security observability write failed: %s", type(exc).__name__)
        return None


# NEXUS_OWNER_CONSOLE_SHELL_V1 (plan PR 22): record_security_event() above has
# written to db.security_events since this module was first built, but
# nothing ever read it back -- this is that read side. Source/actor/
# organization are already one-way HMAC fingerprints (not reversible to a
# real identity), matching this module's existing privacy stance, so the
# Owner sees "who" only as a stable pseudonym they can correlate across
# events, never a name/email/IP.
EVENT_PROJECTION = {
    "_id": 0,
    "security_event_id": 1,
    "event_type": 1,
    "severity": 1,
    "diagnostic_code": 1,
    "request_method": 1,
    "normalized_path": 1,
    "source_fingerprint": 1,
    "actor_fingerprint": 1,
    "organization_fingerprint": 1,
    "first_seen_at": 1,
    "last_seen_at": 1,
    "occurrence_count": 1,
    "metadata": 1,
}


def build_security_observability_router(db, get_current_user):
    router = APIRouter(prefix="/owner/security", tags=["owner-security"])

    async def _owner(user):
        if user.role != "owner" or user.access_status != "approved":
            raise HTTPException(status_code=403, detail="Owner access required")

    @router.get("/events")
    async def list_security_events(
        event_type: Optional[str] = None,
        severity: Optional[str] = None,
        page: int = Query(default=1, ge=1),
        page_size: int = Query(default=25, ge=1, le=100),
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        user = await get_current_user(authorization, session_token)
        await _owner(user)
        query = {}
        if event_type:
            query["event_type"] = event_type
        if severity:
            query["severity"] = severity
        total = await db.security_events.count_documents(query)
        rows = await db.security_events.find(query, EVENT_PROJECTION).sort(
            [("last_seen_at", -1)]
        ).skip((page - 1) * page_size).limit(page_size).to_list(page_size)
        total_pages = max(1, math.ceil(total / page_size))
        return {
            "items": rows,
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": total_pages,
            "has_previous": page > 1,
            "has_next": page < total_pages,
        }

    @router.get("/events/summary")
    async def security_events_summary(
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        user = await get_current_user(authorization, session_token)
        await _owner(user)
        pipeline = [
            {"$group": {"_id": {"event_type": "$event_type", "severity": "$severity"}, "occurrences": {"$sum": "$occurrence_count"}, "count": {"$sum": 1}}},
        ]
        rows = await db.security_events.aggregate(pipeline).to_list(1000)
        by_type = {}
        total_occurrences = 0
        for row in rows:
            key = row["_id"]["event_type"]
            entry = by_type.setdefault(key, {"event_type": key, "count": 0, "occurrences": 0})
            entry["count"] += row["count"]
            entry["occurrences"] += int(row.get("occurrences") or 0)
            total_occurrences += int(row.get("occurrences") or 0)
        return {"by_event_type": list(by_type.values()), "total_events": sum(e["count"] for e in by_type.values()), "total_occurrences": total_occurrences}

    return router
