# NEXUS_8A7S1A_SUPPORT_FOUNDATION_V1
from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal, Optional
import uuid

from pymongo.errors import DuplicateKeyError

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
    await db.support_conversations.create_index([("organization_id", 1), ("created_by_user_id", 1), ("create_idempotency_key", 1)], unique=True, partialFilterExpression={"create_idempotency_key": {"$type": "string"}}, name="support_conversation_create_idempotency_unique")
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


    # NEXUS_8A7S1B_CONVERSATION_DIRECTORY_V1
    def conversation_view(item):
        return {k: v for k, v in item.items() if k != "_id"}

    async def visible_conversation(user, conversation_id, owner_mode=False):
        query = {"conversation_id": conversation_id, "status": {"$ne": "creating"}}
        if not owner_mode:
            org_id = await organization_actor(user, None)
            query["organization_id"] = org_id
        item = await db.support_conversations.find_one(query, {"_id": 0})
        if not item:
            if not owner_mode:
                other = await db.support_conversations.find_one({"conversation_id": conversation_id}, {"_id": 0, "organization_id": 1})
                if other:
                    await record_security_event(event_type="cross_tenant_access_blocked", severity="high", actor=user.user_id, organization=query.get("organization_id"), path="/support/conversations", metadata={"reason_code": "support_read_scope"})
            raise HTTPException(status_code=404, detail={"code": "support_conversation_not_found", "message": "Conversation not found"})
        return item

    async def list_conversations(query, page, page_size):
        page = max(1, page)
        page_size = max(1, min(page_size, 100))
        total = await db.support_conversations.count_documents(query)
        items = await db.support_conversations.find(query, {"_id": 0}).sort([("updated_at", -1), ("conversation_id", -1)]).skip((page - 1) * page_size).limit(page_size).to_list(page_size)
        pages = max(1, (total + page_size - 1) // page_size)
        return {"items": items, "page": page, "page_size": page_size, "total": total, "total_pages": pages, "has_next": page < pages, "has_previous": page > 1}

    @router.post("/support/conversations")
    async def create_support_conversation(
        data: SupportConversationCreate,
        organization_id: Optional[str] = Query(None),
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        user = await actor(authorization, session_token)
        org_id = await organization_actor(user, organization_id)
        key = data.idempotency_key.strip()
        prior = await db.support_conversations.find_one({"organization_id": org_id, "created_by_user_id": user.user_id, "create_idempotency_key": key}, {"_id": 0})
        if prior:
            if prior.get("status") == "creating":
                raise HTTPException(status_code=409, detail={"code": "support_creation_in_progress", "message": "Conversation creation is in progress"})
            return {"conversation": conversation_view(prior), "idempotent": True}
        now = now_iso()
        conversation_id = "supc_" + uuid.uuid4().hex[:20]
        message_id = "supm_" + uuid.uuid4().hex[:20]
        subject = data.subject.strip()
        body = data.initial_message.strip()
        conversation = {
            "conversation_id": conversation_id, "organization_id": org_id, "channel": data.channel,
            "subject": subject, "category": (data.category or "general").strip()[:80] or "general",
            "status": "creating", "priority": data.priority, "created_by_user_id": user.user_id,
            "created_by_role": user.role, "assigned_owner_user_id": None, "last_message_id": message_id,
            "last_message_at": now, "last_message_preview": body[:180], "owner_unread_count": 1,
            "organization_unread_count": 0, "message_count": 1, "attachment_count": 0, "version": 1,
            "create_idempotency_key": key, "created_at": now, "updated_at": now,
        }
        message = {
            "message_id": message_id, "conversation_id": conversation_id, "organization_id": org_id,
            "sender_user_id": user.user_id, "sender_role": user.role, "message_type": "text",
            "body": body, "attachment_ids": [], "idempotency_key": key, "created_at": now,
        }
        inserted_conversation = inserted_message = inserted_audit = False
        audit_id = "audit_" + uuid.uuid4().hex[:12]
        try:
            await db.support_conversations.insert_one(conversation.copy()); inserted_conversation = True
            await db.support_messages.insert_one(message.copy()); inserted_message = True
            result = await db.support_conversations.update_one({"conversation_id": conversation_id, "organization_id": org_id, "status": "creating"}, {"$set": {"status": "waiting_owner", "updated_at": now}})
            if result.modified_count != 1: raise RuntimeError("support conversation activation conflict")
            conversation["status"] = "waiting_owner"
            await db.audit_events.insert_one({"audit_id": audit_id, "organization_id": org_id, "event_type": "support_conversation_created", "entity_type": "support_conversation", "entity_id": conversation_id, "actor_user_id": user.user_id, "previous_value": None, "new_value": {"channel": data.channel, "status": "waiting_owner", "priority": data.priority, "message_count": 1}, "created_at": now}); inserted_audit = True
        except DuplicateKeyError:
            if inserted_audit: await db.audit_events.delete_one({"audit_id": audit_id})
            if inserted_message: await db.support_messages.delete_one({"message_id": message_id})
            if inserted_conversation: await db.support_conversations.delete_one({"conversation_id": conversation_id})
            prior = await db.support_conversations.find_one({"organization_id": org_id, "created_by_user_id": user.user_id, "create_idempotency_key": key}, {"_id": 0})
            if prior and prior.get("status") != "creating": return {"conversation": conversation_view(prior), "idempotent": True}
            raise HTTPException(status_code=409, detail={"code": "support_creation_conflict", "message": "Conversation could not be created"})
        except Exception:
            if inserted_audit: await db.audit_events.delete_one({"audit_id": audit_id})
            if inserted_message: await db.support_messages.delete_one({"message_id": message_id})
            if inserted_conversation: await db.support_conversations.delete_one({"conversation_id": conversation_id})
            raise HTTPException(status_code=500, detail={"code": "support_creation_failed", "message": "Conversation could not be created"})
        return {"conversation": conversation_view(conversation), "idempotent": False}

    @router.get("/support/conversations")
    async def organization_support_conversations(
        channel: Optional[str] = Query(None), status: Optional[str] = Query(None), page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100),
        organization_id: Optional[str] = Query(None), authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None),
    ):
        user = await actor(authorization, session_token); org_id = await organization_actor(user, organization_id)
        if channel not in SUPPORT_CHANNELS | {None}: raise HTTPException(status_code=400, detail={"code": "support_channel_invalid", "message": "Invalid channel"})
        if status not in SUPPORT_STATUSES | {None}: raise HTTPException(status_code=400, detail={"code": "support_status_invalid", "message": "Invalid status"})
        query = {"organization_id": org_id, "status": {"$ne": "creating"}}
        if channel: query["channel"] = channel
        if status: query["status"] = status
        return await list_conversations(query, page, page_size)

    @router.get("/support/conversations/{conversation_id}")
    async def organization_support_conversation(conversation_id: str, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
        user = await actor(authorization, session_token)
        item = await visible_conversation(user, conversation_id)
        messages = await db.support_messages.find({"conversation_id": conversation_id, "organization_id": item["organization_id"]}, {"_id": 0}).sort([("created_at", 1), ("message_id", 1)]).limit(500).to_list(500)
        return {"conversation": conversation_view(item), "messages": messages}

    @router.get("/owner/support/conversations")
    async def owner_support_conversations(
        organization_id: Optional[str] = Query(None), channel: Optional[str] = Query(None), status: Optional[str] = Query(None), page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100), authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None),
    ):
        await owner_actor(await actor(authorization, session_token))
        if channel not in SUPPORT_CHANNELS | {None}: raise HTTPException(status_code=400, detail={"code": "support_channel_invalid", "message": "Invalid channel"})
        if status not in SUPPORT_STATUSES | {None}: raise HTTPException(status_code=400, detail={"code": "support_status_invalid", "message": "Invalid status"})
        query = {"status": {"$ne": "creating"}}
        if organization_id: query["organization_id"] = organization_id
        if channel: query["channel"] = channel
        if status: query["status"] = status
        return await list_conversations(query, page, page_size)

    @router.get("/owner/support/conversations/{conversation_id}")
    async def owner_support_conversation(conversation_id: str, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
        user = await owner_actor(await actor(authorization, session_token))
        item = await visible_conversation(user, conversation_id, owner_mode=True)
        messages = await db.support_messages.find({"conversation_id": conversation_id, "organization_id": item["organization_id"]}, {"_id": 0}).sort([("created_at", 1), ("message_id", 1)]).limit(500).to_list(500)
        return {"conversation": conversation_view(item), "messages": messages}

    return router
