# NEXUS_8A3A_THIRD_PARTY_MATRIX_API_V1
from __future__ import annotations

import math
import re
from typing import Optional

from fastapi import APIRouter, Cookie, Header, HTTPException, Query

from owner_billing_hub import fiscal_profile_view

SAFE_PERSON_PROJECTION = {
    "_id": 0,
    "user_id": 1,
    "organization_id": 1,
    "name": 1,
    "first_name": 1,
    "last_name": 1,
    "role": 1,
    "email": 1,
    "phone": 1,
    "access_status": 1,
    "active": 1,
    "created_at": 1,
    "last_login": 1,
}

SAFE_ORGANIZATION_PROJECTION = {
    "_id": 0,
    "organization_id": 1,
    "name": 1,
    "address": 1,
    "phone": 1,
    "created_at": 1,
}

SAFE_PROFILE_PROJECTION = {
    "_id": 0,
    "organization_id": 1,
    "billing_email": 1,
    "billing_contact_name": 1,
    "billing_contact_phone": 1,
    "person_type": 1,
    "commercial_name": 1,
    "legal_name": 1,
    "document_type": 1,
    "tax_id": 1,
    "verification_digit": 1,
    "tax_responsibility": 1,
    "tax_regime": 1,
    "country": 1,
    "department": 1,
    "city": 1,
    "address": 1,
    "postal_code": 1,
    "fiscal_notes": 1,
    "cc_emails": 1,
    "copy_primary_manager": 1,
    "email_enabled": 1,
    "profile_status": 1,
    "missing_required_fields": 1,
    "profile_version": 1,
    "created_at": 1,
    "updated_at": 1,
}

async def ensure_third_party_matrix_indexes(db):
    await db.organizations.create_index(
        "organization_id", unique=True, sparse=True,
        name="third_party_organization_id_unique",
    )
    await db.organizations.create_index(
        "name", name="third_party_organization_name",
    )
    await db.users.create_index(
        [("organization_id", 1), ("role", 1), ("name", 1)],
        name="third_party_user_org_role_name",
    )
    await db.users.create_index(
        [("organization_id", 1), ("access_status", 1)],
        name="third_party_user_org_access",
    )


def _require_owner(user):
    if user.role != "owner":
        raise HTTPException(status_code=403, detail="Owner access required")
    if user.access_status != "approved":
        raise HTTPException(status_code=403, detail="Account pending approval")


def _safe_regex(value: str):
    return {"$regex": re.escape(value.strip()), "$options": "i"}


async def _people_counts(db, organization_ids):
    if not organization_ids:
        return {}
    pipeline = [
        {"$match": {"organization_id": {"$in": organization_ids}}},
        {"$group": {
            "_id": "$organization_id",
            "people_count": {"$sum": 1},
            "approved_count": {"$sum": {"$cond": [
                {"$eq": ["$access_status", "approved"]}, 1, 0
            ]}},
        }},
    ]
    rows = await db.users.aggregate(pipeline).to_list(len(organization_ids))
    return {row["_id"]: row for row in rows if row.get("_id")}


def _summary(organization, profile, counts):
    view = fiscal_profile_view(profile or {
        "organization_id": organization.get("organization_id")
    })
    return {
        "organization_id": organization.get("organization_id"),
        "name": organization.get("name"),
        "address": organization.get("address"),
        "phone": organization.get("phone"),
        "created_at": organization.get("created_at"),
        "legal_name": view.get("legal_name"),
        "commercial_name": view.get("commercial_name"),
        "tax_id": view.get("tax_id"),
        "billing_email": view.get("billing_email"),
        "city": view.get("city"),
        "profile_status": view.get("profile_status"),
        "missing_required_fields": view.get("missing_required_fields", []),
        "profile_version": view.get("profile_version", 0),
        "people_count": int((counts or {}).get("people_count", 0)),
        "approved_people_count": int((counts or {}).get("approved_count", 0)),
    }


def build_third_party_matrix_router(db, get_current_user):
    router = APIRouter(
        prefix="/owner/third-party-matrix",
        tags=["owner-third-party-matrix"],
    )

    async def actor(authorization, session_token):
        user = await get_current_user(authorization, session_token)
        _require_owner(user)
        return user

    @router.get("")
    async def list_third_parties(
        page: int = Query(default=1, ge=1),
        page_size: int = Query(default=25, ge=1, le=100),
        search: Optional[str] = Query(default=None, max_length=120),
        profile_status: Optional[str] = Query(default=None),
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        await actor(authorization, session_token)
        if profile_status not in {None, "complete", "incomplete"}:
            raise HTTPException(400, "Invalid profile_status")

        query = {}
        if search and search.strip():
            pattern = _safe_regex(search)
            matching_profiles = await db.organization_billing_profiles.find(
                {"$or": [
                    {"legal_name": pattern}, {"commercial_name": pattern},
                    {"tax_id": pattern}, {"billing_email": pattern},
                    {"city": pattern},
                ]},
                {"_id": 0, "organization_id": 1},
            ).to_list(1000)
            profile_ids = [row["organization_id"] for row in matching_profiles]
            query = {"$or": [
                {"name": pattern}, {"organization_id": pattern},
                {"organization_id": {"$in": profile_ids}},
            ]}

        organizations = await db.organizations.find(
            query, SAFE_ORGANIZATION_PROJECTION
        ).sort([("name", 1), ("organization_id", 1)]).to_list(5000)
        organization_ids = [row["organization_id"] for row in organizations]
        profiles = await db.organization_billing_profiles.find(
            {"organization_id": {"$in": organization_ids}},
            SAFE_PROFILE_PROJECTION,
        ).to_list(len(organization_ids) or 1)
        profile_map = {row["organization_id"]: row for row in profiles}
        counts = await _people_counts(db, organization_ids)
        items = [
            _summary(org, profile_map.get(org["organization_id"]), counts.get(org["organization_id"]))
            for org in organizations
        ]
        if profile_status:
            items = [row for row in items if row["profile_status"] == profile_status]

        total = len(items)
        total_pages = max(1, math.ceil(total / page_size))
        start = (page - 1) * page_size
        paged = items[start:start + page_size] if start < total else []
        return {
            "items": paged,
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": total_pages,
            "has_previous": page > 1,
            "has_next": page < total_pages,
        }

    @router.get("/{organization_id}")
    async def third_party_detail(
        organization_id: str,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        await actor(authorization, session_token)
        organization = await db.organizations.find_one(
            {"organization_id": organization_id}, SAFE_ORGANIZATION_PROJECTION
        )
        if not organization:
            raise HTTPException(404, "Organization not found")
        profile = await db.organization_billing_profiles.find_one(
            {"organization_id": organization_id}, SAFE_PROFILE_PROJECTION
        )
        people = await db.users.find(
            {"organization_id": organization_id}, SAFE_PERSON_PROJECTION
        ).sort([("role", 1), ("name", 1), ("user_id", 1)]).to_list(1000)
        audit = await db.organization_billing_profile_audits.find(
            {"organization_id": organization_id},
            {"_id": 0, "audit_id": 1, "event_type": 1,
             "actor_user_id": 1, "actor_role": 1, "reason": 1,
             "profile_version": 1, "created_at": 1},
        ).sort("created_at", -1).to_list(25)
        return {
            "organization": organization,
            "fiscal_profile": fiscal_profile_view(profile or {
                "organization_id": organization_id
            }),
            "people": people,
            "people_count": len(people),
            "fiscal_audit": audit,
        }

    return router
