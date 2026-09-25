from fastapi import APIRouter, Cookie, Header, HTTPException
from pydantic import BaseModel, Field
from typing import Literal, Optional
from datetime import datetime, timezone, timedelta
import hashlib
import json
import uuid
from billing_catalog import CATALOG_VERSION, PREMIUM_SURCHARGE_AMOUNT_MINOR, catalog_response, get_plan
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

class PlanChangeRequest(BaseModel):
    plan_code: Literal["standard", "premium"]
    effective: Literal["next_period", "immediate"] = "next_period"
    reason: str = Field(min_length=10, max_length=500)

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

class PremiumSurchargeInvoiceRequest(BaseModel):
    due_at: str
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

def _next_billing_period(subscription, now):
    day = int(subscription.get("billing_day") or 1)
    last_day = _add_months(now.replace(day=1), 1) - timedelta(days=1)
    effective = now.replace(day=min(day, last_day.day), hour=0, minute=0, second=0, microsecond=0)
    if effective <= now:
        next_month = _add_months(now.replace(day=1), 1)
        next_last_day = _add_months(next_month, 1) - timedelta(days=1)
        effective = next_month.replace(day=min(day, next_last_day.day), hour=0, minute=0, second=0, microsecond=0)
    return effective.isoformat()

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
    # NEXUS_OWNER_CONSOLE_SHELL_V1 (plan PR 12): additive, existing invoices
    # simply lack this field (treated as a regular monthly invoice); supports
    # filtering/reporting on premium-surcharge invoices without a full scan.
    await db.subscription_invoices.create_index([("invoice_type",1),("status",1)], sparse=True, name="subscription_invoice_type_status")
    await db.subscription_payment_events.create_index("payment_event_id", unique=True, name="subscription_payment_event_id_unique")
    await db.subscription_payment_events.create_index([("organization_id",1),("idempotency_key",1)], unique=True, name="subscription_payment_idempotency_unique")
    await db.subscription_payment_events.create_index([("provider",1),("provider_reference",1)], unique=True, name="subscription_payment_provider_reference_unique")
    await db.subscription_audit_events.create_index("audit_event_id", unique=True, name="subscription_audit_id_unique")
    await db.subscription_audit_events.create_index([("organization_id",1),("created_at",-1)], name="subscription_audit_org_created")

async def _owner(current_user):
    if current_user.role != "owner" or current_user.access_status != "approved":
        raise HTTPException(403, "Owner access required")

def _ensure_premium_package_active(plan_code, organization):
    if plan_code == "premium" and not all(
        bool(organization.get(field))
        for field in ("nexus_ai_contracted", "nexus_ai_enabled", "premium_templates_contracted")
    ):
        raise HTTPException(
            409,
            detail={"code":"premium_package_inactive","message":"Activa el paquete Premium mediante el flujo de factura pagada antes de asignar este plan."},
        )

async def _organization(db, organization_id):
    item = await db.organizations.find_one({"organization_id": organization_id}, {"_id":0})
    if not item: raise HTTPException(404, "Organization not found")
    return item

async def _audit(db, organization_id, event_type, entity_type, entity_id, actor, previous, current, reason, request_id=None):
    event={"audit_event_id":_id("saudit"),"organization_id":organization_id,"event_type":event_type,"entity_type":entity_type,"entity_id":entity_id,"actor_user_id":actor.user_id,"previous_value":previous,"new_value":current,"reason":reason,"request_id":request_id,"source":"owner_api","created_at":_now()}
    await db.subscription_audit_events.insert_one(event.copy())


