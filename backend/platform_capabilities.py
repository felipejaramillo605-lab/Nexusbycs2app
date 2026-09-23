"""Standalone-safe authority and audit ledger for platform template entitlements."""
from __future__ import annotations

import hashlib
import json
import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Cookie, Header, HTTPException, Request
from pydantic import BaseModel, Field
from pymongo import ReturnDocument

CAPABILITY = "manage_portal_template_entitlements"
AUTHORITY_ID = CAPABILITY
ALLOWED_CAPABILITIES = frozenset({CAPABILITY})
MAX_ACTIVE_GRANTS = 500
MAX_AUDIT_EVENTS = 2000
MAX_AUTHORITY_BYTES = 8 * 1024 * 1024
MAX_REASON_LENGTH = 500
MAX_REQUEST_ID_LENGTH = 128
_PUBLIC_DENIAL = "Not authorized for platform capability"
logger = logging.getLogger(__name__)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _request_id(request: Request) -> str:
    supplied = (request.headers.get("x-request-id") or "").strip()
    if supplied and len(supplied) <= MAX_REQUEST_ID_LENGTH and re.fullmatch(r"[A-Za-z0-9._:-]+", supplied):
        return supplied
    return "req_" + uuid.uuid4().hex


def _clean_reason(reason: str) -> str:
    value = (reason or "").strip()
    if not value:
        raise HTTPException(status_code=400, detail="reason is required")
    if len(value) > MAX_REASON_LENGTH:
        raise HTTPException(status_code=422, detail="reason is too long")
    return value


def _is_eligible_platform_owner(user: Optional[dict]) -> bool:
    return bool(
        user
        and user.get("role") == "owner"
        and user.get("access_status") == "approved"
        and user.get("active") is not False
        and not user.get("deleted_at")
    )


def _authority_size_ok(doc: dict) -> bool:
    # Hard event/grant counts and bounded input strings make concurrent appends
    # safely smaller than MongoDB's 16 MiB document limit; this byte guard leaves
    # additional headroom for legacy or manually modified documents.
    try:
        from bson import BSON
        return len(BSON.encode(doc)) < MAX_AUTHORITY_BYTES
    except Exception:
        return False


def _capacity_expr(*, needs_grant_slot: bool = False) -> dict:
    clauses = [{"$lt": [{"$size": {"$ifNull": ["$audit_events", []]}}, MAX_AUDIT_EVENTS]}]
    if needs_grant_slot:
        clauses.append({"$lt": [{"$size": {"$ifNull": ["$active_grants", []]}}, MAX_ACTIVE_GRANTS]})
    return {"$expr": {"$and": clauses}}


def _request_event(doc: Optional[dict], request_id: str) -> Optional[dict]:
    for event in reversed((doc or {}).get("audit_events", [])):
        if event.get("request_id") == request_id:
            return event
    return None


async def _prior_request_event(db, authority: Optional[dict], request_id: str) -> Optional[dict]:
    event = _request_event(authority, request_id)
    if event:
        return event
    tombstone = await db.platform_capability_request_tombstones.find_one({"_id": request_id}, {"event": 1})
    return (tombstone or {}).get("event")


def _request_tombstone_event(event: dict) -> dict:
    # Retain only fields needed to replay or reject a request; the full event and
    # reason remain in the separately verified archive file.
    fields = (
        "request_id", "event_id", "type", "actor_user_id", "target_user_id",
        "organization_id", "before", "after", "state", "failure_code",
    )
    return {key: event[key] for key in fields if key in event}


async def persist_request_tombstones(db, chain: list[dict]) -> None:
    """Persist compacted request IDs durably before removing their audit events."""
    for item in chain:
        event = item["event"]
        request_id = event.get("request_id")
        if not request_id:
            continue
        compact_event = _request_tombstone_event(event)
        record = {"_id": request_id, "event": compact_event, "event_hash": item["hash"]}
        try:
            await db.platform_capability_request_tombstones.insert_one(record)
        except Exception:
            existing = await db.platform_capability_request_tombstones.find_one({"_id": request_id})
            if not existing or existing.get("event") != compact_event or existing.get("event_hash") != item["hash"]:
                raise RuntimeError("request_id tombstone conflict; audit ledger was not compacted")


