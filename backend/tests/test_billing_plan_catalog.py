"""Owner billing catalog and plan-change API contract tests."""
from copy import deepcopy
from types import SimpleNamespace
import sys
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from billing_catalog import CATALOG_VERSION
from owner_subscriptions import build_subscription_router


class MemoryCollection:
    def __init__(self, rows=()):
        self.rows = [deepcopy(row) for row in rows]

    @staticmethod
    def _matches(row, query):
        for key, expected in query.items():
            actual = row.get(key)
            if isinstance(expected, dict) and "$exists" in expected:
                if (key in row) != expected["$exists"]:
                    return False
            elif actual != expected:
                return False
        return True

    async def find_one(self, query, projection=None):
        for row in self.rows:
            if self._matches(row, query):
                return deepcopy(row)
        return None

    async def update_one(self, query, update, upsert=False):
        for row in self.rows:
            if self._matches(row, query):
                before = deepcopy(row)
                row.update(deepcopy(update.get("$set", {})))
                for key in update.get("$unset", {}):
                    row.pop(key, None)
                return SimpleNamespace(matched_count=1, modified_count=int(row != before), upserted_id=None)
        if upsert:
            row = deepcopy(query)
            row.update(deepcopy(update.get("$set", {})))
            self.rows.append(row)
            return SimpleNamespace(matched_count=0, modified_count=0, upserted_id=len(self.rows))
        return SimpleNamespace(matched_count=0, modified_count=0, upserted_id=None)

    async def insert_one(self, row):
        self.rows.append(deepcopy(row))
        return SimpleNamespace(inserted_id=len(self.rows))


def _client(role="owner", access_status="approved", premium_active=False, with_subscription=True):
    organization = {
        "organization_id": "org-a",
        "nexus_ai_contracted": premium_active,
        "nexus_ai_enabled": premium_active,
        "premium_templates_contracted": premium_active,
    }
    subscription = {
        "subscription_id": "sub-a",
        "organization_id": "org-a",
        "plan_code": "custom_legacy",
        "plan_version": 3,
        "monthly_amount_minor": 12_500_000,
        "currency": "COP",
        "billing_day": 10,
        "status": "active",
        "contract_term": "monthly",
        "contract_started_at": "2026-01-10T00:00:00+00:00",
    }
    database = SimpleNamespace(
        organizations=MemoryCollection([organization]),
        organization_subscriptions=MemoryCollection([subscription] if with_subscription else []),
        subscription_audit_events=MemoryCollection(),
    )

    async def get_current_user(authorization, session_token):
        if authorization != "Bearer test-owner":
            raise HTTPException(status_code=401, detail="Not authenticated")
        return SimpleNamespace(role=role, access_status=access_status, user_id="user-owner-a")

    app = FastAPI()
    app.include_router(build_subscription_router(database, get_current_user), prefix="/api")
    return TestClient(app), database


def test_catalog_returns_fixed_prices_templates_and_no_iva():
    client, _ = _client()

    response = client.get("/api/owner/billing/catalog", headers={"Authorization": "Bearer test-owner"})

    assert response.status_code == 200
    body = response.json()
    assert body["catalog_version"] == CATALOG_VERSION
    assert body["currency"] == "COP"
    assert {plan["plan_code"]: plan["monthly_amount_minor"] for plan in body["plans"]} == {
        "standard": 8_000_000,
        "premium": 15_000_000,
    }
    assert body["tax"] == {"mode": "none", "iva_rate_bps": 0}
    assert "invoice_templates" not in body


def test_catalog_is_owner_only():
    client, _ = _client(role="manager")

    response = client.get("/api/owner/billing/catalog", headers={"Authorization": "Bearer test-owner"})

    assert response.status_code == 403


def test_put_rejects_catalog_price_mismatch():
    client, database = _client()

    response = client.put(
        "/api/owner/subscriptions/org-a",
        headers={"Authorization": "Bearer test-owner"},
        json={
            "plan_code": "standard", "monthly_amount_minor": 15_000_000, "currency": "COP",
            "reason": "Actualizar plan de prueba", "status": "active", "contract_term": "monthly",
            "trial_days": 0,
        },
    )

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "catalog_price_mismatch"
    assert database.organization_subscriptions.rows[0]["plan_code"] == "custom_legacy"