def build_subscription_router(db, get_current_user):
    router=APIRouter()
    subscriptions_router=APIRouter(prefix="/owner/subscriptions", tags=["owner-subscriptions"])
    billing_catalog_router=APIRouter(prefix="/owner/billing", tags=["owner-billing-catalog"])

    @billing_catalog_router.get("/catalog")
    async def get_billing_catalog(authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
        user=await get_current_user(authorization,session_token); await _owner(user)
        return catalog_response()

    @subscriptions_router.get("/{organization_id}")
    async def get_subscription(organization_id: str, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
        user=await get_current_user(authorization,session_token); await _owner(user); await _organization(db,organization_id)
        return _public(await db.organization_subscriptions.find_one({"organization_id":organization_id},{"_id":0}))

    @subscriptions_router.put("/{organization_id}")
    async def put_subscription(organization_id: str, data: SubscriptionUpsertRequest, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
        user=await get_current_user(authorization,session_token); await _owner(user); organization=await _organization(db,organization_id)
        if data.status not in SUBSCRIPTION_STATES: raise HTTPException(400,"Unsupported subscription status")
        if data.contract_term not in CONTRACT_TERMS: raise HTTPException(400,"Unsupported contract term")
        if data.trial_days not in {0,15}: raise HTTPException(400,"trial_days must be 0 or 15")
        normalized_plan_code=data.plan_code.strip().lower()
        catalog_plan=get_plan(normalized_plan_code)
        _ensure_premium_package_active(normalized_plan_code,organization)
        currency=_currency(data.currency)
        if catalog_plan and (
            data.monthly_amount_minor != catalog_plan["monthly_amount_minor"]
            or currency != catalog_plan["currency"]
        ):
            raise HTTPException(
                409,
                detail={"code":"catalog_price_mismatch","message":"El valor y la moneda deben coincidir con el catálogo de planes."},
            )
        previous=await db.organization_subscriptions.find_one({"organization_id":organization_id},{"_id":0})
        now=_now(); started=datetime.now(timezone.utc); term_months=CONTRACT_TERMS[data.contract_term]; item={"subscription_id":previous.get("subscription_id") if previous else _id("sub"),"organization_id":organization_id,"plan_code":normalized_plan_code,"plan_version":int(previous.get("plan_version",0)+1) if previous else 1,"monthly_amount_minor":data.monthly_amount_minor,"currency":currency,"billing_day":data.billing_day,"status":"trial" if data.trial_days==15 else data.status,"contract_term":data.contract_term,"contract_term_months":term_months,"contract_started_at":previous.get("contract_started_at") if previous else started.isoformat(),"contract_ends_at":_add_months(started,term_months).isoformat(),"trial_days":data.trial_days,"trial_started_at":started.isoformat() if data.trial_days else None,"trial_ends_at":(started+timedelta(days=data.trial_days)).isoformat() if data.trial_days else None,"manual_payment_only":True,"access_enforcement_enabled":bool(previous.get("access_enforcement_enabled",False)) if previous else False,"subscription_access_state":previous.get("subscription_access_state","active") if previous else "active","pricing_source":"catalog" if catalog_plan else "custom","updated_by":user.user_id,"updated_at":now}
        if catalog_plan:
            item["catalog_version"]=CATALOG_VERSION
        if not previous: item["created_at"]=now
        update={"$set":item}
        if not catalog_plan and previous and previous.get("catalog_version"):
            update["$unset"]={"catalog_version":""}
        await db.organization_subscriptions.update_one({"organization_id":organization_id},update,upsert=True)
        await _audit(db,organization_id,"subscription_upserted","subscription",item["subscription_id"],user,previous,item,data.reason)
        return item

    @subscriptions_router.post("/{organization_id}/plan-change")
    async def change_subscription_plan(
        organization_id: str,
        data: PlanChangeRequest,
        x_request_id: str = Header(..., alias="X-Request-ID", min_length=8, max_length=200),
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        user=await get_current_user(authorization,session_token); await _owner(user)
        organization=await _organization(db,organization_id)
        plan=get_plan(data.plan_code)
        fingerprint=hashlib.sha256(json.dumps(
            {"plan_code":data.plan_code,"effective":data.effective,"reason":data.reason.strip()},
            sort_keys=True,separators=(",",":"),
        ).encode("utf-8")).hexdigest()

        prior_event=await db.subscription_audit_events.find_one(
            {"organization_id":organization_id,"event_type":"subscription_plan_changed","request_id":x_request_id},
            {"_id":0},
        )
        if prior_event:
            if prior_event.get("request_fingerprint")!=fingerprint:
                raise HTTPException(409,detail={"code":"idempotency_key_conflict","message":"X-Request-ID ya se usó con otros datos."})
            return {**(prior_event.get("new_value") or {}),"audit_event_id":prior_event.get("audit_event_id"),"idempotent_replay":True}

        previous=await db.organization_subscriptions.find_one({"organization_id":organization_id},{"_id":0})
        if not previous:
            raise HTTPException(404,detail="Subscription not found")
        _ensure_premium_package_active(data.plan_code,organization)

        now=datetime.now(timezone.utc)
        effective_from=now.isoformat() if data.effective=="immediate" else _next_billing_period(previous,now)
        next_version=int(previous.get("plan_version",0) or 0)+1
        updated={
            **previous,
            "plan_code":data.plan_code,
            "monthly_amount_minor":plan["monthly_amount_minor"],
            "currency":plan["currency"],
            "catalog_version":CATALOG_VERSION,
            "pricing_source":"catalog",
            "plan_version":next_version,
            "plan_effective_from":effective_from,
            "updated_by":user.user_id,
            "updated_at":now.isoformat(),
        }
        expected={"organization_id":organization_id}
        if "plan_version" in previous:
            expected["plan_version"]=previous["plan_version"]
        else:
            expected["plan_version"]={"$exists":False}
        changed=await db.organization_subscriptions.update_one(expected,{"$set":{key:value for key,value in updated.items() if key!="_id"}})
        if changed.modified_count!=1:
            replay=await db.subscription_audit_events.find_one(
                {"organization_id":organization_id,"event_type":"subscription_plan_changed","request_id":x_request_id},
                {"_id":0},
            )
            if replay and replay.get("request_fingerprint")==fingerprint:
                return {**(replay.get("new_value") or {}),"audit_event_id":replay.get("audit_event_id"),"idempotent_replay":True}
            raise HTTPException(409,detail={"code":"subscription_plan_changed_concurrently","message":"La suscripción cambió durante la solicitud; vuelve a consultar el estado."})

        event={"audit_event_id":_id("saudit"),"organization_id":organization_id,"event_type":"subscription_plan_changed","entity_type":"subscription","entity_id":updated.get("subscription_id"),"actor_user_id":user.user_id,"previous_value":previous,"new_value":updated,"reason":data.reason.strip(),"request_id":x_request_id,"request_fingerprint":fingerprint,"source":"owner_api","created_at":_now()}
        await db.subscription_audit_events.insert_one(event.copy())
        return {**updated,"audit_event_id":event["audit_event_id"],"idempotent_replay":False}

    @subscriptions_router.post("/{organization_id}/invoices")
    async def create_invoice(organization_id: str, data: InvoiceCreateRequest, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
        user=await get_current_user(authorization,session_token); await _owner(user); await _organization(db,organization_id)
        start=_date(data.period_start,"period_start"); end=_date(data.period_end,"period_end"); due=_date(data.due_at,"due_at")
        if start>=end: raise HTTPException(400,"period_start must be before period_end")
        subscription=await db.organization_subscriptions.find_one({"organization_id":organization_id},{"_id":0})
        if not subscription: raise HTTPException(409,"Organization subscription does not exist")
        existing=await db.subscription_invoices.find_one({"organization_id":organization_id,"period_start":data.period_start,"period_end":data.period_end},{"_id":0})
        if existing: raise HTTPException(409,"Invoice already exists for this period")
        contract_amount=int(subscription["monthly_amount_minor"])
        if data.discount_minor >= contract_amount: raise HTTPException(400,"discount_minor must be less than the monthly contract amount; invoices cannot be issued at zero")
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

    # NEXUS_OWNER_CONSOLE_SHELL_V1 (plan PR 12): dedicated Premium-surcharge
    # invoice creation. Before this, the Owner had to fake the flat 70,000
    # COP surcharge through the generic "Emitir factura" form by abusing the
    # discount field (since create_invoice above forces amount_minor to equal
    # the organization's *monthly plan price* minus discount -- confirmed in
    # owner_subscriptions.py:242-246 before this endpoint existed). Kept as a
    # SEPARATE endpoint rather than loosening that check on the generic one:
    # loosening the generic monthly-invoice form's amount validation would
    # let the Owner issue an arbitrary amount on any regular invoice, which
    # is exactly the kind of billing-integrity hole this app has been
    # careful to avoid everywhere else (see the idempotency/authorization
    # discipline on every other money-mutating endpoint in this file).
    #
    # Dedup relies on the same mechanism create_invoice already uses -- the
    # (organization_id, period_start, period_end) unique index -- period_start
    # here is today's date (no time), so at most one surcharge invoice per
    # organization per day can share it; a genuine same-day retry collides
    # and fails loudly instead of double-charging, same tradeoff the existing
    # monthly-invoice endpoint already accepts.
    #
    # This does NOT set invoice_purpose or premium_request_id -- that link is
    # still made afterward by the existing, already-tested
    # POST /owner/platform-capabilities/premium-plan-requests/{id}/invoice-link
    # flow (platform_capabilities.py), which selects from exactly this kind
    # of eligible unpaid manual invoice (OwnerPremiumPlanPanel.jsx:45-48).
    @subscriptions_router.post("/{organization_id}/invoices/premium-surcharge")
    async def create_premium_surcharge_invoice(organization_id: str, data: PremiumSurchargeInvoiceRequest, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
        user=await get_current_user(authorization,session_token); await _owner(user); await _organization(db,organization_id)
        due=_date(data.due_at,"due_at")
        subscription=await db.organization_subscriptions.find_one({"organization_id":organization_id},{"_id":0})
        if not subscription: raise HTTPException(409,"Organization subscription does not exist")
        await assert_fiscal_profile_complete(db,organization_id)
        today=datetime.now(timezone.utc).date().isoformat()
        period_start=f"{today}T00:00:00+00:00"
        existing=await db.subscription_invoices.find_one({"organization_id":organization_id,"period_start":period_start,"period_end":data.due_at},{"_id":0})
        if existing: raise HTTPException(409,"A premium-surcharge invoice for this organization and due date already exists today")
        amount=PREMIUM_SURCHARGE_AMOUNT_MINOR
        now=_now(); item={"invoice_id":_id("sinv"),"organization_id":organization_id,"subscription_id":subscription["subscription_id"],"plan_code_snapshot":subscription["plan_code"],"plan_version_snapshot":subscription["plan_version"],"period_start":period_start,"period_end":data.due_at,"due_at":data.due_at,"contract_amount_minor_snapshot":amount,"discount_minor":0,"discount_reason":None,"amount_minor":amount,"paid_amount_minor":0,"currency":"COP","status":"pending","provider":"manual","service_description":"Excedente del plan Premium — activación de paquete Premium","notes":data.notes,"invoice_type":"premium_surcharge","created_by":user.user_id,"created_at":now,"updated_at":now}
        item=await enrich_new_invoice(db,item)
        await db.subscription_invoices.insert_one(item.copy())
        await post_invoice_side_effects(db,item)
        await _audit(db,organization_id,"invoice_created","invoice",item["invoice_id"],user,None,item,data.notes or "Premium surcharge invoice created")
        return item

    @subscriptions_router.get("/{organization_id}/invoices")
    async def list_invoices(organization_id: str, status: Optional[str]=None, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
        user=await get_current_user(authorization,session_token); await _owner(user); await _organization(db,organization_id)
        query={"organization_id":organization_id}
        if status:
            if status not in INVOICE_STATES: raise HTTPException(400,"Unsupported invoice status")
            query["status"]=status
        return await db.subscription_invoices.find(query,{"_id":0}).sort([("period_start",-1),("invoice_id",-1)]).to_list(500)

    @subscriptions_router.post("/{organization_id}/invoices/{invoice_id}/manual-payment")
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
        # NEXUS_FIX_PAYMENT_EVENT_ORDERING_V1: persist the payment event first so a crash or write
        # failure after this point never leaves an invoice marked "paid" without evidence of payment.
        # If the invoice-side transition then fails, delete the event rather than leaving it behind:
        # a lingering event would satisfy the idempotency-key lookup above on retry and falsely report
        # idempotent_replay=True for a payment that was never actually applied to the invoice.
        await db.subscription_payment_events.insert_one(event.copy())
        result=await db.subscription_invoices.update_one({"organization_id":organization_id,"invoice_id":invoice_id,"status":{"$in":["draft","issued","pending","overdue"]}},{"$set":{"status":"paid","paid_amount_minor":data.amount_minor,"balance_minor":0,"paid_at":now,"payment_event_id":event["payment_event_id"],"updated_at":now}})
        if result.modified_count!=1:
            current=await db.subscription_invoices.find_one({"organization_id":organization_id,"invoice_id":invoice_id},{"_id":0})
            await db.subscription_payment_events.delete_one({"payment_event_id":event["payment_event_id"]})
            raise HTTPException(409,"Invoice state changed before payment confirmation" if not current or current.get("status")!="paid" else "Invoice is already paid")
        current=await db.subscription_invoices.find_one({"organization_id":organization_id,"invoice_id":invoice_id},{"_id":0})
        await _audit(db,organization_id,"manual_payment_confirmed","invoice",invoice_id,user,invoice,current,data.notes or "Manual payment confirmed",data.idempotency_key)
        reactivation=await reactivate_after_payment(db,organization_id,invoice_id,user.user_id)
        return {**event,"invoice_status":"paid","idempotent_replay":False,"reactivation":reactivation}

    @subscriptions_router.post("/{organization_id}/invoices/{invoice_id}/state")
    async def change_invoice_state(organization_id: str, invoice_id: str, data: InvoiceStateRequest, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
        user=await get_current_user(authorization,session_token); await _owner(user); await _organization(db,organization_id)
        if data.status not in INVOICE_STATES: raise HTTPException(400,"Unsupported invoice status")
        previous=await db.subscription_invoices.find_one({"organization_id":organization_id,"invoice_id":invoice_id},{"_id":0})
        if not previous: raise HTTPException(404,"Invoice not found")
        if previous["status"]=="paid" and data.status not in {"refunded"}: raise HTTPException(409,"Paid invoice can only transition to refunded")
        if previous["status"] in {"void","refunded"}: raise HTTPException(409,"Terminal invoice state cannot be changed")
        now=_now()
        # Premium activation and refund race on this invoice document. Activation
        # atomically reserves it while paid; refund can proceed only when no live
        # entitlement lock remains. This is a single-document CAS (Mongo standalone safe).
        changed=await db.subscription_invoices.update_one(
            {
                "organization_id":organization_id,
                "invoice_id":invoice_id,
                "status":previous["status"],
                "$or":[
                    {"premium_activation_state":{"$exists":False}},
                    {"premium_activation_state":"released"},
                ],
            },
            {"$set":{"status":data.status,"state_reason":data.reason,"updated_by":user.user_id,"updated_at":now}},
        )
        if changed.modified_count!=1:
            current=await db.subscription_invoices.find_one({"organization_id":organization_id,"invoice_id":invoice_id},{"_id":0})
            if current and current.get("premium_activation_state") in {"reserved","active"}:
                raise HTTPException(409,"Disable the Premium package before refunding its invoice")
            raise HTTPException(409,"Invoice state changed before the requested transition")
        current=await db.subscription_invoices.find_one({"organization_id":organization_id,"invoice_id":invoice_id},{"_id":0}); await _audit(db,organization_id,"invoice_state_changed","invoice",invoice_id,user,previous,current,data.reason)
        return current

    @subscriptions_router.get("/{organization_id}/audit")
    async def list_audit(organization_id: str, limit: int=100, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
        user=await get_current_user(authorization,session_token); await _owner(user); await _organization(db,organization_id)
        return await db.subscription_audit_events.find({"organization_id":organization_id},{"_id":0}).sort("created_at",-1).to_list(max(1,min(limit,500)))

    router.include_router(subscriptions_router)
    router.include_router(billing_catalog_router)
    return router