def _request_id_unused_filter(request_id: str) -> dict:
    # The archive lock below serializes this authority-document predicate with
    # tombstone creation/compaction; tombstones themselves live in a separate
    # collection and cannot appear in a Mongo update selector.
    return {"audit_events.request_id": {"$ne": request_id}}


def _request_id_unique_expr(request_id: str) -> dict:
    return {"$expr": {"$eq": [
        {"$size": {"$filter": {
            "input": {"$ifNull": ["$audit_events", []]},
            "as": "event",
            "cond": {"$eq": ["$$event.request_id", request_id]},
        }}},
        1,
    ]}}


def protect_active_capability_holder(authority: Optional[dict], user_id: str, remains_eligible: bool) -> None:
    if not remains_eligible and any(
        grant.get("user_id") == user_id for grant in (authority or {}).get("active_grants", [])
    ):
        raise HTTPException(
            status_code=409,
            detail="Revoke the platform capability grant before changing this owner's account",
        )


async def ensure_platform_capability_indexes(db) -> None:
    # Authority/grants/audit are one document keyed by the built-in unique _id.
    # The sparse unique organization marker makes reconciliation deterministic.
    await db.organizations.create_index(
        "portal_template_entitlement_request_id",
        unique=True,
        sparse=True,
        name="portal_template_entitlement_request_unique",
    )
    # The tombstone collection uses Mongo's built-in unique _id; rows survive archival.


async def _record_denial(db, *, actor_user_id: Optional[str], request_id: str, reason: str) -> None:
    """Best-effort append-only denial event; never turns a denial into access."""
    try:
        authority = await db.platform_capability_authority.find_one({"_id": AUTHORITY_ID})
        if not authority or not _authority_size_ok(authority):
            return
        if await _prior_request_event(db, authority, request_id):
            return
        event = {
            "event_id": "pcau_" + uuid.uuid4().hex,
            "type": "denied",
            "capability": CAPABILITY,
            "actor_user_id": actor_user_id,
            "reason": reason[:120],
            "request_id": request_id,
            "state": "applied",
            "created_at": _now(),
        }
        await db.platform_capability_authority.update_one(
            {
                "_id": AUTHORITY_ID,
                "version": authority.get("version", 0),
                "archive_lock": {"$exists": False},
                "maintenance_lock": {"$exists": False},
                **_capacity_expr(),
                **_request_id_unused_filter(request_id),
            },
            {"$push": {"audit_events": event}, "$inc": {"version": 1}, "$set": {"updated_at": _now()}},
        )
    except Exception:
        logger.exception("Could not append platform capability denial event")


async def require_platform_capability(db, current_user, capability: str, request_id: str) -> dict:
    user_id = getattr(current_user, "user_id", None) if current_user is not None else None
    if (
        current_user is None
        or getattr(current_user, "role", None) != "owner"
        or getattr(current_user, "access_status", None) != "approved"
        or capability not in ALLOWED_CAPABILITIES
    ):
        await _record_denial(db, actor_user_id=user_id, request_id=request_id, reason="actor_or_capability_denied")
        raise HTTPException(status_code=403, detail=_PUBLIC_DENIAL)
    authority = await db.platform_capability_authority.find_one(
        {"_id": AUTHORITY_ID, "active_grants.user_id": user_id}
    )
    if not authority:
        await _record_denial(db, actor_user_id=user_id, request_id=request_id, reason="grant_missing")
        raise HTTPException(status_code=403, detail=_PUBLIC_DENIAL)
    return authority


