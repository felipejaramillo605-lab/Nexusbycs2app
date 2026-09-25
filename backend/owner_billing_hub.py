from fastapi import APIRouter, Cookie, Header, HTTPException, Response
from pydantic import BaseModel, Field, EmailStr
from typing import Optional, List
from datetime import datetime, timezone, timedelta
import asyncio, hashlib, logging, os, smtplib, ssl, uuid
from email.message import EmailMessage
from platform_billing_settings import get_seller_settings
from invoice_pdf import build_invoice_pdf
import platform_branding

logger = logging.getLogger(__name__)

# NEXUS_7I_FLEXIBLE_BILLING_V2
NOTICE = "Documento administrativo de cobro generado por Nexus. No constituye factura electrónica de venta validada por la DIAN."

def now_iso(): return datetime.now(timezone.utc).isoformat()
def make_id(prefix): return f"{prefix}_{uuid.uuid4().hex[:16]}"
def public(doc): return {k:v for k,v in (doc or {}).items() if k != "_id"}

FISCAL_REQUIRED_FIELDS=("legal_name","document_type","tax_id","billing_email","billing_contact_name","city","address")
def clean_optional(value):
    if value is None:return None
    value=str(value).strip();return value or None
def normalize_tax_id(value):
    value=clean_optional(value);return " ".join(value.upper().split()) if value else None
def fiscal_profile_view(profile):
    item=public(profile);missing=[f for f in FISCAL_REQUIRED_FIELDS if not clean_optional(item.get(f))]
    item["profile_status"]="complete" if not missing else "incomplete";item["missing_required_fields"]=missing;item["profile_version"]=int(item.get("profile_version") or 0);return item

# NEXUS_8A5_FISCAL_ISSUANCE_GUARD_V1
async def assert_fiscal_profile_complete(db, organization_id):
    profile=await db.organization_billing_profiles.find_one({"organization_id":organization_id},{"_id":0})
    fiscal=fiscal_profile_view(profile or {"organization_id":organization_id})
    if fiscal["profile_status"]!="complete":
        raise HTTPException(status_code=409,detail={"code":"fiscal_profile_incomplete","message":"Completa la información fiscal antes de emitir una factura.","organization_id":organization_id,"missing_required_fields":fiscal["missing_required_fields"],"profile_version":fiscal["profile_version"]})
    return fiscal
def normalize_fiscal_profile(data):
    item=data.model_dump(mode="json",exclude={"expected_version","change_reason"})
    fields=("billing_contact_name","billing_contact_phone","person_type","commercial_name","legal_name","document_type","verification_digit","tax_responsibility","tax_regime","country","department","city","address","postal_code","fiscal_notes")
    for field in fields:item[field]=clean_optional(item.get(field))
    billing_email=clean_optional(item.get("billing_email"));item["billing_email"]=billing_email.lower() if billing_email else None;item["tax_id"]=normalize_tax_id(item.get("tax_id"));item["cc_emails"]=list(dict.fromkeys(str(v).strip().lower() for v in item.get("cc_emails",[]) if str(v).strip()));return item

# NEXUS_8A1_FISCAL_PROFILE_FOUNDATION_V1
class BillingProfileRequest(BaseModel):
    billing_email: EmailStr
    billing_contact_name: str = Field(min_length=2,max_length=120)
    billing_contact_phone: Optional[str] = Field(default=None,max_length=40)
    person_type: Optional[str] = Field(default=None,max_length=40)
    commercial_name: Optional[str] = Field(default=None,max_length=180)
    legal_name: Optional[str] = Field(default=None,max_length=180)
    document_type: Optional[str] = Field(default=None,max_length=40)
    tax_id: Optional[str] = Field(default=None,max_length=80)
    verification_digit: Optional[str] = Field(default=None,max_length=4)
    tax_responsibility: Optional[str] = Field(default=None,max_length=120)
    tax_regime: Optional[str] = Field(default=None,max_length=120)
    country: Optional[str] = Field(default="Colombia",max_length=120)
    department: Optional[str] = Field(default=None,max_length=120)
    city: Optional[str] = Field(default=None,max_length=120)
    address: Optional[str] = Field(default=None,max_length=240)
    postal_code: Optional[str] = Field(default=None,max_length=20)
    fiscal_notes: Optional[str] = Field(default=None,max_length=1000)
    cc_emails: List[EmailStr] = Field(default_factory=list,max_length=5)
    copy_primary_manager: bool = True
    email_enabled: bool = True
    expected_version: Optional[int] = Field(default=None,ge=0)
    change_reason: Optional[str] = Field(default=None,min_length=3,max_length=500)

