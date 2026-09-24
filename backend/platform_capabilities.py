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
        "premium_request_id", "invoice_id",
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
    await db.premium_plan_requests.create_index(
        "request_id", unique=True, name="premium_plan_request_id_unique",
    )
    await db.premium_plan_requests.create_index(
        [("organization_id", 1), ("status", 1)],
        unique=True,
        partialFilterExpression={"status": "pending"},
        name="premium_plan_one_pending_request_per_org",
    )
    await db.premium_plan_requests.create_index(
        [("organization_id", 1), ("created_at", -1)],
        name="premium_plan_request_org_created",
    )
    await db.premium_plan_audit_events.create_index(
        "event_id", unique=True, name="premium_plan_audit_event_id_unique",
    )
    await db.premium_plan_audit_events.create_index(
        "request_id", unique=True, name="premium_plan_audit_request_id_unique",
    )
    await db.premium_plan_audit_events.create_index(
        [("organization_id", 1), ("created_at", -1)],
        name="premium_plan_audit_org_created",
    )
    await db.subscription_invoices.create_index(
        "premium_request_id", unique=True, sparse=True,
        name="premium_plan_invoice_request_unique",
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
        {
            "premium_templates_contracted": 1,
            "nexus_ai_contracted": 1,
            "nexus_ai_enabled": 1,
            "portal_template_entitlement_request_id": 1,
        },
    )
    if not org:
        await _set_entitlement_event_state(db, request_id, "failed", "organization_not_found")
        raise HTTPException(status_code=404, detail="Organization not found")
    if org.get("portal_template_entitlement_request_id") == request_id:
        if event.get("after") is False:
            # Keep this event pending until invoice locks are released so a new
            # activation cannot overlap the disable reconciliation.
            return {"organization_id": org_id, "contracted": False, "request_id": request_id}
        try:
            completed = await _set_entitlement_event_state(db, request_id, "applied")
        except Exception as exc:
            logger.exception("Entitlement audit apply failed; request_id=%s", request_id)
            raise HTTPException(status_code=503, detail="Entitlement audit is pending reconciliation") from exc
        if not completed:
            raise HTTPException(status_code=503, detail="Entitlement audit is pending reconciliation")
        return {"organization_id": org_id, "contracted": bool(event["after"]), "request_id": request_id}
    if event.get("after") is True:
        invoice = await db.subscription_invoices.find_one(
            {
                "invoice_id": event.get("invoice_id"),
                "organization_id": org_id,
                "provider": "manual",
                "invoice_purpose": "premium_plan_excess",
                "premium_request_id": event.get("premium_request_id"),
                "status": "paid",
                "premium_activation_operation_id": request_id,
                "premium_activation_state": {"$in": ["reserved", "active"]},
            },
            {"_id": 0, "amount_minor": 1, "paid_amount_minor": 1},
        )
        if not invoice or int(invoice.get("paid_amount_minor") or 0) < int(invoice.get("amount_minor") or 0):
            await _set_entitlement_event_state(db, request_id, "failed", "premium_invoice_lock_unavailable")
            raise HTTPException(status_code=409, detail="Paid Premium invoice activation lock is unavailable")
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
                "nexus_ai_contracted": bool(event["after"]),
                "nexus_ai_enabled": bool(event["after"]),
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
    if event.get("after") is False:
        return {"organization_id": org_id, "contracted": False, "request_id": request_id}
    try:
        completed = await _set_entitlement_event_state(db, request_id, "applied")
    except Exception as exc:
        logger.exception("Entitlement audit apply failed; request_id=%s", request_id)
        raise HTTPException(status_code=503, detail="Entitlement change applied; audit requires reconciliation") from exc
    if not completed:
        raise HTTPException(status_code=503, detail="Entitlement change applied; audit requires reconciliation")
    return {"organization_id": org_id, "contracted": bool(event["after"]), "request_id": request_id}


async def _validate_premium_invoice(db, organization_id: str, premium_request_id: str, invoice_id: str) -> dict:
    request = await db.premium_plan_requests.find_one(
        {"request_id": premium_request_id, "organization_id": organization_id}, {"_id": 0}
    )
    if not request or request.get("status") not in {"pending", "active"}:
        raise HTTPException(status_code=409, detail="Premium request is unavailable")
    invoice = await db.subscription_invoices.find_one(
        {"invoice_id": invoice_id, "organization_id": organization_id}, {"_id": 0}
    )
    if not invoice:
        raise HTTPException(status_code=409, detail="Premium invoice is unavailable")
    if (
        invoice.get("provider") != "manual"
        or invoice.get("invoice_purpose") != "premium_plan_excess"
        or invoice.get("premium_request_id") != premium_request_id
        or invoice.get("status") != "paid"
        or int(invoice.get("paid_amount_minor") or 0) < int(invoice.get("amount_minor") or 0)
    ):
        raise HTTPException(status_code=409, detail="A paid manual Premium invoice linked to this request is required")
    return invoice


