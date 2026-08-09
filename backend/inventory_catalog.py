# NEXUS_INVENTORY_CATALOG_5A_PACKAGE_3_V1
from fastapi import APIRouter, Header, Cookie, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import re, uuid

class CatalogItemCreate(BaseModel):
    name: str
    sku: Optional[str] = None
    quantity: float = 0
    min_stock: float = 0
    unit: str = 'unidades'
    unit_cost: float = 0
    organization_id: Optional[str] = None

class CatalogItemUpdate(BaseModel):
    name: str
    sku: Optional[str] = None
    min_stock: float = 0
    unit: str = 'unidades'
    unit_cost: float = 0
    organization_id: Optional[str] = None


def build_inventory_catalog_router(db,get_current_user,require_management_role,resolve_team_organization):
    router=APIRouter()
    def normalize_sku(value):
        value=re.sub(r'[^A-Z0-9._-]+','-',str(value or '').strip().upper()).strip('-')
        if value and not (2<=len(value)<=48): raise HTTPException(400,'SKU must contain between 2 and 48 characters')
        return value or None
    async def org(user,requested):
        require_management_role(user);return await resolve_team_organization(user,requested)
    async def next_sku(oid):
        row=await db.inventory_sku_sequences.find_one_and_update({'organization_id':oid,'sequence':'inventory_sku'},{'$inc':{'value':1},'$setOnInsert':{'created_at':datetime.now(timezone.utc).isoformat()}},upsert=True,return_document=True)
        return f"INV-{int(row.get('value',1)):06d}"
    async def unique(oid,sku,item_id=None):
        q={'organization_id':oid,'sku':sku}
        if item_id:q['item_id']={'$ne':item_id}
        if await db.inventory.find_one(q,{'_id':1}):raise HTTPException(409,'SKU already exists in this organization')
    async def migrate(oid):
        items=await db.inventory.find({'organization_id':oid,'$or':[{'sku':{'$exists':False}},{'sku':None},{'sku':''}]},{'_id':0,'item_id':1}).sort('created_at',1).to_list(100000);count=0
        for item in items:
            while True:
                sku=await next_sku(oid)
                if not await db.inventory.find_one({'organization_id':oid,'sku':sku},{'_id':1}):break
            result=await db.inventory.update_one({'organization_id':oid,'item_id':item['item_id'],'$or':[{'sku':{'$exists':False}},{'sku':None},{'sku':''}]},{'$set':{'sku':sku,'sku_source':'migration','updated_at':datetime.now(timezone.utc).isoformat(),'active':True}})
            count+=result.modified_count
        return count

    @router.post('/inventory/catalog/migrate-skus')
    async def migrate_skus(organization_id:Optional[str]=None,authorization:Optional[str]=Header(None),session_token:Optional[str]=Cookie(None)):
        user=await get_current_user(authorization,session_token);oid=await org(user,organization_id);return {'organization_id':oid,'migrated_count':await migrate(oid)}

    @router.get('/inventory/catalog/items')
    async def list_items(organization_id:Optional[str]=None,include_archived:bool=False,authorization:Optional[str]=Header(None),session_token:Optional[str]=Cookie(None)):
        user=await get_current_user(authorization,session_token);oid=await org(user,organization_id);await migrate(oid);q={'organization_id':oid}
        if not include_archived:q['active']={'$ne':False}
        rows=await db.inventory.find(q,{'_id':0}).sort([('name',1),('item_id',1)]).to_list(100000)
        for x in rows:x['is_low_stock']=float(x.get('quantity',0))<=float(x.get('min_stock',0));x['inventory_value']=round(float(x.get('quantity',0))*float(x.get('unit_cost',0)),2)
        return rows

    @router.post('/inventory/catalog/items')
    async def create_item(data:CatalogItemCreate,authorization:Optional[str]=Header(None),session_token:Optional[str]=Cookie(None)):
        user=await get_current_user(authorization,session_token);oid=await org(user,data.organization_id)
        if min(data.quantity,data.min_stock,data.unit_cost)<0:raise HTTPException(400,'Stock, minimum stock and cost cannot be negative')
        sku=normalize_sku(data.sku) or await next_sku(oid);await unique(oid,sku);now=datetime.now(timezone.utc).isoformat();doc={'item_id':f'item_{uuid.uuid4().hex[:12]}','organization_id':oid,'sku':sku,'sku_source':'manual' if data.sku else 'automatic','name':data.name.strip()[:160],'quantity':round(float(data.quantity),4),'min_stock':round(float(data.min_stock),4),'unit':data.unit.strip()[:40] or 'unidades','unit_cost':round(float(data.unit_cost),2),'active':True,'created_at':now,'updated_at':now}
        if not doc['name']:raise HTTPException(400,'Name is required')
        await db.inventory.insert_one(doc.copy());doc['is_low_stock']=doc['quantity']<=doc['min_stock'];doc['inventory_value']=round(doc['quantity']*doc['unit_cost'],2);return doc

    @router.put('/inventory/catalog/items/{item_id}')
    async def update_item(item_id:str,data:CatalogItemUpdate,authorization:Optional[str]=Header(None),session_token:Optional[str]=Cookie(None)):
        user=await get_current_user(authorization,session_token);oid=await org(user,data.organization_id);item=await db.inventory.find_one({'organization_id':oid,'item_id':item_id},{'_id':0})
        if not item:raise HTTPException(404,'Inventory item not found')
        if min(data.min_stock,data.unit_cost)<0:raise HTTPException(400,'Minimum stock and cost cannot be negative')
        sku=normalize_sku(data.sku) or item.get('sku') or await next_sku(oid);await unique(oid,sku,item_id);updates={'sku':sku,'sku_source':'manual' if data.sku and sku!=item.get('sku') else item.get('sku_source','automatic'),'name':data.name.strip()[:160],'min_stock':round(float(data.min_stock),4),'unit':data.unit.strip()[:40] or 'unidades','unit_cost':round(float(data.unit_cost),2),'updated_at':datetime.now(timezone.utc).isoformat()}
        if not updates['name']:raise HTTPException(400,'Name is required')
        await db.inventory.update_one({'organization_id':oid,'item_id':item_id},{'$set':updates});return {**item,**updates}

    @router.delete('/inventory/catalog/items/{item_id}')
    async def archive_item(item_id:str,organization_id:Optional[str]=None,authorization:Optional[str]=Header(None),session_token:Optional[str]=Cookie(None)):
        user=await get_current_user(authorization,session_token);oid=await org(user,organization_id);now=datetime.now(timezone.utc).isoformat();result=await db.inventory.update_one({'organization_id':oid,'item_id':item_id,'active':{'$ne':False}},{'$set':{'active':False,'archived_at':now,'updated_at':now}})
        if result.modified_count!=1:raise HTTPException(404,'Inventory item not found')
        return {'message':'Inventory item archived'}
    return router