async def _atomic_authority_update(db, query: dict, update: dict) -> Optional[dict]:
    authority = await db.platform_capability_authority.find_one({"_id": AUTHORITY_ID})
    if not authority or not _authority_size_ok(authority):
        raise HTTPException(status_code=503, detail="Platform capability authority is unavailable")
    pushed_event = update.get("$push", {}).get("audit_events")
    request_id = pushed_event.get("request_id") if isinstance(pushed_event, dict) else None
    if request_id and await db.platform_capability_request_tombstones.find_one({"_id": request_id}, {"_id": 1}):
        raise HTTPException(status_code=409, detail="request_id already used")
    return await db.platform_capability_authority.find_one_and_update(
        {
            "_id": AUTHORITY_ID,
            "version": authority.get("version", 0),
            "archive_lock": {"$exists": False},
            "maintenance_lock": {"$exists": False},
            **query,
        },
        update,
        return_document=ReturnDocument.AFTER,
    )


def _actor_filter(user_id: str) -> dict:
    return {"active_grants.user_id": user_id}


def _event(
    event_type: str,
    actor_user_id: str,
    request_id: str,
    reason: str,
    *,
    target_user_id: Optional[str] = None,
    organization_id: Optional[str] = None,
    before=None,
    after=None,
    state: str = "applied",
) -> dict:
    return {
        "event_id": "pcau_" + uuid.uuid4().hex,
        "type": event_type,
        "capability": CAPABILITY,
        "actor_user_id": actor_user_id,
        "target_user_id": target_user_id,
        "organization_id": organization_id,
        "before": before,
        "after": after,
        "reason": reason,
        "request_id": request_id,
        "state": state,
        "created_at": _now(),
    }


async def grant_capability(db, actor, target_user: dict, reason: str, request_id: str) -> dict:
    actor_id = actor.user_id
    target_id = target_user["user_id"]
    authority = await require_platform_capability(db, actor, CAPABILITY, request_id)
    prior = await _prior_request_event(db, authority, request_id)
    if prior:
        if prior.get("type") == "granted" and prior.get("actor_user_id") == actor_id and prior.get("target_user_id") == target_id and prior.get("state") == "applied":
            return authority
        raise HTTPException(status_code=409, detail="request_id already used")
    grant = {
        "user_id": target_id,
        "granted_by_user_id": actor_id,
        "granted_at": _now(),
        "reason": reason,
    }
    audit = _event("granted", actor_id, request_id, reason, target_user_id=target_id, after={"active": True})
    query = {
        "$and": [
            _actor_filter(actor_id),
            _request_id_unused_filter(request_id),
            {"active_grants.user_id": {"$ne": target_id}},
            _capacity_expr(needs_grant_slot=True),
        ]
    }
    updated = await _atomic_authority_update(
        db,
        query,
        {"$push": {"active_grants": grant, "audit_events": audit}, "$inc": {"version": 1}, "$set": {"updated_at": _now()}},
    )
    if updated:
        return updated
    current = await db.platform_capability_authority.find_one({"_id": AUTHORITY_ID}) or {}
    prior = await _prior_request_event(db, current, request_id)
    if prior:
        if prior.get("type") == "granted" and prior.get("actor_user_id") == actor_id and prior.get("target_user_id") == target_id and prior.get("state") == "applied":
            return current
        raise HTTPException(status_code=409, detail="request_id already used")
    if not any(g.get("user_id") == actor_id for g in current.get("active_grants", [])):
        await _record_denial(db, actor_user_id=actor_id, request_id=request_id, reason="grant_actor_revoked")
        raise HTTPException(status_code=403, detail=_PUBLIC_DENIAL)
    if any(g.get("user_id") == target_id for g in current.get("active_grants", [])):
        raise HTTPException(status_code=409, detail="Capability grant already active")
    raise HTTPException(status_code=503, detail="Platform capability authority is at capacity")


