"""Unified, read-side audit contract for the Owner console (plan PR 21).

This app accumulated several independent audit-event schemas over time,
each hand-rolled by the module that needed it: `db.audit_events` (a
general-purpose collection written by many unrelated modules -- inventory,
procurement, professional media, support, transactions -- but whose
`entity_type="user_account"` slice, written only by server.py's
`_owner_account_audit`, had NO reader anywhere before this),
`db.subscription_audit_events` (billing, owner_subscriptions.py, already
has its own per-organization read endpoint), `db.organization_billing_
profile_audits` (fiscal profile changes, owner_billing_hub.py, already
embedded in the organization ficha), and the hash-chained `audit_events`
array inside `platform_capability_authority` (capability grants,
platform_capabilities.py, already read via `GET /me` and the grants
endpoint).

Rather than forcing every existing, already-tested, already-read module to
migrate its storage (real regression risk for zero benefit -- their own
readers keep working exactly as they do today, untouched), this module
defines the ONE normalized envelope every audit record maps to for a
cross-cutting Owner view:
  - `record_audit_event()` gives new/growing writers (starting with account
    events, the one source that had no reader to protect) a real place to
    write through directly, into `db.platform_audit_log`.
  - The read side normalizes the three legacy sources on the fly and merges
    them with the new unified collection, so the Owner gets one real merged
    timeline without any existing write path changing.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Cookie, Header, HTTPException, Query

# The contract: every NEW audit writer should produce exactly this envelope.
# `category` is the one addition the legacy schemas don't share -- it's what
# lets the unified read endpoint group/filter consistently across sources
# that otherwise agree on almost nothing (field names, whether "reason" is
# required, whether there's an `entity_type` at all).
CATEGORIES = {"account", "billing", "fiscal_profile", "capability"}
AUDIT_EVENT_CONTRACT = {
    "required": {"category", "event_type", "actor_user_id", "created_at"},
    "optional": {"organization_id", "entity_type", "entity_id", "reason", "previous_value", "new_value", "metadata"},
}

_SOURCE_FETCH_LIMIT = 200


def _now():
    return datetime.now(timezone.utc).isoformat()


async def ensure_audit_log_indexes(db):
    await db.platform_audit_log.create_index("audit_id", unique=True, name="platform_audit_log_id_unique")
    await db.platform_audit_log.create_index(
        [("category", 1), ("created_at", -1)], name="platform_audit_log_category_created"
    )
    await db.platform_audit_log.create_index(
        [("organization_id", 1), ("created_at", -1)], name="platform_audit_log_org_created"
    )


async def record_audit_event(
    db,
    *,
    category,
    event_type,
    actor_user_id,
    organization_id=None,
    entity_type=None,
    entity_id=None,
    reason=None,
    previous_value=None,
    new_value=None,
    metadata=None,
):
    if category not in CATEGORIES:
        raise ValueError(f"Unknown audit category: {category}")
    event = {
        "audit_id": "paud_" + uuid.uuid4().hex,
        "category": category,
        "event_type": event_type,
        "actor_user_id": actor_user_id,
        "organization_id": organization_id,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "reason": reason,
        "previous_value": previous_value,
        "new_value": new_value,
        "metadata": metadata or {},
        "created_at": _now(),
    }
    await db.platform_audit_log.insert_one(event.copy())
    return event


def _normalize_account_event(row):
    return {
        "audit_id": row.get("audit_id"),
        "category": "account",
        "event_type": row.get("event_type"),
        "actor_user_id": row.get("actor_user_id"),
        "organization_id": row.get("organization_id"),
        "entity_type": row.get("entity_type"),
        "entity_id": row.get("entity_id"),
        "reason": None,
        "previous_value": row.get("previous_value"),
        "new_value": row.get("new_value"),
        "metadata": {},
        "created_at": row.get("created_at"),
    }


def _normalize_subscription_event(row):
    return {
        "audit_id": row.get("audit_event_id"),
        "category": "billing",
        "event_type": row.get("event_type"),
        "actor_user_id": row.get("actor_user_id"),
        "organization_id": row.get("organization_id"),
        "entity_type": row.get("entity_type"),
        "entity_id": row.get("entity_id"),
        "reason": row.get("reason"),
        "previous_value": row.get("previous_value"),
        "new_value": row.get("new_value"),
        "metadata": {},
        "created_at": row.get("created_at"),
    }


def _normalize_fiscal_profile_event(row):
    return {
        "audit_id": row.get("audit_id"),
        "category": "fiscal_profile",
        "event_type": row.get("event_type"),
        "actor_user_id": row.get("actor_user_id"),
        "organization_id": row.get("organization_id"),
        "entity_type": "billing_profile",
        "entity_id": row.get("organization_id"),
        "reason": row.get("reason"),
        "previous_value": row.get("previous_value"),
        "new_value": row.get("new_value"),
        "metadata": {},
        "created_at": row.get("created_at"),
    }


def _normalize_capability_event(row):
    return {
        "audit_id": row.get("event_id"),
        "category": "capability",
        "event_type": row.get("type"),
        "actor_user_id": row.get("actor_user_id"),
        "organization_id": row.get("organization_id"),
        "entity_type": "capability_grant",
        "entity_id": row.get("target_user_id"),
        "reason": row.get("reason"),
        "previous_value": row.get("before"),
        "new_value": row.get("after"),
        "metadata": {},
        "created_at": row.get("created_at"),
    }


async def _fetch_recent(db, category_filter, organization_id):
    """Bounded recent-window fetch from every source, normalized to the same
    envelope, merged and sorted in Python. Mirrors the same bounded-fetch +
    Python-side merge billing_summary (plan PR 14) already uses -- at this
    app's real admin-action volume that's simpler to get right than a
    cross-collection database-side merge, and easy to verify.
    """
    rows = []
    query_base = {"organization_id": organization_id} if organization_id else {}

    platform_query = dict(query_base)
    if category_filter:
        platform_query["category"] = category_filter
    docs = (
        await db.platform_audit_log.find(platform_query, {"_id": 0}).sort("created_at", -1).to_list(_SOURCE_FETCH_LIMIT)
    )
    rows.extend(docs)

    # Legacy sources, normalized on read. db.audit_events is actually a much
    # bigger, general-purpose collection than just account events -- it's
    # also written by inventory_reorder.py, procurement_*.py,
    # professional_media.py, service_recipes.py, support_center.py,
    # transaction_voids.py, and other server.py flows (invitations, RSVP
    # links, etc). Those domains are out of scope for this PR's contract
    # (not among the 4 schemas the plan called out), so this filters to
    # exactly entity_type="user_account" -- what _owner_account_audit always
    # wrote here before this PR now writes through record_audit_event
    # instead -- rather than mislabeling unrelated operational audit rows as
    # "account" category.
    if category_filter in (None, "account"):
        account_query = {**query_base, "entity_type": "user_account"}
        docs = await db.audit_events.find(account_query, {"_id": 0}).sort("created_at", -1).to_list(_SOURCE_FETCH_LIMIT)
        rows.extend(_normalize_account_event(row) for row in docs)

    if category_filter in (None, "billing"):
        docs = (
            await db.subscription_audit_events.find(query_base, {"_id": 0})
            .sort("created_at", -1)
            .to_list(_SOURCE_FETCH_LIMIT)
        )
        rows.extend(_normalize_subscription_event(row) for row in docs)

    if category_filter in (None, "fiscal_profile"):
        docs = (
            await db.organization_billing_profile_audits.find(query_base, {"_id": 0})
            .sort("created_at", -1)
            .to_list(_SOURCE_FETCH_LIMIT)
        )
        rows.extend(_normalize_fiscal_profile_event(row) for row in docs)

    if category_filter in (None, "capability") and not organization_id:
        # Capability grants are platform-wide, not per-organization, so they
        # never match an organization_id filter -- skip the source entirely
        # rather than return zero rows that look like "capability events
        # for this org don't exist" when the real answer is "not scoped
        # that way."
        authority = await db.platform_capability_authority.find_one({}, {"_id": 0, "audit_events": 1})
        for row in (authority or {}).get("audit_events", [])[-_SOURCE_FETCH_LIMIT:]:
            rows.append(_normalize_capability_event(row))

    rows.sort(key=lambda r: r.get("created_at") or "", reverse=True)
    return rows


def build_audit_log_router(db, get_current_user):
    router = APIRouter(prefix="/owner/audit", tags=["owner-audit"])

    async def _owner(user):
        if user.role != "owner" or user.access_status != "approved":
            raise HTTPException(status_code=403, detail="Owner access required")

    @router.get("/events")
    async def list_audit_events(
        category: Optional[str] = None,
        organization_id: Optional[str] = None,
        page: int = Query(default=1, ge=1),
        page_size: int = Query(default=25, ge=1, le=100),
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        user = await get_current_user(authorization, session_token)
        await _owner(user)
        if category is not None and category not in CATEGORIES:
            raise HTTPException(status_code=400, detail="Unsupported audit category")
        rows = await _fetch_recent(db, category, organization_id)
        total = len(rows)
        start = (page - 1) * page_size
        page_rows = rows[start : start + page_size]
        total_pages = max(1, -(-total // page_size))
        return {
            "items": page_rows,
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": total_pages,
            "has_previous": page > 1,
            "has_next": page < total_pages,
        }

    return router