async def _reserve_premium_invoice_activation(
    db, organization_id: str, premium_request_id: str, invoice_id: str, operation_id: str,
) -> dict:
    """Claim the paid invoice before entitlement writes; a refund uses the opposite CAS."""
    now = _now()
    result = await db.subscription_invoices.update_one(
        {
            "invoice_id": invoice_id,
            "organization_id": organization_id,
            "provider": "manual",
            "invoice_purpose": "premium_plan_excess",
            "premium_request_id": premium_request_id,
            "status": "paid",
            "$expr": {"$gte": [
                {"$ifNull": ["$paid_amount_minor", 0]},
                {"$ifNull": ["$amount_minor", 0]},
            ]},
            "$or": [
                {"premium_activation_state": {"$exists": False}},
                {"premium_activation_state": "released"},
                {
                    "premium_activation_operation_id": operation_id,
                    "premium_activation_state": {"$in": ["reserved", "active"]},
                },
            ],
        },
        {"$set": {
            "premium_activation_state": "reserved",
            "premium_activation_operation_id": operation_id,
            "premium_activation_request_id": premium_request_id,
            "premium_activation_locked_at": now,
            "updated_at": now,
        }},
    )
    invoice = await db.subscription_invoices.find_one(
        {"invoice_id": invoice_id, "organization_id": organization_id}, {"_id": 0}
    )
    if not invoice or invoice.get("premium_activation_operation_id") != operation_id or invoice.get("premium_activation_state") not in {"reserved", "active"}:
        raise HTTPException(status_code=409, detail="Premium invoice is already locked or no longer paid")
    # A no-op CAS is an idempotent retry for this exact operation.
    return invoice


async def _mark_premium_invoice_active(db, organization_id: str, premium_request_id: str, invoice_id: str, operation_id: str) -> None:
    await db.subscription_invoices.update_one(
        {
            "invoice_id": invoice_id,
            "organization_id": organization_id,
            "premium_request_id": premium_request_id,
            "premium_activation_operation_id": operation_id,
            "premium_activation_state": "reserved",
        },
        {"$set": {"premium_activation_state": "active", "premium_activation_at": _now(), "updated_at": _now()}},
    )
    invoice = await db.subscription_invoices.find_one(
        {"invoice_id": invoice_id, "organization_id": organization_id}, {"_id": 0}
    )
    if not invoice or invoice.get("premium_activation_operation_id") != operation_id or invoice.get("premium_activation_state") not in {"reserved", "active"}:
        raise HTTPException(status_code=503, detail="Premium activation lock requires reconciliation")


async def _release_premium_invoice_lock(db, organization_id: str, invoice: dict, operation_id: str) -> None:
    """Release only after the organization has durably lost all Premium flags."""
    org = await db.organizations.find_one(
        {"organization_id": organization_id},
        {"premium_templates_contracted": 1, "nexus_ai_contracted": 1, "nexus_ai_enabled": 1},
    )
    if not org or any(bool(org.get(key)) for key in ("premium_templates_contracted", "nexus_ai_contracted", "nexus_ai_enabled")):
        raise HTTPException(status_code=503, detail="Disable the Premium package before releasing its invoice lock")
    invoice_id = invoice.get("invoice_id")
    premium_request_id = invoice.get("premium_request_id")
    lock_operation_id = invoice.get("premium_activation_operation_id")
    released = await db.subscription_invoices.update_one(
        {
            "invoice_id": invoice_id,
            "organization_id": organization_id,
            "premium_request_id": premium_request_id,
            "premium_activation_operation_id": lock_operation_id,
            "premium_activation_state": {"$in": ["reserved", "active"]},
        },
        {"$set": {
            "premium_activation_state": "released",
            "premium_activation_released_by_operation_id": operation_id,
            "premium_activation_released_at": _now(),
            "updated_at": _now(),
        }},
    )
    if released.modified_count != 1:
        current = await db.subscription_invoices.find_one(
            {"invoice_id": invoice_id, "organization_id": organization_id}, {"_id": 0}
        )
        if not current or current.get("premium_activation_state") != "released" or current.get("premium_request_id") != premium_request_id:
            raise HTTPException(status_code=503, detail="Premium invoice lock release requires reconciliation")


