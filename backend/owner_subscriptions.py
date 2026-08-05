from fastapi import APIRouter, Cookie, Header, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, timezone, timedelta
import hashlib
import uuid
from owner_billing_hub import assert_fiscal_profile_complete, enrich_new_invoice, post_invoice_side_effects
from owner_subscription_lifecycle import reactivate_after_payment

# NEXUS_7I_FLEXIBLE_BILLING_V2
SUBSCRIPTION_STATES = {"trial", "active", "grace_period", "past_due", "suspended", "cancelled", "indefinite_block"}
CONTRACT_TERMS = {"monthly": 1, "six_months": 6, "annual": 12}
INVOICE_STATES = {"draft", "issued", "pending", "paid", "overdue", "void", "refunded"}
PAYMENT_PROVIDERS = {"manual", "wompi", "stripe"}

class SubscriptionUpsertRequest(BaseModel):
    plan_code: str = Field(min_length=2, max_length=80)
    monthly_amount_minor: int = Field(ge=0)
    currency: str = Field(default="COP", min_length=3, max_length=3)
    billing_day: int = Field(default=1, ge=1, le=28)
    status: str = "active"
    contract_term: str = "monthly"
    trial_days: int = Field(default=0, ge=0, le=15)
    reason: str = Field(min_length=3, max_length=500)

class InvoiceCreateRequest(BaseModel):
    period_start: str
    period_end: str
    due_at: str
    amount_minor: int = Field(ge=0)
    discount_minor: int = Field(default=0, ge=0)
    discount_reason: Optional[str] = Field(default=None, max_length=300)
    service_description: str = Field(default="Suscripción o membresía a Nexus by CS2 por un mes.", min_length=5, max_length=240)
    currency: str = Field(default="COP", min_length=3, max_length=3)
    notes: Optional[str] = Field(default=None, max_length=500)

class ManualPaymentRequest(BaseModel):
    amount_minor: int = Field(gt=0)
    currency: str = Field(default="COP", min_length=3, max_length=3)
    provider_reference: str = Field(min_length=3, max_length=200)
    idempotency_key: str = Field(min_length=8, max_length=200)
    notes: Optional[str] = Field(default=None, max_length=500)

class InvoiceStateRequest(BaseModel):
    status: str
    reason: str = Field(min_length=3, max_length=500)


def _now(): return datetime.now(timezone.utc).isoformat()
def _id(prefix): return f"{prefix}_{uuid.uuid4().hex[:16]}"
def _currency(value):
    value = str(value).strip().upper()
    if len(value) != 3 or not value.isalpha():
        raise HTTPException(400, "currency must be a three-letter code")
    return value

def _date(value, name):
    try: return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError: raise HTTPException(400, f"{name} must use ISO-8601 format")

def _add_months(value, months):
    month=value.month-1+months; year=value.year+month//12; month=month%12+1
    days=[31,29 if year%4==0 and (year%100!=0 or year%400==0) else 28,31,30,31,30,31,31,30,31,30,31]
    return value.replace(year=year,month=month,day=min(value.day,days[month-1]))

def _public(doc):
    if not doc: return doc
    return {k:v for k,v in doc.items() if k != "_id"}

async def ensure_subscription_indexes(db):
    await db.organization_subscriptions.create_index("subscription_id", unique=True, name="subscription_id_unique")
    await db.organization_subscriptions.create_index("organization_id", unique=True, name="subscription_org_unique")
    await db.subscription_invoices.create_index("invoice_id", unique=True, name="subscription_invoice_id_unique")
    await db.subscription_invoices.create_index("invoice_number", unique=True, sparse=True, name="subscription_invoice_number_global_unique")
    await db.subscription_invoices.create_index([("organization_id",1),("period_start",1),("period_end",1)], unique=True, name="subscription_invoice_period_unique")
    await db.subscription_invoices.create_index([("organization_id",1),("status",1),("due_at",1)], name="subscription_invoice_status_due")
    await db.subscription_payment_events.create_index("payment_event_id", unique=True, name="subscription_payment_event_id_unique")
    await db.subscription_payment_events.create_index([("organization_id",1),("idempotency_key",1)], unique=True, name="subscription_payment_idempotency_unique")
    await db.subscription_payment_events.create_index([("provider",1),("provider_reference",1)], unique=True, name="subscription_payment_provider_reference_unique")
    await db.subscription_audit_events.create_index("audit_event_id", unique=True, name="subscription_audit_id_unique")
    await db.subscription_audit_events.create_index([("organization_id",1),("created_at",-1)], name="subscription_audit_org_created")

