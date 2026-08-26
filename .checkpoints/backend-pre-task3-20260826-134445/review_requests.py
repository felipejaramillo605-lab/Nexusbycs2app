# NEXUS_REVIEW_REQUEST_H1A_V2_PERSISTENT_FOUNDATION
from __future__ import annotations
import re,secrets
from datetime import datetime,timedelta,timezone
from appointment_email_delivery import enqueue_delivery
REQUEST_TYPE="post_appointment_review"
DELAY_MINUTES=60

def utcnow(): return datetime.now(timezone.utc)
def norm_email(v): return str(v or "").strip().lower()
def valid_https(v): return bool(re.match(r"^https://",str(v or "").strip(),re.I))

async def ensure_review_request_indexes(db):
 await db.review_requests.create_index("review_request_id",unique=True,name="review_request_id_unique")
 await db.review_requests.create_index([("organization_id",1),("appointment_id",1),("request_type",1)],unique=True,name="review_request_tenant_appointment_unique")
 await db.review_requests.create_index([("organization_id",1),("status",1),("scheduled_send_at",1)],name="review_request_schedule")
 await db.review_requests.create_index("email_delivery_id",name="review_request_email_delivery",partialFilterExpression={"email_delivery_id":{"$type":"string"}})

async def resolve_client(db,appointment):
 org=appointment.get("organization_id")
 if not org:return None,"missing_organization"
 candidates=[]
 phone=str(appointment.get("client_phone") or "").strip()
 if phone:candidates=await db.clients.find({"organization_id":org,"phone":phone},{"_id":0}).to_list(3)
 if not candidates:
  email=norm_email(appointment.get("client_email"))
  if email:candidates=await db.clients.find({"organization_id":org,"email":{"$regex":"^"+re.escape(email)+"$","$options":"i"}},{"_id":0}).to_list(3)
 unique={x.get("client_id"):x for x in candidates if x.get("client_id")}
 if not unique:return None,"missing_client"
 if len(unique)!=1:return None,"ambiguous_client"
 return next(iter(unique.values())),None

def eligibility(appointment,organization,client):
 if appointment.get("status")!="completed":return "appointment_not_completed"
 if not appointment.get("appointment_id") or not appointment.get("organization_id"):return "missing_identity"
 if not organization or organization.get("active") is False or organization.get("deleted_at"):return "organization_unavailable"
 cfg=organization.get("review_request_settings") or {}
 if cfg.get("enabled") is not True:return "review_disabled"
 if (cfg.get("channels") or {}).get("email") is not True:return "email_channel_disabled"
 if not valid_https(organization.get("review_link")):return "invalid_review_link"
 if not client:return "missing_client"
 if client.get("active") is False:return "client_inactive"
 if client.get("deleted_at") or client.get("deletion_requested_at"):return "client_deleted"
 if client.get("accepts_marketing") is not True:return "consent_required"
 if not norm_email(client.get("email") or appointment.get("client_email")):return "missing_recipient"
 return None

async def schedule_review_request(db,*,appointment,organization):
 client,reason=await resolve_client(db,appointment)
 reason=reason or eligibility(appointment,organization,client)
 if reason:return {"created":False,"reason":reason}
 identity={"organization_id":appointment["organization_id"],"appointment_id":appointment["appointment_id"],"request_type":REQUEST_TYPE}
 existing=await db.review_requests.find_one(identity,{"_id":0})
 if existing:return {"created":False,"reason":"idempotent_replay","review_request_id":existing["review_request_id"]}
 now=utcnow();scheduled=now+timedelta(minutes=DELAY_MINUTES);rid="revreq_"+secrets.token_hex(8)
 payload={"customer_name":client.get("name") or appointment.get("client_name") or "Cliente","organization_name":organization.get("name") or "Nexus","review_link":str(organization.get("review_link") or "").strip(),"client_id":client["client_id"],"review_request_id":rid}
 queued=await enqueue_delivery(db,organization_id=identity["organization_id"],appointment_id=identity["appointment_id"],event_type="review_request",recipient=norm_email(client.get("email") or appointment.get("client_email")),payload=payload,scheduled_for=scheduled)
 delivery=queued.get("delivery") or {}
 row={**identity,"review_request_id":rid,"client_id":client["client_id"],"scheduled_send_at":scheduled,"status":"queued","email_delivery_id":delivery.get("delivery_id"),"email_status":delivery.get("status") or "queued","whatsapp_status":"deferred","whatsapp_reason":"persistent_channel_not_available","consent_basis":"explicit_marketing_consent","consent_verified_at":now,"created_at":now,"updated_at":now}
 try:await db.review_requests.insert_one(row.copy())
 except Exception:
  existing=await db.review_requests.find_one(identity,{"_id":0})
  if existing:return {"created":False,"reason":"idempotent_replay","review_request_id":existing["review_request_id"]}
  raise
 return {"created":True,"reason":"queued","review_request_id":rid,"delivery_id":delivery.get("delivery_id")}

async def revalidate_review_delivery(db,delivery):
 p=delivery.get("payload") or {};org_id=delivery.get("organization_id");client_id=p.get("client_id")
 client=await db.clients.find_one({"client_id":client_id,"organization_id":org_id},{"_id":0}) if client_id and org_id else None
 org=await db.organizations.find_one({"organization_id":org_id},{"_id":0}) if org_id else None
 pseudo={"status":"completed","appointment_id":delivery.get("appointment_id"),"organization_id":org_id,"client_email":delivery.get("recipient")}
 reason=eligibility(pseudo,org,client)
 if reason:return reason
 if str(org.get("review_link") or "").strip()!=str(p.get("review_link") or "").strip():return "review_link_changed"
 return None
