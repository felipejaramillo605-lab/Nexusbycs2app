# NEXUS_CHECKOUT_INVENTORY_5B_PACKAGE_2_V1
from fastapi import HTTPException
from datetime import datetime, timezone
import uuid

async def prepare_checkout_inventory(db, organization_id, service_id, appointment_id):
    recipe=await db.service_inventory_recipes.find_one({'organization_id':organization_id,'service_id':service_id,'active':True},{'_id':0})
    policy_row=await db.inventory_checkout_policies.find_one({'organization_id':organization_id},{'_id':0})
    policy=(policy_row or {}).get('policy','WARNING')
    if not recipe or not recipe.get('lines'):
        return {'policy':policy,'recipe':None,'lines':[],'shortages':[],'material_cost_expected':0.0,'material_cost_consumed':0.0,'status':'not_configured'}
    ids=[x['inventory_item_id'] for x in recipe['lines']]
    items=await db.inventory.find({'organization_id':organization_id,'item_id':{'$in':ids}},{'_id':0}).to_list(1000)
    by_id={x['item_id']:x for x in items};lines=[];shortages=[]
    for source in recipe['lines']:
        item=by_id.get(source['inventory_item_id']);required=round(float(source.get('quantity_per_service',0)),4)
        available=max(0.0,round(float((item or {}).get('quantity',0)),4));consume=min(required,available);short=round(required-consume,4);cost=round(float(source.get('unit_cost_snapshot',(item or {}).get('unit_cost',0)) or 0),2)
        row={'inventory_item_id':source['inventory_item_id'],'sku_snapshot':source.get('sku_snapshot') or (item or {}).get('sku'),'item_name_snapshot':source.get('item_name_snapshot') or (item or {}).get('name'),'unit_snapshot':source.get('unit_snapshot') or (item or {}).get('unit'),'required_quantity':required,'available_quantity':available,'consume_quantity':consume,'shortage_quantity':short,'unit_cost_snapshot':cost,'expected_cost':round(required*cost,2),'consumed_cost':round(consume*cost,2)}
        lines.append(row)
        if short>0:shortages.append(row)
    if policy=='STRICT' and shortages:
        raise HTTPException(status_code=409,detail={'code':'inventory_shortage','policy':'STRICT','message':'Inventario insuficiente para completar el checkout','shortages':shortages})
    return {'policy':policy,'recipe':recipe,'lines':lines,'shortages':shortages,'material_cost_expected':round(sum(x['expected_cost'] for x in lines),2),'material_cost_consumed':round(sum(x['consumed_cost'] for x in lines),2),'status':'warning' if shortages else 'consumed'}

async def reserve_checkout_inventory(db, plan, organization_id):
    reserved=[]
    try:
        for line in plan['lines']:
            qty=line['consume_quantity']
            if qty<=0:continue
            result=await db.inventory.update_one({'organization_id':organization_id,'item_id':line['inventory_item_id'],'active':{'$ne':False},'quantity':{'$gte':qty}},{'$inc':{'quantity':-qty},'$set':{'updated_at':datetime.now(timezone.utc).isoformat()}})
            if result.modified_count!=1:raise HTTPException(status_code=409,detail={'code':'inventory_changed','message':'El inventario cambió durante el checkout; intenta nuevamente','inventory_item_id':line['inventory_item_id']})
            reserved.append(line)
        return reserved
    except Exception:
        await release_checkout_inventory(db,reserved,organization_id)
        raise

async def release_checkout_inventory(db, reserved, organization_id):
    for line in reversed(reserved):
        await db.inventory.update_one({'organization_id':organization_id,'item_id':line['inventory_item_id']},{'$inc':{'quantity':line['consume_quantity']},'$set':{'updated_at':datetime.now(timezone.utc).isoformat()}})

async def finalize_checkout_inventory(db, plan, reserved, organization_id, appointment_id, transaction_id, service_id, actor_user_id):
    now=datetime.now(timezone.utc).isoformat();recipe=plan.get('recipe') or {};docs=[]
    for line in reserved:
        item=await db.inventory.find_one({'organization_id':organization_id,'item_id':line['inventory_item_id']},{'_id':0}) or {}
        new_stock=round(float(item.get('quantity',0)),4);previous=round(new_stock+line['consume_quantity'],4)
        docs.append({'movement_id':f'mov_{uuid.uuid4().hex[:16]}','organization_id':organization_id,'inventory_item_id':line['inventory_item_id'],'item_name_snapshot':line.get('item_name_snapshot'),'movement_type':'service_consumption','direction':'out','quantity':line['consume_quantity'],'unit_cost':line['unit_cost_snapshot'],'total_cost':line['consumed_cost'],'previous_stock':previous,'new_stock':new_stock,'reference_type':'appointment_checkout','reference_id':transaction_id,'appointment_id':appointment_id,'transaction_id':transaction_id,'service_id':service_id,'recipe_id':recipe.get('recipe_id'),'recipe_version':recipe.get('version'),'idempotency_key':f'checkout:{transaction_id}:{line["inventory_item_id"]}','created_by':actor_user_id,'created_at':now,'notes':'Consumo automático por servicio'})
    if docs:await db.inventory_movements.insert_many(docs)
    shortage_docs=[]
    for line in plan['shortages']:
        shortage_docs.append({'shortage_id':f'short_{uuid.uuid4().hex[:16]}','organization_id':organization_id,'appointment_id':appointment_id,'transaction_id':transaction_id,'service_id':service_id,'recipe_id':recipe.get('recipe_id'),'recipe_version':recipe.get('version'),'inventory_item_id':line['inventory_item_id'],'sku_snapshot':line.get('sku_snapshot'),'item_name_snapshot':line.get('item_name_snapshot'),'unit_snapshot':line.get('unit_snapshot'),'required_quantity':line['required_quantity'],'available_quantity':line['available_quantity'],'consumed_quantity':line['consume_quantity'],'shortage_quantity':line['shortage_quantity'],'unit_cost_snapshot':line['unit_cost_snapshot'],'shortage_cost':round(line['shortage_quantity']*line['unit_cost_snapshot'],2),'policy_snapshot':plan['policy'],'status':'open','created_by':actor_user_id,'created_at':now})
    if shortage_docs:await db.inventory_shortages.insert_many(shortage_docs)
    return docs,shortage_docs

async def rollback_checkout_inventory(db, reserved, organization_id, transaction_id):
    await release_checkout_inventory(db,reserved,organization_id)
    await db.inventory_movements.delete_many({'organization_id':organization_id,'transaction_id':transaction_id,'movement_type':'service_consumption'})
    await db.inventory_shortages.delete_many({'organization_id':organization_id,'transaction_id':transaction_id})

async def ensure_checkout_inventory_indexes(db):
    await db.inventory_shortages.create_index([('organization_id',1),('status',1),('created_at',-1)],name='nexus_inventory_shortages_org_status')
    await db.inventory_shortages.create_index([('organization_id',1),('transaction_id',1),('inventory_item_id',1)],unique=True,name='nexus_inventory_shortages_transaction_item_unique')
    await db.inventory_movements.create_index([('organization_id',1),('transaction_id',1),('inventory_item_id',1),('movement_type',1)],unique=True,partialFilterExpression={'movement_type':{'$in':['service_consumption','service_consumption_reversal']}},name='nexus_checkout_inventory_movement_unique')
