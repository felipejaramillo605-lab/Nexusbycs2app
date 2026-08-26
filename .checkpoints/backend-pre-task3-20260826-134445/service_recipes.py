# NEXUS_SERVICE_RECIPES_5B_PACKAGE_1_V1
from fastapi import APIRouter, Header, Cookie, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List, Literal
from datetime import datetime, timezone
import uuid

class RecipeLineInput(BaseModel):
    inventory_item_id: str
    quantity_per_service: float = Field(gt=0)

class RecipeSave(BaseModel):
    organization_id: Optional[str] = None
    lines: List[RecipeLineInput] = Field(default_factory=list)
    notes: Optional[str] = None

class InventoryPolicyUpdate(BaseModel):
    organization_id: Optional[str] = None
    policy: Literal['WARNING','STRICT']


def build_service_recipes_router(db,get_current_user,require_management_role,resolve_team_organization):
    router=APIRouter()
    async def org(user,requested):
        require_management_role(user);return await resolve_team_organization(user,requested)
    async def service_for(user,service_id,requested=None):
        oid=await org(user,requested);service=await db.services.find_one({'organization_id':oid,'service_id':service_id},{'_id':0})
        if not service:raise HTTPException(404,'Service not found')
        return oid,service
    async def enrich(oid,lines):
        if len(lines)>100:raise HTTPException(400,'A recipe supports up to 100 ingredients')
        ids=[x.inventory_item_id for x in lines]
        if len(ids)!=len(set(ids)):raise HTTPException(400,'Inventory items cannot be duplicated in a recipe')
        items=await db.inventory.find({'organization_id':oid,'item_id':{'$in':ids}},{'_id':0}).to_list(1000) if ids else []
        by_id={x['item_id']:x for x in items};result=[]
        for line in lines:
            item=by_id.get(line.inventory_item_id)
            if not item:raise HTTPException(404,f'Inventory item not found: {line.inventory_item_id}')
            if item.get('active') is False:raise HTTPException(409,f'Archived inventory item cannot be used: {item.get("sku") or item["item_id"]}')
            quantity=round(float(line.quantity_per_service),4);cost=round(float(item.get('unit_cost',0)),2)
            result.append({'inventory_item_id':item['item_id'],'sku_snapshot':item.get('sku'),'item_name_snapshot':item.get('name'),'unit_snapshot':item.get('unit'),'quantity_per_service':quantity,'unit_cost_snapshot':cost,'estimated_line_cost':round(quantity*cost,2)})
        return result

    @router.get('/service-recipes/policy')
    async def get_policy(organization_id:Optional[str]=None,authorization:Optional[str]=Header(None),session_token:Optional[str]=Cookie(None)):
        user=await get_current_user(authorization,session_token);oid=await org(user,organization_id);row=await db.inventory_checkout_policies.find_one({'organization_id':oid},{'_id':0})
        return row or {'organization_id':oid,'policy':'WARNING','is_default':True}

    @router.put('/service-recipes/policy')
    async def put_policy(data:InventoryPolicyUpdate,authorization:Optional[str]=Header(None),session_token:Optional[str]=Cookie(None)):
        user=await get_current_user(authorization,session_token);oid=await org(user,data.organization_id);previous=await db.inventory_checkout_policies.find_one({'organization_id':oid},{'_id':0});now=datetime.now(timezone.utc).isoformat();row={'organization_id':oid,'policy':data.policy,'updated_by':user.user_id,'updated_at':now}
        await db.inventory_checkout_policies.update_one({'organization_id':oid},{'$set':row,'$setOnInsert':{'created_at':now}},upsert=True)
        await db.audit_events.insert_one({'audit_id':f'audit_{uuid.uuid4().hex[:12]}','organization_id':oid,'event_type':'inventory_checkout_policy_updated','entity_type':'inventory_policy','entity_id':oid,'actor_user_id':user.user_id,'previous_value':previous or {'policy':'WARNING','is_default':True},'new_value':row,'created_at':now})
        return {**row,'is_default':False}

    @router.get('/service-recipes/{service_id}')
    async def get_recipe(service_id:str,organization_id:Optional[str]=None,authorization:Optional[str]=Header(None),session_token:Optional[str]=Cookie(None)):
        user=await get_current_user(authorization,session_token);oid,service=await service_for(user,service_id,organization_id);row=await db.service_inventory_recipes.find_one({'organization_id':oid,'service_id':service_id,'active':True},{'_id':0});policy=await db.inventory_checkout_policies.find_one({'organization_id':oid},{'_id':0})
        return row or {'organization_id':oid,'service_id':service_id,'service_name_snapshot':service.get('name'),'version':0,'active':False,'lines':[],'estimated_material_cost':0,'policy':(policy or {}).get('policy','WARNING')}

    @router.get('/service-recipes/{service_id}/versions')
    async def versions(service_id:str,organization_id:Optional[str]=None,authorization:Optional[str]=Header(None),session_token:Optional[str]=Cookie(None)):
        user=await get_current_user(authorization,session_token);oid,_=await service_for(user,service_id,organization_id);return await db.service_inventory_recipe_versions.find({'organization_id':oid,'service_id':service_id},{'_id':0}).sort('version',-1).to_list(1000)

    @router.put('/service-recipes/{service_id}')
    async def save_recipe(service_id:str,data:RecipeSave,authorization:Optional[str]=Header(None),session_token:Optional[str]=Cookie(None)):
        user=await get_current_user(authorization,session_token);oid,service=await service_for(user,service_id,data.organization_id);lines=await enrich(oid,data.lines);previous=await db.service_inventory_recipes.find_one({'organization_id':oid,'service_id':service_id,'active':True},{'_id':0});version=int((previous or {}).get('version',0))+1;now=datetime.now(timezone.utc).isoformat();recipe_id=f'recipe_{uuid.uuid4().hex[:16]}';row={'recipe_id':recipe_id,'organization_id':oid,'service_id':service_id,'service_name_snapshot':service.get('name'),'service_price_snapshot':float(service.get('price',0)),'version':version,'active':True,'lines':lines,'ingredient_count':len(lines),'estimated_material_cost':round(sum(x['estimated_line_cost'] for x in lines),2),'notes':(data.notes or '').strip()[:500] or None,'created_by':user.user_id,'created_at':now,'updated_by':user.user_id,'updated_at':now}
        if previous:
            await db.service_inventory_recipes.update_one({'recipe_id':previous['recipe_id'],'active':True},{'$set':{'active':False,'archived_at':now,'archived_by':user.user_id}})
            await db.service_inventory_recipe_versions.insert_one({**previous,'active':False,'archived_at':now,'archived_by':user.user_id})
        try:await db.service_inventory_recipes.insert_one(row.copy())
        except Exception:
            if previous:await db.service_inventory_recipes.update_one({'recipe_id':previous['recipe_id']},{'$set':{'active':True},'$unset':{'archived_at':'','archived_by':''}})
            raise
        await db.audit_events.insert_one({'audit_id':f'audit_{uuid.uuid4().hex[:12]}','organization_id':oid,'event_type':'service_inventory_recipe_version_created','entity_type':'service_recipe','entity_id':recipe_id,'actor_user_id':user.user_id,'previous_value':previous,'new_value':row,'created_at':now})
        return row
    return router

async def ensure_service_recipe_indexes(db):
    await db.service_inventory_recipes.create_index([('organization_id',1),('service_id',1),('active',1)],unique=True,partialFilterExpression={'active':True},name='nexus_service_recipe_active_unique')
    await db.service_inventory_recipes.create_index([('organization_id',1),('recipe_id',1)],unique=True,name='nexus_service_recipe_id_unique')
    await db.service_inventory_recipe_versions.create_index([('organization_id',1),('service_id',1),('version',-1)],unique=True,name='nexus_service_recipe_version_unique')
    await db.service_inventory_recipe_versions.create_index([('organization_id',1),('lines.inventory_item_id',1)],name='nexus_service_recipe_inventory_item')
    await db.inventory_checkout_policies.create_index('organization_id',unique=True,name='nexus_inventory_checkout_policy_org_unique')
