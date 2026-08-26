# NEXUS_PURCHASE_ORDERS_5C2_V1
from fastapi import APIRouter,HTTPException,Header,Cookie
from pydantic import BaseModel,Field
from typing import Optional,List
from datetime import datetime,timezone
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError
import uuid,re
from unit_catalog import validate_quantity_for_unit
STATES={'draft','submitted','approved','partially_received','received','cancelled'}
class PurchaseLine(BaseModel):
 inventory_item_id:str
 quantity:float=Field(gt=0)
 unit_cost:float=Field(ge=0)
 discount_percent:float=Field(default=0,ge=0,le=100)
 tax_percent:float=Field(default=0,ge=0,le=100)
 purchase_unit:Optional[str]=None
 conversion_factor:float=Field(default=1,gt=0)
class PurchaseOrderPayload(BaseModel):
 supplier_id:str
 expected_delivery_date:Optional[str]=None
 external_reference:Optional[str]=None
 notes:Optional[str]=None
 lines:List[PurchaseLine]
class CancelPayload(BaseModel): reason:str

def money(v):return round(float(v)+1e-9,2)
def clean(v,n=500):return (v or '').strip()[:n] or None
def serialize_line(line,item):
 gross=money(line.quantity*line.unit_cost);discount=money(gross*line.discount_percent/100);taxable=money(gross-discount);tax=money(taxable*line.tax_percent/100);total=money(taxable+tax)
 return {'line_id':f'pol_{uuid.uuid4().hex[:12]}','inventory_item_id':line.inventory_item_id,'item_name_snapshot':item.get('name'),'sku_snapshot':item.get('sku'),'quantity':line.quantity,'purchase_unit':clean(line.purchase_unit,60) or item.get('unit'),'conversion_factor':line.conversion_factor,'unit_cost':money(line.unit_cost),'discount_percent':line.discount_percent,'discount_amount':discount,'tax_percent':line.tax_percent,'tax_amount':tax,'subtotal':taxable,'total':total,'received_quantity':0}
async def ensure_purchase_order_indexes(db):
 await db.purchase_orders.create_index([('organization_id',1),('purchase_order_id',1)],unique=True,name='nexus_po_identity_unique')
 await db.purchase_orders.create_index([('organization_id',1),('order_number',1)],unique=True,name='nexus_po_number_unique')
 await db.purchase_orders.create_index([('organization_id',1),('status',1),('created_at',-1)],name='nexus_po_directory')
 await db.procurement_counters.create_index([('organization_id',1),('counter_type',1)],unique=True,name='nexus_procurement_counter_unique')
async def audit(db,org,event,po,user,old,new,reason=None):
 await db.audit_events.insert_one({'audit_id':f'audit_{uuid.uuid4().hex[:12]}','organization_id':org,'event_type':event,'entity_type':'purchase_order','entity_id':po,'actor_user_id':user,'previous_value':old,'new_value':new,'reason':reason,'created_at':datetime.now(timezone.utc).isoformat()})
async def number(db,org):
 row=await db.procurement_counters.find_one_and_update(
  {'organization_id':org,'counter_type':'purchase_order'},
  {
   '$inc':{'sequence':1},
   '$set':{'updated_at':datetime.now(timezone.utc).isoformat()},
   '$setOnInsert':{'created_at':datetime.now(timezone.utc).isoformat()},
  },
  upsert=True,
  return_document=ReturnDocument.AFTER,
 )
 return f'OC-{int(row["sequence"]):06d}'