async def _release_all_premium_invoice_locks(db, organization_id: str, operation_id: str) -> int:
    """Release every historical Premium invoice lock only after package disable."""
    org = await db.organizations.find_one(
        {"organization_id": organization_id},
        {"premium_templates_contracted": 1, "nexus_ai_contracted": 1, "nexus_ai_enabled": 1},
    )
    if not org or any(bool(org.get(key)) for key in ("premium_templates_contracted", "nexus_ai_contracted", "nexus_ai_enabled")):
        raise HTTPException(status_code=503, detail="Disable the Premium package before releasing its invoice locks")
    query = {
        "organization_id": organization_id,
        "invoice_purpose": "premium_plan_excess",
        "premium_activation_state": {"$in": ["reserved", "active"]},
    }
    invoices = await db.subscription_invoices.find(query, {"_id": 0}).to_list(500)
    released_count = 0
    for invoice in invoices:
        if invoice.get("premium_activation_state") in {"reserved", "active"}:
            await _release_premium_invoice_lock(db, organization_id, invoice, operation_id)
            released_count += 1
    released_rows = await db.subscription_invoices.find(
        {
            "organization_id": organization_id,
            "invoice_purpose": "premium_plan_excess",
            "premium_activation_state": "released",
            "premium_activation_released_by_operation_id": operation_id,
        },
        {"_id": 0, "premium_request_id": 1},
    ).to_list(500)
    for row in released_rows:
        if row.get("premium_request_id"):
            await db.premium_plan_requests.update_one(
                {
                    "request_id": row["premium_request_id"],
                    "organization_id": organization_id,
                    "status": {"$in": ["pending", "active"]},
                },
                {"$set": {"status": "disabled", "last_entitlement_request_id": operation_id, "updated_at": _now()}},
            )
    remaining = await db.subscription_invoices.find(query, {"_id": 0}).to_list(1)
    if remaining:
        raise HTTPException(status_code=503, detail="Premium invoice locks remain pending reconciliation")
    return released_count


async def _compensate_unpersisted_premium_reservation(
    db, organization_id: str, premium_request_id: str, invoice_id: str, operation_id: str,
) -> bool:
    """Release a reservation only after authoritative ledger reads prove no event exists."""
    authority = await db.platform_capability_authority.find_one({"_id": AUTHORITY_ID})
    if not authority:
        raise HTTPException(status_code=503, detail="Premium activation lock requires ledger reconciliation")
    prior = await _prior_request_event(db, authority, operation_id)
    if prior:
        return False
    org = await db.organizations.find_one({"organization_id": organization_id}, {"_id": 0}) or {}
    if org.get("portal_template_entitlement_request_id") == operation_id or any(
        bool(org.get(key)) for key in ("premium_templates_contracted", "nexus_ai_contracted", "nexus_ai_enabled")
    ):
        return False
    released = await db.subscription_invoices.update_one(
        {
            "invoice_id": invoice_id,
            "organization_id": organization_id,
            "provider": "manual",
            "invoice_purpose": "premium_plan_excess",
            "premium_request_id": premium_request_id,
            "status": "paid",
            "premium_activation_operation_id": operation_id,
            "premium_activation_state": "reserved",
        },
        {"$set": {
            "premium_activation_state": "released",
            "premium_activation_compensated_at": _now(),
            "premium_activation_compensation_reason": "authority_event_not_persisted",
            "updated_at": _now(),
        }},
    )
    if released.modified_count == 1:
        return True
    current = await db.subscription_invoices.find_one(
        {"invoice_id": invoice_id, "organization_id": organization_id}, {"_id": 0}
    )
    if current and current.get("premium_activation_state") == "released" and current.get("premium_activation_operation_id") == operation_id:
        return True
    return False


