# NEXUS_INVENTORY_AUDIT_ENGINE_5A_PACKAGE_2_V1
from fastapi import APIRouter, Header, Cookie, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
from io import BytesIO, StringIO
import csv, re, uuid

class AuditCreate(BaseModel):
    name: str
    organization_id: Optional[str] = None
    blind_count: bool = False
    location: Optional[str] = None
    notes: Optional[str] = None

class AuditLineUpdate(BaseModel):
    counted_quantity: float
    observation: Optional[str] = None

class AuditApply(BaseModel):
    line_ids: Optional[List[str]] = None


def build_inventory_audit_router(db, get_current_user, require_management_role, resolve_team_organization):
    router=APIRouter()
    async def org(user, requested):
        require_management_role(user); return await resolve_team_organization(user, requested)
    async def authorized_audit(user,audit_id):
        row=await db.inventory_audits.find_one({'audit_id':audit_id},{'_id':0})
        if not row: raise HTTPException(404,'Inventory audit not found')
        resolved=await org(user,row['organization_id'])
        if resolved!=row['organization_id']: raise HTTPException(403,'Access denied')
        return row

    @router.post('/inventory/audits')
    async def create_audit(data:AuditCreate,authorization:Optional[str]=Header(None),session_token:Optional[str]=Cookie(None)):
        user=await get_current_user(authorization,session_token); oid=await org(user,data.organization_id)
        seq=await db.inventory_sku_sequences.find_one_and_update({'organization_id':oid,'sequence':'audit_number'},{'$inc':{'value':1},'$setOnInsert':{'created_at':datetime.now(timezone.utc).isoformat()}},upsert=True,return_document=True)
        number=int(seq.get('value',1)); now=datetime.now(timezone.utc).isoformat(); audit_id=f'audit_{uuid.uuid4().hex[:16]}'; audit_number=f'AUD-{datetime.now(timezone.utc).year}-{number:06d}'
        products=await db.inventory.find({'organization_id':oid,'active':{'$ne':False}},{'_id':0}).sort('name',1).to_list(100000)
        header={'audit_id':audit_id,'audit_number':audit_number,'organization_id':oid,'name':data.name.strip()[:160],'blind_count':data.blind_count,'location':(data.location or '').strip()[:160] or None,'notes':(data.notes or '').strip()[:500] or None,'status':'prepared','item_count':len(products),'created_by':user.user_id,'created_at':now,'updated_at':now,'adjustments_applied':False}
        await db.inventory_audits.insert_one(header.copy())
        lines=[]
        for p in products:
            q=float(p.get('quantity',0)); cost=float(p.get('unit_cost',0)); sku=p.get('sku') or f"INV-{p['item_id'][-8:].upper()}"
            lines.append({'audit_line_id':f'aline_{uuid.uuid4().hex[:16]}','audit_id':audit_id,'organization_id':oid,'inventory_item_id':p['item_id'],'sku_snapshot':sku,'item_name_snapshot':p.get('name'),'unit_snapshot':p.get('unit'),'system_quantity':q,'counted_quantity':None,'difference_quantity':None,'unit_cost_snapshot':cost,'system_value':round(q*cost,2),'counted_value':None,'difference_value':None,'observation':None,'status':'pending','adjustment_applied':False})
        if lines: await db.inventory_audit_lines.insert_many(lines)
        return header

    @router.get('/inventory/audits')
    async def list_audits(organization_id:Optional[str]=None,page:int=1,page_size:int=25,authorization:Optional[str]=Header(None),session_token:Optional[str]=Cookie(None)):
        user=await get_current_user(authorization,session_token); oid=await org(user,organization_id); page=max(1,page);page_size=max(1,min(page_size,100));q={'organization_id':oid};total=await db.inventory_audits.count_documents(q);rows=await db.inventory_audits.find(q,{'_id':0}).sort('created_at',-1).skip((page-1)*page_size).limit(page_size).to_list(page_size);pages=(total+page_size-1)//page_size;return {'items':rows,'page':page,'page_size':page_size,'total':total,'total_pages':pages}

    @router.get('/inventory/audits/{audit_id}')
    async def audit_detail(audit_id:str,authorization:Optional[str]=Header(None),session_token:Optional[str]=Cookie(None)):
        user=await get_current_user(authorization,session_token);header=await authorized_audit(user,audit_id);lines=await db.inventory_audit_lines.find({'audit_id':audit_id},{'_id':0}).sort('item_name_snapshot',1).to_list(100000);return {**header,'lines':lines}

    @router.put('/inventory/audits/{audit_id}/lines/{line_id}')
    async def update_line(audit_id:str,line_id:str,data:AuditLineUpdate,authorization:Optional[str]=Header(None),session_token:Optional[str]=Cookie(None)):
        user=await get_current_user(authorization,session_token);header=await authorized_audit(user,audit_id)
        if header['status'] in {'adjusted','closed','cancelled'}: raise HTTPException(409,'Audit is not editable')
        if data.counted_quantity<0: raise HTTPException(400,'Counted quantity cannot be negative')
        line=await db.inventory_audit_lines.find_one({'audit_id':audit_id,'audit_line_id':line_id},{'_id':0})
        if not line: raise HTTPException(404,'Audit line not found')
        counted=round(float(data.counted_quantity),4);diff=round(counted-float(line['system_quantity']),4);cost=float(line['unit_cost_snapshot']);now=datetime.now(timezone.utc).isoformat();updates={'counted_quantity':counted,'difference_quantity':diff,'counted_value':round(counted*cost,2),'difference_value':round(diff*cost,2),'observation':(data.observation or '').strip()[:500] or None,'status':'counted' if diff==0 else 'difference','counted_by':user.user_id,'counted_at':now}
        await db.inventory_audit_lines.update_one({'audit_line_id':line_id},{'$set':updates});await db.inventory_audits.update_one({'audit_id':audit_id},{'$set':{'status':'counting','updated_at':now}});return {**line,**updates}

    @router.get('/inventory/audits/{audit_id}/report')
    async def audit_report(audit_id:str,authorization:Optional[str]=Header(None),session_token:Optional[str]=Cookie(None)):
        user=await get_current_user(authorization,session_token);header=await authorized_audit(user,audit_id);lines=await db.inventory_audit_lines.find({'audit_id':audit_id},{'_id':0}).to_list(100000);counted=[x for x in lines if x.get('counted_quantity') is not None];return {'audit_id':audit_id,'audit_number':header['audit_number'],'total_references':len(lines),'counted_references':len(counted),'pending_references':len(lines)-len(counted),'matching_references':sum(1 for x in counted if x.get('difference_quantity')==0),'shortage_references':sum(1 for x in counted if float(x.get('difference_quantity') or 0)<0),'surplus_references':sum(1 for x in counted if float(x.get('difference_quantity') or 0)>0),'system_value':round(sum(float(x.get('system_value') or 0) for x in lines),2),'counted_value':round(sum(float(x.get('counted_value') or 0) for x in counted),2),'difference_value':round(sum(float(x.get('difference_value') or 0) for x in counted),2),'accuracy_percent':round(100*sum(1 for x in counted if x.get('difference_quantity')==0)/len(counted),2) if counted else 0,'lines':lines}

    @router.get('/inventory/audits/{audit_id}/count-sheet.xlsx')
    async def count_sheet(audit_id:str,authorization:Optional[str]=Header(None),session_token:Optional[str]=Cookie(None)):
        user=await get_current_user(authorization,session_token);header=await authorized_audit(user,audit_id);lines=await db.inventory_audit_lines.find({'audit_id':audit_id},{'_id':0}).sort('item_name_snapshot',1).to_list(100000)
        try: from openpyxl import Workbook; from openpyxl.styles import Font,PatternFill,Alignment,Protection
        except ImportError: raise HTTPException(500,'openpyxl is required')
        wb=Workbook();ws=wb.active;ws.title='Acta de conteo';ws.append(['ACTA DE CONTEO FÍSICO',header['audit_number']]);ws.append(['Auditoría',header['name']]);ws.append(['Fecha de corte',header['created_at']]);ws.append([]);heads=['SKU','Producto','Unidad','Cantidad teórica','Costo unitario','Cantidad contada físicamente','Observaciones'];ws.append(heads)
        for c in ws[5]: c.font=Font(bold=True,color='FFFFFF');c.fill=PatternFill('solid',fgColor='1F4E78');c.alignment=Alignment(horizontal='center')
        for x in lines: ws.append([x['sku_snapshot'],x['item_name_snapshot'],x['unit_snapshot'],None if header.get('blind_count') else x['system_quantity'],x['unit_cost_snapshot'],None,None])
        for row in ws.iter_rows(min_row=6):
            for cell in row[:5]: cell.protection=Protection(locked=True)
            for cell in row[5:]: cell.protection=Protection(locked=False)
        ws.protection.sheet=True;ws.protection.password='nexus';widths=[18,36,14,18,18,28,45]
        for i,w in enumerate(widths,1): ws.column_dimensions[chr(64+i)].width=w
        out=BytesIO();wb.save(out);out.seek(0);name=f"{header['audit_number']}_acta_conteo.xlsx";return StreamingResponse(out,media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',headers={'Content-Disposition':f'attachment; filename="{name}"'})

    @router.get('/inventory/audits/{audit_id}/report.csv')
    async def report_csv(audit_id:str,authorization:Optional[str]=Header(None),session_token:Optional[str]=Cookie(None)):
        user=await get_current_user(authorization,session_token);header=await authorized_audit(user,audit_id);lines=await db.inventory_audit_lines.find({'audit_id':audit_id},{'_id':0}).sort('item_name_snapshot',1).to_list(100000);out=StringIO();w=csv.writer(out);w.writerow(['SKU','Producto','Unidad','Cantidad teórica','Cantidad contada','Diferencia','Costo unitario','Impacto económico','Observaciones']);[w.writerow([x['sku_snapshot'],x['item_name_snapshot'],x['unit_snapshot'],x['system_quantity'],x.get('counted_quantity'),x.get('difference_quantity'),x['unit_cost_snapshot'],x.get('difference_value'),x.get('observation')]) for x in lines];data=BytesIO(out.getvalue().encode('utf-8-sig'));return StreamingResponse(data,media_type='text/csv',headers={'Content-Disposition':f'attachment; filename="{header["audit_number"]}_diferencias.csv"'})

    @router.post('/inventory/audits/{audit_id}/apply-adjustments')
    async def apply_adjustments(audit_id:str,data:AuditApply,authorization:Optional[str]=Header(None),session_token:Optional[str]=Cookie(None)):
        user=await get_current_user(authorization,session_token);header=await authorized_audit(user,audit_id)
        if header.get('adjustments_applied'): raise HTTPException(409,'Audit adjustments already applied')
        q={'audit_id':audit_id,'counted_quantity':{'$ne':None},'difference_quantity':{'$ne':0},'adjustment_applied':False}
        if data.line_ids:q['audit_line_id']={'$in':data.line_ids}
        lines=await db.inventory_audit_lines.find(q,{'_id':0}).to_list(100000);applied=[]
        for x in lines:
            diff=float(x['difference_quantity']);key=f"audit:{audit_id}:{x['audit_line_id']}";existing=await db.inventory_movements.find_one({'organization_id':header['organization_id'],'idempotency_key':key},{'_id':0})
            if existing: movement=existing
            else:
                item=await db.inventory.find_one({'item_id':x['inventory_item_id'],'organization_id':header['organization_id']},{'_id':0});previous=float(item.get('quantity',0));new=round(previous+diff,4)
                if new<0: raise HTTPException(409,f"Negative stock for {x['sku_snapshot']}")
                now=datetime.now(timezone.utc).isoformat();res=await db.inventory.update_one({'item_id':x['inventory_item_id'],'organization_id':header['organization_id'],'quantity':item.get('quantity',0)},{'$set':{'quantity':new,'updated_at':now}})
                if res.modified_count!=1: raise HTTPException(409,'Inventory changed concurrently')
                movement={'movement_id':f'mov_{uuid.uuid4().hex[:16]}','organization_id':header['organization_id'],'inventory_item_id':x['inventory_item_id'],'item_name_snapshot':x['item_name_snapshot'],'movement_type':'audit_adjustment_in' if diff>0 else 'audit_adjustment_out','direction':'in' if diff>0 else 'out','quantity':abs(diff),'unit_cost':x['unit_cost_snapshot'],'total_cost':round(abs(diff)*float(x['unit_cost_snapshot']),2),'previous_stock':previous,'new_stock':new,'reference_type':'inventory_audit','reference_id':audit_id,'idempotency_key':key,'created_by':user.user_id,'created_at':now,'notes':x.get('observation')}
                await db.inventory_movements.insert_one(movement.copy())
            await db.inventory_audit_lines.update_one({'audit_line_id':x['audit_line_id']},{'$set':{'adjustment_applied':True,'adjustment_movement_id':movement['movement_id']}});applied.append(movement['movement_id'])
        now=datetime.now(timezone.utc).isoformat();await db.inventory_audits.update_one({'audit_id':audit_id},{'$set':{'status':'adjusted','adjustments_applied':True,'adjusted_by':user.user_id,'adjusted_at':now,'updated_at':now}});return {'audit_id':audit_id,'applied_count':len(applied),'movement_ids':applied}
    return router
