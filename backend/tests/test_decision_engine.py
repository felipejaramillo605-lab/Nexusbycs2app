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
    assert subject.mask_pii('ana@example.com +57 300 123 4567') == '[CORREO] [TELEFONO]'


def test_masks_typed_colombian_pii_without_masking_ordinary_numbers():
    text = 'CC 123456789, NIT 900.123.456-7, Calle 72 # 10-34, ABC123, Nequi 3001234567, código: AB-1234 y https://nexus.test/a'
    masked = subject.mask_pii(text)
    for token in ('[CEDULA]', '[NIT]', '[DIRECCION]', '[PLACA]', '[CUENTA]', '[CODIGO]', '[ENLACE]'):
        assert token in masked
    assert subject.mask_pii('Tengo 3 citas a las 10') == 'Tengo 3 citas a las 10'

def test_heuristic_support_priority():
    result=asyncio.run(subject.HeuristicProvider().decide('support','La app está caída y bloqueado el acceso'))
    assert result['choice']['priority']=='urgent'
    assert result['output_type'] == 'choice' and result['value'] == result['choice']


def test_decision_contract_validates_choice_score_and_probability():
    common = {'kind': 'review', 'confidence': .8, 'provider': 'test', 'model_version': 'v1', 'latency_ms': 1, 'masked': True, 'fallback': False}
    assert subject.validate_decision_result({**common, 'output_type': 'choice', 'value': 'positive'}, kind='review', options={'choices': ('positive', 'negative')})['value'] == 'positive'
    assert subject.validate_decision_result({**common, 'output_type': 'score', 'value': 3}, kind='review', options={'min': 1, 'max': 5})['value'] == 3
    assert subject.validate_decision_result({**common, 'output_type': 'probability', 'value': .25}, kind='review')['value'] == .25
    try:
        subject.validate_decision_result({**common, 'output_type': 'choice', 'value': 'urgent'}, kind='review', options={'choices': ('positive',)})
    except subject.DecisionContractError:
        return
    assert False

def test_disabled_engine_uses_heuristic_and_audits(monkeypatch):
    monkeypatch.delenv('DECISION_ENGINE_ENABLED', raising=False); db=DB()
    result=asyncio.run(subject.decide(db, actor_user_id='u', organization_id='o', kind='support', text='Error de factura'))
    assert result['disabled'] is True and result['kind'] == 'support' and db.platform_audit_log.rows[0]['category']=='ai_decision'


class InvalidProvider(subject.DecisionProvider):
    async def decide(self, kind, text, options=None):
        return {'choice': {'category': 'outside', 'priority': 'urgent'}, 'output_type': 'choice', 'value': {'category': 'outside', 'priority': 'urgent'}, 'confidence': .9, 'provider': 'invalid', 'model_version': 'v1'}


def test_invalid_provider_falls_back_to_the_closed_heuristic_contract(monkeypatch):
    monkeypatch.setenv('DECISION_ENGINE_ENABLED', 'true'); db=DB()
    result=asyncio.run(subject.decide(db, actor_user_id='u', organization_id='o', kind='support', text='error de acceso', provider=InvalidProvider()))
    assert result['fallback'] is True and result['value']['category'] == 'technical'

def test_jev_without_key_is_not_configured(monkeypatch):
    monkeypatch.delenv('JEV_API_KEY', raising=False)
    try: asyncio.run(subject.JevProvider().decide('support','hola'))
    except subject.NotConfigured: return
    assert False