async def _reconcile_premium_invoice_state(db, event: dict) -> None:
    """Bring invoice lock and request status into line with a persisted ledger event."""
    premium_request_id = event.get("premium_request_id")
    invoice_id = event.get("invoice_id")
    org_id = event.get("organization_id")
    if not premium_request_id or not invoice_id or not org_id:
        return
    request_id = event["request_id"]
    org = await db.organizations.find_one(
        {"organization_id": org_id},
        {"_id": 0, "portal_template_entitlement_request_id": 1, "premium_templates_contracted": 1, "nexus_ai_contracted": 1, "nexus_ai_enabled": 1},
    ) or {}
    flags = tuple(bool(org.get(key)) for key in ("premium_templates_contracted", "nexus_ai_contracted", "nexus_ai_enabled"))
    if event.get("after") is True and org.get("portal_template_entitlement_request_id") == request_id and all(flags):
        invoice = await db.subscription_invoices.find_one(
            {"invoice_id": invoice_id, "organization_id": org_id, "premium_request_id": premium_request_id},
            {"_id": 0},
        )
        if not invoice:
            raise HTTPException(status_code=503, detail="Premium invoice is missing during entitlement reconciliation")
        if invoice.get("premium_activation_state") in {None, "released"}:
            await _reserve_premium_invoice_activation(db, org_id, premium_request_id, invoice_id, request_id)
        await _mark_premium_invoice_active(db, org_id, premium_request_id, invoice_id, request_id)
        await _update_premium_request_status(db, premium_request_id, org_id, True, request_id)
        return
    if event.get("after") is False and org.get("portal_template_entitlement_request_id") == request_id and not any(flags):
        await _update_premium_request_status(db, premium_request_id, org_id, False, request_id)
        await _release_all_premium_invoice_locks(db, org_id, request_id)
        return
    if event.get("state") == "failed" and event.get("after") is True and not any(flags):
        invoice = await db.subscription_invoices.find_one(
            {"invoice_id": invoice_id, "organization_id": org_id, "premium_request_id": premium_request_id},
            {"_id": 0},
        )
        if invoice and invoice.get("premium_activation_state") in {"reserved", "active"}:
            await _release_premium_invoice_lock(db, org_id, invoice, request_id)


