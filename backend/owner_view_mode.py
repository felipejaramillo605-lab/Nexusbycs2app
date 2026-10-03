"""Owner "view mode": a time-boxed, read-only look at one organization's Manager screens.

The Owner keeps their own identity and session. Entering view mode creates a
server-side record (reason required, audited before it starts). While the
client sends that record's id in `X-Nexus-View-Session`, the middleware lets
only safe reads through, scoped to that organization. It is a guardrail and an
audit trail for support work -- it does not remove the Owner's own privileges
when the header is omitted.
"""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Cookie, Header, HTTPException, Request
from pydantic import BaseModel, Field

from audit_contracts import record_audit_event

VIEW_HEADER = "x-nexus-view-session"
VIEW_SESSION_MINUTES = 30
SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
# Reads that move data out or are not part of "looking at a screen".
BLOCKED_READ_PATTERN = re.compile(r"(export|download|\.csv|\.pdf|/pdf)", re.IGNORECASE)
ORG_PATH_PATTERN = re.compile(r"/organizations/([^/]+)")
VIEW_SESSIONS_PATH = "/api/owner/view-sessions"


def _now():
    return datetime.now(timezone.utc)


def _expired(session) -> bool:
    try:
        return datetime.fromisoformat(session["expires_at"]) <= _now()
    except (KeyError, ValueError, TypeError):
        return True


def _denied(status: int, code: str, message: str):
    return HTTPException(status_code=status, detail={"code": code, "message": message})


async def enforce_view_mode(request: Request, db, record_security_event=None):
    """Raise when a request made in view mode is not a safe, in-scope read. No-op without the header."""
    view_id = request.headers.get(VIEW_HEADER)
    if not view_id:
        return
    path = request.url.path
    session = await db.owner_view_sessions.find_one({"view_id": view_id}, {"_id": 0})
    if not session or session.get("ended_at") or _expired(session):
        raise _denied(401, "VIEW_SESSION_EXPIRED", "El modo visualización terminó o expiró")
    if path.startswith(VIEW_SESSIONS_PATH):
        return
    if request.method not in SAFE_METHODS:
        if record_security_event:
            await record_security_event(
                event_type="view_mode_write_blocked",
                request_method=request.method,
                path=path,
                actor=session.get("owner_user_id"),
                organization=session.get("organization_id"),
                metadata={"reason_code": "read_only"},
            )
        raise _denied(
            403, "VIEW_MODE_READ_ONLY", "Modo visualización: las acciones que modifican datos están bloqueadas"
        )
    if path.startswith("/api/owner/") or BLOCKED_READ_PATTERN.search(path):
        raise _denied(403, "VIEW_MODE_BLOCKED", "Modo visualización: esta consulta no está disponible")
    organization_id = session["organization_id"]
    requested = {request.query_params.get("organization_id"), request.query_params.get("org_id")}
    match = ORG_PATH_PATTERN.search(path)
    if match:
        requested.add(match.group(1))
    if any(value and value != organization_id for value in requested):
        raise _denied(403, "VIEW_MODE_WRONG_ORG", "Modo visualización: solo puedes ver la organización seleccionada")


class ViewSessionStart(BaseModel):
    organization_id: str = Field(min_length=1, max_length=80)
    reason: str = Field(min_length=10, max_length=300)


def build_owner_view_router(db, get_current_user):
    router = APIRouter()

    async def owner(authorization, session_token):
        user = await get_current_user(authorization, session_token)
        if user.role != "owner" or user.access_status != "approved":
            raise HTTPException(status_code=403, detail="Approved Owner access required")
        return user

    def public(session, organization_name=None):
        return {
            "view_id": session["view_id"],
            "organization_id": session["organization_id"],
            "organization_name": organization_name or session.get("organization_name"),
            "expires_at": session["expires_at"],
        }

    @router.post("/owner/view-sessions", tags=["owner"])
    async def start_view_session(
        data: ViewSessionStart, authorization: str | None = Header(None), session_token: str | None = Cookie(None)
    ):
        user = await owner(authorization, session_token)
        org = await db.organizations.find_one({"organization_id": data.organization_id}, {"_id": 0, "name": 1})
        if not org:
            raise HTTPException(status_code=404, detail="Organization not found")
        now = _now()
        session = {
            "view_id": "ovs_" + uuid.uuid4().hex,
            "owner_user_id": user.user_id,
            "organization_id": data.organization_id,
            "organization_name": org.get("name"),
            "reason": data.reason.strip(),
            "created_at": now.isoformat(),
            "expires_at": (now + timedelta(minutes=VIEW_SESSION_MINUTES)).isoformat(),
            "ended_at": None,
        }
        # If the start cannot be audited, it does not start.
        try:
            await record_audit_event(
                db,
                category="support_view",
                event_type="view_session_started",
                actor_user_id=user.user_id,
                organization_id=data.organization_id,
                entity_type="view_session",
                entity_id=session["view_id"],
                reason=session["reason"],
                metadata={"expires_at": session["expires_at"], "mode": "read_only"},
            )
        except Exception:
            raise HTTPException(status_code=500, detail="View mode could not be audited, so it was not started")
        await db.owner_view_sessions.update_many(
            {"owner_user_id": user.user_id, "ended_at": None},
            {"$set": {"ended_at": now.isoformat(), "ended_by": "replaced"}},
        )
        await db.owner_view_sessions.insert_one(dict(session))
        return public(session)

    @router.get("/owner/view-sessions/current", tags=["owner"])
    async def current_view_session(authorization: str | None = Header(None), session_token: str | None = Cookie(None)):
        user = await owner(authorization, session_token)
        session = await db.owner_view_sessions.find_one(
            {"owner_user_id": user.user_id, "ended_at": None}, {"_id": 0}, sort=[("created_at", -1)]
        )
        if not session or _expired(session):
            return {"active": False}
        return {"active": True, **public(session)}

    @router.delete("/owner/view-sessions/{view_id}", tags=["owner"])
    async def end_view_session(
        view_id: str, authorization: str | None = Header(None), session_token: str | None = Cookie(None)
    ):
        user = await owner(authorization, session_token)
        session = await db.owner_view_sessions.find_one({"view_id": view_id, "owner_user_id": user.user_id}, {"_id": 0})
        if not session:
            raise HTTPException(status_code=404, detail="View session not found")
        if not session.get("ended_at"):
            now = _now().isoformat()
            await db.owner_view_sessions.update_one(
                {"view_id": view_id}, {"$set": {"ended_at": now, "ended_by": "owner"}}
            )
            await record_audit_event(
                db,
                category="support_view",
                event_type="view_session_ended",
                actor_user_id=user.user_id,
                organization_id=session["organization_id"],
                entity_type="view_session",
                entity_id=view_id,
                metadata={"ended_at": now},
            )
        return {"ended": True}

    return router


async def ensure_view_session_indexes(db):
    await db.owner_view_sessions.create_index("view_id", unique=True, name="owner_view_sessions_id_unique")
    await db.owner_view_sessions.create_index(
        [("owner_user_id", 1), ("ended_at", 1)], name="owner_view_sessions_owner_active"
    )
