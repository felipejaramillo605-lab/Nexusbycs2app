# NEXUS_TRANSACTION_VOID_REVERSAL_5B_PACKAGE_3_V1
from fastapi import APIRouter, HTTPException, Header, Cookie
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import uuid
from pymongo.errors import DuplicateKeyError

# NEXUS_TRANSACTION_VOID_POLICY_5B4_HOTFIX_V2
def void_conflict(code, message, **extra):
    return HTTPException(status_code=409, detail={'code': code, 'message': message, **extra})

class TransactionVoidRequest(BaseModel):
    reason: str
    notes: Optional[str] = None

async def ensure_transaction_void_indexes(db):
    await db.inventory_movements.create_index([('organization_id',1),('transaction_id',1),('inventory_item_id',1),('movement_type',1)],unique=True,partialFilterExpression={'movement_type':{'$in':['service_consumption','service_consumption_reversal']}},name='nexus_checkout_inventory_movement_unique')
    await db.audit_events.create_index([('organization_id',1),('entity_type',1),('entity_id',1),('created_at',-1)],name='nexus_audit_entity_history')
    await db.transaction_void_locks.create_index([('organization_id',1),('transaction_id',1)],unique=True,name='nexus_transaction_void_once_unique')
    await db.audit_events.create_index([('organization_id',1),('event_type',1),('entity_type',1),('entity_id',1)],unique=True,partialFilterExpression={'event_type':'transaction_voided','entity_type':'transaction'},name='nexus_transaction_void_audit_unique')

