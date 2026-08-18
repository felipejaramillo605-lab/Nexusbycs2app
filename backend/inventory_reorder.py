# NEXUS_INVENTORY_REORDER_ALERTS_V2_HARDENED
from fastapi import APIRouter, HTTPException, Header, Cookie
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, timezone
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError
import hashlib, json, math, uuid

OPEN_PO_STATES={"draft","submitted","approved","partially_received"}
DISCRETE_PURCHASE_UNITS={"unidades","pares","cajas","paquetes","frascos"}

class GeneratePayload(BaseModel):
    item_ids:Optional[List[str]]=None
    organization_id:Optional[str]=None
    idempotency_key:str=Field(min_length=8,max_length=160)

def _severity(quantity,min_stock):
    return "critical" if quantity<=0 else ("warning" if quantity<=min_stock else "ok")
def _target_stock(min_stock):return round(max(min_stock*2,min_stock+1),6)
def _purchase_quantity(required_base,factor,minimum_order,purchase_unit):
    factor=max(float(factor or 1),1e-9);raw=max(float(required_base or 0),0)/factor
    if (purchase_unit or "").strip().lower() in DISCRETE_PURCHASE_UNITS:raw=math.ceil(raw-1e-9)
    return round(max(raw,float(minimum_order or 1)) if required_base>0 else 0,6)
def _select_link(links,supplier_map):
    valid=[x for x in links if x.get("active",True) and x.get("supplier_id") in supplier_map]
    valid.sort(key=lambda x:(0 if x.get("preferred") else 1,str(x.get("supplier_id") or "")))
    return valid[0] if valid else None
def _fingerprint(org,actor,key,supplier_id,lines):
    normalized=[{"item_id":x["inventory_item_id"],"quantity":round(float(x["quantity"]),6),"factor":round(float(x.get("conversion_factor",1)),6)} for x in sorted(lines,key=lambda y:y["inventory_item_id"])]
    raw=json.dumps({"org":org,"actor":actor,"request":key,"supplier":supplier_id,"lines":normalized},sort_keys=True,separators=(",",":"));digest=hashlib.sha256(raw.encode()).hexdigest()
    return f"reorder:{key}:{supplier_id}"[:300],digest

async def ensure_inventory_reorder_indexes(db):
    await db.purchase_orders.create_index([("organization_id",1),("generation_key",1),("supplier_id",1)],unique=True,partialFilterExpression={"auto_generation_source":"reorder_alerts","generation_key":{"$type":"string"}},name="nexus_reorder_generation_unique")
async def _po_number(db,org):
    now=datetime.now(timezone.utc).isoformat();row=await db.procurement_counters.find_one_and_update({"organization_id":org,"counter_type":"purchase_order"},{"$inc":{"sequence":1},"$set":{"updated_at":now},"$setOnInsert":{"created_at":now}},upsert=True,return_document=ReturnDocument.AFTER);return f'OC-{int(row["sequence"]):06d}'

