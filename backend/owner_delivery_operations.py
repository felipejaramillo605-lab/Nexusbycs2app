from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Cookie, Header, HTTPException
from pydantic import BaseModel, EmailStr, Field
from typing import Optional
import asyncio, os, uuid
from owner_billing_hub import next_invoice_number, resolve_billing_recipient, invoice_pdf, NOTICE
from owner_subscription_lifecycle import run_lifecycle, send_invoice_email

def now(): return datetime.now(timezone.utc)
def iso(): return now().isoformat()
def ident(prefix): return f"{prefix}_{uuid.uuid4().hex[:16]}"
def clean_error(value):
    text=str(value or 'delivery_failed').replace(os.getenv('SMTP_PASSWORD','__never__'),'***')
    return text[:240]

class BackfillRequest(BaseModel):
    organization_id: Optional[str]=None
    apply: bool=False
    reason: str=Field(default='Historical billing metadata backfill',min_length=3,max_length=300)
class TestDeliveryRequest(BaseModel):
    invoice_id: str
    test_recipient: EmailStr
    event_type: str='controlled_test'
class RetryRequest(BaseModel):
    test_recipient: Optional[EmailStr]=None
class SchedulerRunRequest(BaseModel):
    at: Optional[str]=None

async def ensure_delivery_operations_indexes(db):
    await db.subscription_backfill_events.create_index('backfill_key',unique=True,name='subscription_backfill_key_unique')
    await db.subscription_backfill_events.create_index([('organization_id',1),('created_at',-1)],name='subscription_backfill_org_created')
    await db.subscription_delivery_attempts.create_index('attempt_id',unique=True,name='subscription_delivery_attempt_unique')
    await db.subscription_delivery_attempts.create_index([('delivery_id',1),('created_at',-1)],name='subscription_delivery_attempt_created')
    await db.subscription_scheduler_locks.create_index('expires_at',expireAfterSeconds=0,name='subscription_scheduler_lock_ttl')
    await db.subscription_email_deliveries.create_index([('organization_id',1),('status',1),('updated_at',-1)],name='subscription_delivery_monitoring')

async def backfill_preview(db,organization_id=None):
    q={'$or':[{'invoice_number':{'$exists':False}},{'invoice_number':None},{'delivery_email_snapshot':{'$exists':False}},{'delivery_email_snapshot':None},{'balance_minor':{'$exists':False}},{'balance_minor':None}]}
    if organization_id:q['organization_id']=organization_id
    rows=[]
    async for inv in db.subscription_invoices.find(q,{'_id':0}).sort('created_at',1):
        profile,manager,org,email=await resolve_billing_recipient(db,inv['organization_id'])
        changes={}
        if not inv.get('invoice_number'):changes['invoice_number']='WILL_ASSIGN_GLOBAL_NUMBER'
        if not inv.get('delivery_email_snapshot') and email:changes['delivery_email_snapshot']=email
        if 'delivery_cc_snapshot' not in inv:changes['delivery_cc_snapshot']=[str(x) for x in profile.get('cc_emails',[])]
        if inv.get('balance_minor') is None:
            amount=int(inv.get('amount_minor',0) or 0); paid=int(inv.get('paid_amount_minor',0) or 0); expected_balance=amount-paid
            changes['balance_minor']='INVALID_NEGATIVE_BALANCE' if expected_balance < 0 else expected_balance
        rows.append({'invoice_id':inv['invoice_id'],'organization_id':inv['organization_id'],'current_invoice_number':inv.get('invoice_number'),'recipient_available':bool(email),'resolved_recipient':email,'changes':changes})
    return rows

