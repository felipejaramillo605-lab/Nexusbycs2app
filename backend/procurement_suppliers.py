# NEXUS_SUPPLIERS_5C1_V1
from fastapi import APIRouter, HTTPException, Header, Cookie
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
from pymongo.errors import DuplicateKeyError
import re, uuid

class SupplierPayload(BaseModel):
    business_name: str
    legal_name: Optional[str]=None
    tax_id: Optional[str]=None
    contact_name: Optional[str]=None
    phone: Optional[str]=None
    email: Optional[str]=None
    address: Optional[str]=None
    city: Optional[str]=None
    payment_terms: Optional[str]=None
    payment_term_days: int=0
    usual_lead_time_days: int=0
    notes: Optional[str]=None

class SupplierProductPayload(BaseModel):
    inventory_item_id: str
    supplier_sku: Optional[str]=None
    supplier_product_name: Optional[str]=None
    last_unit_cost: float=0
    minimum_order_quantity: float=1
    purchase_unit: Optional[str]=None
    conversion_factor: float=1
    preferred: bool=False

def clean(v,limit=500):
    value=(v or '').strip()
    return value[:limit] or None

def tax_norm(v): return re.sub(r'[^A-Z0-9]','',str(v or '').upper()) or None

async def ensure_supplier_indexes(db):
    await db.suppliers.create_index([('organization_id',1),('supplier_id',1)],unique=True,name='nexus_supplier_identity_unique')
    await db.suppliers.create_index([('organization_id',1),('tax_id_normalized',1)],unique=True,partialFilterExpression={'tax_id_normalized':{'$type':'string'}},name='nexus_supplier_tax_unique')
    await db.suppliers.create_index([('organization_id',1),('active',1),('business_name',1)],name='nexus_supplier_directory')
    await db.supplier_products.create_index([('organization_id',1),('supplier_id',1),('inventory_item_id',1)],unique=True,name='nexus_supplier_product_unique')
    await db.supplier_products.create_index([('organization_id',1),('inventory_item_id',1),('preferred',1)],name='nexus_supplier_product_preferred')

async def audit(db,org,event,entity,actor,previous,new):
    await db.audit_events.insert_one({'audit_id':f'audit_{uuid.uuid4().hex[:12]}','organization_id':org,'event_type':event,'entity_type':'supplier','entity_id':entity,'actor_user_id':actor,'previous_value':previous,'new_value':new,'created_at':datetime.now(timezone.utc).isoformat()})

