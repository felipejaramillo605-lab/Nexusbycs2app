import asyncio
import os
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import decision_engine as subject

class Collection:
    def __init__(self): self.rows=[]
    async def insert_one(self, row): self.rows.append(row)
class DB:
    def __init__(self): self.platform_audit_log=Collection()

def test_masks_email_and_colombian_phone():
    assert subject.mask_pii('ana@example.com +57 300 123 4567') == '[correo] [teléfono]'

def test_heuristic_support_priority():
    result=asyncio.run(subject.HeuristicProvider().decide('support','La app está caída y bloqueado el acceso'))
    assert result['choice']['priority']=='urgent'

def test_disabled_engine_uses_heuristic_and_audits(monkeypatch):
    monkeypatch.delenv('DECISION_ENGINE_ENABLED', raising=False); db=DB()
    result=asyncio.run(subject.decide(db, actor_user_id='u', organization_id='o', kind='support', text='Error de factura'))
    assert result['disabled'] is True and db.platform_audit_log.rows[0]['category']=='ai_decision'

def test_jev_without_key_is_not_configured(monkeypatch):
    monkeypatch.delenv('JEV_API_KEY', raising=False)
    try: asyncio.run(subject.JevProvider().decide('support','hola'))
    except subject.NotConfigured: return
    assert False
