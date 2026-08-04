from datetime import datetime, timezone, timedelta
from email.message import EmailMessage
from typing import Optional
import os, smtplib, ssl, uuid

REMINDER_DAYS = (7, 3, 1, 0)
ACTIVE_INVOICE_STATES = {"draft", "issued", "pending", "overdue"}

def now_utc(): return datetime.now(timezone.utc)
def now_iso(): return now_utc().isoformat()
def make_id(prefix): return f"{prefix}_{uuid.uuid4().hex[:16]}"
def as_datetime(value):
    if isinstance(value, datetime): return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
def as_bool(name, default=False): return os.getenv(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}
def grace_days(): return max(0, min(int(os.getenv("SUBSCRIPTION_GRACE_DAYS", "5")), 30))
def delivery_mode(): return os.getenv("SUBSCRIPTION_EMAIL_DELIVERY_MODE", "controlled").strip().lower()
def lifecycle_mode(): return os.getenv("SUBSCRIPTION_LIFECYCLE_MODE", "simulation").strip().lower()
def enforcement_enabled(): return as_bool("SUBSCRIPTION_ACCESS_ENFORCEMENT_ENABLED", False)

async def ensure_lifecycle_indexes(db):
    await db.subscription_lifecycle_runs.create_index("run_id", unique=True, name="subscription_lifecycle_run_id_unique")
    await db.subscription_lifecycle_events.create_index("dedupe_key", unique=True, name="subscription_lifecycle_event_dedupe_unique")
    await db.subscription_lifecycle_events.create_index([("organization_id",1),("created_at",-1)], name="subscription_lifecycle_org_created")
    await db.subscription_email_deliveries.create_index("delivery_key", unique=True, sparse=True, name="subscription_email_delivery_key_unique")
    await db.organization_subscriptions.create_index([("status",1),("grace_until",1)], name="subscription_status_grace")

def _message(invoice, event_type):
    number=invoice.get("invoice_number") or invoice.get("invoice_id")
    due=str(invoice.get("due_at", ""))[:10]
    amount=f"{int(invoice.get('amount_minor',0))/100:,.0f}".replace(",", ".")
    labels={7:"7 días",3:"3 días",1:"1 día",0:"hoy"}
    if event_type.startswith("reminder_"):
        day=int(event_type.rsplit("_",1)[1]); subject=f"Recordatorio de pago {number}"
        intro=f"Tu documento de cobro vence {labels[day]}."
    elif event_type=="invoice_overdue": subject=f"Documento vencido {number}"; intro="Tu documento administrativo de cobro se encuentra vencido."
    else: subject=f"Documento de cobro {number}"; intro="Se emitió un nuevo documento administrativo de cobro."
    text=f"{intro}\n\nCódigo: {number}\nVencimiento: {due}\nTotal: COP $ {amount}\n\n{invoice.get('legal_notice','')}"
    html=f"<h2>{subject}</h2><p>{intro}</p><p><b>Código:</b> {number}<br><b>Vencimiento:</b> {due}<br><b>Total:</b> COP $ {amount}</p><p><small>{invoice.get('legal_notice','')}</small></p>"
    return subject,text,html

def send_invoice_email(invoice, recipient, cc, event_type, pdf_bytes):
    required=[os.getenv("SMTP_HOST"),os.getenv("SMTP_USER"),os.getenv("SMTP_PASSWORD"),os.getenv("SMTP_FROM_EMAIL")]
    if not all(required): return False, "smtp_not_configured"
    msg=EmailMessage(); subject,text,html=_message(invoice,event_type)
    msg["Subject"]=subject; msg["From"]=f"{os.getenv('SMTP_FROM_NAME','Nexus')} <{os.getenv('SMTP_FROM_EMAIL')}>"; msg["To"]=recipient
    if cc: msg["Cc"]=', '.join(cc)
    msg.set_content(text); msg.add_alternative(html,subtype="html")
    msg.add_attachment(pdf_bytes,maintype="application",subtype="pdf",filename=f"{invoice.get('invoice_number',invoice['invoice_id'])}.pdf")
    try:
        host=os.getenv("SMTP_HOST"); port=int(os.getenv("SMTP_PORT","587")); context=ssl.create_default_context()
        if port==465:
            with smtplib.SMTP_SSL(host,port,context=context,timeout=20) as smtp: smtp.login(os.getenv("SMTP_USER"),os.getenv("SMTP_PASSWORD")); smtp.send_message(msg)
        else:
            with smtplib.SMTP(host,port,timeout=20) as smtp: smtp.ehlo(); smtp.starttls(context=context); smtp.ehlo(); smtp.login(os.getenv("SMTP_USER"),os.getenv("SMTP_PASSWORD")); smtp.send_message(msg)
        return True,None
    except Exception as exc:
        return False, f"{type(exc).__name__}: delivery_failed"[:200]

async def record_event(db, *, organization_id, invoice_id, event_type, dedupe_key, mode, data):
    row={"lifecycle_event_id":make_id("slife"),"organization_id":organization_id,"invoice_id":invoice_id,"event_type":event_type,"dedupe_key":dedupe_key,"mode":mode,"data":data,"created_at":now_iso()}
    try: await db.subscription_lifecycle_events.insert_one(row.copy()); return row,True
    except Exception: return await db.subscription_lifecycle_events.find_one({"dedupe_key":dedupe_key},{"_id":0}),False

