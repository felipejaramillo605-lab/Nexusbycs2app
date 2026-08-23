from fastapi import APIRouter, Cookie, Header, HTTPException, Response
from pydantic import BaseModel, Field, EmailStr
from typing import Optional, List
from datetime import datetime, timezone, timedelta
import asyncio, hashlib, os, smtplib, ssl, uuid
from email.message import EmailMessage
from platform_billing_settings import get_seller_settings

# NEXUS_7I_FLEXIBLE_BILLING_V2
NOTICE = "Documento administrativo de cobro generado por Nexus. No constituye factura electrónica de venta validada por la DIAN."

def now_iso(): return datetime.now(timezone.utc).isoformat()
def make_id(prefix): return f"{prefix}_{uuid.uuid4().hex[:16]}"
def public(doc): return {k:v for k,v in (doc or {}).items() if k != "_id"}

FISCAL_REQUIRED_FIELDS=("legal_name","document_type","tax_id","billing_email","city","address")
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
    item["billing_email"]=str(item["billing_email"]).strip().lower();item["tax_id"]=normalize_tax_id(item.get("tax_id"));item["cc_emails"]=list(dict.fromkeys(str(v).strip().lower() for v in item.get("cc_emails",[]) if str(v).strip()));return item

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
    except Exception: pass
    delivery={"email_delivery_id":make_id("semail"),"organization_id":item["organization_id"],"invoice_id":item["invoice_id"],"invoice_number":item["invoice_number"],"recipient":item.get("delivery_email_snapshot"),"cc":item.get("delivery_cc_snapshot",[]),"status":"queued" if item.get("delivery_email_snapshot") else "missing_recipient","attempt_count":0,"created_at":now_iso()}
    await db.subscription_email_deliveries.insert_one(delivery)
    return delivery