async def set_organization_entitlement(
    db, actor, organization_id: str, contracted: bool, reason: str, request_id: str,
    premium_request_id: Optional[str] = None, invoice_id: Optional[str] = None,
) -> dict:
    authority = await require_platform_capability(db, actor, CAPABILITY, request_id)
    release_invoice = None
    if contracted:
        if not premium_request_id or not invoice_id:
            raise HTTPException(status_code=409, detail="A Premium request and paid manual invoice are required")
        await _validate_premium_invoice(db, organization_id, premium_request_id, invoice_id)
        await _reserve_premium_invoice_activation(db, organization_id, premium_request_id, invoice_id, request_id)
    else:
        # Locate a previous activation lock so a failed disable can be retried and
        # its release reconciled without editing or deleting paid invoice evidence.
        release_invoice = await db.subscription_invoices.find_one(
            {
                "organization_id": organization_id,
                "invoice_purpose": "premium_plan_excess",
                "premium_activation_state": {"$in": ["reserved", "active"]},
            },
            {"_id": 0},
        )
        if release_invoice:
            premium_request_id = release_invoice.get("premium_request_id")
            invoice_id = release_invoice.get("invoice_id")
    prior = await _prior_request_event(db, authority, request_id)
    if not contracted and prior and prior.get("type") == "entitlement_change_requested":
        premium_request_id = prior.get("premium_request_id")
        invoice_id = prior.get("invoice_id")
        if not release_invoice and invoice_id:
            release_invoice = await db.subscription_invoices.find_one(
                {
                    "invoice_id": invoice_id,
                    "organization_id": organization_id,
                    "invoice_purpose": "premium_plan_excess",
                    "premium_request_id": premium_request_id,
                    "premium_activation_state": {"$in": ["reserved", "active", "released"]},
                },
                {"_id": 0},
            )
    if prior:
        if (
            prior.get("type") != "entitlement_change_requested"
            or prior.get("actor_user_id") != actor.user_id
            or prior.get("organization_id") != organization_id
            or prior.get("after") is not bool(contracted)
            or prior.get("premium_request_id") != premium_request_id
            or prior.get("invoice_id") != invoice_id
        ):
            raise HTTPException(status_code=409, detail="request_id already used")
        if prior.get("state") == "applied":
            if contracted:
                current_org = await db.organizations.find_one({"organization_id": organization_id}, {"_id": 0}) or {}
                if current_org.get("portal_template_entitlement_request_id") == request_id and all(bool(current_org.get(k)) for k in ("premium_templates_contracted", "nexus_ai_contracted", "nexus_ai_enabled")):
                    await _mark_premium_invoice_active(db, organization_id, premium_request_id, invoice_id, request_id)
                    await _update_premium_request_status(db, premium_request_id, organization_id, True, request_id)
            await _reconcile_premium_invoice_state(db, prior)
            return {"organization_id": organization_id, "contracted": bool(contracted), "request_id": request_id}
        if prior.get("state") == "failed":
            raise HTTPException(status_code=409, detail="Entitlement request previously failed")
        result = await _apply_entitlement_event(db, prior)
        if contracted:
            await _mark_premium_invoice_active(db, organization_id, premium_request_id, invoice_id, request_id)
        await _update_premium_request_status(db, premium_request_id, organization_id, bool(contracted), request_id)
        await _reconcile_premium_invoice_state(db, prior)
        if not contracted:
            await _finalize_entitlement_event(db, request_id)
        return result

    org = await db.organizations.find_one(
        {"organization_id": organization_id},
        {
            "premium_templates_contracted": 1,
            "nexus_ai_contracted": 1,
            "nexus_ai_enabled": 1,
            "portal_template_entitlement_request_id": 1,
        },
    )
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    before = bool(org.get("premium_templates_contracted", False))
    event = _event(
        "entitlement_change_requested", actor.user_id, request_id, reason,
        organization_id=organization_id, before=before, after=bool(contracted), state="pending",
    )
    event["premium_request_id"] = premium_request_id
    event["invoice_id"] = invoice_id
    event["before_flags"] = {
        key: bool(org.get(key))
        for key in ("nexus_ai_contracted", "nexus_ai_enabled", "premium_templates_contracted")
    }
    event["after_flags"] = {key: bool(contracted) for key in event["before_flags"]}
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
    try:
        updated = await _atomic_authority_update(db, query, {"$push": {"audit_events": event}, "$inc": {"version": 1}, "$set": {"updated_at": _now()}})
    except Exception:
        # Resolve uncertain writes from the ledger before releasing the invoice.
        # A persisted pending/applied event owns the reservation and is replayed;
        # a confirmed absence is compensated with a CAS on this exact lock.
        try:
            latest_authority = await db.platform_capability_authority.find_one({"_id": AUTHORITY_ID})
            persisted = await _prior_request_event(db, latest_authority, request_id)
        except Exception as read_exc:
            logger.exception("Could not reconcile Premium activation ledger; request_id=%s", request_id)
            raise HTTPException(status_code=503, detail="Premium activation lock requires ledger reconciliation") from read_exc
        if persisted and persisted.get("type") == "entitlement_change_requested":
            if persisted.get("state") == "pending":
                result = await _apply_entitlement_event(db, persisted)
                await _reconcile_premium_invoice_state(db, {**persisted, "state": "applied"})
                return result
            if persisted.get("state") == "applied":
                await _reconcile_premium_invoice_state(db, persisted)
                return {"organization_id": organization_id, "contracted": bool(contracted), "request_id": request_id}
            await _reconcile_premium_invoice_state(db, persisted)
        elif persisted is None:
            compensated = await _compensate_unpersisted_premium_reservation(
                db, organization_id, premium_request_id, invoice_id, request_id,
            )
            if not compensated:
                raise HTTPException(status_code=503, detail="Premium activation lock requires reconciliation")
        raise
    if not updated:
        current = await db.platform_capability_authority.find_one({"_id": AUTHORITY_ID}) or {}
        prior = await _prior_request_event(db, current, request_id)
        if prior:
            if (
                prior.get("type") == "entitlement_change_requested"
                and prior.get("actor_user_id") == actor.user_id
                and prior.get("organization_id") == organization_id
                and prior.get("after") is bool(contracted)
                and prior.get("premium_request_id") == premium_request_id
                and prior.get("invoice_id") == invoice_id
            ):
                if prior.get("state") == "applied":
                    await _reconcile_premium_invoice_state(db, prior)
                    return {"organization_id": organization_id, "contracted": bool(contracted), "request_id": request_id}
                if prior.get("state") == "failed":
                    raise HTTPException(status_code=409, detail="Entitlement request previously failed")
                result = await _apply_entitlement_event(db, prior)
                await _reconcile_premium_invoice_state(db, {**prior, "state": "applied"})
                return result
            raise HTTPException(status_code=409, detail="request_id already used")
        if not any(g.get("user_id") == actor.user_id for g in current.get("active_grants", [])):
            if contracted:
                await _compensate_unpersisted_premium_reservation(db, organization_id, premium_request_id, invoice_id, request_id)
            await _record_denial(db, actor_user_id=actor.user_id, request_id=request_id, reason="entitlement_actor_revoked")
            raise HTTPException(status_code=403, detail=_PUBLIC_DENIAL)
        if any(
            event.get("type") == "entitlement_change_requested"
            and event.get("organization_id") == organization_id
            and event.get("state") == "pending"
            for event in current.get("audit_events", [])
        ):
            if contracted:
                await _compensate_unpersisted_premium_reservation(db, organization_id, premium_request_id, invoice_id, request_id)
            raise HTTPException(status_code=409, detail="Organization has a pending entitlement request")
        if contracted:
            compensated = await _compensate_unpersisted_premium_reservation(db, organization_id, premium_request_id, invoice_id, request_id)
            if not compensated:
                raise HTTPException(status_code=503, detail="Premium activation lock requires reconciliation")
        raise HTTPException(status_code=503, detail="Platform capability authority is at capacity")
    result = await _apply_entitlement_event(db, event)
    if contracted:
        await _mark_premium_invoice_active(db, organization_id, premium_request_id, invoice_id, request_id)
    await _update_premium_request_status(db, premium_request_id, organization_id, bool(contracted), request_id)
    if not contracted:
        await _reconcile_premium_invoice_state(db, event)
        await _finalize_entitlement_event(db, request_id)
    return result