async def revoke_capability(db, actor, target_user_id: str, reason: str, request_id: str) -> dict:
    actor_id = actor.user_id
    authority = await require_platform_capability(db, actor, CAPABILITY, request_id)
    prior = await _prior_request_event(db, authority, request_id)
    if prior:
        if prior.get("type") == "revoked" and prior.get("actor_user_id") == actor_id and prior.get("target_user_id") == target_user_id and prior.get("state") == "applied":
            return authority
        raise HTTPException(status_code=409, detail="request_id already used")
    existing = next((g for g in authority.get("active_grants", []) if g.get("user_id") == target_user_id), None)
    if not existing:
        raise HTTPException(status_code=409, detail="Capability grant is not active")
    audit = _event(
        "revoked", actor_id, request_id, reason, target_user_id=target_user_id,
        before={"active": True, "granted_at": existing.get("granted_at")}, after={"active": False},
    )
    query = {
        "$and": [
            _actor_filter(actor_id),
            _request_id_unused_filter(request_id),
            {"active_grants.user_id": target_user_id},
            {"$expr": {"$and": [
                {"$gt": [{"$size": {"$ifNull": ["$active_grants", []]}}, 1]},
                {"$lt": [{"$size": {"$ifNull": ["$audit_events", []]}}, MAX_AUDIT_EVENTS]},
            ]}},
        ]
    }
    updated = await _atomic_authority_update(
        db,
        query,
        {"$pull": {"active_grants": {"user_id": target_user_id}}, "$push": {"audit_events": audit}, "$inc": {"version": 1}, "$set": {"updated_at": _now()}},
    )
    if updated:
        return updated
    current = await db.platform_capability_authority.find_one({"_id": AUTHORITY_ID}) or {}
    prior = await _prior_request_event(db, current, request_id)
    if prior:
        if prior.get("type") == "revoked" and prior.get("actor_user_id") == actor_id and prior.get("target_user_id") == target_user_id and prior.get("state") == "applied":
            return current
        raise HTTPException(status_code=409, detail="request_id already used")
    grants = current.get("active_grants", [])
    if not any(g.get("user_id") == actor_id for g in grants):
        await _record_denial(db, actor_user_id=actor_id, request_id=request_id, reason="revoke_actor_revoked")
        raise HTTPException(status_code=403, detail=_PUBLIC_DENIAL)
    if not any(g.get("user_id") == target_user_id for g in grants):
        raise HTTPException(status_code=409, detail="Capability grant is not active")
    raise HTTPException(status_code=409, detail="At least one active capability grant must remain")


async def _set_entitlement_event_state(
    db,
    request_id: str,
    state: str,
    failure_code: Optional[str] = None,
    *,
    maintenance_lock_id: Optional[str] = None,
) -> bool:
    authority = await db.platform_capability_authority.find_one({"_id": AUTHORITY_ID}, {"version": 1})
    if not authority:
        return False
    values = {"audit_events.$[event].state": state, "audit_events.$[event].resolved_at": _now()}
    if failure_code:
        values["audit_events.$[event].failure_code"] = failure_code
    lock_filter = (
        {"maintenance_lock": maintenance_lock_id}
        if maintenance_lock_id
        else {"maintenance_lock": {"$exists": False}}
    )
    result = await db.platform_capability_authority.update_one(
        {
            "_id": AUTHORITY_ID,
            "version": authority.get("version", 0),
            "archive_lock": {"$exists": False},
            **lock_filter,
            "audit_events": {"$elemMatch": {"request_id": request_id, "state": "pending"}},
            **_request_id_unique_expr(request_id),
        },
        {"$set": {**values, "updated_at": _now()}, "$inc": {"version": 1}},
        array_filters=[{"event.request_id": request_id, "event.state": "pending"}],
    )
    return result.modified_count == 1


