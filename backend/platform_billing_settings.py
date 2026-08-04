from fastapi import APIRouter, Cookie, Header, HTTPException
from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime, timezone
import os
SETTINGS_ID="nexus_billing_seller"
DEFAULT_NOTICE="Documento administrativo de cobro generado por Nexus. No constituye factura electrónica de venta validada por la DIAN."
def now_iso(): return datetime.now(timezone.utc).isoformat()
class SellerSettingsRequest(BaseModel):
    commercial_name:str=Field(min_length=2,max_length=120)
    legal_name:Optional[str]=Field(default=None,max_length=180)
    tax_id:Optional[str]=Field(default=None,max_length=80)
    address:Optional[str]=Field(default=None,max_length=240)
    city:Optional[str]=Field(default=None,max_length=120)
    billing_email:Optional[EmailStr]=None
    phone:Optional[str]=Field(default=None,max_length=40)
    legal_notice:str=Field(default=DEFAULT_NOTICE,min_length=10,max_length=1000)
    invoice_prefix:str=Field(default="NXS",min_length=2,max_length=12,pattern=r"^[A-Za-z0-9_-]+$")
async def ensure_platform_billing_indexes(db):
    await db.platform_billing_settings.create_index("settings_id",unique=True,name="platform_billing_settings_id_unique")
async def get_seller_settings(db):
    row=await db.platform_billing_settings.find_one({"settings_id":SETTINGS_ID},{"_id":0})
    return row or {"settings_id":SETTINGS_ID,"commercial_name":os.getenv("SMTP_FROM_NAME","Nexus by CS2"),"legal_name":os.getenv("BILLING_SELLER_LEGAL_NAME","") or "","tax_id":os.getenv("BILLING_SELLER_TAX_ID","") or "","address":os.getenv("BILLING_SELLER_ADDRESS","") or "","city":os.getenv("BILLING_SELLER_CITY","") or "","billing_email":os.getenv("SMTP_FROM_EMAIL","") or "","phone":"","legal_notice":DEFAULT_NOTICE,"invoice_prefix":"NXS","source":"environment_fallback"}
async def operational_health(db):
    rows=await db.subscription_email_deliveries.aggregate([{"$group":{"_id":"$status","count":{"$sum":1}}}]).to_list(100)
    return {"smtp_configured":all(os.getenv(k) for k in ("SMTP_HOST","SMTP_USER","SMTP_PASSWORD","SMTP_FROM_EMAIL")),"scheduler_enabled":os.getenv("SUBSCRIPTION_SCHEDULER_ENABLED","false").lower() in {"1","true","yes","on"},"lifecycle_mode":os.getenv("SUBSCRIPTION_LIFECYCLE_MODE","simulation"),"delivery_mode":os.getenv("SUBSCRIPTION_EMAIL_DELIVERY_MODE","controlled"),"max_attempts":max(1,min(int(os.getenv("SUBSCRIPTION_EMAIL_MAX_ATTEMPTS","3")),10)),"automatic_enforcement_enabled":os.getenv("SUBSCRIPTION_ACCESS_ENFORCEMENT_ENABLED","false").lower() in {"1","true","yes","on"},"reminder_days":[7,5,3,1,0],"delivery_status_counts":{str(x.get("_id") or "unknown"):x.get("count",0) for x in rows},"secrets_exposed":False}
def build_platform_billing_router(db,get_current_user):
    router=APIRouter(prefix="/owner/platform-billing",tags=["owner-platform-billing"])
    async def owner(a,c):
        user=await get_current_user(a,c)
        if user.role!="owner" or user.access_status!="approved": raise HTTPException(403,"Owner access required")
        return user
    @router.get("/seller-profile")
    async def get_profile(authorization:Optional[str]=Header(None),session_token:Optional[str]=Cookie(None)):
        await owner(authorization,session_token); return await get_seller_settings(db)
    @router.put("/seller-profile")
    async def put_profile(data:SellerSettingsRequest,authorization:Optional[str]=Header(None),session_token:Optional[str]=Cookie(None)):
        user=await owner(authorization,session_token); now=now_iso(); item={**data.model_dump(mode="json"),"settings_id":SETTINGS_ID,"updated_at":now,"updated_by":user.user_id}
        await db.platform_billing_settings.update_one({"settings_id":SETTINGS_ID},{"$set":item,"$setOnInsert":{"created_at":now}},upsert=True); return item
    @router.get("/operational-health")
    async def health(authorization:Optional[str]=Header(None),session_token:Optional[str]=Cookie(None)):
        await owner(authorization,session_token); return await operational_health(db)
    return router