async def _owner(current_user):
    if current_user.role != "owner" or current_user.access_status != "approved":
        raise HTTPException(403, "Owner access required")

async def _organization(db, organization_id):
    item = await db.organizations.find_one({"organization_id": organization_id}, {"_id":0})
    if not item: raise HTTPException(404, "Organization not found")
    return item

async def _audit(db, organization_id, event_type, entity_type, entity_id, actor, previous, current, reason, request_id=None):
    event={"audit_event_id":_id("saudit"),"organization_id":organization_id,"event_type":event_type,"entity_type":entity_type,"entity_id":entity_id,"actor_user_id":actor.user_id,"previous_value":previous,"new_value":current,"reason":reason,"request_id":request_id,"source":"owner_api","created_at":_now()}
    await db.subscription_audit_events.insert_one(event.copy())


def build_subscription_router(db, get_current_user):
    router=APIRouter(prefix="/owner/subscriptions", tags=["owner-subscriptions"])

    @router.get("/{organization_id}")
    async def get_subscription(organization_id: str, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
        user=await get_current_user(authorization,session_token); await _owner(user); await _organization(db,organization_id)
        return _public(await db.organization_subscriptions.find_one({"organization_id":organization_id},{"_id":0}))

    @router.put("/{organization_id}")
    async def put_subscription(organization_id: str, data: SubscriptionUpsertRequest, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
        user=await get_current_user(authorization,session_token); await _owner(user); await _organization(db,organization_id)
        if data.status not in SUBSCRIPTION_STATES: raise HTTPException(400,"Unsupported subscription status")
        if data.contract_term not in CONTRACT_TERMS: raise HTTPException(400,"Unsupported contract term")
        if data.trial_days not in {0,15}: raise HTTPException(400,"trial_days must be 0 or 15")
        previous=await db.organization_subscriptions.find_one({"organization_id":organization_id},{"_id":0})
        now=_now(); started=datetime.now(timezone.utc); term_months=CONTRACT_TERMS[data.contract_term]; item={"subscription_id":previous.get("subscription_id") if previous else _id("sub"),"organization_id":organization_id,"plan_code":data.plan_code.strip().lower(),"plan_version":int(previous.get("plan_version",0)+1) if previous else 1,"monthly_amount_minor":data.monthly_amount_minor,"currency":_currency(data.currency),"billing_day":data.billing_day,"status":"trial" if data.trial_days==15 else data.status,"contract_term":data.contract_term,"contract_term_months":term_months,"contract_started_at":previous.get("contract_started_at") if previous else started.isoformat(),"contract_ends_at":_add_months(started,term_months).isoformat(),"trial_days":data.trial_days,"trial_started_at":started.isoformat() if data.trial_days else None,"trial_ends_at":(started+timedelta(days=data.trial_days)).isoformat() if data.trial_days else None,"manual_payment_only":True,"access_enforcement_enabled":bool(previous.get("access_enforcement_enabled",False)) if previous else False,"subscription_access_state":previous.get("subscription_access_state","active") if previous else "active","updated_by":user.user_id,"updated_at":now}
        if not previous: item["created_at"]=now
        await db.organization_subscriptions.update_one({"organization_id":organization_id},{"$set":item},upsert=True)
        await _audit(db,organization_id,"subscription_upserted","subscription",item["subscription_id"],user,previous,item,data.reason)
        return item

    @router.post("/{organization_id}/invoices")
    async def create_invoice(organization_id: str, data: InvoiceCreateRequest, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
        user=await get_current_user(authorization,session_token); await _owner(user); await _organization(db,organization_id)
        start=_date(data.period_start,"period_start"); end=_date(data.period_end,"period_end"); due=_date(data.due_at,"due_at")
        if start>=end: raise HTTPException(400,"period_start must be before period_end")
        subscription=await db.organization_subscriptions.find_one({"organization_id":organization_id},{"_id":0})
        if not subscription: raise HTTPException(409,"Organization subscription does not exist")
        existing=await db.subscription_invoices.find_one({"organization_id":organization_id,"period_start":data.period_start,"period_end":data.period_end},{"_id":0})
        if existing: raise HTTPException(409,"Invoice already exists for this period")
        contract_amount=int(subscription["monthly_amount_minor"])
        if data.discount_minor > contract_amount: raise HTTPException(400,"discount_minor cannot exceed monthly contract amount")
        if data.discount_minor and not (data.discount_reason or "").strip(): raise HTTPException(400,"discount_reason is required when discount is applied")
        expected_amount=contract_amount-data.discount_minor
        if data.amount_minor != expected_amount: raise HTTPException(409,"Invoice amount must equal monthly contract amount minus period discount")
        await assert_fiscal_profile_complete(db,organization_id)
        now=_now(); item={"invoice_id":_id("sinv"),"organization_id":organization_id,"subscription_id":subscription["subscription_id"],"plan_code_snapshot":subscription["plan_code"],"plan_version_snapshot":subscription["plan_version"],"period_start":data.period_start,"period_end":data.period_end,"due_at":data.due_at,"contract_amount_minor_snapshot":contract_amount,"discount_minor":data.discount_minor,"discount_reason":data.discount_reason.strip() if data.discount_reason else None,"amount_minor":data.amount_minor,"paid_amount_minor":0,"currency":_currency(data.currency),"status":"pending","provider":"manual","service_description":data.service_description.strip(),"notes":data.notes,"created_by":user.user_id,"created_at":now,"updated_at":now}
        item=await enrich_new_invoice(db,item)
        await db.subscription_invoices.insert_one(item.copy())
        await post_invoice_side_effects(db,item)
        await _audit(db,organization_id,"invoice_created","invoice",item["invoice_id"],user,None,item,data.notes or "Monthly invoice created")
        return item

    @router.get("/{organization_id}/invoices")
    async def list_invoices(organization_id: str, status: Optional[str]=None, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
        user=await get_current_user(authorization,session_token); await _owner(user); await _organization(db,organization_id)
        query={"organization_id":organization_id}
        if status:
            if status not in INVOICE_STATES: raise HTTPException(400,"Unsupported invoice status")
            query["status"]=status
        return await db.subscription_invoices.find(query,{"_id":0}).sort([("period_start",-1),("invoice_id",-1)]).to_list(500)

    @router.post("/{organization_id}/invoices/{invoice_id}/manual-payment")
    async def confirm_manual_payment(organization_id: str, invoice_id: str, data: ManualPaymentRequest, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
        user=await get_current_user(authorization,session_token); await _owner(user); await _organization(db,organization_id)
        previous_event=await db.subscription_payment_events.find_one({"organization_id":organization_id,"idempotency_key":data.idempotency_key},{"_id":0})
        if previous_event:
            if previous_event.get("invoice_id")!=invoice_id or previous_event.get("amount_minor")!=data.amount_minor: raise HTTPException(409,"Idempotency key was already used with different payment data")
            return {**previous_event,"idempotent_replay":True}
        invoice=await db.subscription_invoices.find_one({"organization_id":organization_id,"invoice_id":invoice_id},{"_id":0})
        if not invoice: raise HTTPException(404,"Invoice not found")
        if invoice["status"] in {"void","refunded"}: raise HTTPException(409,"Invoice cannot receive payment in its current state")
        currency=_currency(data.currency)
        if currency!=invoice["currency"]: raise HTTPException(409,"Payment currency does not match invoice currency")
        if data.amount_minor!=invoice["amount_minor"]: raise HTTPException(409,"Manual payment must match the invoice amount")
        duplicate=await db.subscription_payment_events.find_one({"provider":"manual","provider_reference":data.provider_reference},{"_id":0})
        if duplicate: raise HTTPException(409,"Payment reference was already used")
        now=_now(); event={"payment_event_id":_id("spay"),"organization_id":organization_id,"invoice_id":invoice_id,"provider":"manual","provider_reference":data.provider_reference.strip(),"idempotency_key":data.idempotency_key,"amount_minor":data.amount_minor,"currency":currency,"status":"confirmed","confirmed_by":user.user_id,"confirmed_at":now,"notes":data.notes,"request_fingerprint":hashlib.sha256(f"{organization_id}|{invoice_id}|{data.amount_minor}|{currency}|{data.provider_reference}".encode()).hexdigest(),"created_at":now}
        result=await db.subscription_invoices.update_one({"organization_id":organization_id,"invoice_id":invoice_id,"status":{"$in":["draft","issued","pending","overdue"]}},{"$set":{"status":"paid","paid_amount_minor":data.amount_minor,"balance_minor":0,"paid_at":now,"payment_event_id":event["payment_event_id"],"updated_at":now}})
        if result.modified_count!=1:
            current=await db.subscription_invoices.find_one({"organization_id":organization_id,"invoice_id":invoice_id},{"_id":0})
            raise HTTPException(409,"Invoice state changed before payment confirmation" if not current or current.get("status")!="paid" else "Invoice is already paid")
        try: await db.subscription_payment_events.insert_one(event.copy())
        except Exception:
            await db.subscription_invoices.update_one({"organization_id":organization_id,"invoice_id":invoice_id,"payment_event_id":event["payment_event_id"]},{"$set":invoice})
            raise
        current=await db.subscription_invoices.find_one({"organization_id":organization_id,"invoice_id":invoice_id},{"_id":0})
        await _audit(db,organization_id,"manual_payment_confirmed","invoice",invoice_id,user,invoice,current,data.notes or "Manual payment confirmed",data.idempotency_key)
        reactivation=await reactivate_after_payment(db,organization_id,invoice_id,user.user_id)
        return {**event,"invoice_status":"paid","idempotent_replay":False,"reactivation":reactivation}

    @router.post("/{organization_id}/invoices/{invoice_id}/state")
    async def change_invoice_state(organization_id: str, invoice_id: str, data: InvoiceStateRequest, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
        user=await get_current_user(authorization,session_token); await _owner(user); await _organization(db,organization_id)
        if data.status not in INVOICE_STATES: raise HTTPException(400,"Unsupported invoice status")
        previous=await db.subscription_invoices.find_one({"organization_id":organization_id,"invoice_id":invoice_id},{"_id":0})
        if not previous: raise HTTPException(404,"Invoice not found")
        if previous["status"]=="paid" and data.status not in {"refunded"}: raise HTTPException(409,"Paid invoice can only transition to refunded")
        if previous["status"] in {"void","refunded"}: raise HTTPException(409,"Terminal invoice state cannot be changed")
        now=_now(); await db.subscription_invoices.update_one({"organization_id":organization_id,"invoice_id":invoice_id,"status":previous["status"]},{"$set":{"status":data.status,"state_reason":data.reason,"updated_by":user.user_id,"updated_at":now}})
        current=await db.subscription_invoices.find_one({"organization_id":organization_id,"invoice_id":invoice_id},{"_id":0}); await _audit(db,organization_id,"invoice_state_changed","invoice",invoice_id,user,previous,current,data.reason)
        return current

    @router.get("/{organization_id}/audit")
    async def list_audit(organization_id: str, limit: int=100, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
        user=await get_current_user(authorization,session_token); await _owner(user); await _organization(db,organization_id)
        return await db.subscription_audit_events.find({"organization_id":organization_id},{"_id":0}).sort("created_at",-1).to_list(max(1,min(limit,500)))

    return router
