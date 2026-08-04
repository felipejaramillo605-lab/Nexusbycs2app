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

class BillingProfileRequest(BaseModel):
    billing_email: EmailStr
    billing_contact_name: str = Field(min_length=2,max_length=120)
    billing_contact_phone: Optional[str] = Field(default=None,max_length=40)
    legal_name: Optional[str] = Field(default=None,max_length=180)
    tax_id: Optional[str] = Field(default=None,max_length=80)
    address: Optional[str] = Field(default=None,max_length=240)
    city: Optional[str] = Field(default=None,max_length=120)
    cc_emails: List[EmailStr] = Field(default_factory=list,max_length=5)
    copy_primary_manager: bool = True
    email_enabled: bool = True

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
      "legal_notice":NOTICE,"issued_at":now_iso(),"service_description":"Suscripción mensual Nexus Business OS",
      "seller_snapshot":{"commercial_name":seller_settings.get("commercial_name"),"legal_name":seller_settings.get("legal_name"),"tax_id":seller_settings.get("tax_id"),"email":seller_settings.get("billing_email"),"phone":seller_settings.get("phone"),"address":seller_settings.get("address"),"city":seller_settings.get("city")},
      "buyer_snapshot":{"organization_name":organization.get("name"),"legal_name":profile.get("legal_name") or organization.get("legal_name"),"tax_id":profile.get("tax_id") or organization.get("tax_id"),"address":profile.get("address") or organization.get("address"),"city":profile.get("city") or organization.get("city"),"billing_contact_name":profile.get("billing_contact_name") or manager.get("name")},
      "delivery_email_snapshot":email,"delivery_cc_snapshot":[str(x) for x in profile.get("cc_emails",[])],"primary_manager_snapshot":{"user_id":manager.get("user_id"),"name":manager.get("name"),"email":manager.get("email")},
      "subtotal_minor":item["amount_minor"],"tax_minor":0,"discount_minor":0,"balance_minor":item["amount_minor"]})
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
        user=await actor(authorization,session_token); oid=org_for(user,organization_id); profile=await db.organization_billing_profiles.find_one({"organization_id":oid},{"_id":0}); _,manager,org,email=await resolve_billing_recipient(db,oid); return profile or {"organization_id":oid,"billing_email":email,"billing_contact_name":manager.get("name"),"legal_name":org.get("legal_name") or org.get("name"),"email_source":"fallback"}
    @router.put("/profile")
    async def put_profile(data:BillingProfileRequest,organization_id:Optional[str]=None,authorization:Optional[str]=Header(None),session_token:Optional[str]=Cookie(None)):
        user=await actor(authorization,session_token); oid=org_for(user,organization_id); now=now_iso(); item={**data.model_dump(mode="json"),"organization_id":oid,"updated_by":user.user_id,"updated_at":now}; await db.organization_billing_profiles.update_one({"organization_id":oid},{"$set":item,"$setOnInsert":{"created_at":now}},upsert=True); return item
    @router.get("/invoices")
    async def invoices(organization_id:Optional[str]=None,invoice_number:Optional[str]=None,status:Optional[str]=None,authorization:Optional[str]=Header(None),session_token:Optional[str]=Cookie(None)):
        user=await actor(authorization,session_token); oid=org_for(user,organization_id); q={"organization_id":oid};
        if invoice_number:q["invoice_number"]=invoice_number.strip().upper()
        if status:q["status"]=status
        return await db.subscription_invoices.find(q,{"_id":0}).sort([("issued_at",-1),("created_at",-1)]).to_list(500)
    @router.get("/invoices/{invoice_id}/pdf")
    async def pdf(invoice_id:str,organization_id:Optional[str]=None,authorization:Optional[str]=Header(None),session_token:Optional[str]=Cookie(None)):
        user=await actor(authorization,session_token); oid=org_for(user,organization_id); item=await db.subscription_invoices.find_one({"organization_id":oid,"invoice_id":invoice_id},{"_id":0});
        if not item: raise HTTPException(404,"Invoice not found")
        return Response(invoice_pdf(item),media_type="application/pdf",headers={"Content-Disposition":f"attachment; filename={item.get('invoice_number',invoice_id)}.pdf"})
    @router.get("/notifications")
    async def notifications(unread_only:bool=False,limit:int=100,authorization:Optional[str]=Header(None),session_token:Optional[str]=Cookie(None)):
        user=await actor(authorization,session_token); oid=org_for(user,None if user.role!='owner' else user.organization_id); q={"organization_id":oid};
        if unread_only:q["read_by"]={"$ne":user.user_id}
        return await db.subscription_notifications.find(q,{"_id":0}).sort("created_at",-1).to_list(max(1,min(limit,200)))
    @router.post("/notifications/{notification_id}/read")
    async def mark_read(notification_id:str,authorization:Optional[str]=Header(None),session_token:Optional[str]=Cookie(None)):
        user=await actor(authorization,session_token); oid=org_for(user,None if user.role!='owner' else user.organization_id); result=await db.subscription_notifications.update_one({"notification_id":notification_id,"organization_id":oid},{"$addToSet":{"read_by":user.user_id},"$set":{"last_read_at":now_iso()}});
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
