from fastapi import APIRouter, Cookie, Header, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
from owner_subscription_lifecycle import run_lifecycle, lifecycle_mode, delivery_mode, enforcement_enabled, grace_days

class LifecycleRunRequest(BaseModel):
    at: Optional[str]=None
    mode: str="simulation"
    organization_id: Optional[str]=None

# NEXUS_7I_V3_MANUAL_ORGANIZATION_BLOCK
class AccessDecisionRequest(BaseModel):
    reason: str = Field(min_length=3,max_length=500)
    idempotency_key: str = Field(min_length=8,max_length=200)
    override_open_debt: bool = False

def build_lifecycle_router(db,get_current_user,pdf_factory):
    router=APIRouter(prefix="/owner/subscription-lifecycle",tags=["owner-subscription-lifecycle"])
    @router.get("/config")
    async def config(authorization:Optional[str]=Header(None),session_token:Optional[str]=Cookie(None)):
        user=await get_current_user(authorization,session_token)
        if user.role!="owner": raise HTTPException(403,"Owner access required")
        return {"lifecycle_mode":lifecycle_mode(),"email_delivery_mode":delivery_mode(),"access_enforcement_enabled":enforcement_enabled(),"grace_days":grace_days(),"reminder_days":[7,5,3,1,0]}
    @router.post("/run")
    async def run(data:LifecycleRunRequest,authorization:Optional[str]=Header(None),session_token:Optional[str]=Cookie(None)):
        user=await get_current_user(authorization,session_token)
        if user.role!="owner": raise HTTPException(403,"Owner access required")
        if data.mode=="live" and lifecycle_mode()!="live": raise HTTPException(409,"Live lifecycle mode is disabled")
        return await run_lifecycle(db,at=data.at,mode=data.mode,organization_id=data.organization_id,pdf_factory=pdf_factory)
    @router.post("/organizations/{organization_id}/block")
    async def block_organization(organization_id:str,data:AccessDecisionRequest,authorization:Optional[str]=Header(None),session_token:Optional[str]=Cookie(None)):
        user=await get_current_user(authorization,session_token)
        if user.role!="owner": raise HTTPException(403,"Owner access required")
        sub=await db.organization_subscriptions.find_one({"organization_id":organization_id},{"_id":0})
        if not sub: raise HTTPException(404,"Subscription not found")
        if sub.get("manual_access_blocked"):
            return {"blocked":True,"idempotent_replay":True,"enforcement_applied":True}
        existing_event=await db.subscription_audit_events.find_one({"organization_id":organization_id,"event_type":"subscription_manual_blocked","request_id":data.idempotency_key},{"_id":0})
        if existing_event:
            return {"blocked":True,"idempotent_replay":True,"enforcement_applied":True}
        open_invoices=await db.subscription_invoices.find({
            "organization_id":organization_id,
            "status":{"$in":["draft","issued","pending","overdue"]},
            "balance_minor":{"$gt":0},
        },{"_id":0,"invoice_id":1,"balance_minor":1,"due_at":1,"status":1}).to_list(500)
        if not open_invoices:
            raise HTTPException(409,"Organization has no open subscription balance")
        previous={k:sub.get(k) for k in ("status","subscription_access_state","manual_access_blocked","enforcement_applied")}
        now=__import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat()
        result=await db.organization_subscriptions.update_one(
            {"organization_id":organization_id,"manual_access_blocked":{"$ne":True}},
            {"$set":{
                "status":"suspended","subscription_access_state":"suspended","manual_access_blocked":True,
                "manual_block_reason":data.reason,"manual_blocked_at":now,"manual_blocked_by":user.user_id,
                "suspended_at":now,"suspended_by":user.user_id,"suspension_reason":data.reason,
                "enforcement_applied":True,"updated_at":now,
            }},
        )
        if not result.modified_count:
            return {"blocked":True,"idempotent_replay":True,"enforcement_applied":True}
        balance=sum(int(x.get("balance_minor",0)) for x in open_invoices)
        await db.subscription_audit_events.insert_one({
            "audit_event_id":"saudit_"+__import__("uuid").uuid4().hex[:16],"organization_id":organization_id,
            "event_type":"subscription_manual_blocked","entity_type":"subscription","entity_id":sub["subscription_id"],
            "actor_user_id":user.user_id,"previous_value":previous,
            "new_value":{"status":"suspended","subscription_access_state":"suspended","manual_access_blocked":True,"enforcement_applied":True},
            "reason":data.reason,"request_id":data.idempotency_key,"source":"owner_api",
            "open_invoice_ids":[x["invoice_id"] for x in open_invoices],"open_balance_minor":balance,"created_at":now,
        })
        return {"blocked":True,"idempotent_replay":False,"enforcement_applied":True,"open_invoice_count":len(open_invoices),"open_balance_minor":balance}

    @router.post("/organizations/{organization_id}/reactivate")
    async def reactivate_organization(organization_id:str,data:AccessDecisionRequest,authorization:Optional[str]=Header(None),session_token:Optional[str]=Cookie(None)):
        user=await get_current_user(authorization,session_token)
        if user.role!="owner": raise HTTPException(403,"Owner access required")
        sub=await db.organization_subscriptions.find_one({"organization_id":organization_id},{"_id":0})
        if not sub: raise HTTPException(404,"Subscription not found")
        open_debt=await db.subscription_invoices.count_documents({"organization_id":organization_id,"status":{"$in":["pending","overdue"]},"balance_minor":{"$gt":0}})
        if open_debt and not data.override_open_debt: raise HTTPException(409,"Open debt remains; explicit override is required")
        if sub.get("subscription_access_state")=="active" and not sub.get("manual_access_blocked"):
            return {"reactivated":True,"idempotent_replay":True}
        existing_event=await db.subscription_audit_events.find_one({"organization_id":organization_id,"event_type":"subscription_manual_reactivated","request_id":data.idempotency_key},{"_id":0})
        if existing_event:
            return {"reactivated":True,"idempotent_replay":True}
        now=__import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat()
        await db.organization_subscriptions.update_one({"organization_id":organization_id},{
            "$set":{"status":"active","subscription_access_state":"active","manual_access_blocked":False,"reactivated_at":now,"reactivated_by":user.user_id,"reactivation_reason":data.reason,"enforcement_applied":False,"updated_at":now},
            "$unset":{"grace_until":"","suspended_at":"","manual_block_reason":"","manual_blocked_at":"","manual_blocked_by":""},
        })
        await db.subscription_audit_events.insert_one({"audit_event_id":"saudit_"+__import__("uuid").uuid4().hex[:16],"organization_id":organization_id,"event_type":"subscription_manual_reactivated","entity_type":"subscription","entity_id":sub["subscription_id"],"actor_user_id":user.user_id,"previous_value":{"status":sub.get("status"),"subscription_access_state":sub.get("subscription_access_state")},"new_value":{"status":"active","subscription_access_state":"active"},"reason":data.reason,"request_id":data.idempotency_key,"source":"owner_api","override_open_debt":data.override_open_debt,"created_at":now})
        return {"reactivated":True,"open_debt_count":open_debt,"override_used":bool(open_debt)}
    @router.get("/runs")
    async def runs(limit:int=50,authorization:Optional[str]=Header(None),session_token:Optional[str]=Cookie(None)):
        user=await get_current_user(authorization,session_token)
        if user.role!="owner": raise HTTPException(403,"Owner access required")
        return await db.subscription_lifecycle_runs.find({},{"_id":0}).sort("started_at",-1).to_list(max(1,min(limit,200)))
    return router
