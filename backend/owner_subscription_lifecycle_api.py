from fastapi import APIRouter, Cookie, Header, HTTPException
from pydantic import BaseModel
from typing import Optional
from owner_subscription_lifecycle import run_lifecycle, lifecycle_mode, delivery_mode, enforcement_enabled, grace_days

class LifecycleRunRequest(BaseModel):
    at: Optional[str]=None
    mode: str="simulation"
    organization_id: Optional[str]=None

def build_lifecycle_router(db,get_current_user,pdf_factory):
    router=APIRouter(prefix="/owner/subscription-lifecycle",tags=["owner-subscription-lifecycle"])
    @router.get("/config")
    async def config(authorization:Optional[str]=Header(None),session_token:Optional[str]=Cookie(None)):
        user=await get_current_user(authorization,session_token)
        if user.role!="owner": raise HTTPException(403,"Owner access required")
        return {"lifecycle_mode":lifecycle_mode(),"email_delivery_mode":delivery_mode(),"access_enforcement_enabled":enforcement_enabled(),"grace_days":grace_days(),"reminder_days":[7,3,1,0]}
    @router.post("/run")
    async def run(data:LifecycleRunRequest,authorization:Optional[str]=Header(None),session_token:Optional[str]=Cookie(None)):
        user=await get_current_user(authorization,session_token)
        if user.role!="owner": raise HTTPException(403,"Owner access required")
        if data.mode=="live" and lifecycle_mode()!="live": raise HTTPException(409,"Live lifecycle mode is disabled")
        return await run_lifecycle(db,at=data.at,mode=data.mode,organization_id=data.organization_id,pdf_factory=pdf_factory)
    @router.get("/runs")
    async def runs(limit:int=50,authorization:Optional[str]=Header(None),session_token:Optional[str]=Cookie(None)):
        user=await get_current_user(authorization,session_token)
        if user.role!="owner": raise HTTPException(403,"Owner access required")
        return await db.subscription_lifecycle_runs.find({},{"_id":0}).sort("started_at",-1).to_list(max(1,min(limit,200)))
    return router