async def _finalize_entitlement_event(db, request_id: str, maintenance_lock_id: Optional[str] = None) -> None:
    completed = await _set_entitlement_event_state(
        db, request_id, "applied", maintenance_lock_id=maintenance_lock_id,
    )
    if not completed:
        raise HTTPException(status_code=503, detail="Entitlement change requires reconciliation")


async def _update_premium_request_status(db, premium_request_id, organization_id, contracted, operation_id):
    if not premium_request_id:
        return
    status = "active" if contracted else "disabled"
    await db.premium_plan_requests.update_one(
        {"request_id": premium_request_id, "organization_id": organization_id},
        {"$set": {"status": status, "last_entitlement_request_id": operation_id, "updated_at": _now()}},
    )


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
    premium_request_id: Optional[str] = Field(default=None, min_length=1, max_length=128)
    invoice_id: Optional[str] = Field(default=None, min_length=1, max_length=128)


class PremiumInvoiceLinkRequest(BaseModel):
    invoice_id: str = Field(min_length=1, max_length=128)
    reason: str = Field(min_length=1, max_length=MAX_REASON_LENGTH)


def _premium_request_public(row: dict) -> dict:
    return {
        "request_id": row.get("request_id"),
        "organization_id": row.get("organization_id"),
        "organization_name": row.get("organization_name"),
        "status": row.get("status"),
        "created_at": row.get("created_at"),
        "requested_by": row.get("requested_by"),
    }


async def _ensure_premium_audit_event(db, event: dict) -> None:
    """Idempotently persist each request/link audit event by its request ID."""
    try:
        await db.premium_plan_audit_events.update_one(
            {"request_id": event["request_id"]},
            {"$setOnInsert": event},
            upsert=True,
        )
    except Exception:
        pass
    existing = await db.premium_plan_audit_events.find_one(
        {"request_id": event["request_id"]}, {"_id": 0}
    )
    if not existing or any(existing.get(key) != event.get(key) for key in (
        "event_type", "organization_id", "premium_request_id", "invoice_id", "actor_user_id",
    )):
        raise RuntimeError("Premium audit request ID conflict")