async def _apply_entitlement_event(db, event: dict) -> dict:
    request_id = event["request_id"]
    org_id = event["organization_id"]
    expected_before = event["before"]
    expected_marker = event.get("before_request_id")
    org = await db.organizations.find_one(
        {"organization_id": org_id},
        {"premium_templates_contracted": 1, "portal_template_entitlement_request_id": 1},
    )
    if not org:
        await _set_entitlement_event_state(db, request_id, "failed", "organization_not_found")
        raise HTTPException(status_code=404, detail="Organization not found")
    if org.get("portal_template_entitlement_request_id") == request_id:
        try:
            completed = await _set_entitlement_event_state(db, request_id, "applied")
        except Exception as exc:
            logger.exception("Entitlement audit apply failed; request_id=%s", request_id)
            raise HTTPException(status_code=503, detail="Entitlement audit is pending reconciliation") from exc
        if not completed:
            raise HTTPException(status_code=503, detail="Entitlement audit is pending reconciliation")
        return {"organization_id": org_id, "contracted": bool(event["after"]), "request_id": request_id}
    current_value = bool(org.get("premium_templates_contracted", False))
    marker_matches = org.get("portal_template_entitlement_request_id") == expected_marker
    if current_value != bool(expected_before) or not marker_matches:
        await _set_entitlement_event_state(db, request_id, "failed", "organization_precondition_changed")
        raise HTTPException(status_code=409, detail="Organization entitlement changed concurrently")
    query = {"organization_id": org_id}
    if "premium_templates_contracted" in org:
        query["premium_templates_contracted"] = org["premium_templates_contracted"]
    else:
        query["premium_templates_contracted"] = {"$exists": False}
    if "portal_template_entitlement_request_id" in org:
        query["portal_template_entitlement_request_id"] = org["portal_template_entitlement_request_id"]
    else:
        query["portal_template_entitlement_request_id"] = {"$exists": False}
    try:
        result = await db.organizations.update_one(
            query,
            {"$set": {
                "premium_templates_contracted": bool(event["after"]),
                "portal_template_entitlement_request_id": request_id,
            }},
        )
    except Exception:
        latest = await db.organizations.find_one({"organization_id": org_id}, {"portal_template_entitlement_request_id": 1})
        if latest and latest.get("portal_template_entitlement_request_id") != request_id:
            await _set_entitlement_event_state(db, request_id, "failed", "organization_update_failed")
        logger.exception("Portal template entitlement org update is uncertain; request_id=%s", request_id)
        raise HTTPException(status_code=503, detail="Entitlement change requires reconciliation")
    if result.matched_count != 1:
        latest = await db.organizations.find_one({"organization_id": org_id}, {"portal_template_entitlement_request_id": 1})
        if latest and latest.get("portal_template_entitlement_request_id") == request_id:
            pass
        else:
            await _set_entitlement_event_state(db, request_id, "failed", "organization_precondition_changed")
            raise HTTPException(status_code=409, detail="Organization entitlement changed concurrently")
    try:
        completed = await _set_entitlement_event_state(db, request_id, "applied")
    except Exception as exc:
        logger.exception("Entitlement audit apply failed; request_id=%s", request_id)
        raise HTTPException(status_code=503, detail="Entitlement change applied; audit requires reconciliation") from exc
    if not completed:
        raise HTTPException(status_code=503, detail="Entitlement change applied; audit requires reconciliation")
    return {"organization_id": org_id, "contracted": bool(event["after"]), "request_id": request_id}


