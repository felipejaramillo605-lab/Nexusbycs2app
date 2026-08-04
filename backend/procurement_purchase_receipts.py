# NEXUS_PURCHASE_RECEIPTS_5C3_V1
from fastapi import APIRouter,HTTPException,Header,Cookie
from pydantic import BaseModel,Field
from typing import Optional,List
from datetime import datetime,timezone
from pymongo.errors import DuplicateKeyError
import uuid

class ReceiptLine(BaseModel):
 line_id:str
 quantity:float=Field(gt=0)
 unit_cost:Optional[float]=Field(default=None,ge=0)
 lot_number:Optional[str]=None
 expiry_date:Optional[str]=None
class ReceiptPayload(BaseModel):
 idempotency_key:str=Field(min_length=8,max_length=120)
 received_at:Optional[str]=None
 supplier_document:Optional[str]=None
 notes:Optional[str]=None
 lines:List[ReceiptLine]

def clean(value,limit):return (value or '').strip()[:limit] or None
def qty(value):return round(float(value)+1e-9,6)
async def ensure_purchase_receipt_indexes(db):
 await db.purchase_receipts.create_index([('organization_id',1),('receipt_id',1)],unique=True,name='nexus_purchase_receipt_identity_unique')
 await db.purchase_receipts.create_index([('organization_id',1),('idempotency_key',1)],unique=True,name='nexus_purchase_receipt_idempotency_unique')
 await db.purchase_receipts.create_index([('organization_id',1),('purchase_order_id',1),('created_at',-1)],name='nexus_purchase_receipt_history')
 await db.inventory_movements.create_index([('organization_id',1),('reference_type',1),('reference_id',1),('item_id',1)],unique=True,name='nexus_purchase_receipt_movement_unique',partialFilterExpression={'reference_type':'purchase_receipt'})