def test_put_rejects_premium_without_all_three_package_flags():
    client, database = _client(premium_active=True)
    database.organizations.rows[0]["premium_templates_contracted"] = False

    response = client.put(
        "/api/owner/subscriptions/org-a",
        headers={"Authorization": "Bearer test-owner"},
        json={
            "plan_code": "premium", "monthly_amount_minor": 15_000_000, "currency": "COP",
            "reason": "Asignar plan Premium", "status": "active", "contract_term": "monthly",
            "trial_days": 0,
        },
    )

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "premium_package_inactive"
    assert database.organization_subscriptions.rows[0]["plan_code"] == "custom_legacy"
    assert database.organization_subscriptions.rows[0]["monthly_amount_minor"] == 12_500_000


def test_put_preserves_custom_legacy_subscription():
    client, database = _client()

    response = client.put(
        "/api/owner/subscriptions/org-a",
        headers={"Authorization": "Bearer test-owner"},
        json={
            "plan_code": "legacy_customer_rate", "monthly_amount_minor": 12_500_000, "currency": "COP",
            "reason": "Conservar contrato histórico", "status": "active", "contract_term": "monthly",
            "trial_days": 0,
        },
    )

    assert response.status_code == 200
    saved = database.organization_subscriptions.rows[0]
    assert saved["plan_code"] == "legacy_customer_rate"
    assert saved["monthly_amount_minor"] == 12_500_000
    assert saved["pricing_source"] == "custom"
    assert "catalog_version" not in saved


def test_plan_change_uses_catalog_price_and_replays_same_request_id():
    client, database = _client()
    headers = {"Authorization": "Bearer test-owner", "X-Request-ID": "plan-change-0001"}
    payload = {"plan_code": "standard", "effective": "immediate", "reason": "Cambio autorizado a estándar"}

    first = client.post("/api/owner/subscriptions/org-a/plan-change", headers=headers, json=payload)
    replay = client.post("/api/owner/subscriptions/org-a/plan-change", headers=headers, json=payload)

    assert first.status_code == 200
    assert first.json()["monthly_amount_minor"] == 8_000_000
    assert first.json()["catalog_version"] == CATALOG_VERSION
    assert first.json()["pricing_source"] == "catalog"
    assert first.json()["idempotent_replay"] is False
    assert replay.status_code == 200
    assert replay.json()["idempotent_replay"] is True
    assert len(database.subscription_audit_events.rows) == 1


def test_plan_change_rejects_reused_request_id_with_different_payload():
    client, _ = _client()
    headers = {"Authorization": "Bearer test-owner", "X-Request-ID": "plan-change-0002"}
    first = client.post(
        "/api/owner/subscriptions/org-a/plan-change", headers=headers,
        json={"plan_code": "standard", "effective": "immediate", "reason": "Cambio autorizado estándar"},
    )
    replay = client.post(
        "/api/owner/subscriptions/org-a/plan-change", headers=headers,
        json={"plan_code": "standard", "effective": "next_period", "reason": "Cambio autorizado estándar"},
    )

    assert first.status_code == 200
    assert replay.status_code == 409
    assert replay.json()["detail"]["code"] == "idempotency_key_conflict"


def test_premium_plan_requires_all_three_entitlement_flags():
    client, database = _client(premium_active=False)

    response = client.post(
        "/api/owner/subscriptions/org-a/plan-change",
        headers={"Authorization": "Bearer test-owner", "X-Request-ID": "plan-change-0003"},
        json={"plan_code": "premium", "effective": "immediate", "reason": "Cambio solicitado a premium"},
    )

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "premium_package_inactive"
    assert database.organization_subscriptions.rows[0]["plan_code"] == "custom_legacy"
    assert not database.subscription_audit_events.rows


def test_plan_change_returns_404_when_subscription_is_missing():
    client, _ = _client(with_subscription=False)

    response = client.post(
        "/api/owner/subscriptions/org-a/plan-change",
        headers={"Authorization": "Bearer test-owner", "X-Request-ID": "plan-change-0004"},
        json={"plan_code": "standard", "effective": "immediate", "reason": "Cambio autorizado estándar"},
    )

    assert response.status_code == 404
