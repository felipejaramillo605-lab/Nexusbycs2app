"""Owner-only inspection and revocation of staff login sessions."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import re
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Cookie, Header, HTTPException, Query, Request
from pydantic import BaseModel, Field
from pymongo.errors import DuplicateKeyError

from security_observability import fingerprint

REQUEST_ID_RE = re.compile(r"[A-Za-z0-9._:-]{1,128}\Z")
CURSOR_VERSION = 1


class RevokeSessionRequest(BaseModel):
    reason: str = Field(min_length=10, max_length=500)


def _key() -> bytes:
    value = os.getenv("SECURITY_OBSERVABILITY_KEY", "")
    if len(value) < 32:
        raise HTTPException(status_code=503, detail="Session security service unavailable")
    return value.encode("utf-8")


def _safe_fingerprint(value: str) -> str:
    try:
        result = fingerprint(value)
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Session security service unavailable") from exc
    if not result:
        raise HTTPException(status_code=503, detail="Session security service unavailable")
    return result


def _as_utc(value) -> Optional[datetime]:
    if isinstance(value, str):
        try:
            value = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    if not isinstance(value, datetime):
        return None
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def _cursor_encode(created_at: datetime, session_ref: str) -> str:
    payload = json.dumps({"v": CURSOR_VERSION, "created_at": created_at.isoformat(), "session_ref": session_ref}, separators=(",", ":")).encode()
    encoded = base64.urlsafe_b64encode(payload).decode().rstrip("=")
    signature = hmac.new(_key(), encoded.encode(), hashlib.sha256).digest()
    return encoded + "." + base64.urlsafe_b64encode(signature).decode().rstrip("=")


def _cursor_decode(value: Optional[str]):
    if not value:
        return None
    try:
        encoded, supplied_sig = value.split(".", 1)
        expected_sig = base64.urlsafe_b64encode(hmac.new(_key(), encoded.encode(), hashlib.sha256).digest()).decode().rstrip("=")
        if not hmac.compare_digest(supplied_sig, expected_sig):
            raise ValueError("bad signature")
        raw = base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4))
        payload = json.loads(raw)
        created_at = _as_utc(payload.get("created_at"))
        session_ref = payload.get("session_ref")
        if payload.get("v") != CURSOR_VERSION or not created_at or not isinstance(session_ref, str):
            raise ValueError("bad payload")
        return created_at, session_ref
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid cursor") from exc


def _require_owner(user):
    if (getattr(user, "role", None) != "owner"
            or getattr(user, "access_status", None) != "approved"
            or getattr(user, "active", True) is False
            or getattr(user, "deleted_at", None)):
        raise HTTPException(status_code=403, detail="Owner access required")


def _active_target(user):
    return bool(user and user.get("access_status") == "approved"
                and user.get("active") is not False and not user.get("deleted_at"))


def _session_view(session):
    created_at = _as_utc(session.get("created_at"))
    expires_at = _as_utc(session.get("expires_at"))
    return {
        "session_ref": _safe_fingerprint(session["session_token_hash"]),
        "created_at": created_at.isoformat() if created_at else None,
        "expires_at": expires_at.isoformat() if expires_at else None,
    }


def build_owner_access_sessions_router(db, get_current_user, owner_account_audit):
    router = APIRouter(prefix="/owner/access/users", tags=["owner-access-sessions"])

    async def actor(authorization, session_token):
        current_user = await get_current_user(authorization, session_token)
        _require_owner(current_user)
        return current_user

    async def active_target(user_id):
        target = await db.users.find_one({"user_id": user_id}, {"_id": 0, "user_id": 1, "organization_id": 1, "role": 1, "access_status": 1, "active": 1, "deleted_at": 1})
        if not _active_target(target):
            raise HTTPException(status_code=404, detail="Active user not found")
        return target

    @router.get("/{user_id}/sessions")
    async def list_sessions(
        user_id: str,
        cursor: Optional[str] = Query(default=None, max_length=2048),
        limit: int = Query(default=25, ge=1, le=200),
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        await actor(authorization, session_token)
        _key()
        await active_target(user_id)
        position = _cursor_decode(cursor)
        now = datetime.now(timezone.utc)
        docs = await db.user_sessions.find(
            {"user_id": user_id, "expires_at": {"$gt": now}, "revoked_at": {"$exists": False}},
            {"session_token_hash": 1, "created_at": 1, "expires_at": 1},
        ).to_list(10000)
        items = [_session_view(row) for row in docs if row.get("session_token_hash")]
        active_count = len(items)
        items.sort(key=lambda row: (row["created_at"] or "", row["session_ref"]), reverse=True)
        if position:
            cursor_created, cursor_ref = position
            cursor_created_text = cursor_created.isoformat()
            items = [row for row in items if (row["created_at"] or "", row["session_ref"]) < (cursor_created_text, cursor_ref)]
        page = items[:limit]
        next_cursor = _cursor_encode(_as_utc(page[-1]["created_at"]), page[-1]["session_ref"]) if len(items) > limit and page[-1]["created_at"] else None
        return {"active_count": active_count, "sessions": page, "next_cursor": next_cursor}

    @router.post("/{user_id}/sessions/revoke")
    async def revoke_session(
        user_id: str,
        data: RevokeSessionRequest,
        request: Request,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        current_user = await actor(authorization, session_token)
        if user_id == current_user.user_id:
            raise HTTPException(status_code=409, detail="Owners cannot revoke their own session here")
        request_id = (request.headers.get("x-request-id") or "").strip()
        if not REQUEST_ID_RE.fullmatch(request_id):
            raise HTTPException(status_code=400, detail="A valid X-Request-ID is required")
        reason = data.reason.strip()
        if len(reason) < 10:
            raise HTTPException(status_code=422, detail="reason must contain at least 10 characters")
        target = await active_target(user_id)

        request_key = _key()
        operation_id = hmac.new(request_key, f"{current_user.user_id}|{request_id}".encode(), hashlib.sha256).hexdigest()
        operation_fingerprint = hmac.new(request_key, f"{user_id}|{reason}".encode(), hashlib.sha256).hexdigest()
        operations = db.owner_access_session_operations
        operation = await operations.find_one({"operation_id": operation_id}, {"_id": 0})
        if operation and operation.get("request_fingerprint") != operation_fingerprint:
            raise HTTPException(status_code=409, detail="X-Request-ID was already used for another operation")
        if operation and operation.get("status") == "complete":
            return {"revoked_count": operation.get("revoked_count", 0), "idempotent_replay": True}
        if operation:
            raise HTTPException(status_code=409, detail="Revocation operation is already in progress")
        if not operation:
            session_filter = {"user_id": user_id, "expires_at": {"$gt": datetime.now(timezone.utc)}, "revoked_at": {"$exists": False}}
            active_count = await db.user_sessions.count_documents(session_filter)
            operation = {
                "operation_id": operation_id,
                "request_fingerprint": operation_fingerprint,
                "actor_user_id": current_user.user_id,
                "target_user_id": user_id,
                "status": "processing",
                "active_count_before": active_count,
                "created_at": datetime.now(timezone.utc),
            }
            try:
                await operations.insert_one(operation)
            except DuplicateKeyError:
                raise HTTPException(status_code=409, detail="Revocation operation is already in progress")

        delete_result = await db.user_sessions.delete_many({"user_id": user_id})
        revoked_count = int(getattr(delete_result, "deleted_count", 0))
        await owner_account_audit(
            "user_sessions_revoked",
            target,
            current_user,
            {"active_session_count": operation.get("active_count_before", 0)},
            {"revoked_count": revoked_count, "reason": reason, "request_id": request_id},
        )
        await operations.update_one(
            {"operation_id": operation_id},
            {"$set": {"status": "complete", "revoked_count": revoked_count, "completed_at": datetime.now(timezone.utc)}},
        )
        return {"revoked_count": revoked_count, "idempotent_replay": False}

    return router


async def ensure_owner_access_sessions_indexes(db):
    await db.user_sessions.create_index([("user_id", 1), ("expires_at", -1), ("created_at", -1)], name="owner_access_sessions_user_expiry_created")
    await db.owner_access_session_operations.create_index("operation_id", unique=True, name="owner_access_session_operation_unique")