class AnnouncementRequest(BaseModel):
    organization_ids: List[str] = Field(min_length=1,max_length=100)
    title: str = Field(min_length=3,max_length=120)
    message: str = Field(min_length=3,max_length=1000)
    severity: str = "information"
    expires_at: Optional[str] = None

async def ensure_billing_hub_indexes(db):
    await db.subscription_invoices.create_index("invoice_number", unique=True, sparse=True, name="subscription_invoice_number_global_unique")
    await db.system_counters.create_index("counter_id", unique=True, name="system_counter_id_unique")
    await db.organization_billing_profiles.create_index("organization_id", unique=True, name="billing_profile_org_unique")
    await db.organization_billing_profile_audits.create_index("audit_id", unique=True, name="billing_profile_audit_id_unique")
    await db.organization_billing_profile_audits.create_index([("organization_id",1),("created_at",-1)], name="billing_profile_audit_org_created")
    await db.subscription_notifications.create_index("notification_id", unique=True, name="subscription_notification_id_unique")
    await db.subscription_notifications.create_index([("organization_id",1),("created_at",-1)], name="subscription_notification_org_created")
    await db.subscription_notifications.create_index("dedupe_key", unique=True, sparse=True, name="subscription_notification_dedupe_unique")
    await db.subscription_email_deliveries.create_index("email_delivery_id", unique=True, name="subscription_email_delivery_id_unique")
    await db.subscription_email_deliveries.create_index([("invoice_id",1),("created_at",-1)], name="subscription_email_invoice_created")

async def next_invoice_number(db):
    year=datetime.now(timezone.utc).year
    counter=await db.system_counters.find_one_and_update(
        {"counter_id":f"subscription_invoice_{year}"},{"$inc":{"value":1},"$setOnInsert":{"created_at":now_iso()}},
        upsert=True,return_document=True)
    return f"NXS-{year}-{int(counter['value']):06d}"

async def resolve_billing_recipient(db, organization_id):
    profile=await db.organization_billing_profiles.find_one({"organization_id":organization_id},{"_id":0})
    manager=await db.users.find_one({"organization_id":organization_id,"role":{"$in":["manager","admin"]},"access_status":"approved","active":{"$ne":False},"deleted_at":{"$exists":False}},{"_id":0,"email":1,"name":1,"user_id":1},sort=[("role",1),("created_at",1)])
    organization=await db.organizations.find_one({"organization_id":organization_id},{"_id":0}) or {}
    email=(profile or {}).get("billing_email") or (manager or {}).get("email") or organization.get("email")
    return profile or {}, manager or {}, organization, email