def build_purchase_order_router(db,get_current_user,require_management_role,resolve_team_organization):
 r=APIRouter()
 async def ctx(a,t,org=None):
  u=await get_current_user(a,t);require_management_role(u);return u,await resolve_team_organization(u,org)
 async def compose(data,org):
  if not data.lines:raise HTTPException(400,'La orden debe incluir al menos un producto')
  supplier=await db.suppliers.find_one({'organization_id':org,'supplier_id':data.supplier_id,'active':True},{'_id':0})
  if not supplier:raise HTTPException(404,'Proveedor no encontrado o inactivo')
  ids=[x.inventory_item_id for x in data.lines]
  if len(ids)!=len(set(ids)):raise HTTPException(400,'No se permiten productos repetidos')
  docs=await db.inventory.find({'organization_id':org,'item_id':{'$in':ids},'active':{'$ne':False}},{'_id':0}).to_list(len(ids));lookup={x['item_id']:x for x in docs}
  if len(lookup)!=len(ids):raise HTTPException(404,'Uno o más productos de inventario no existen')
  # NEXUS_PO_UNIT_QUANTITY_VALIDATION_V1
  # quantity es float por diseño (litros, kilos, etc. son legítimamente
  # fraccionarios), pero para unidades discretas (unidades, cajas, pares,
  # paquetes, frascos) una cantidad como 1.3 no tiene sentido físico. Se
  # valida contra la unidad BASE real del producto de inventario (no contra
  # purchase_unit, que es texto libre opcional de la línea) porque es el
  # único dato confiable con el que ya contamos en este punto.
  for x in data.lines:
      try:
          validate_quantity_for_unit(x.quantity, lookup[x.inventory_item_id].get('unit'), 'La cantidad solicitada')
      except ValueError as e:
          raise HTTPException(400, str(e))
  lines=[serialize_line(x,lookup[x.inventory_item_id]) for x in data.lines]
  subtotal=money(sum(x['subtotal'] for x in lines));discount=money(sum(x['discount_amount'] for x in lines));tax=money(sum(x['tax_amount'] for x in lines));total=money(sum(x['total'] for x in lines))
  return supplier,lines,{'subtotal':subtotal,'discount_total':discount,'tax_total':tax,'total':total}
 @r.get('/purchase-orders')
 async def listing(organization_id:Optional[str]=None,status:Optional[str]=None,supplier_id:Optional[str]=None,search:Optional[str]=None,page:int=1,page_size:int=25,authorization:Optional[str]=Header(None),session_token:Optional[str]=Cookie(None)):
  u,org=await ctx(authorization,session_token,organization_id);q={'organization_id':org}
  if status:q['status']=status
  if supplier_id:q['supplier_id']=supplier_id
  if search:q['$or']=[{'order_number':{'$regex':re.escape(search),'$options':'i'}},{'supplier_name_snapshot':{'$regex':re.escape(search),'$options':'i'}},{'external_reference':{'$regex':re.escape(search),'$options':'i'}}]
  page=max(1,page);page_size=max(1,min(page_size,100));total=await db.purchase_orders.count_documents(q);items=await db.purchase_orders.find(q,{'_id':0}).sort([('created_at',-1),('purchase_order_id',-1)]).skip((page-1)*page_size).limit(page_size).to_list(page_size);pages=(total+page_size-1)//page_size
  return {'items':items,'page':page,'page_size':page_size,'total':total,'total_pages':pages,'has_next':page<pages,'has_previous':page>1}
 @r.post('/purchase-orders')
 async def create(data:PurchaseOrderPayload,organization_id:Optional[str]=None,authorization:Optional[str]=Header(None),session_token:Optional[str]=Cookie(None)):
  u,org=await ctx(authorization,session_token,organization_id);supplier,lines,totals=await compose(data,org);now=datetime.now(timezone.utc).isoformat();pid=f'po_{uuid.uuid4().hex[:16]}'
  doc={'purchase_order_id':pid,'organization_id':org,'order_number':await number(db,org),'supplier_id':supplier['supplier_id'],'supplier_name_snapshot':supplier['business_name'],'expected_delivery_date':clean(data.expected_delivery_date,30),'external_reference':clean(data.external_reference,120),'notes':clean(data.notes,1000),'lines':lines,**totals,'currency':'COP','status':'draft','created_by':u.user_id,'created_at':now,'updated_by':u.user_id,'updated_at':now}
  await db.purchase_orders.insert_one(doc.copy());await audit(db,org,'purchase_order_created',pid,u.user_id,None,doc);return doc
 @r.get('/purchase-orders/{pid}')
 async def detail(pid:str,authorization:Optional[str]=Header(None),session_token:Optional[str]=Cookie(None)):
  u,org=await ctx(authorization,session_token);doc=await db.purchase_orders.find_one({'organization_id':org,'purchase_order_id':pid},{'_id':0})
  if not doc:raise HTTPException(404,'Orden de compra no encontrada')
  return doc
 @r.put('/purchase-orders/{pid}')
 async def update(pid:str,data:PurchaseOrderPayload,authorization:Optional[str]=Header(None),session_token:Optional[str]=Cookie(None)):
  u,org=await ctx(authorization,session_token);old=await db.purchase_orders.find_one({'organization_id':org,'purchase_order_id':pid},{'_id':0})
  if not old:raise HTTPException(404,'Orden de compra no encontrada')
  if old['status']!='draft':raise HTTPException(409,'Sólo las órdenes en borrador pueden editarse')
  supplier,lines,totals=await compose(data,org);changes={'supplier_id':supplier['supplier_id'],'supplier_name_snapshot':supplier['business_name'],'expected_delivery_date':clean(data.expected_delivery_date,30),'external_reference':clean(data.external_reference,120),'notes':clean(data.notes,1000),'lines':lines,**totals,'updated_by':u.user_id,'updated_at':datetime.now(timezone.utc).isoformat()}
  res=await db.purchase_orders.update_one({'organization_id':org,'purchase_order_id':pid,'status':'draft'},{'$set':changes})
  if res.modified_count!=1:raise HTTPException(409,'La orden cambió durante la edición')
  new={**old,**changes};await audit(db,org,'purchase_order_updated',pid,u.user_id,old,new);return new
 async def transition(pid,target,event,u,org,reason=None):
  old=await db.purchase_orders.find_one({'organization_id':org,'purchase_order_id':pid},{'_id':0})
  if not old:raise HTTPException(404,'Orden de compra no encontrada')
  if old['status']==target:return old
  allowed={'submitted':{'draft'},'approved':{'submitted'},'cancelled':{'draft','submitted','approved'}}
  if old['status'] not in allowed[target]:raise HTTPException(409,f'Transición no permitida: {old["status"]} a {target}')
  now=datetime.now(timezone.utc).isoformat();changes={'status':target,'updated_by':u.user_id,'updated_at':now,f'{target}_by':u.user_id,f'{target}_at':now}
  if reason:changes['cancellation_reason']=reason
  res=await db.purchase_orders.update_one({'organization_id':org,'purchase_order_id':pid,'status':old['status']},{'$set':changes})
  if res.modified_count!=1:raise HTTPException(409,'La orden cambió durante la transición')
  new={**old,**changes};await audit(db,org,event,pid,u.user_id,old,new,reason);return new
 @r.post('/purchase-orders/{pid}/submit')
 async def submit(pid:str,authorization:Optional[str]=Header(None),session_token:Optional[str]=Cookie(None)):
  u,org=await ctx(authorization,session_token);return await transition(pid,'submitted','purchase_order_submitted',u,org)
 @r.post('/purchase-orders/{pid}/approve')
 async def approve(pid:str,authorization:Optional[str]=Header(None),session_token:Optional[str]=Cookie(None)):
  u,org=await ctx(authorization,session_token);return await transition(pid,'approved','purchase_order_approved',u,org)
 @r.post('/purchase-orders/{pid}/cancel')
 async def cancel(pid:str,data:CancelPayload,authorization:Optional[str]=Header(None),session_token:Optional[str]=Cookie(None)):
  u,org=await ctx(authorization,session_token);reason=data.reason.strip()
  if len(reason)<5:raise HTTPException(400,'El motivo debe tener al menos 5 caracteres')
  return await transition(pid,'cancelled','purchase_order_cancelled',u,org,reason[:500])
 return r