def build_supplier_router(db,get_current_user,require_management_role,resolve_team_organization):
    router=APIRouter()
    async def context(auth,token,requested=None):
        user=await get_current_user(auth,token);require_management_role(user)
        org=await resolve_team_organization(user,requested)
        return user,org
    def doc(data,org,user,existing=None):
        if not data.business_name.strip(): raise HTTPException(400,'El nombre comercial es obligatorio')
        if data.payment_term_days<0 or data.usual_lead_time_days<0: raise HTTPException(400,'Los plazos no pueden ser negativos')
        now=datetime.now(timezone.utc).isoformat()
        return {'supplier_id':(existing or {}).get('supplier_id') or f'sup_{uuid.uuid4().hex[:16]}','organization_id':org,'business_name':data.business_name.strip()[:160],'legal_name':clean(data.legal_name,200),'tax_id':clean(data.tax_id,80),'tax_id_normalized':tax_norm(data.tax_id),'contact_name':clean(data.contact_name,160),'phone':clean(data.phone,60),'email':clean((data.email or '').lower(),180),'address':clean(data.address,300),'city':clean(data.city,120),'payment_terms':clean(data.payment_terms,200),'payment_term_days':data.payment_term_days,'usual_lead_time_days':data.usual_lead_time_days,'notes':clean(data.notes,1000),'active':(existing or {}).get('active',True),'created_by':(existing or {}).get('created_by') or user.user_id,'created_at':(existing or {}).get('created_at') or now,'updated_by':user.user_id,'updated_at':now}
    @router.get('/suppliers')
    async def listing(organization_id:Optional[str]=None,search:Optional[str]=None,active:Optional[bool]=None,page:int=1,page_size:int=25,authorization:Optional[str]=Header(None),session_token:Optional[str]=Cookie(None)):
        user,org=await context(authorization,session_token,organization_id);q={'organization_id':org}
        if active is not None:q['active']=active
        if search:q['$or']=[{'business_name':{'$regex':re.escape(search),'$options':'i'}},{'legal_name':{'$regex':re.escape(search),'$options':'i'}},{'tax_id':{'$regex':re.escape(search),'$options':'i'}}]
        page=max(1,page);page_size=max(1,min(page_size,100));total=await db.suppliers.count_documents(q)
        items=await db.suppliers.find(q,{'_id':0}).sort([('active',-1),('business_name',1)]).skip((page-1)*page_size).limit(page_size).to_list(page_size);pages=(total+page_size-1)//page_size
        return {'items':items,'page':page,'page_size':page_size,'total':total,'total_pages':pages,'has_next':page<pages,'has_previous':page>1}
    @router.post('/suppliers')
    async def create(data:SupplierPayload,organization_id:Optional[str]=None,authorization:Optional[str]=Header(None),session_token:Optional[str]=Cookie(None)):
        user,org=await context(authorization,session_token,organization_id);item=doc(data,org,user)
        try: await db.suppliers.insert_one(item.copy())
        except DuplicateKeyError: raise HTTPException(409,detail={'code':'supplier_duplicate','message':'Ya existe un proveedor con esta identificación'})
        await audit(db,org,'supplier_created',item['supplier_id'],user.user_id,None,item);return item
    @router.get('/suppliers/{supplier_id}')
    async def detail(supplier_id:str,authorization:Optional[str]=Header(None),session_token:Optional[str]=Cookie(None)):
        user,org=await context(authorization,session_token);item=await db.suppliers.find_one({'organization_id':org,'supplier_id':supplier_id},{'_id':0})
        if not item:raise HTTPException(404,'Proveedor no encontrado')
        item['products']=await db.supplier_products.find({'organization_id':org,'supplier_id':supplier_id,'active':True},{'_id':0}).to_list(1000);return item
    @router.put('/suppliers/{supplier_id}')
    async def update(supplier_id:str,data:SupplierPayload,authorization:Optional[str]=Header(None),session_token:Optional[str]=Cookie(None)):
        user,org=await context(authorization,session_token);old=await db.suppliers.find_one({'organization_id':org,'supplier_id':supplier_id},{'_id':0})
        if not old:raise HTTPException(404,'Proveedor no encontrado')
        item=doc(data,org,user,old)
        try: await db.suppliers.replace_one({'organization_id':org,'supplier_id':supplier_id},item)
        except DuplicateKeyError: raise HTTPException(409,detail={'code':'supplier_duplicate','message':'Ya existe un proveedor con esta identificación'})
        await audit(db,org,'supplier_updated',supplier_id,user.user_id,old,item);return item
    @router.post('/suppliers/{supplier_id}/archive')
    async def archive(supplier_id:str,authorization:Optional[str]=Header(None),session_token:Optional[str]=Cookie(None)):
        user,org=await context(authorization,session_token);now=datetime.now(timezone.utc).isoformat();r=await db.suppliers.update_one({'organization_id':org,'supplier_id':supplier_id,'active':True},{'$set':{'active':False,'archived_by':user.user_id,'archived_at':now,'updated_by':user.user_id,'updated_at':now}})
        if r.modified_count!=1:raise HTTPException(409,'Proveedor inexistente o ya archivado')
        await audit(db,org,'supplier_archived',supplier_id,user.user_id,{'active':True},{'active':False});return {'supplier_id':supplier_id,'active':False}
    @router.post('/suppliers/{supplier_id}/reactivate')
    async def reactivate(supplier_id:str,authorization:Optional[str]=Header(None),session_token:Optional[str]=Cookie(None)):
        user,org=await context(authorization,session_token);now=datetime.now(timezone.utc).isoformat();r=await db.suppliers.update_one({'organization_id':org,'supplier_id':supplier_id,'active':False},{'$set':{'active':True,'updated_by':user.user_id,'updated_at':now},'$unset':{'archived_by':'','archived_at':''}})
        if r.modified_count!=1:raise HTTPException(409,'Proveedor inexistente o activo')
        await audit(db,org,'supplier_reactivated',supplier_id,user.user_id,{'active':False},{'active':True});return {'supplier_id':supplier_id,'active':True}
    @router.post('/suppliers/{supplier_id}/products')
    async def link(supplier_id:str,data:SupplierProductPayload,authorization:Optional[str]=Header(None),session_token:Optional[str]=Cookie(None)):
        user,org=await context(authorization,session_token);supplier=await db.suppliers.find_one({'organization_id':org,'supplier_id':supplier_id,'active':True});inv=await db.inventory.find_one({'organization_id':org,'item_id':data.inventory_item_id,'active':{'$ne':False}})
        if not supplier:raise HTTPException(404,'Proveedor no encontrado o inactivo')
        if not inv:raise HTTPException(404,'Producto de inventario no encontrado')
        if data.last_unit_cost<0 or data.minimum_order_quantity<=0 or data.conversion_factor<=0:raise HTTPException(400,'Costo, cantidad mínima o conversión inválidos')
        now=datetime.now(timezone.utc).isoformat()
        if data.preferred:await db.supplier_products.update_many({'organization_id':org,'inventory_item_id':data.inventory_item_id,'preferred':True},{'$set':{'preferred':False,'updated_at':now}})
        item={'supplier_product_id':f'supitem_{uuid.uuid4().hex[:16]}','organization_id':org,'supplier_id':supplier_id,'inventory_item_id':data.inventory_item_id,'supplier_sku':clean(data.supplier_sku,100),'supplier_product_name':clean(data.supplier_product_name,200),'last_unit_cost':round(data.last_unit_cost,4),'minimum_order_quantity':round(data.minimum_order_quantity,4),'purchase_unit':clean(data.purchase_unit,60) or inv.get('unit'),'conversion_factor':round(data.conversion_factor,6),'preferred':data.preferred,'active':True,'created_by':user.user_id,'created_at':now,'updated_at':now}
        try:await db.supplier_products.insert_one(item.copy())
        except DuplicateKeyError:raise HTTPException(409,'El producto ya está asociado con este proveedor')
        await audit(db,org,'supplier_product_linked',supplier_id,user.user_id,None,item);return item
    @router.delete('/suppliers/{supplier_id}/products/{inventory_item_id}')
    async def unlink(supplier_id:str,inventory_item_id:str,authorization:Optional[str]=Header(None),session_token:Optional[str]=Cookie(None)):
        user,org=await context(authorization,session_token);now=datetime.now(timezone.utc).isoformat();r=await db.supplier_products.update_one({'organization_id':org,'supplier_id':supplier_id,'inventory_item_id':inventory_item_id,'active':True},{'$set':{'active':False,'preferred':False,'updated_at':now}})
        if r.modified_count!=1:raise HTTPException(404,'Relación proveedor-producto no encontrada')
        await audit(db,org,'supplier_product_unlinked',supplier_id,user.user_id,{'inventory_item_id':inventory_item_id,'active':True},{'active':False});return {'active':False}
    return router