async def enrich_new_invoice(db,item):
    profile,manager,organization,email=await resolve_billing_recipient(db,item["organization_id"])
    seller_settings=await get_seller_settings(db)
    item.update({
      "invoice_number":await next_invoice_number(db),"document_type":"administrative_charge_document",
      "legal_notice":item.get("legal_notice") or NOTICE,"issued_at":now_iso(),
      "service_description":item.get("service_description") or "Suscripción mensual Nexus Business OS",
      "seller_snapshot":{"commercial_name":seller_settings.get("commercial_name"),"legal_name":seller_settings.get("legal_name"),"tax_id":seller_settings.get("tax_id"),"email":seller_settings.get("billing_email"),"phone":seller_settings.get("phone"),"address":seller_settings.get("address"),"city":seller_settings.get("city")},
      "buyer_snapshot":{"organization_name":organization.get("name"),"commercial_name":profile.get("commercial_name") or organization.get("name"),"person_type":profile.get("person_type"),"legal_name":profile.get("legal_name") or organization.get("legal_name"),"document_type":profile.get("document_type"),"tax_id":profile.get("tax_id") or organization.get("tax_id"),"verification_digit":profile.get("verification_digit"),"tax_responsibility":profile.get("tax_responsibility"),"tax_regime":profile.get("tax_regime"),"country":profile.get("country"),"department":profile.get("department"),"address":profile.get("address") or organization.get("address"),"city":profile.get("city") or organization.get("city"),"postal_code":profile.get("postal_code"),"billing_email":profile.get("billing_email") or email,"billing_contact_name":profile.get("billing_contact_name") or manager.get("name"),"billing_contact_phone":profile.get("billing_contact_phone"),"profile_version":int(profile.get("profile_version") or 0)},
      "delivery_email_snapshot":email,"delivery_cc_snapshot":[str(x) for x in profile.get("cc_emails",[])],"primary_manager_snapshot":{"user_id":manager.get("user_id"),"name":manager.get("name"),"email":manager.get("email")},
      "subtotal_minor":item.get("subtotal_minor",item["amount_minor"]),
      "tax_minor":int(item.get("tax_minor") or 0),
      "discount_minor":int(item.get("discount_minor") or 0),
      "balance_minor":item["amount_minor"]})
    return item

async def post_invoice_side_effects(db,item):
    dedupe=f"{item['invoice_id']}:invoice_issued"
    notification={"notification_id":make_id("snot"),"organization_id":item["organization_id"],"event_type":"invoice_issued","severity":"billing","title":f"Nueva factura {item['invoice_number']}","message":f"Se emitió el cobro del periodo {item['period_start'][:10]} al {item['period_end'][:10]}. Vence el {item['due_at'][:10]}.","related_entity_type":"invoice","related_entity_id":item["invoice_id"],"dedupe_key":dedupe,"created_at":now_iso(),"read_by":[]}
    try: await db.subscription_notifications.insert_one(notification)
    except Exception: logger.exception("Failed to insert billing notification %s for invoice %s", notification["notification_id"], item["invoice_id"])
    delivery={"email_delivery_id":make_id("semail"),"organization_id":item["organization_id"],"invoice_id":item["invoice_id"],"invoice_number":item["invoice_number"],"recipient":item.get("delivery_email_snapshot"),"cc":item.get("delivery_cc_snapshot",[]),"status":"queued" if item.get("delivery_email_snapshot") else "missing_recipient","attempt_count":0,"created_at":now_iso()}
    await db.subscription_email_deliveries.insert_one(delivery)
    return delivery

# NEXUS_OWNER_CONSOLE_SHELL_V1 (plan PR 12/13): real PDF generation lives in
# invoice_pdf.py now (reportlab-based, brand-consistent) -- this fetches the
# platform's uploaded logo bytes (if any) so the PDF header can show the
# actual Nexus mark instead of a text fallback.
async def _platform_logo_bytes(db) -> bytes | None:
    branding = await db.platform_settings.find_one({"settings_id": platform_branding.SETTINGS_ID}, {"_id": 0})
    filename = platform_branding.managed_filename((branding or {}).get("platform_logo_url"))
    if not filename:
        return None
    try:
        return platform_branding._safe_path(filename).read_bytes()
    except (HTTPException, OSError):
        return None

# Compatibility wrapper: owner_delivery_operations.py (email delivery,
# scheduler) and server.py (lifecycle router, scheduler loop) call this
# synchronously with just an invoice dict, no db access at hand to fetch the
# platform logo -- they still get the new professional template, just with
# the text "NEXUS BY CS2" wordmark fallback instead of the uploaded logo
# image. Never a regression: the old generator never embedded a logo either.
def invoice_pdf(invoice):
    return build_invoice_pdf(invoice, None)