def build_platform_capability_router(db, get_current_user, resolve_team_organization=None):
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
        return await set_organization_entitlement(
            db, actor, organization_id, data.contracted, _clean_reason(data.reason), rid,
            data.premium_request_id, data.invoice_id,
        )

    @router.post("/premium-plan-requests")
    async def request_premium_plan(
        request: Request,
        organization_id: Optional[str] = None,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        user = await get_current_user(authorization, session_token)
        if user.role not in {"manager", "admin"} or user.access_status != "approved":
            raise HTTPException(status_code=403, detail="Manager access required")
        if not resolve_team_organization:
            raise HTTPException(status_code=503, detail="Organization resolver is unavailable")
        org_id = await resolve_team_organization(user, organization_id)
        rid = _request_id(request)
        existing = await db.premium_plan_requests.find_one({"organization_id": org_id, "status": "pending"}, {"_id": 0})
        if existing:
            if existing.get("idempotency_key") == rid:
                await _ensure_premium_audit_event(db, {
                    "event_id": "ppae_" + uuid.uuid4().hex,
                    "request_id": rid,
                    "premium_request_id": existing["request_id"],
                    "organization_id": org_id,
                    "event_type": "premium_requested",
                    "actor_user_id": user.user_id,
                    "reason": "Manager requested the Premium plan",
                    "state": "applied",
                    "created_at": existing.get("created_at") or _now(),
                })
                return {"status": "pending", "idempotent_replay": True}
            raise HTTPException(status_code=409, detail="A Premium request is already pending")
        org = await db.organizations.find_one({"organization_id": org_id}, {"_id": 0, "name": 1, "nexus_ai_contracted": 1, "nexus_ai_enabled": 1, "premium_templates_contracted": 1}) or {}
        if all(bool(org.get(k)) for k in ("nexus_ai_contracted", "nexus_ai_enabled", "premium_templates_contracted")):
            return {"status": "active", "idempotent_replay": True}
        now = _now()
        row = {
            "request_id": "ppr_" + uuid.uuid4().hex,
            "organization_id": org_id,
            "organization_name": str(org.get("name") or "")[:160],
            "status": "pending",
            "requested_by": user.user_id,
            "idempotency_key": rid,
            "created_at": now,
            "updated_at": now,
        }
        try:
            await db.premium_plan_requests.insert_one(row.copy())
        except Exception:
            existing = await db.premium_plan_requests.find_one({"organization_id": org_id, "status": "pending"}, {"_id": 0})
            if existing and existing.get("idempotency_key") == rid:
                return {"status": "pending", "idempotent_replay": True}
            if existing:
                raise HTTPException(status_code=409, detail="A Premium request is already pending")
            raise
        await _ensure_premium_audit_event(db, {
            "event_id": "ppae_" + uuid.uuid4().hex,
            "request_id": rid,
            "premium_request_id": row["request_id"],
            "organization_id": org_id,
            "event_type": "premium_requested",
            "actor_user_id": user.user_id,
            "reason": "Manager requested the Premium plan",
            "state": "applied",
            "created_at": now,
        })
        return {"status": "pending", "idempotent_replay": False}

    @router.get("/premium-plan/status")
    async def premium_plan_status(
        organization_id: Optional[str] = None,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        user = await get_current_user(authorization, session_token)
        if user.role not in {"manager", "admin"} or user.access_status != "approved":
            raise HTTPException(status_code=403, detail="Manager access required")
        if not resolve_team_organization:
            raise HTTPException(status_code=503, detail="Organization resolver is unavailable")
        org_id = await resolve_team_organization(user, organization_id)
        org = await db.organizations.find_one({"organization_id": org_id}, {"_id": 0, "nexus_ai_contracted": 1, "nexus_ai_enabled": 1, "premium_templates_contracted": 1}) or {}
        if all(bool(org.get(k)) for k in ("nexus_ai_contracted", "nexus_ai_enabled", "premium_templates_contracted")):
            return {"status": "active"}
        pending = await db.premium_plan_requests.find_one({"organization_id": org_id, "status": "pending"}, {"_id": 1})
        return {"status": "pending" if pending else "not_requested"}

    @router.get("/premium-plan-requests")
    async def list_premium_requests(request: Request, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
        _, rid = await authorized(request, authorization, session_token)
        rows = await db.premium_plan_requests.find({"status": {"$in": ["pending", "active"]}}, {"_id": 0}).sort("created_at", -1).to_list(200)
        return {"requests": [_premium_request_public(row) for row in rows], "request_id": rid}

    @router.post("/premium-plan-requests/{premium_request_id}/invoice-link")
    async def link_premium_invoice(
        premium_request_id: str,
        data: PremiumInvoiceLinkRequest,
        request: Request,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        actor, rid = await authorized(request, authorization, session_token)
        reason = _clean_reason(data.reason)
        plan_request = await db.premium_plan_requests.find_one(
            {"request_id": premium_request_id, "status": "pending"}, {"_id": 0}
        )
        if not plan_request:
            raise HTTPException(status_code=404, detail="Pending Premium request not found")
        org_id = plan_request["organization_id"]
        invoice = await db.subscription_invoices.find_one(
            {"invoice_id": data.invoice_id, "organization_id": org_id}, {"_id": 0}
        )
        if not invoice:
            raise HTTPException(status_code=409, detail="Invoice does not belong to this Premium request organization")
        if invoice.get("provider") != "manual" or invoice.get("status") not in {"draft", "issued", "pending", "overdue"}:
            raise HTTPException(status_code=409, detail="Only an unpaid manual invoice can be linked")
        if invoice.get("invoice_purpose") or invoice.get("premium_request_id"):
            if invoice.get("invoice_purpose") == "premium_plan_excess" and invoice.get("premium_request_id") == premium_request_id:
                await _ensure_premium_audit_event(db, {
                    "event_id": "ppae_" + uuid.uuid4().hex,
                    "request_id": invoice.get("premium_link_request_id") or rid,
                    "premium_request_id": premium_request_id,
                    "organization_id": org_id,
                    "invoice_id": data.invoice_id,
                    "event_type": "premium_invoice_linked",
                    "actor_user_id": invoice.get("premium_linked_by") or actor.user_id,
                    "reason": invoice.get("premium_link_reason") or reason,
                    "state": "applied",
                    "created_at": invoice.get("premium_linked_at") or _now(),
                })
                return {"linked": True, "idempotent_replay": True}
            raise HTTPException(status_code=409, detail="Invoice already has a commercial purpose")
        try:
            linked = await db.subscription_invoices.update_one(
                {
                    "invoice_id": data.invoice_id,
                    "organization_id": org_id,
                    "provider": "manual",
                    "status": {"$in": ["draft", "issued", "pending", "overdue"]},
                    "invoice_purpose": {"$exists": False},
                    "premium_request_id": {"$exists": False},
                },
                {"$set": {
                    "invoice_purpose": "premium_plan_excess",
                    "premium_request_id": premium_request_id,
                    "premium_linked_by": actor.user_id,
                    "premium_linked_at": _now(),
                    "premium_link_reason": reason,
                    "premium_link_request_id": rid,
                }},
            )
        except Exception as exc:
            logger.exception("Premium invoice link failed; request_id=%s", rid)
            raise HTTPException(status_code=503, detail="Premium invoice link requires reconciliation") from exc
        if linked.modified_count != 1:
            raise HTTPException(status_code=409, detail="Invoice changed before it could be linked")
        audit = {
            "event_id": "ppae_" + uuid.uuid4().hex,
            "request_id": rid,
            "premium_request_id": premium_request_id,
            "organization_id": org_id,
            "invoice_id": data.invoice_id,
            "event_type": "premium_invoice_linked",
            "actor_user_id": actor.user_id,
            "reason": reason,
            "state": "applied",
            "created_at": _now(),
        }
        try:
            await _ensure_premium_audit_event(db, audit)
        except Exception as exc:
            logger.exception("Premium invoice link audit failed; request_id=%s", rid)
            raise HTTPException(status_code=503, detail="Premium invoice linked; audit requires reconciliation") from exc
        return {"linked": True, "idempotent_replay": False}

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
    counts = {"applied": 0, "failed": 0, "pending": 0, "locks_reconciled": 0}
    for event in authority.get("audit_events", []):
        if event.get("type") != "entitlement_change_requested":
            continue
        rid = event.get("request_id")
        state = event.get("state")
        if state == "pending":
            org = await db.organizations.find_one(
                {"organization_id": event.get("organization_id")},
                {"portal_template_entitlement_request_id": 1, "premium_templates_contracted": 1, "nexus_ai_contracted": 1, "nexus_ai_enabled": 1},
            )
            expected_flags = event.get("after_flags") or {
                "premium_templates_contracted": bool(event.get("after")),
                "nexus_ai_contracted": bool(event.get("after")),
                "nexus_ai_enabled": bool(event.get("after")),
            }
            state_matches = bool(org) and org.get("portal_template_entitlement_request_id") == rid and all(
                bool(org.get(key)) == bool(value) for key, value in expected_flags.items()
            )
            next_state = "applied" if state_matches else "failed"
            if state_matches and event.get("after") is False:
                # For disable, release every lock while the authority event is
                # still pending; pending serializes any concurrent reactivation.
                try:
                    await _reconcile_premium_invoice_state(db, event)
                    await _finalize_entitlement_event(db, rid, maintenance_lock_id)
                except Exception:
                    logger.exception("Premium disable reconciliation failed; request_id=%s", rid)
                    counts["pending"] += 1
                    continue
                counts["applied"] += 1
                counts["locks_reconciled"] += 1
                continue
            try:
                changed = await _set_entitlement_event_state(
                    db, rid, next_state, None if state_matches else "org_update_not_applied",
                    maintenance_lock_id=maintenance_lock_id,
                )
            except Exception:
                logger.exception("Entitlement reconciliation write failed; request_id=%s", rid)
                counts["pending"] += 1
                continue
            if not changed:
                counts["pending"] += 1
                continue
            counts[next_state] += 1
            event = {**event, "state": next_state}
        if state in {"pending", "applied", "failed"}:
            try:
                await _reconcile_premium_invoice_state(db, event)
                counts["locks_reconciled"] += 1
            except Exception:
                logger.exception("Premium invoice lock reconciliation failed; request_id=%s", rid)
                counts["pending"] += 1
    return counts