async def receive_purchase_order(db,org,pid,payload,user_id):
 key=payload.idempotency_key.strip()
 existing=await db.purchase_receipts.find_one({'organization_id':org,'idempotency_key':key},{'_id':0})
 if existing:return existing
 order=await db.purchase_orders.find_one({'organization_id':org,'purchase_order_id':pid},{'_id':0})
 if not order:raise HTTPException(404,'Orden de compra no encontrada')
 if order.get('status') not in {'approved','partially_received'}:raise HTTPException(409,'La orden no está disponible para recepción')
 if not payload.lines:raise HTTPException(400,'Incluye al menos una línea para recibir')
 requested={x.line_id:x for x in payload.lines}
 if len(requested)!=len(payload.lines):raise HTTPException(400,'No se permiten líneas repetidas')
 order_lines={x['line_id']:x for x in order.get('lines',[])}
 if any(x not in order_lines for x in requested):raise HTTPException(404,'Una o más líneas no pertenecen a la orden')
 receipt_id=f'rcv_{uuid.uuid4().hex[:16]}';now=datetime.now(timezone.utc).isoformat();received_at=clean(payload.received_at,40) or now;receipt_lines=[]
 for line_id,input_line in requested.items():
  line=order_lines[line_id];pending=qty(float(line['quantity'])-float(line.get('received_quantity',0)))
  if input_line.quantity>pending+1e-6:raise HTTPException(409,f'Cantidad superior a la pendiente para {line.get("item_name_snapshot",line_id)}')
  factor=qty(line.get('conversion_factor',1));base_qty=qty(input_line.quantity*factor);cost=float(input_line.unit_cost if input_line.unit_cost is not None else line.get('unit_cost',0))
  item=await db.inventory.find_one({'organization_id':org,'item_id':line['inventory_item_id'],'active':{'$ne':False}},{'_id':0})
  if not item:raise HTTPException(409,'Producto de inventario no disponible')
  receipt_lines.append({'line_id':line_id,'inventory_item_id':line['inventory_item_id'],'item_name_snapshot':line.get('item_name_snapshot'),'received_quantity':qty(input_line.quantity),'purchase_unit':line.get('purchase_unit'),'conversion_factor':factor,'base_quantity':base_qty,'unit_cost':round(cost,2),'total_cost':round(input_line.quantity*cost,2),'lot_number':clean(input_line.lot_number,120),'expiry_date':clean(input_line.expiry_date,40)})
 receipt={'receipt_id':receipt_id,'organization_id':org,'purchase_order_id':pid,'order_number_snapshot':order.get('order_number'),'supplier_id':order.get('supplier_id'),'supplier_name_snapshot':order.get('supplier_name_snapshot'),'idempotency_key':key,'received_at':received_at,'supplier_document':clean(payload.supplier_document,120),'notes':clean(payload.notes,1000),'lines':receipt_lines,'status':'processing','created_by':user_id,'created_at':now}
 try:await db.purchase_receipts.insert_one(receipt.copy())
 except DuplicateKeyError:
  saved=await db.purchase_receipts.find_one({'organization_id':org,'idempotency_key':key},{'_id':0});return saved
 applied=[]
 try:
  for rline in receipt_lines:
   before=await db.inventory.find_one({'organization_id':org,'item_id':rline['inventory_item_id']},{'_id':0,'quantity':1})
   result=await db.inventory.update_one({'organization_id':org,'item_id':rline['inventory_item_id'],'active':{'$ne':False}},{'$inc':{'quantity':rline['base_quantity']},'$set':{'unit_cost':rline['unit_cost'],'updated_at':now}})
   if result.modified_count!=1:raise RuntimeError('No se pudo incrementar inventario')
   after_qty=qty(float(before.get('quantity',0))+rline['base_quantity']);movement={'movement_id':f'mov_{uuid.uuid4().hex[:16]}','organization_id':org,'item_id':rline['inventory_item_id'],'movement_type':'purchase_receipt','quantity':rline['base_quantity'],'unit_cost':rline['unit_cost'],'previous_quantity':before.get('quantity',0),'new_quantity':after_qty,'reference_type':'purchase_receipt','reference_id':receipt_id,'purchase_order_id':pid,'supplier_id':order.get('supplier_id'),'supplier_document':receipt['supplier_document'],'lot_number':rline['lot_number'],'expiry_date':rline['expiry_date'],'notes':receipt['notes'],'created_by':user_id,'created_at':now}
   await db.inventory_movements.insert_one(movement);applied.append(rline)
  increments={x['line_id']:x['received_quantity'] for x in receipt_lines};new_lines=[]
  for line in order['lines']:
   row=dict(line);row['received_quantity']=qty(float(row.get('received_quantity',0))+increments.get(row['line_id'],0));new_lines.append(row)
  completed=all(float(x.get('received_quantity',0))+1e-6>=float(x['quantity']) for x in new_lines);new_status='received' if completed else 'partially_received'
  result=await db.purchase_orders.update_one({'organization_id':org,'purchase_order_id':pid,'status':order['status']},{'$set':{'lines':new_lines,'status':new_status,'updated_by':user_id,'updated_at':now},'$push':{'receipt_ids':receipt_id}})
  if result.modified_count!=1:raise RuntimeError('La orden cambió durante la recepción')
  await db.purchase_receipts.update_one({'organization_id':org,'receipt_id':receipt_id},{'$set':{'status':'completed','order_status_after':new_status,'completed_at':now}})
  await db.audit_events.insert_one({'audit_id':f'audit_{uuid.uuid4().hex[:12]}','organization_id':org,'event_type':'purchase_order_received','entity_type':'purchase_order','entity_id':pid,'actor_user_id':user_id,'previous_value':{'status':order['status']},'new_value':{'status':new_status,'receipt_id':receipt_id,'lines':receipt_lines},'created_at':now})
  return await db.purchase_receipts.find_one({'organization_id':org,'receipt_id':receipt_id},{'_id':0})
 except Exception as exc:
  for rline in reversed(applied):
   await db.inventory.update_one({'organization_id':org,'item_id':rline['inventory_item_id']},{'$inc':{'quantity':-rline['base_quantity']}})
  await db.inventory_movements.delete_many({'organization_id':org,'reference_type':'purchase_receipt','reference_id':receipt_id})
  await db.purchase_receipts.update_one({'organization_id':org,'receipt_id':receipt_id},{'$set':{'status':'failed','failure_reason':str(exc)[:300],'failed_at':datetime.now(timezone.utc).isoformat()}})
  if isinstance(exc,HTTPException):raise
  raise HTTPException(409,str(exc))

def build_purchase_receipt_router(db,get_current_user,require_management_role,resolve_team_organization):
 r=APIRouter()
 async def ctx(a,t,org=None):
  user=await get_current_user(a,t);require_management_role(user);return user,await resolve_team_organization(user,org)
 @r.post('/purchase-orders/{pid}/receipts')
 async def receive(pid:str,payload:ReceiptPayload,organization_id:Optional[str]=None,authorization:Optional[str]=Header(None),session_token:Optional[str]=Cookie(None)):
  user,org=await ctx(authorization,session_token,organization_id);return await receive_purchase_order(db,org,pid,payload,user.user_id)
 @r.get('/purchase-orders/{pid}/receipts')
 async def history(pid:str,organization_id:Optional[str]=None,authorization:Optional[str]=Header(None),session_token:Optional[str]=Cookie(None)):
  user,org=await ctx(authorization,session_token,organization_id)
  if not await db.purchase_orders.find_one({'organization_id':org,'purchase_order_id':pid},{'_id':1}):raise HTTPException(404,'Orden de compra no encontrada')
  return await db.purchase_receipts.find({'organization_id':org,'purchase_order_id':pid,'status':'completed'},{'_id':0}).sort('created_at',-1).to_list(500)
 return r
