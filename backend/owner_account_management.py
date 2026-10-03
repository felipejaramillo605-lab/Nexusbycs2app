"""Owner account management: add other Owners by email, and delete (archive) an organization.

* Adding an Owner promotes an existing account, or leaves a time-boxed invitation that only a
  Google-verified sign-in with that exact email can consume (a manually registered email is never
  trusted to become Owner).
* Deleting an organization is a soft delete: the data stays for legal retention, the organization
  disappears from lists and its public pages, and every account in it loses access (anonymized like
  the existing per-user admin deletion). Both actions are audited with a written reason.
"""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Cookie, Header, HTTPException, Request
from pydantic import BaseModel, Field

from audit_contracts import record_audit_event

INVITATION_DAYS = 14
EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
PUBLIC_ORG_PATH = re.compile(r"^/api/public/(org_[A-Za-z0-9_-]+)/")


def _now():
    return datetime.now(timezone.utc)


def normalize_email(value: str) -> str:
    return (value or "").strip().lower()


def _same_name(a: str, b: str) -> bool:
    return " ".join((a or "").split()).casefold() == " ".join((b or "").split()).casefold()


class OwnerAddIn(BaseModel):
    email: str = Field(min_length=5, max_length=254)
    reason: str = Field(min_length=10, max_length=300)


class OrganizationDeleteIn(BaseModel):
    confirm_name: str = Field(min_length=1, max_length=200)
    reason: str = Field(min_length=10, max_length=300)


async def consume_owner_invitation(db, email: str) -> bool:
    """Atomically accept a pending, unexpired Owner invitation for a Google-verified email."""
    now = _now().isoformat()
    invitation = await db.owner_invitations.find_one_and_update(
        {"email_normalized": normalize_email(email), "status": "pending", "expires_at": {"$gt": now}},
        {"$set": {"status": "accepted", "accepted_at": now}},
    )
    return bool(invitation)


async def enforce_organization_active(request: Request, db):
    """404 for public pages of a deleted organization (cheap: only `/api/public/org_*/…` paths hit the DB)."""
    match = PUBLIC_ORG_PATH.match(request.url.path)
    if not match:
        return
    deleted = await db.organizations.find_one(
        {"organization_id": match.group(1), "deleted_at": {"$exists": True, "$ne": None}},
        {"_id": 0, "organization_id": 1},
    )
    if deleted:
        raise HTTPException(status_code=404, detail="Organization not found")