async def set_organization_entitlement(db, actor, organization_id: str, contracted: bool, reason: str, request_id: str) -> dict:
    authority = await require_platform_capability(db, actor, CAPABILITY, request_id)
    prior = await _prior_request_event(db, authority, request_id)
    if prior:
        if (
            prior.get("type") != "entitlement_change_requested"
            or prior.get("actor_user_id") != actor.user_id
            or prior.get("organization_id") != organization_id
            or prior.get("after") is not bool(contracted)
        ):
            raise HTTPException(status_code=409, detail="request_id already used")
        if prior.get("state") == "applied":
            return {"organization_id": organization_id, "contracted": bool(contracted), "request_id": request_id}
        if prior.get("state") == "failed":
            raise HTTPException(status_code=409, detail="Entitlement request previously failed")
        return await _apply_entitlement_event(db, prior)

    org = await db.organizations.find_one(
        {"organization_id": organization_id},
        {"premium_templates_contracted": 1, "portal_template_entitlement_request_id": 1},
    )
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    before = bool(org.get("premium_templates_contracted", False))
    event = _event(
        "entitlement_change_requested", actor.user_id, request_id, reason,
        organization_id=organization_id, before=before, after=bool(contracted), state="pending",
    )
    event["before_request_id"] = org.get("portal_template_entitlement_request_id")
    query = {"$and": [
        _actor_filter(actor.user_id),
        _capacity_expr(),
        _request_id_unused_filter(request_id),
        {"audit_events": {"$not": {"$elemMatch": {
            "type": "entitlement_change_requested",
            "organization_id": organization_id,
            "state": "pending",
        }}}},
    ]}
    updated = await _atomic_authority_update(db, query, {"$push": {"audit_events": event}, "$inc": {"version": 1}, "$set": {"updated_at": _now()}})
    if not updated:
        current = await db.platform_capability_authority.find_one({"_id": AUTHORITY_ID}) or {}
        prior = await _prior_request_event(db, current, request_id)
        if prior:
            if (
                prior.get("type") == "entitlement_change_requested"
                and prior.get("actor_user_id") == actor.user_id
                and prior.get("organization_id") == organization_id
                and prior.get("after") is bool(contracted)
            ):
                if prior.get("state") == "applied":
                    return {"organization_id": organization_id, "contracted": bool(contracted), "request_id": request_id}
                if prior.get("state") == "failed":
                    raise HTTPException(status_code=409, detail="Entitlement request previously failed")
                return await _apply_entitlement_event(db, prior)
            raise HTTPException(status_code=409, detail="request_id already used")
        if not any(g.get("user_id") == actor.user_id for g in current.get("active_grants", [])):
            await _record_denial(db, actor_user_id=actor.user_id, request_id=request_id, reason="entitlement_actor_revoked")
            raise HTTPException(status_code=403, detail=_PUBLIC_DENIAL)
        if any(
            event.get("type") == "entitlement_change_requested"
            and event.get("organization_id") == organization_id
            and event.get("state") == "pending"
            for event in current.get("audit_events", [])
        ):
            raise HTTPException(status_code=409, detail="Organization has a pending entitlement request")
        raise HTTPException(status_code=503, detail="Platform capability authority is at capacity")
    return await _apply_entitlement_event(db, event)


def _audit_chain(events: list[dict], previous_hash: str = "") -> tuple[list[dict], str]:
    chain = []
    last = previous_hash
    for event in events:
        payload = json.dumps(event, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        last = hashlib.sha256((last + "\n" + payload).encode("utf-8")).hexdigest()
        chain.append({"event": event, "previous_hash": chain[-1]["hash"] if chain else previous_hash, "hash": last})
    return chain, last


class CapabilityGrantRequest(BaseModel):
    user_id: str = Field(min_length=1, max_length=256)
    reason: str = Field(min_length=1, max_length=MAX_REASON_LENGTH)


class CapabilityRevokeRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=MAX_REASON_LENGTH)


class PortalTemplateEntitlementRequest(BaseModel):
    contracted: bool
    reason: str = Field(min_length=1, max_length=MAX_REASON_LENGTH)