def build_transaction_void_router(db,get_current_user,require_management_role,validate_organization_access):
    router=APIRouter()

    # Replace the placeholder route with an endpoint whose dependency defaults are constructed here.
    router.routes.clear()
    @router.post('/transactions/{transaction_id}/void')
    async def void_transaction(transaction_id:str,data:TransactionVoidRequest,authorization:Optional[str]=Header(None),session_token:Optional[str]=Cookie(None)):
        user=await get_current_user(authorization,session_token);require_management_role(user)
        reason=(data.reason or '').strip()
        if len(reason)<5:raise HTTPException(status_code=400,detail='A void reason of at least 5 characters is required')
        tx=await db.transactions.find_one({'transaction_id':transaction_id},{'_id':0})
        if not tx:raise HTTPException(status_code=404,detail='Transaction not found')
        if not await validate_organization_access(user,tx['organization_id']):raise HTTPException(status_code=403,detail='Access denied')
        if tx.get('status')=='voided':raise void_conflict('transaction_already_voided','La transacción ya fue anulada',voided_at=tx.get('voided_at'),voided_by=tx.get('voided_by'))
        if tx.get('status')!='confirmed':raise void_conflict('transaction_not_voidable','Solo se pueden anular transacciones confirmadas',status=tx.get('status'))
        settlement_id=tx.get('settlement_id')
        if settlement_id:
            settlement=await db.staff_settlements.find_one({'settlement_id':settlement_id},{'_id':0})
            settlement_status=(settlement or {}).get('status') or tx.get('settlement_status')
            if settlement_status in {'draft','approved','paid'}:
                raise HTTPException(status_code=409,detail={'code':'transaction_in_settlement','message':'Cancel the settlement before voiding this transaction','settlement_id':settlement_id,'settlement_status':settlement_status})
        org=tx['organization_id'];now=datetime.now(timezone.utc).isoformat();void_operation_id=f'void_{uuid.uuid4().hex}'
        try:
            await db.transaction_void_locks.insert_one({'organization_id':org,'transaction_id':transaction_id,'void_operation_id':void_operation_id,'status':'processing','actor_user_id':user.user_id,'reason':reason,'created_at':now})
        except DuplicateKeyError:
            current=await db.transactions.find_one({'transaction_id':transaction_id},{'_id':0}) or {}
            if current.get('status')=='voided':raise void_conflict('transaction_already_voided','La transacción ya fue anulada',voided_at=current.get('voided_at'),voided_by=current.get('voided_by'))
            raise void_conflict('transaction_void_in_progress','La anulación de esta transacción ya está en proceso')
        movements=await db.inventory_movements.find({'organization_id':org,'transaction_id':transaction_id,'movement_type':'service_consumption'},{'_id':0}).to_list(1000)
        restored=[];reversal_ids=[]
        try:
            for movement in movements:
                item_id=movement['inventory_item_id'];qty=round(float(movement.get('quantity',0) or 0),4)
                if qty<=0:continue
                existing=await db.inventory_movements.find_one({'organization_id':org,'transaction_id':transaction_id,'inventory_item_id':item_id,'movement_type':'service_consumption_reversal'},{'_id':0})
                if existing:raise HTTPException(status_code=409,detail='Inventory consumption has already been reversed')
                item=await db.inventory.find_one({'organization_id':org,'item_id':item_id},{'_id':0})
                if not item:raise HTTPException(status_code=409,detail=f'Inventory item unavailable for reversal: {item_id}')
                previous=round(float(item.get('quantity',0) or 0),4);new=round(previous+qty,4)
                result=await db.inventory.update_one({'organization_id':org,'item_id':item_id},{'$inc':{'quantity':qty},'$set':{'updated_at':now}})
                if result.modified_count!=1:raise HTTPException(status_code=409,detail='Inventory changed during reversal')
                restored.append((item_id,qty))
                reversal_id=f'mov_{uuid.uuid4().hex[:16]}';reversal_ids.append(reversal_id)
                await db.inventory_movements.insert_one({'movement_id':reversal_id,'organization_id':org,'inventory_item_id':item_id,'item_name_snapshot':movement.get('item_name_snapshot'),'movement_type':'service_consumption_reversal','direction':'in','quantity':qty,'unit_cost':movement.get('unit_cost',0),'total_cost':movement.get('total_cost',0),'previous_stock':previous,'new_stock':new,'reference_type':'transaction_void','reference_id':transaction_id,'appointment_id':tx.get('appointment_id'),'transaction_id':transaction_id,'service_id':tx.get('service_id'),'recipe_id':movement.get('recipe_id'),'recipe_version':movement.get('recipe_version'),'idempotency_key':f'void:{transaction_id}:{item_id}','created_by':user.user_id,'created_at':now,'notes':reason})
            result=await db.transactions.update_one({'transaction_id':transaction_id,'status':'confirmed'},{'$set':{'status':'voided','void_operation_id':void_operation_id,'void_reason':reason,'void_notes':(data.notes or '').strip()[:500] or None,'voided_by':user.user_id,'voided_at':now,'inventory_reversal_status':'reversed' if movements else 'not_applicable','inventory_reversal_count':len(reversal_ids)},'$unset':{'settlement_id':'','settlement_status':'','settled_at':''}})
            if result.modified_count!=1:raise HTTPException(status_code=409,detail='Transaction state changed during void')
            await db.inventory_movements.update_many({'organization_id':org,'transaction_id':transaction_id,'movement_type':'service_consumption'},{'$set':{'reversed':True,'reversed_at':now,'reversed_by':user.user_id}})
            await db.inventory_shortages.update_many({'organization_id':org,'transaction_id':transaction_id,'status':'open'},{'$set':{'status':'reversed','resolved_at':now,'resolved_by':user.user_id,'resolution_reason':'transaction_void'}})
            await db.appointments.update_one({'appointment_id':tx.get('appointment_id'),'transaction_id':transaction_id},{'$set':{'status':'confirmed','updated_at':now,'checkout_voided_at':now},'$unset':{'transaction_id':'','completed_at':''}})
            appointment=await db.appointments.find_one({'appointment_id':tx.get('appointment_id')},{'_id':0})
            if appointment and appointment.get('client_phone'):
                await db.clients.update_one({'organization_id':org,'phone':appointment['client_phone'],'total_visits':{'$gt':0}},{'$inc':{'total_visits':-1},'$set':{'updated_at':now}})
            try:
                await db.audit_events.insert_one({'audit_id':f'audit_{uuid.uuid4().hex[:12]}','organization_id':org,'event_type':'transaction_voided','entity_type':'transaction','entity_id':transaction_id,'actor_user_id':user.user_id,'previous_value':{'status':'confirmed'},'new_value':{'status':'voided','inventory_reversal_count':len(reversal_ids),'void_operation_id':void_operation_id},'reason':reason,'created_at':now})
            except DuplicateKeyError:
                pass
            await db.transaction_void_locks.update_one({'organization_id':org,'transaction_id':transaction_id,'void_operation_id':void_operation_id},{'$set':{'status':'completed','completed_at':now}})
        except Exception:
            for item_id,qty in reversed(restored):await db.inventory.update_one({'organization_id':org,'item_id':item_id},{'$inc':{'quantity':-qty},'$set':{'updated_at':now}})
            if reversal_ids:await db.inventory_movements.delete_many({'movement_id':{'$in':reversal_ids}})
            await db.transaction_void_locks.delete_one({'organization_id':org,'transaction_id':transaction_id,'void_operation_id':void_operation_id,'status':'processing'})
            raise
        updated=await db.transactions.find_one({'transaction_id':transaction_id},{'_id':0})
        return updated
    return router