async def apply_backfill(db,user,organization_id,reason):
    preview=await backfill_preview(db,organization_id); results=[]
    for row in preview:
        inv=await db.subscription_invoices.find_one({'invoice_id':row['invoice_id']},{'_id':0})
        updates={}; fields=[]
        if not inv.get('invoice_number'):updates['invoice_number']=await next_invoice_number(db);fields.append('invoice_number')
        if not inv.get('delivery_email_snapshot') and row.get('resolved_recipient'):updates['delivery_email_snapshot']=row['resolved_recipient'];fields.append('delivery_email_snapshot')
        if 'delivery_cc_snapshot' not in inv:
            profile,_,_,_=await resolve_billing_recipient(db,inv['organization_id']);updates['delivery_cc_snapshot']=[str(x) for x in profile.get('cc_emails',[])];fields.append('delivery_cc_snapshot')
        if inv.get('balance_minor') is None:
            amount=int(inv.get('amount_minor',0) or 0); paid=int(inv.get('paid_amount_minor',0) or 0); expected_balance=amount-paid
            if expected_balance < 0: raise HTTPException(409,'Historical invoice has a negative derived balance')
            updates['balance_minor']=expected_balance;fields.append('balance_minor')
        key=f"{inv['invoice_id']}:billing_metadata_v1"
        if updates:
            updates.update({'backfilled_at':iso(),'backfilled_by':user.user_id})
            result=await db.subscription_invoices.update_one({'invoice_id':inv['invoice_id'],'organization_id':inv['organization_id']},{'$set':updates})
            event={'backfill_event_id':ident('sback'),'backfill_key':key,'invoice_id':inv['invoice_id'],'organization_id':inv['organization_id'],'fields':fields,'reason':reason,'actor_user_id':user.user_id,'created_at':iso()}
            try: await db.subscription_backfill_events.insert_one(event)
            except Exception: pass
            results.append({**row,'applied':bool(result.modified_count),'assigned_invoice_number':updates.get('invoice_number'),'fields':fields})
        else: results.append({**row,'applied':False,'fields':[]})
    return results

async def controlled_delivery(db,invoice,recipient,event_type,actor_user_id,delivery_id=None):
    if not recipient: raise HTTPException(400,'A controlled test recipient is required')
    max_attempts=max(1,min(int(os.getenv('SUBSCRIPTION_EMAIL_MAX_ATTEMPTS','3')),10))
    delivery_id=delivery_id or ident('semail'); existing=await db.subscription_email_deliveries.find_one({'email_delivery_id':delivery_id},{'_id':0})
    attempts=int((existing or {}).get('attempt_count',0))
    if existing and existing.get('status')=='sent': raise HTTPException(409,'Delivery is already sent')
    if attempts>=max_attempts: raise HTTPException(409,'Maximum delivery attempts reached')
    attempt_id=ident('sattempt'); started=iso()
    ok,error=await asyncio.to_thread(send_invoice_email,invoice,str(recipient),[],event_type,invoice_pdf(invoice))
    status='sent' if ok else 'failed'; finished=iso()
    row={**(existing or {}),'email_delivery_id':delivery_id,'delivery_key':(existing or {}).get('delivery_key') or f"controlled:{invoice['invoice_id']}:{delivery_id}",'organization_id':invoice['organization_id'],'invoice_id':invoice['invoice_id'],'invoice_number':invoice.get('invoice_number'),'event_type':event_type,'recipient':str(recipient),'recipient_mode':'controlled_test','cc':[],'status':status,'attempt_count':attempts+1,'last_attempt_at':finished,'updated_at':finished,'sent_at':finished if ok else None,'last_error':clean_error(error) if not ok else None,'created_at':(existing or {}).get('created_at') or started}
    await db.subscription_email_deliveries.update_one({'email_delivery_id':delivery_id},{'$set':row},upsert=True)
    await db.subscription_delivery_attempts.insert_one({'attempt_id':attempt_id,'delivery_id':delivery_id,'invoice_id':invoice['invoice_id'],'organization_id':invoice['organization_id'],'recipient':str(recipient),'status':status,'error':row['last_error'],'actor_user_id':actor_user_id,'created_at':finished})
    return row