def build_inventory_reorder_router(db,get_current_user,require_management_role,resolve_team_organization):
    router=APIRouter()
    async def ctx(a,t,org=None):
        user=await get_current_user(a,t);require_management_role(user);return user,await resolve_team_organization(user,org)
    # NEXUS_REORDER_V4B_COVERING_ORDER_DETAILS
    async def open_quantities(org,item_ids):
        pipeline=[{"$match":{"organization_id":org,"status":{"$in":sorted(OPEN_PO_STATES)},"lines.inventory_item_id":{"$in":item_ids}}},{"$unwind":"$lines"},{"$match":{"lines.inventory_item_id":{"$in":item_ids}}},{"$project":{"purchase_order_id":1,"order_number":1,"status":1,"item_id":"$lines.inventory_item_id","ordered_purchase_quantity":{"$ifNull":["$lines.quantity",0]},"received_purchase_quantity":{"$ifNull":["$lines.received_quantity",0]},"pending_purchase_quantity":{"$max":[{"$subtract":[{"$ifNull":["$lines.quantity",0]},{"$ifNull":["$lines.received_quantity",0]}]},0]},"conversion_factor":{"$ifNull":["$lines.conversion_factor",1]}}},{"$project":{"purchase_order_id":1,"order_number":1,"status":1,"item_id":1,"ordered_purchase_quantity":1,"received_purchase_quantity":1,"pending_purchase_quantity":1,"conversion_factor":1,"pending_base_quantity":{"$multiply":["$pending_purchase_quantity","$conversion_factor"]}}},{"$group":{"_id":"$item_id","open_base_quantity":{"$sum":"$pending_base_quantity"},"covering_orders":{"$push":{"purchase_order_id":"$purchase_order_id","order_number":"$order_number","status":"$status","ordered_purchase_quantity":"$ordered_purchase_quantity","received_purchase_quantity":"$received_purchase_quantity","pending_purchase_quantity":"$pending_purchase_quantity","conversion_factor":"$conversion_factor","pending_base_quantity":"$pending_base_quantity"}}}}]
        rows=await db.purchase_orders.aggregate(pipeline).to_list(100000)
        return {x["_id"]:{"open_base_quantity":round(float(x.get("open_base_quantity",0)),6),"open_order_ids":sorted({o.get("purchase_order_id") for o in x.get("covering_orders",[]) if o.get("purchase_order_id")}),"covering_orders":sorted([{**o,"ordered_purchase_quantity":round(float(o.get("ordered_purchase_quantity",0)),6),"received_purchase_quantity":round(float(o.get("received_purchase_quantity",0)),6),"pending_purchase_quantity":round(float(o.get("pending_purchase_quantity",0)),6),"conversion_factor":round(float(o.get("conversion_factor",1)),6),"pending_base_quantity":round(float(o.get("pending_base_quantity",0)),6)} for o in x.get("covering_orders",[])],key=lambda o:(str(o.get("order_number") or ""),str(o.get("purchase_order_id") or "")))} for x in rows}
    async def load_suggestions(org):
        items=await db.inventory.find({"organization_id":org,"active":{"$ne":False}},{"_id":0}).to_list(100000);low=[x for x in items if float(x.get("quantity",0))<=float(x.get("min_stock",0))]
        if not low:return []
        ids=[x["item_id"] for x in low];links=await db.supplier_products.find({"organization_id":org,"inventory_item_id":{"$in":ids},"active":True},{"_id":0}).to_list(100000);supplier_ids=sorted({x["supplier_id"] for x in links});suppliers=await db.suppliers.find({"organization_id":org,"supplier_id":{"$in":supplier_ids},"active":True},{"_id":0,"supplier_id":1,"business_name":1}).to_list(1000) if supplier_ids else [];supplier_map={x["supplier_id"]:x for x in suppliers};links_by_item={}
        for link in links:links_by_item.setdefault(link["inventory_item_id"],[]).append(link)
        opened=await open_quantities(org,ids);out=[]
        for item in low:
            link=_select_link(links_by_item.get(item["item_id"],[]),supplier_map);supplier=supplier_map.get(link.get("supplier_id")) if link else None;current=float(item.get("quantity",0));minimum=float(item.get("min_stock",0));target=_target_stock(minimum);od=opened.get(item["item_id"],{"open_base_quantity":0,"open_order_ids":[],"covering_orders":[]});open_base=float(od["open_base_quantity"]);required=round(max(target-current-open_base,0),6);factor=float((link or {}).get("conversion_factor",1) or 1);unit=(link or {}).get("purchase_unit") or item.get("unit");moq=float((link or {}).get("minimum_order_quantity",1) or 1);purchase=_purchase_quantity(required,factor,moq,unit)
            out.append({"item_id":item["item_id"],"sku":item.get("sku"),"name":item.get("name"),"unit":item.get("unit"),"quantity":current,"min_stock":minimum,"target_stock":target,"unit_cost":float(item.get("unit_cost",0)),"severity":_severity(current,minimum),"open_purchase_quantity":open_base,"open_base_quantity":open_base,"open_order_ids":od["open_order_ids"],"covering_orders":od.get("covering_orders",[]),"required_base_quantity":required,"suggested_quantity":purchase,"suggested_purchase_quantity":purchase,"suggested_base_quantity":round(purchase*factor,6),"purchase_unit":unit,"conversion_factor":factor,"minimum_order_quantity":moq,"covered_by_open_orders":required<=1e-6,"suggested_supplier_id":supplier.get("supplier_id") if supplier else None,"suggested_supplier_name":supplier.get("business_name") if supplier else None,"suggested_unit_cost":float((link or {}).get("last_unit_cost") or item.get("unit_cost",0))})
        out.sort(key=lambda r:(0 if r["severity"]=="critical" else 1,r["name"] or ""));return out
    @router.get("/inventory/reorder-alerts")
    async def list_alerts(organization_id:Optional[str]=None,authorization:Optional[str]=Header(None),session_token:Optional[str]=Cookie(None)):
        _,org=await ctx(authorization,session_token,organization_id);alerts=await load_suggestions(org);return {"organization_id":org,"total":len(alerts),"critical_count":sum(1 for x in alerts if x["severity"]=="critical"),"warning_count":sum(1 for x in alerts if x["severity"]=="warning"),"with_supplier":sum(1 for x in alerts if x["suggested_supplier_id"]),"covered_count":sum(1 for x in alerts if x["covered_by_open_orders"]),"items":alerts}
    @router.post("/inventory/reorder-alerts/generate-orders")
    async def generate_orders(data:GeneratePayload,authorization:Optional[str]=Header(None),session_token:Optional[str]=Cookie(None)):
        user,org=await ctx(authorization,session_token,data.organization_id);request_key=data.idempotency_key.strip();alerts=await load_suggestions(org)
        if data.item_ids:
            selected=set(data.item_ids);alerts=[x for x in alerts if x["item_id"] in selected]
            if not alerts:raise HTTPException(400,"Ninguna alerta seleccionada es válida")
        skipped=[];actionable=[]
        for a in alerts:
            if not a["suggested_supplier_id"]:skipped.append({"item_id":a["item_id"],"name":a["name"],"reason":"sin_proveedor_vinculado"})
            elif a["covered_by_open_orders"] or a["suggested_purchase_quantity"]<=0:skipped.append({"item_id":a["item_id"],"name":a["name"],"reason":"cubierto_por_orden_abierta","open_order_ids":a["open_order_ids"]})
            else:actionable.append(a)
        if not actionable:return {"created_orders":[],"created_count":0,"skipped":skipped,"skipped_count":len(skipped),"idempotent":False,"message":"Las alertas seleccionadas no requieren una orden adicional"}
        groups={}
        for a in actionable:groups.setdefault(a["suggested_supplier_id"],[]).append(a)
        created_docs=[];created_audits=[];results=[]
        try:
            for supplier_id,items in sorted(groups.items()):
                supplier=await db.suppliers.find_one({"organization_id":org,"supplier_id":supplier_id,"active":True},{"_id":0})
                if not supplier:continue
                lines=[]
                for a in items:
                    q=a["suggested_purchase_quantity"];cost=a["suggested_unit_cost"];gross=round(q*cost+1e-9,2);lines.append({"line_id":f"pol_{uuid.uuid4().hex[:12]}","inventory_item_id":a["item_id"],"item_name_snapshot":a["name"],"sku_snapshot":a.get("sku"),"quantity":q,"purchase_unit":a["purchase_unit"],"conversion_factor":a["conversion_factor"],"unit_cost":cost,"discount_percent":0,"discount_amount":0,"tax_percent":0,"tax_amount":0,"subtotal":gross,"total":gross,"received_quantity":0})
                generation_key,fingerprint=_fingerprint(org,user.user_id,request_key,supplier_id,lines);existing=await db.purchase_orders.find_one({"organization_id":org,"generation_key":generation_key,"supplier_id":supplier_id},{"_id":0})
                if existing:results.append({"purchase_order_id":existing["purchase_order_id"],"order_number":existing["order_number"],"supplier_id":supplier_id,"supplier_name":existing.get("supplier_name_snapshot"),"item_count":len(existing.get("lines",[])),"total":existing.get("total",0),"idempotent":True});continue
                now=datetime.now(timezone.utc).isoformat();pid=f"po_{uuid.uuid4().hex[:16]}";subtotal=round(sum(x["subtotal"] for x in lines)+1e-9,2);doc={"purchase_order_id":pid,"organization_id":org,"order_number":await _po_number(db,org),"supplier_id":supplier_id,"supplier_name_snapshot":supplier["business_name"],"expected_delivery_date":None,"external_reference":None,"notes":"Generada automáticamente desde alertas de reorden","lines":lines,"subtotal":subtotal,"discount_total":0,"tax_total":0,"total":subtotal,"currency":"COP","status":"draft","auto_generated":True,"auto_generation_source":"reorder_alerts","generation_key":generation_key,"generation_fingerprint":fingerprint,"generation_request_key":request_key,"created_by":user.user_id,"created_at":now,"updated_by":user.user_id,"updated_at":now}
                try:await db.purchase_orders.insert_one(doc.copy())
                except DuplicateKeyError:
                    existing=await db.purchase_orders.find_one({"organization_id":org,"generation_key":generation_key,"supplier_id":supplier_id},{"_id":0})
                    if existing:results.append({"purchase_order_id":existing["purchase_order_id"],"order_number":existing["order_number"],"supplier_id":supplier_id,"supplier_name":existing.get("supplier_name_snapshot"),"item_count":len(existing.get("lines",[])),"total":existing.get("total",0),"idempotent":True});continue
                    raise
                created_docs.append(pid);audit_id=f"audit_{uuid.uuid4().hex[:12]}"
                try:await db.audit_events.insert_one({"audit_id":audit_id,"organization_id":org,"event_type":"purchase_order_auto_generated","entity_type":"purchase_order","entity_id":pid,"actor_user_id":user.user_id,"previous_value":None,"new_value":{"source":"reorder_alerts","item_count":len(lines),"generation_fingerprint":fingerprint},"reason":None,"created_at":now});created_audits.append(audit_id)
                except Exception:await db.purchase_orders.delete_one({"organization_id":org,"purchase_order_id":pid,"generation_key":generation_key});created_docs.remove(pid);raise
                results.append({"purchase_order_id":pid,"order_number":doc["order_number"],"supplier_id":supplier_id,"supplier_name":supplier["business_name"],"item_count":len(lines),"total":subtotal,"idempotent":False})
        except Exception:
            if created_audits:await db.audit_events.delete_many({"audit_id":{"$in":created_audits}})
            if created_docs:await db.purchase_orders.delete_many({"organization_id":org,"purchase_order_id":{"$in":created_docs},"auto_generation_source":"reorder_alerts"})
            raise HTTPException(409,"No fue posible completar la generación de órdenes")
        created_count=sum(1 for x in results if not x.get("idempotent"));return {"created_orders":results,"created_count":created_count,"skipped":skipped,"skipped_count":len(skipped),"idempotent":bool(results) and created_count==0,"message":f"Se crearon {created_count} órdenes de compra en borrador"}
    return router