def _pdf_escape(value): return str(value or "").replace("\\","\\\\").replace("(","\\(").replace(")","\\)").encode("latin-1","replace").decode("latin-1")
def invoice_pdf(invoice):
    seller=invoice.get("seller_snapshot") or {}; buyer=invoice.get("buyer_snapshot") or {}
    money=lambda n:f"COP $ {int(n or 0)/100:,.0f}".replace(",",".")
    lines=["NEXUS BY CS2","DOCUMENTO ADMINISTRATIVO DE COBRO",f"Codigo: {invoice.get('invoice_number')}",f"Emision: {str(invoice.get('issued_at',''))[:10]}   Vencimiento: {str(invoice.get('due_at',''))[:10]}","",f"PROVEEDOR: {seller.get('legal_name') or seller.get('commercial_name')}",f"NIT: {seller.get('tax_id') or 'Pendiente de configurar'}",f"Correo: {seller.get('email') or 'Pendiente de configurar'}",f"Direccion: {seller.get('address') or ''} {seller.get('city') or ''}","",f"COMPRADOR: {buyer.get('legal_name') or buyer.get('organization_name')}",f"NIT / documento: {buyer.get('tax_id') or 'Pendiente de configurar'}",f"Correo de facturacion: {invoice.get('delivery_email_snapshot') or 'No configurado'}",f"Direccion: {buyer.get('address') or ''} {buyer.get('city') or ''}","",f"Concepto: {invoice.get('service_description') or 'Suscripcion o membresia a Nexus by CS2 por un mes.'}",f"Plan: {invoice.get('plan_code_snapshot')} version {invoice.get('plan_version_snapshot')}",f"Periodo cubierto: {str(invoice.get('period_start'))[:10]} al {str(invoice.get('period_end'))[:10]}",f"Valor contractual: {money(invoice.get('contract_amount_minor_snapshot') or invoice.get('subtotal_minor') or invoice.get('amount_minor'))}",f"Descuento excepcional: {money(invoice.get('discount_minor'))}",f"Motivo del descuento: {invoice.get('discount_reason') or 'No aplica'}",f"Impuestos: {money(invoice.get('tax_minor'))}",f"TOTAL A PAGAR: {money(invoice.get('amount_minor'))}",f"Pagado: {money(invoice.get('paid_amount_minor'))}",f"Saldo: {money((invoice.get('amount_minor') or 0)-(invoice.get('paid_amount_minor') or 0))}",f"Estado: {invoice.get('status')}","",NOTICE]
    content=["BT","/F1 16 Tf","50 790 Td"]
    for i,line in enumerate(lines): content += (["0 -24 Td"] if i else [])+[f"({_pdf_escape(line)}) Tj", "/F1 10 Tf"]
    stream="\n".join(content+["ET"]).encode("latin-1")
    objs=[b"<< /Type /Catalog /Pages 2 0 R >>",b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",b"<< /Length %d >>\nstream\n"%len(stream)+stream+b"\nendstream",b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]
    out=bytearray(b"%PDF-1.4\n"); offsets=[0]
    for i,obj in enumerate(objs,1): offsets.append(len(out)); out+=f"{i} 0 obj\n".encode()+obj+b"\nendobj\n"
    x=len(out);out+=f"xref\n0 {len(objs)+1}\n0000000000 65535 f \n".encode();out+=b"".join(f"{o:010d} 00000 n \n".encode() for o in offsets[1:]);out+=f"trailer << /Size {len(objs)+1} /Root 1 0 R >>\nstartxref\n{x}\n%%EOF".encode();return bytes(out)

def build_billing_hub_router(db,get_current_user):
    router=APIRouter(prefix="/billing",tags=["billing-hub"])
    async def actor(auth,cookie): return await get_current_user(auth,cookie)
    def org_for(user,requested=None):
        if user.role=="owner":
            if not requested: raise HTTPException(400,"organization_id is required for Owner")
            return requested
        if user.role not in {"manager","admin"} or not user.organization_id: raise HTTPException(403,"Billing access required")
        if requested and requested!=user.organization_id: raise HTTPException(403,"Cross-tenant billing access denied")
        return user.organization_id
    @router.get("/profile")
    async def get_profile(organization_id:Optional[str]=None,authorization:Optional[str]=Header(None),session_token:Optional[str]=Cookie(None)):
        user=await actor(authorization,session_token);oid=org_for(user,organization_id);profile=await db.organization_billing_profiles.find_one({"organization_id":oid},{"_id":0})
        if profile:return fiscal_profile_view(profile)
        _,manager,org,email=await resolve_billing_recipient(db,oid);return fiscal_profile_view({"organization_id":oid,"billing_email":email,"billing_contact_name":manager.get("name"),"legal_name":org.get("legal_name") or org.get("name"),"email_source":"fallback","profile_version":0})
    @router.put("/profile")
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
            if previous:await db.organization_billing_profiles.replace_one({"organization_id":oid,"profile_version":item["profile_version"],"updated_by":user.user_id},previous)
            else:await db.organization_billing_profiles.delete_one({"organization_id":oid,"profile_version":1,"updated_by":user.user_id})
            raise
        return item
    @router.get("/invoices")
    async def invoices(organization_id:Optional[str]=None,invoice_number:Optional[str]=None,status:Optional[str]=None,authorization:Optional[str]=Header(None),session_token:Optional[str]=Cookie(None)):
        user=await actor(authorization,session_token); oid=org_for(user,organization_id); q={"organization_id":oid}
        if invoice_number:q["invoice_number"]=invoice_number.strip().upper()
        if status:q["status"]=status
        return await db.subscription_invoices.find(q,{"_id":0}).sort([("issued_at",-1),("created_at",-1)]).to_list(500)
    @router.get("/invoices/{invoice_id}/pdf")
    async def pdf(invoice_id:str,organization_id:Optional[str]=None,authorization:Optional[str]=Header(None),session_token:Optional[str]=Cookie(None)):
        user=await actor(authorization,session_token); oid=org_for(user,organization_id); item=await db.subscription_invoices.find_one({"organization_id":oid,"invoice_id":invoice_id},{"_id":0})
        if not item: raise HTTPException(404,"Invoice not found")
        return Response(invoice_pdf(item),media_type="application/pdf",headers={"Content-Disposition":f"attachment; filename={item.get('invoice_number',invoice_id)}.pdf"})
    @router.get("/notifications")
    async def notifications(unread_only:bool=False,limit:int=100,authorization:Optional[str]=Header(None),session_token:Optional[str]=Cookie(None)):
        user=await actor(authorization,session_token); oid=org_for(user,None if user.role!='owner' else user.organization_id); q={"organization_id":oid}
        if unread_only:q["read_by"]={"$ne":user.user_id}
        return await db.subscription_notifications.find(q,{"_id":0}).sort("created_at",-1).to_list(max(1,min(limit,200)))
    @router.post("/notifications/{notification_id}/read")
    async def mark_read(notification_id:str,authorization:Optional[str]=Header(None),session_token:Optional[str]=Cookie(None)):
        user=await actor(authorization,session_token); oid=org_for(user,None if user.role!='owner' else user.organization_id); result=await db.subscription_notifications.update_one({"notification_id":notification_id,"organization_id":oid},{"$addToSet":{"read_by":user.user_id},"$set":{"last_read_at":now_iso()}})
        if not result.matched_count: raise HTTPException(404,"Notification not found")
        return {"notification_id":notification_id,"read":True}
    @router.post("/owner/announcements")
    async def announce(data:AnnouncementRequest,authorization:Optional[str]=Header(None),session_token:Optional[str]=Cookie(None)):
        user=await actor(authorization,session_token)
        if user.role!="owner": raise HTTPException(403,"Owner access required")
        now=now_iso(); rows=[]
        for oid in dict.fromkeys(data.organization_ids):
            row={"notification_id":make_id("snot"),"organization_id":oid,"event_type":"owner_announcement","severity":data.severity,"title":data.title,"message":data.message,"created_by":user.user_id,"created_at":now,"expires_at":data.expires_at,"read_by":[]}; await db.subscription_notifications.insert_one(row); rows.append(public(row))
        return rows
    return router
