"""message-templates (marketing) must be blocked for US orgs, same as payroll/HR.

Regresion: GET/POST/PUT/duplicate/delete de /organizations/{id}/message-templates
no aplicaba el guard de pais y devolvia 200 para organizaciones US (detectado en
FASE 4 de la auditoria E2E, 2026-08-11).
"""
import asyncio
import os
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test_database")
os.environ.setdefault("EMERGENT_LLM_KEY", "test-key")
os.environ.setdefault("CORS_ORIGINS", "http://localhost:3000")
import server  # noqa: E402


class _Organizations:
    def __init__(self, docs):
        self.docs = docs

    async def find_one(self, query, projection=None):
        for doc in self.docs:
            if all(doc.get(k) == v for k, v in query.items()):
                return dict(doc)
        return None


def _manager(org_id):
    return SimpleNamespace(role="manager", organization_id=org_id)


def _patch_auth(monkeypatch, user, organizations):
    async def fake_get_current_user(*args, **kwargs):
        return user

    monkeypatch.setattr(server, "get_current_user", fake_get_current_user)
    monkeypatch.setattr(server, "db", SimpleNamespace(organizations=_Organizations(organizations)))


def test_list_message_templates_blocked_for_us_org(monkeypatch):
    _patch_auth(monkeypatch, _manager("org_us"), [{"organization_id": "org_us", "operating_country": "US"}])
    with pytest.raises(HTTPException) as caught:
        asyncio.run(server.list_message_templates("org_us", authorization=None, session_token=None))
    assert caught.value.status_code == 403
    assert caught.value.detail["code"] == "feature_unavailable_for_country"


def test_list_message_templates_allowed_for_co_org(monkeypatch):
    _patch_auth(monkeypatch, _manager("org_co"), [{"organization_id": "org_co", "operating_country": "CO"}])
    monkeypatch.setattr(
        server,
        "get_or_seed_templates",
        lambda db, organization_id: asyncio.sleep(0, result=[]),
    )
    result = asyncio.run(server.list_message_templates("org_co", authorization=None, session_token=None))
    assert result["items"] == []


def test_create_message_template_blocked_for_us_org(monkeypatch):
    _patch_auth(monkeypatch, _manager("org_us"), [{"organization_id": "org_us", "operating_country": "US"}])
    data = server.MessageTemplateCreate(channel="email", purpose="birthday", name="x", body="y")
    with pytest.raises(HTTPException) as caught:
        asyncio.run(server.create_message_template("org_us", data, authorization=None, session_token=None))
    assert caught.value.status_code == 403