def build_owner_account_router(db, get_current_user):
    router = APIRouter()

    async def owner(authorization, session_token):
        user = await get_current_user(authorization, session_token)
        if user.role != "owner" or user.access_status != "approved":
            raise HTTPException(status_code=403, detail="Approved Owner access required")
        return user

    @router.post("/owner/owners", tags=["owner-users"])
    async def add_owner(
        data: OwnerAddIn, authorization: str | None = Header(None), session_token: str | None = Cookie(None)
    ):
        actor = await owner(authorization, session_token)
        email = normalize_email(data.email)
        if not EMAIL_PATTERN.match(email):
            raise HTTPException(status_code=422, detail="Escribe un correo válido")
        reason = data.reason.strip()
        existing = await db.users.find_one({"email": {"$regex": f"^{re.escape(email)}$", "$options": "i"}}, {"_id": 0})
        if existing:
            if existing.get("access_status") == "deleted" or existing.get("deleted_at"):
                raise HTTPException(
                    status_code=409, detail="Esa cuenta fue eliminada; pide que se registre de nuevo con otro correo"
                )
            if existing.get("role") == "owner" and existing.get("access_status") == "approved":
                return {"result": "already_owner", "email": existing.get("email")}
            previous = {"role": existing.get("role"), "access_status": existing.get("access_status")}
            await db.users.update_one(
                {"user_id": existing["user_id"]},
                {"$set": {"role": "owner", "access_status": "approved", "active": True}},
            )
            await db.user_sessions.delete_many({"user_id": existing["user_id"]})
            await record_audit_event(
                db,
                category="account",
                event_type="owner_added",
                actor_user_id=actor.user_id,
                organization_id=existing.get("organization_id"),
                entity_type="user_account",
                entity_id=existing["user_id"],
                reason=reason,
                previous_value=previous,
                new_value={"role": "owner", "access_status": "approved"},
            )
            return {"result": "promoted", "email": existing.get("email"), "name": existing.get("name")}
        now = _now()
        pending = await db.owner_invitations.find_one(
            {"email_normalized": email, "status": "pending", "expires_at": {"$gt": now.isoformat()}}, {"_id": 0}
        )
        if pending:
            return {"result": "already_invited", "email": email, "expires_at": pending["expires_at"]}
        invitation = {
            "invitation_id": "oinv_" + uuid.uuid4().hex,
            "email_normalized": email,
            "status": "pending",
            "reason": reason,
            "created_by": actor.user_id,
            "created_at": now.isoformat(),
            "expires_at": (now + timedelta(days=INVITATION_DAYS)).isoformat(),
        }
        await db.owner_invitations.insert_one(dict(invitation))
        await record_audit_event(
            db,
            category="account",
            event_type="owner_invited",
            actor_user_id=actor.user_id,
            entity_type="owner_invitation",
            entity_id=invitation["invitation_id"],
            reason=reason,
            new_value={"email": email, "expires_at": invitation["expires_at"]},
        )
        return {"result": "invited", "email": email, "expires_at": invitation["expires_at"]}

    @router.get("/owner/owner-invitations", tags=["owner-users"])
    async def list_invitations(authorization: str | None = Header(None), session_token: str | None = Cookie(None)):
        await owner(authorization, session_token)
        rows = await db.owner_invitations.find(
            {"status": "pending", "expires_at": {"$gt": _now().isoformat()}},
            {"_id": 0, "invitation_id": 1, "email_normalized": 1, "created_at": 1, "expires_at": 1},
        ).to_list(200)
        return {"items": rows}

    @router.delete("/owner/owner-invitations/{invitation_id}", tags=["owner-users"])
    async def revoke_invitation(
        invitation_id: str, authorization: str | None = Header(None), session_token: str | None = Cookie(None)
    ):
        actor = await owner(authorization, session_token)
        invitation = await db.owner_invitations.find_one(
            {"invitation_id": invitation_id, "status": "pending"}, {"_id": 0}
        )
        if not invitation:
            raise HTTPException(status_code=404, detail="Invitation not found")
        await db.owner_invitations.update_one(
            {"invitation_id": invitation_id}, {"$set": {"status": "revoked", "revoked_at": _now().isoformat()}}
        )
        await record_audit_event(
            db,
            category="account",
            event_type="owner_invitation_revoked",
            actor_user_id=actor.user_id,
            entity_type="owner_invitation",
            entity_id=invitation_id,
            previous_value={"email": invitation["email_normalized"]},
        )
        return {"revoked": True}

    async def _impact(organization_id):
        today = _now().date().isoformat()
        users = await db.users.find(
            {"organization_id": organization_id},
            {"_id": 0, "role": 1, "access_status": 1, "active": 1, "deleted_at": 1},
        ).to_list(5000)
        live = [u for u in users if u.get("access_status") != "deleted" and not u.get("deleted_at")]
        return {
            "users": len(live),
            "enabled_owners": sum(
                1
                for u in live
                if u.get("role") == "owner" and u.get("access_status") == "approved" and u.get("active") is not False
            ),
            "upcoming_appointments": await db.appointments.count_documents(
                {"organization_id": organization_id, "status": "confirmed", "date": {"$gte": today}}
            ),
            "clients": await db.clients.count_documents({"organization_id": organization_id}),
        }

    async def _active_org(organization_id):
        org = await db.organizations.find_one(
            {"organization_id": organization_id}, {"_id": 0, "organization_id": 1, "name": 1, "deleted_at": 1}
        )
        if not org or org.get("deleted_at"):
            raise HTTPException(status_code=404, detail="Organization not found")
        return org

    @router.get("/owner/organizations/{organization_id}/deletion-impact", tags=["owner-users"])
    async def deletion_impact(
        organization_id: str, authorization: str | None = Header(None), session_token: str | None = Cookie(None)
    ):
        await owner(authorization, session_token)
        org = await _active_org(organization_id)
        return {"organization_id": organization_id, "name": org.get("name"), **await _impact(organization_id)}

    @router.post("/owner/organizations/{organization_id}/delete", tags=["owner-users"])
    async def delete_organization(
        organization_id: str,
        data: OrganizationDeleteIn,
        authorization: str | None = Header(None),
        session_token: str | None = Cookie(None),
    ):
        actor = await owner(authorization, session_token)
        org = await _active_org(organization_id)
        if not _same_name(data.confirm_name, org.get("name")):
            raise HTTPException(
                status_code=400,
                detail={
                    "code": "confirmation_mismatch",
                    "message": "El nombre escrito no coincide con la organización",
                },
            )
        impact = await _impact(organization_id)
        if impact["enabled_owners"]:
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "owner_in_organization",
                    "message": "Hay una cuenta Owner vinculada a esta organización; desvincúlala antes de eliminarla",
                },
            )
        reason = data.reason.strip()
        now = _now().isoformat()
        await record_audit_event(
            db,
            category="account",
            event_type="organization_deleted",
            actor_user_id=actor.user_id,
            organization_id=organization_id,
            entity_type="organization",
            entity_id=organization_id,
            reason=reason,
            previous_value={"name": org.get("name")},
            new_value={"deleted": True, **{k: impact[k] for k in ("users", "upcoming_appointments", "clients")}},
        )
        members = await db.users.find(
            {"organization_id": organization_id, "role": {"$ne": "owner"}},
            {"_id": 0, "user_id": 1, "access_status": 1, "deleted_at": 1},
        ).to_list(5000)
        for member in members:
            if member.get("access_status") == "deleted" or member.get("deleted_at"):
                continue
            await db.user_sessions.delete_many({"user_id": member["user_id"]})
            await db.users.update_one(
                {"user_id": member["user_id"]},
                {
                    "$set": {
                        "email": f"deleted+{member['user_id']}@nexus.invalid",
                        "name": "Cuenta eliminada",
                        "first_name": None,
                        "last_name": None,
                        "phone": None,
                        "address": None,
                        "picture": None,
                        "password_hash": None,
                        "access_status": "deleted",
                        "active": False,
                        "deleted_at": now,
                        "deletion_kind": "organization_deleted",
                    }
                },
            )
        await db.barbers.update_many(
            {"organization_id": organization_id}, {"$set": {"active": False, "updated_at": now}}
        )
        await db.organizations.update_one(
            {"organization_id": organization_id},
            {
                "$set": {
                    "deleted_at": now,
                    "deleted_by": actor.user_id,
                    "deletion_reason": reason,
                    "status": "deleted",
                    "updated_at": now,
                }
            },
        )
        return {
            "deleted": True,
            "organization_id": organization_id,
            "users_removed": len(members),
            **{k: impact[k] for k in ("upcoming_appointments", "clients")},
        }

    return router