def build_billing_hub_router(db,get_current_user):
    router=APIRouter()
    billing_router=APIRouter(prefix="/billing",tags=["billing-hub"])
    owner_billing_router=APIRouter(prefix="/owner/billing",tags=["owner-billing"])
    async def actor(auth,cookie): return await get_current_user(auth,cookie)
    def org_for(user,requested=None):
        if user.role=="owner":
            if not requested: raise HTTPException(400,"organization_id is required for Owner")
            return requested
        if user.role not in {"manager","admin"} or not user.organization_id: raise HTTPException(403,"Billing access required")
        if requested and requested!=user.organization_id: raise HTTPException(403,"Cross-tenant billing access denied")
        return user.organization_id
    @billing_router.get("/profile")
    async def get_profile(organization_id:Optional[str]=None,authorization:Optional[str]=Header(None),session_token:Optional[str]=Cookie(None)):
        user=await actor(authorization,session_token);oid=org_for(user,organization_id);profile=await db.organization_billing_profiles.find_one({"organization_id":oid},{"_id":0})
        if profile:
            profile["profile_source"]="organization_billing_profiles"
            return fiscal_profile_view(profile)
        _,manager,org,email=await resolve_billing_recipient(db,oid);return fiscal_profile_view({"organization_id":oid,"billing_email":email,"billing_contact_name":manager.get("name"),"legal_name":org.get("legal_name") or org.get("name"),"email_source":"fallback","profile_source":"fallback","profile_version":0})
    @billing_router.put("/profile")
    async def put_profile(data:BillingProfileRequest,organization_id:Optional[str]=None,authorization:Optional[str]=Header(None),session_token:Optional[str]=Cookie(None)):
        user=await actor(authorization,session_token);oid=org_for(user,organization_id);organization=await db.organizations.find_one({"organization_id":oid},{"_id":0,"organization_id":1})
        if not organization:raise HTTPException(404,"Organization not found")
        previous=await db.organization_billing_profiles.find_one({"organization_id":oid},{"_id":0});current_version=int((previous or {}).get("profile_version") or 0)
        if data.expected_version is not None and data.expected_version!=current_version:raise HTTPException(409,{"code":"billing_profile_version_conflict","message":"El perfil fiscal fue modificado por otro usuario.","current_version":current_version})
        now=now_iso();item=fiscal_profile_view({**normalize_fiscal_profile(data),"organization_id":oid,"profile_version":current_version+1,"updated_by":user.user_id,"updated_at":now});query={"organization_id":oid}
        if previous:query["profile_version"]=current_version if "profile_version" in previous else {"$exists":False}
        result=await db.organization_billing_profiles.update_one(query,{"$set":item,"$setOnInsert":{"created_at":now,"created_by":user.user_id}},upsert=previous is None)
        if result.matched_count==0 and result.upserted_id is None:raise HTTPException(409,{"code":"billing_profile_concurrent_update","message":"El perfil fiscal cambió durante la actualización."})
        audit={"audit_id":make_id("bp_audit"),"organization_id":oid,"event_type":"billing_profile_updated" if previous else "billing_profile_created","actor_user_id":user.user_id,"actor_role":user.role,"previous_value":previous,"new_value":item,"reason":data.change_reason or "Actualización de perfil fiscal","profile_version":item["profile_version"],"source":"billing_profile_api","created_at":now}
        try:await db.organization_billing_profile_audits.insert_one(audit.copy())
        except Exception:
            # NEXUS_FIX_FISCAL_ROLLBACK_PRECISION_V1: match on the exact document we just wrote
            # (organization_id + profile_version + updated_at) so a concurrent edit from another
            # actor is never clobbered by this rollback; log instead of guessing when it doesn't match.
            rollback_filter={"organization_id":oid,"profile_version":item["profile_version"],"updated_at":item["updated_at"]}
            if previous:rollback_result=await db.organization_billing_profiles.replace_one(rollback_filter,previous)
            else:rollback_result=await db.organization_billing_profiles.delete_one(rollback_filter)
            if rollback_result.matched_count==0 if previous else rollback_result.deleted_count==0:
                logger.error("Fiscal profile rollback did not match any document for organization_id=%s profile_version=%s; profile may be inconsistent with its audit trail",oid,item["profile_version"])
            raise
        return item
    @billing_router.get("/invoices")
    async def invoices(organization_id:Optional[str]=None,invoice_number:Optional[str]=None,status:Optional[str]=None,authorization:Optional[str]=Header(None),session_token:Optional[str]=Cookie(None)):
        user=await actor(authorization,session_token); oid=org_for(user,organization_id); q={"organization_id":oid}
        if invoice_number:q["invoice_number"]=invoice_number.strip().upper()
        if status:q["status"]=status
        return await db.subscription_invoices.find(q,{"_id":0}).sort([("issued_at",-1),("created_at",-1)]).to_list(500)
    @billing_router.get("/invoices/{invoice_id}/pdf")
    async def pdf(invoice_id:str,organization_id:Optional[str]=None,authorization:Optional[str]=Header(None),session_token:Optional[str]=Cookie(None)):
        user=await actor(authorization,session_token); oid=org_for(user,organization_id); item=await db.subscription_invoices.find_one({"organization_id":oid,"invoice_id":invoice_id},{"_id":0})
        if not item: raise HTTPException(404,"Invoice not found")
        logo_bytes=await _platform_logo_bytes(db)
        return Response(build_invoice_pdf(item,logo_bytes),media_type="application/pdf",headers={"Content-Disposition":f"attachment; filename={item.get('invoice_number',invoice_id)}.pdf"})
    @billing_router.get("/notifications")
    async def notifications(unread_only:bool=False,limit:int=100,authorization:Optional[str]=Header(None),session_token:Optional[str]=Cookie(None)):
        user=await actor(authorization,session_token); oid=org_for(user,None if user.role!='owner' else user.organization_id); q={"organization_id":oid}
        if unread_only:q["read_by"]={"$ne":user.user_id}
        return await db.subscription_notifications.find(q,{"_id":0}).sort("created_at",-1).to_list(max(1,min(limit,200)))
    @billing_router.post("/notifications/{notification_id}/read")
    async def mark_read(notification_id:str,authorization:Optional[str]=Header(None),session_token:Optional[str]=Cookie(None)):
        user=await actor(authorization,session_token); oid=org_for(user,None if user.role!='owner' else user.organization_id); result=await db.subscription_notifications.update_one({"notification_id":notification_id,"organization_id":oid},{"$addToSet":{"read_by":user.user_id},"$set":{"last_read_at":now_iso()}})
        if not result.matched_count: raise HTTPException(404,"Notification not found")
        return {"notification_id":notification_id,"read":True}
    @billing_router.post("/owner/announcements")
    async def announce(data:AnnouncementRequest,authorization:Optional[str]=Header(None),session_token:Optional[str]=Cookie(None)):
        user=await actor(authorization,session_token)
        if user.role!="owner": raise HTTPException(403,"Owner access required")
        now=now_iso(); rows=[]
        for oid in dict.fromkeys(data.organization_ids):
            row={"notification_id":make_id("snot"),"organization_id":oid,"event_type":"owner_announcement","severity":data.severity,"title":data.title,"message":data.message,"created_by":user.user_id,"created_at":now,"expires_at":data.expires_at,"read_by":[]}; await db.subscription_notifications.insert_one(row); rows.append(public(row))
        return rows

    @owner_billing_router.get("/organizations/{organization_id}/notifications")
    async def owner_organization_notifications(
        organization_id: str,
        limit: int = 100,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        user = await actor(authorization, session_token)
        if user.role != "owner" or user.access_status != "approved":
            raise HTTPException(status_code=403, detail="Approved Owner access required")
        organization = await db.organizations.find_one(
            {"organization_id": organization_id}, {"_id": 0, "organization_id": 1}
        )
        if not organization:
            raise HTTPException(status_code=404, detail="Organization not found")
        bounded_limit = max(1, min(limit, 200))
        rows = await db.subscription_notifications.find(
            {"organization_id": organization_id}, {"_id": 0}
        ).sort("created_at", -1).to_list(bounded_limit)
        return [public(row) for row in rows]

    router.include_router(billing_router)
    router.include_router(owner_billing_router)
    return router
