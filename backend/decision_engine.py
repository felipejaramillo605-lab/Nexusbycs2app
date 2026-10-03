"""Deterministic, auditable decision providers; external providers remain disabled by default."""
from __future__ import annotations
import asyncio
import os
import re
from abc import ABC, abstractmethod
from audit_contracts import record_audit_event

EMAIL = re.compile(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}")
PHONE = re.compile(r"(?<!\w)(?:\+?57[ .-]?)?(?:3\d{2}|\d{3})[ .-]?\d{3}[ .-]?\d{4}(?!\w)")
TIMEOUT_SECONDS = 0.8

class NotConfigured(RuntimeError): pass
class DecisionProvider(ABC):
    @abstractmethod
    async def decide(self, kind, text, options=None): raise NotImplementedError

def mask_pii(text):
    return PHONE.sub('[teléfono]', EMAIL.sub('[correo]', text or ''))

class HeuristicProvider(DecisionProvider):
    async def decide(self, kind, text, options=None):
        body = (text or '').lower()
        if kind != 'support':
            return {'choice': 'general', 'confidence': .5, 'provider': 'heuristic', 'model_version': 'v1'}
        category = 'technical' if any(w in body for w in ('error','caído','falla','no funciona','acceso')) else 'billing' if any(w in body for w in ('factura','cobro','pago','precio')) else 'general'
        priority = 'urgent' if any(w in body for w in ('urgente','bloqueado','caído')) else 'high' if any(w in body for w in ('error','falla','no funciona')) else 'normal'
        return {'choice': {'category': category, 'priority': priority}, 'confidence': .72 if priority != 'normal' else .6, 'provider': 'heuristic', 'model_version': 'v1'}

class JevProvider(DecisionProvider):
    async def decide(self, kind, text, options=None):
        if not os.getenv('JEV_API_KEY'): raise NotConfigured('JEV_API_KEY is not configured')
        raise NotConfigured('Jev network provider is intentionally disabled')

async def decide(db, *, actor_user_id, organization_id, kind, text, options=None, provider=None):
    heuristic = HeuristicProvider()
    selected = provider or heuristic
    if not os.getenv('DECISION_ENGINE_ENABLED', '').lower() in {'1','true','yes'}:
        result = await heuristic.decide(kind, text, options)
        result['disabled'] = True
    else:
        try: result = await asyncio.wait_for(selected.decide(kind, mask_pii(text), options), timeout=TIMEOUT_SECONDS)
        except (asyncio.TimeoutError, NotConfigured):
            result = await heuristic.decide(kind, text, options); result['fallback'] = True
    await record_audit_event(db, category='ai_decision', event_type='decision_made', actor_user_id=actor_user_id, organization_id=organization_id, entity_type=kind, metadata={'provider':result['provider'], 'model_version':result['model_version'], 'confidence':result['confidence']})
    return result
