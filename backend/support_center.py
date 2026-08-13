# NEXUS_8A7S1A_SUPPORT_FOUNDATION_V1
from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Cookie, Header, HTTPException, Query
from pydantic import BaseModel, Field

SUPPORT_CHANNELS = {"chat", "ticket"}
SUPPORT_STATUSES = {"open", "waiting_owner", "waiting_organization", "in_progress", "resolved", "closed"}
SUPPORT_PRIORITIES = {"low", "normal", "high", "urgent"}
SUPPORT_MESSAGE_TYPES = {"text", "image", "mixed", "system"}
ORGANIZATION_SUPPORT_ROLES = {"manager", "admin"}
OWNER_SUPPORT_ROLES = {"owner"}


class SupportConversationCreate(BaseModel):
    channel: Literal["chat", "ticket"] = "chat"
    subject: str = Field(min_length=3, max_length=160)
    category: Optional[str] = Field(default=None, max_length=80)
    priority: Literal["low", "normal", "high"] = "normal"
    initial_message: str = Field(min_length=1, max_length=4000)
    idempotency_key: str = Field(min_length=8, max_length=200)


class SupportMessageCreate(BaseModel):
    body: str = Field(min_length=1, max_length=4000)
    idempotency_key: str = Field(min_length=8, max_length=200)


class SupportReadRequest(BaseModel):
    last_read_message_id: str = Field(min_length=8, max_length=128)


class SupportStatusUpdate(BaseModel):
    status: Literal["open", "waiting_owner", "waiting_organization", "in_progress", "resolved", "closed"]
    expected_version: int = Field(ge=1)


class SupportPriorityUpdate(BaseModel):
    priority: Literal["low", "normal", "high", "urgent"]
    expected_version: int = Field(ge=1)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def public_foundation_contract() -> dict:
    return {
        "module": "support_center",
        "foundation_version": "8A-7S1-A",
        "channels": sorted(SUPPORT_CHANNELS),
        "statuses": sorted(SUPPORT_STATUSES),
        "priorities": sorted(SUPPORT_PRIORITIES),
        "message_types": sorted(SUPPORT_MESSAGE_TYPES),
        "attachments_enabled": False,
        "external_notifications_enabled": False,
        "realtime_transport": "polling_planned",
    }


async def ensure_support_center_indexes(db):
    await db.support_conversations.create_index("conversation_id", unique=True, name="support_conversation_id_unique")
    await db.support_conversations.create_index([("organization_id", 1), ("updated_at", -1), ("conversation_id", -1)], name="support_conversation_org_updated")
    await db.support_conversations.create_index([("organization_id", 1), ("status", 1), ("updated_at", -1)], name="support_conversation_org_status_updated")
    await db.support_conversations.create_index([("channel", 1), ("status", 1), ("updated_at", -1)], name="support_conversation_channel_status_updated")
    await db.support_conversations.create_index([("assigned_owner_user_id", 1), ("status", 1), ("updated_at", -1)], name="support_conversation_assignment_status")
    await db.support_messages.create_index("message_id", unique=True, name="support_message_id_unique")
    await db.support_messages.create_index([("conversation_id", 1), ("created_at", 1), ("message_id", 1)], name="support_message_conversation_created")
    await db.support_messages.create_index([("organization_id", 1), ("created_at", -1)], name="support_message_org_created")
    await db.support_messages.create_index(
        [("organization_id", 1), ("sender_user_id", 1), ("idempotency_key", 1)],
        unique=True,
        partialFilterExpression={"idempotency_key": {"$type": "string"}},
        name="support_message_sender_idempotency_unique",
    )
    await db.support_reads.create_index([("conversation_id", 1), ("user_id", 1)], unique=True, name="support_read_conversation_user_unique")
    await db.support_reads.create_index([("organization_id", 1), ("user_id", 1), ("last_read_at", -1)], name="support_read_org_user_updated")
    await db.support_attachments.create_index("attachment_id", unique=True, sparse=True, name="support_attachment_id_unique")
    await db.support_attachments.create_index([("organization_id", 1), ("conversation_id", 1), ("created_at", -1)], name="support_attachment_org_conversation_created")


def build_support_center_router(db, get_current_user, require_management_role, resolve_team_organization, record_security_event):
    router = APIRouter(tags=["support"])

    async def actor(authorization, session_token):
        return await get_current_user(authorization, session_token)

    async def organization_actor(user, requested_org_id):
        require_management_role(user)
        if user.role not in ORGANIZATION_SUPPORT_ROLES and user.role != "owner":
            raise HTTPException(status_code=403, detail={"code": "support_role_forbidden", "message": "Support access is not available for this role"})
        return await resolve_team_organization(user, requested_org_id)

    async def owner_actor(user):
        if user.role not in OWNER_SUPPORT_ROLES:
            raise HTTPException(status_code=403, detail={"code": "owner_support_required", "message": "Owner support access required"})
        return user

    @router.get("/support/foundation")
    async def support_foundation(
        organization_id: Optional[str] = Query(None),
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        user = await actor(authorization, session_token)
        resolved_org = await organization_actor(user, organization_id)
        return {**public_foundation_contract(), "organization_id": resolved_org, "actor_role": user.role}

    @router.get("/owner/support/foundation")
    async def owner_support_foundation(
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        user = await owner_actor(await actor(authorization, session_token))
        return {**public_foundation_contract(), "organization_id": None, "actor_role": user.role, "global_inbox": True}

    return router
