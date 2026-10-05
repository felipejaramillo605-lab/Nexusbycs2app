import asyncio
import sys
from pathlib import Path
from types import SimpleNamespace

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import support_center
from support_center import build_support_center_router, normalize_support_suggestion


def test_maps_local_technical_suggestion_to_manager_categories():
    assert normalize_support_suggestion({"category": "technical", "priority": "urgent"}) == {"category": "peticion", "priority": "high"}


def test_maps_billing_suggestion_without_forcing_unrecognized_values():
    assert normalize_support_suggestion({"category": "billing", "priority": "normal"}) == {"category": "reclamo", "priority": "normal"}


def test_unknown_suggestion_falls_back_to_manager_defaults():
    assert normalize_support_suggestion({}) == {"category": "otro", "priority": "normal"}


class Limiter:
    def __init__(self):
        self.calls = []

    async def check(self, *args):
        self.calls.append(args)


def build_client(monkeypatch):
    users = {
        "Bearer manager": SimpleNamespace(user_id="manager-1", role="manager"),
        "Bearer staff": SimpleNamespace(user_id="staff-1", role="staff"),
    }
    limiter = Limiter()

    async def get_current_user(authorization, _session_token):
        return users[authorization]

    def require_management_role(user):
        if user.role not in {"manager", "admin", "owner"}:
            raise HTTPException(status_code=403, detail="management required")

    async def resolve_team_organization(user, requested_org):
        if requested_org not in {None, "org-a"}:
            raise HTTPException(status_code=403, detail="other organization")
        return "org-a"

    async def decide(_db, **_kwargs):
        return {"choice": {"category": "technical", "priority": "urgent"}, "confidence": 0.72, "provider": "heuristic"}

    monkeypatch.setattr(support_center, "rate_limiter", limiter)
    monkeypatch.setattr(support_center, "decide", decide)
    app = FastAPI()
    app.include_router(build_support_center_router(SimpleNamespace(), get_current_user, require_management_role, resolve_team_organization, lambda **_kwargs: None))
    return TestClient(app), limiter


def test_suggestion_endpoint_uses_shared_mapping_and_user_rate_limit(monkeypatch):
    client, limiter = build_client(monkeypatch)

    response = client.post(
        "/support/decision-suggestion?organization_id=org-a",
        headers={"Authorization": "Bearer manager"},
        json={"subject": "Error", "initial_message": "No funciona el acceso"},
    )

    assert response.status_code == 200
    assert response.json()["suggestion"] == {"category": "peticion", "priority": "high"}
    assert limiter.calls == [("support_suggestion:manager-1", 10, 60)]


def test_suggestion_endpoint_rejects_staff_and_other_tenant(monkeypatch):
    client, _limiter = build_client(monkeypatch)
    payload = {"subject": "Error", "initial_message": "No funciona el acceso"}

    assert client.post("/support/decision-suggestion", headers={"Authorization": "Bearer staff"}, json=payload).status_code == 403
    assert client.post("/support/decision-suggestion?organization_id=org-other", headers={"Authorization": "Bearer manager"}, json=payload).status_code == 403