async def scheduler_once(db,pdf_factory,at=None):
    lock_id='subscription_lifecycle_scheduler'; token=uuid.uuid4().hex; acquired=now(); expires=acquired+timedelta(minutes=15)
    old=await db.subscription_scheduler_locks.find_one_and_update({'lock_id':lock_id,'$or':[{'expires_at':{'$lte':acquired}},{'expires_at':{'$exists':False}}]},{'$set':{'token':token,'acquired_at':acquired,'expires_at':expires}},upsert=True,return_document=True)
    if not old or old.get('token')!=token:return {'acquired':False,'reason':'scheduler_locked'}
    try:return {'acquired':True,'result':await run_lifecycle(db,at=at,mode='simulation',pdf_factory=pdf_factory)}
    finally:await db.subscription_scheduler_locks.delete_one({'lock_id':lock_id,'token':token})

async def scheduler_loop(db,pdf_factory):
    interval=max(300,min(int(os.getenv('SUBSCRIPTION_SCHEDULER_INTERVAL_SECONDS','3600')),86400))
    while True:
        try: await scheduler_once(db,pdf_factory)
        except Exception: pass
        await asyncio.sleep(interval)

def build_delivery_operations_router(db,get_current_user):
    router=APIRouter(prefix='/owner/delivery-operations',tags=['owner-delivery-operations'])
    async def owner(auth,cookie):
        user=await get_current_user(auth,cookie)
        if user.role!='owner':raise HTTPException(403,'Owner access required')
        return user
    @router.post('/backfill')
    async def backfill(data:BackfillRequest,authorization:Optional[str]=Header(None),session_token:Optional[str]=Cookie(None)):
        user=await owner(authorization,session_token)
        if not data.apply:return {'mode':'dry_run','items':await backfill_preview(db,data.organization_id)}
        return {'mode':'applied','items':await apply_backfill(db,user,data.organization_id,data.reason)}
    @router.get('/deliveries')
    async def deliveries(organization_id:Optional[str]=None,status:Optional[str]=None,invoice_number:Optional[str]=None,limit:int=200,authorization:Optional[str]=Header(None),session_token:Optional[str]=Cookie(None)):
        await owner(authorization,session_token);q={}
        if organization_id:q['organization_id']=organization_id
        if status:q['status']=status
        if invoice_number:q['invoice_number']=invoice_number.strip().upper()
        return await db.subscription_email_deliveries.find(q,{'_id':0}).sort('updated_at',-1).to_list(max(1,min(limit,500)))
    @router.post('/deliveries/test')
    async def test(data:TestDeliveryRequest,authorization:Optional[str]=Header(None),session_token:Optional[str]=Cookie(None)):
        user=await owner(authorization,session_token);invoice=await db.subscription_invoices.find_one({'invoice_id':data.invoice_id},{'_id':0})
        if not invoice:raise HTTPException(404,'Invoice not found')
        return await controlled_delivery(db,invoice,data.test_recipient,data.event_type,user.user_id)
    @router.post('/deliveries/{delivery_id}/retry')
    async def retry(delivery_id:str,data:RetryRequest,authorization:Optional[str]=Header(None),session_token:Optional[str]=Cookie(None)):
        user=await owner(authorization,session_token);delivery=await db.subscription_email_deliveries.find_one({'email_delivery_id':delivery_id},{'_id':0})
        if not delivery:raise HTTPException(404,'Delivery not found')
        invoice=await db.subscription_invoices.find_one({'invoice_id':delivery['invoice_id'],'organization_id':delivery['organization_id']},{'_id':0})
        if not invoice:raise HTTPException(404,'Invoice not found')
        recipient=str(data.test_recipient or delivery.get('recipient') or '')
        return await controlled_delivery(db,invoice,recipient,delivery.get('event_type','controlled_retry'),user.user_id,delivery_id)
    @router.post('/scheduler/run')
    async def scheduler(data:SchedulerRunRequest,authorization:Optional[str]=Header(None),session_token:Optional[str]=Cookie(None)):
        await owner(authorization,session_token);return await scheduler_once(db,invoice_pdf,data.at)
    return router