def build_platform_capability_router(db, get_current_user):
    router = APIRouter(prefix="/owner/platform-capabilities", tags=["owner-platform-capabilities"])

    async def authorized(request: Request, authorization: Optional[str], session_token: Optional[str]):
        request_id = _request_id(request)
        try:
            user = await get_current_user(authorization, session_token)
        except HTTPException:
            await _record_denial(db, actor_user_id=None, request_id=request_id, reason="authentication_required")
            raise HTTPException(status_code=403, detail=_PUBLIC_DENIAL)
        await require_platform_capability(db, user, CAPABILITY, request_id)
        return user, request_id

    @router.get("/portal-template-entitlements/grants")
    async def list_grants(request: Request, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
        _, rid = await authorized(request, authorization, session_token)
        authority = await db.platform_capability_authority.find_one({"_id": AUTHORITY_ID}, {"_id": 0})
        events = authority.get("audit_events", [])
        grant_history = [e for e in events if e.get("type") in {"bootstrap_granted", "granted", "revoked"}]
        return {"capability": CAPABILITY, "version": authority.get("version", 0), "active_grants": authority.get("active_grants", []), "audit_events": grant_history[-200:], "request_id": rid}

    @router.post("/portal-template-entitlements/grants")
    async def create_grant(data: CapabilityGrantRequest, request: Request, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
        actor, rid = await authorized(request, authorization, session_token)
        reason = _clean_reason(data.reason)
        target = await db.users.find_one(
            {"user_id": data.user_id},
            {"_id": 0, "user_id": 1, "role": 1, "access_status": 1, "active": 1, "deleted_at": 1},
        )
        if not _is_eligible_platform_owner(target):
            raise HTTPException(status_code=409, detail="Target user is not an approved owner")
        result = await grant_capability(db, actor, target, reason, rid)
        return {"capability": CAPABILITY, "user_id": target["user_id"], "active": True, "version": result.get("version"), "request_id": rid}

    @router.delete("/portal-template-entitlements/grants/{user_id}")
    async def delete_grant(user_id: str, data: CapabilityRevokeRequest, request: Request, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
        actor, rid = await authorized(request, authorization, session_token)
        result = await revoke_capability(db, actor, user_id, _clean_reason(data.reason), rid)
        return {"capability": CAPABILITY, "user_id": user_id, "active": False, "version": result.get("version"), "request_id": rid}

    @router.put("/portal-templates/{organization_id}/entitlement")
    async def set_entitlement(organization_id: str, data: PortalTemplateEntitlementRequest, request: Request, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
        actor, rid = await authorized(request, authorization, session_token)
        return await set_organization_entitlement(db, actor, organization_id, data.contracted, _clean_reason(data.reason), rid)

    return router

async def bootstrap_initial_grant(db, user_id: str) -> dict:
    """Offline-only first grant. Concurrent invocations can create at most one authority doc."""
    user = await db.users.find_one(
        {"user_id": user_id},
        {"_id": 0, "user_id": 1, "role": 1, "access_status": 1, "active": 1, "deleted_at": 1},
    )
    if not _is_eligible_platform_owner(user):
        raise ValueError("bootstrap target must be an approved owner")
    await ensure_platform_capability_indexes(db)
    existing = await db.platform_capability_authority.find_one({"_id": AUTHORITY_ID})
    if existing:
        grants = existing.get("active_grants", [])
        bootstrap_events = [e for e in existing.get("audit_events", []) if e.get("type") == "bootstrap_granted"]
        if len(grants) == 1 and grants[0].get("user_id") == user_id and any(
            e.get("target_user_id") == user_id for e in bootstrap_events
        ):
            return {"created": False, "user_id": user_id, "version": existing.get("version", 1)}
        raise ValueError("platform capability authority already exists; bootstrap is not available")
    now = _now()
    request_id = "bootstrap_" + uuid.uuid4().hex
    grant = {"user_id": user_id, "granted_by_user_id": "offline_bootstrap", "granted_at": now, "reason": "offline bootstrap"}
    event = _event("bootstrap_granted", "offline_bootstrap", request_id, "offline bootstrap", target_user_id=user_id, after={"active": True})
    initial = {"version": 1, "active_grants": [grant], "audit_events": [event], "updated_at": now}
    try:
        result = await db.platform_capability_authority.find_one_and_update(
            {"_id": AUTHORITY_ID},
            {"$setOnInsert": initial},
            upsert=True,
            return_document=ReturnDocument.BEFORE,
        )
    except Exception as exc:
        # The only expected concurrent outcome is another bootstrap winning _id.
        current = await db.platform_capability_authority.find_one({"_id": AUTHORITY_ID})
        if current:
            grants = current.get("active_grants", [])
            boot = [e for e in current.get("audit_events", []) if e.get("type") == "bootstrap_granted"]
            if len(grants) == 1 and grants[0].get("user_id") == user_id and any(e.get("target_user_id") == user_id for e in boot):
                return {"created": False, "user_id": user_id, "version": current.get("version", 1)}
        raise ValueError("platform capability authority already exists; bootstrap failed closed") from exc
    if result is None:
        return {"created": True, "user_id": user_id, "version": 1}
    grants = result.get("active_grants", [])
    boot = [e for e in result.get("audit_events", []) if e.get("type") == "bootstrap_granted"]
    if len(grants) == 1 and grants[0].get("user_id") == user_id and any(e.get("target_user_id") == user_id for e in boot):
        return {"created": False, "user_id": user_id, "version": result.get("version", 1)}
    raise ValueError("platform capability authority already exists; bootstrap failed closed")


async def acquire_platform_maintenance_lock(db) -> str:
    """Acquire the exclusive offline maintenance barrier after API writers are drained."""
    authority = await db.platform_capability_authority.find_one({"_id": AUTHORITY_ID})
    if not authority:
        raise RuntimeError("platform capability authority does not exist")
    lock_id = "maintenance_" + uuid.uuid4().hex
    locked = await db.platform_capability_authority.find_one_and_update(
        {
            "_id": AUTHORITY_ID,
            "version": authority.get("version", 0),
            "archive_lock": {"$exists": False},
            "maintenance_lock": {"$exists": False},
        },
        {"$set": {"maintenance_lock": lock_id}, "$inc": {"version": 1}},
        return_document=ReturnDocument.AFTER,
    )
    if not locked:
        raise RuntimeError("authority changed or another maintenance/archive lock is active")
    return lock_id


async def release_platform_maintenance_lock(db, lock_id: str) -> bool:
    result = await db.platform_capability_authority.update_one(
        {"_id": AUTHORITY_ID, "maintenance_lock": lock_id},
        {"$unset": {"maintenance_lock": ""}, "$inc": {"version": 1}},
    )
    return result.modified_count == 1


async def reconcile_pending_entitlements(db, maintenance_lock_id: Optional[str] = None) -> dict:
    """Reconcile only under the offline writer-drain maintenance barrier."""
    authority = await db.platform_capability_authority.find_one({"_id": AUTHORITY_ID})
    if not authority:
        raise RuntimeError("platform capability authority does not exist")
    if not maintenance_lock_id or authority.get("maintenance_lock") != maintenance_lock_id:
        raise RuntimeError("reconciliation requires an active platform maintenance lock")
    counts = {"applied": 0, "failed": 0, "pending": 0}
    for event in authority.get("audit_events", []):
        if event.get("type") != "entitlement_change_requested" or event.get("state") != "pending":
            continue
        rid = event.get("request_id")
        org = await db.organizations.find_one({"organization_id": event.get("organization_id")}, {"portal_template_entitlement_request_id": 1})
        state = "applied" if org and org.get("portal_template_entitlement_request_id") == rid else "failed"
        failure = None if state == "applied" else "org_update_not_applied"
        try:
            changed = await _set_entitlement_event_state(
                db, rid, state, failure, maintenance_lock_id=maintenance_lock_id,
            )
        except Exception:
            logger.exception("Entitlement reconciliation write failed; request_id=%s", rid)
            counts["pending"] += 1
            continue
        if changed:
            counts[state] += 1
        else:
            counts["pending"] += 1
    return counts