async def queue_or_deliver(db, invoice, event_type, mode, pdf_factory):
    key=f"{invoice['invoice_id']}:{event_type}"
    existing=await db.subscription_email_deliveries.find_one({"delivery_key":key},{"_id":0})
    if existing and existing.get("status") in {"sent","simulated"}: return existing,False
    recipient=invoice.get("delivery_email_snapshot"); cc=invoice.get("delivery_cc_snapshot") or []
    status="simulated" if mode=="simulation" else ("missing_recipient" if not recipient else "queued")
    row=existing or {"email_delivery_id":make_id("semail"),"delivery_key":key,"organization_id":invoice["organization_id"],"invoice_id":invoice["invoice_id"],"invoice_number":invoice.get("invoice_number"),"event_type":event_type,"recipient":recipient,"cc":cc,"attempt_count":0,"created_at":now_iso()}
    row.update({"status":status,"updated_at":now_iso()})
    if mode=="live" and recipient:
        row["attempt_count"]=int(row.get("attempt_count",0))+1; ok,error=send_invoice_email(invoice,recipient,cc,event_type,pdf_factory(invoice)); row["status"]="sent" if ok else "failed"; row["sent_at"]=now_iso() if ok else None; row["last_error"]=error
    await db.subscription_email_deliveries.update_one({"delivery_key":key},{"$set":row},upsert=True)
    return row,True

async def run_lifecycle(db, *, at=None, mode=None, organization_id=None, pdf_factory=None):
    at=as_datetime(at) if at else now_utc(); mode=(mode or lifecycle_mode()).lower()
    if mode not in {"simulation","live"}: raise ValueError("mode must be simulation or live")
    run={"run_id":make_id("srun"),"mode":mode,"at":at.isoformat(),"organization_id":organization_id,"started_at":now_iso(),"counts":{"scanned":0,"events":0,"emails":0,"overdue":0,"grace":0,"suspended":0}}
    query={"status":{"$in":list(ACTIVE_INVOICE_STATES)}}
    if organization_id: query["organization_id"]=organization_id
    invoices=await db.subscription_invoices.find(query,{"_id":0}).to_list(5000)
    for inv in invoices:
        run["counts"]["scanned"]+=1
        due=as_datetime(inv["due_at"]); days=(due.date()-at.date()).days
        event_type=f"reminder_{days}" if days in REMINDER_DAYS else ("invoice_overdue" if days<0 else None)
        if event_type:
            dedupe=f"{inv['invoice_id']}:{event_type}"
            _,created=await record_event(db,organization_id=inv["organization_id"],invoice_id=inv["invoice_id"],event_type=event_type,dedupe_key=dedupe,mode=mode,data={"days_to_due":days})
            if created: run["counts"]["events"]+=1
            if pdf_factory:
                _,email_created=await queue_or_deliver(db,inv,event_type,mode if delivery_mode()!="disabled" else "simulation",pdf_factory)
                if email_created: run["counts"]["emails"]+=1
        if days<0:
            run["counts"]["overdue"]+=1
            if mode=="live": await db.subscription_invoices.update_one({"invoice_id":inv["invoice_id"],"status":{"$in":list(ACTIVE_INVOICE_STATES)}},{"$set":{"status":"overdue","updated_at":now_iso()}})
            subscription=await db.organization_subscriptions.find_one({"organization_id":inv["organization_id"]},{"_id":0})
            if not subscription: continue
            grace_until=due+timedelta(days=grace_days())
            if at<=grace_until:
                run["counts"]["grace"]+=1
                if mode=="live": await db.organization_subscriptions.update_one({"organization_id":inv["organization_id"]},{"$set":{"status":"grace_period","subscription_access_state":"grace_period","grace_until":grace_until.isoformat(),"updated_at":now_iso()}})
            else:
                run["counts"]["suspended"]+=1
                enforce=mode=="live" and enforcement_enabled() and bool(subscription.get("access_enforcement_enabled"))
                if mode=="live": await db.organization_subscriptions.update_one({"organization_id":inv["organization_id"]},{"$set":{"status":"suspended","subscription_access_state":"suspended","suspended_at":now_iso(),"enforcement_applied":enforce,"updated_at":now_iso()}})
    run["completed_at"]=now_iso(); await db.subscription_lifecycle_runs.insert_one(run.copy()); return run

async def reactivate_after_payment(db, organization_id, invoice_id, actor_user_id):
    open_count=await db.subscription_invoices.count_documents({"organization_id":organization_id,"status":{"$in":["draft","issued","pending","overdue"]},"invoice_id":{"$ne":invoice_id}})
    if open_count: return {"reactivated":False,"reason":"other_open_invoices"}
    now=now_iso(); result=await db.organization_subscriptions.update_one({"organization_id":organization_id,"status":{"$in":["grace_period","past_due","suspended"]}},{"$set":{"status":"active","subscription_access_state":"active","reactivated_at":now,"reactivated_by":actor_user_id,"enforcement_applied":False,"updated_at":now},"$unset":{"grace_until":"","suspended_at":""}})
    if result.modified_count:
        await record_event(db,organization_id=organization_id,invoice_id=invoice_id,event_type="subscription_reactivated",dedupe_key=f"{invoice_id}:subscription_reactivated",mode="live",data={"actor_user_id":actor_user_id})
    return {"reactivated":bool(result.modified_count),"reason":"payment_confirmed" if result.modified_count else "not_required"}

async def enforce_subscription_access(db, user):
    if user.role=="owner" or not user.organization_id or not enforcement_enabled(): return
    sub=await db.organization_subscriptions.find_one({"organization_id":user.organization_id},{"_id":0,"subscription_access_state":1,"access_enforcement_enabled":1})
    if sub and sub.get("access_enforcement_enabled") and sub.get("subscription_access_state")=="suspended":
        from fastapi import HTTPException
        raise HTTPException(402,"Organization subscription is suspended")
