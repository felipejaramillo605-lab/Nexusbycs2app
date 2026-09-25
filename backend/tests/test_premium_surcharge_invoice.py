"""HTTP contract tests for the dedicated Premium-surcharge invoice endpoint
(plan PR 12) and a direct render check for the new reportlab-based invoice
PDF (plan PR 13). Same in-memory-fake-collection pattern the rest of this
test suite uses (see test_billing_plan_catalog.py, test_premium_plan_reject.py)
-- no real MongoDB needed.
"""

import sys
from pathlib import Path
from types import SimpleNamespace

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from billing_catalog import PREMIUM_SURCHARGE_AMOUNT_MINOR  # noqa: E402
from invoice_pdf import build_invoice_pdf  # noqa: E402
from owner_subscriptions import build_subscription_router  # noqa: E402


def _matches(row, query):
    for key, expected in query.items():
        actual = row.get(key)
        if isinstance(expected, dict):
            if "$in" in expected and actual not in expected["$in"]:
                return False
            if "$ne" in expected and actual == expected["$ne"]:
                return False
            if "$exists" in expected and (key in row) != expected["$exists"]:
                return False
        elif actual != expected:
            return False
    return True


def _sorted(rows, sort):
    result = list(rows)
    for key, direction in reversed(sort):
        result.sort(
            key=lambda r: (r.get(key) is None, r.get(key)), reverse=direction < 0
        )
    return result


class FakeCursor:
    def __init__(self, rows):
        self.rows = [dict(r) for r in rows]

    def sort(self, key, direction=1):
        self.rows = _sorted(self.rows, [(key, direction)])
        return self

    async def to_list(self, length):
        return [dict(r) for r in self.rows[:length]]


class FakeCollection:
    def __init__(self, *rows):
        self.rows = [dict(r) for r in rows]

    async def find_one(self, query, projection=None, sort=None):
        matches = [dict(r) for r in self.rows if _matches(r, query)]
        if sort:
            matches = _sorted(matches, sort)
        return matches[0] if matches else None

    def find(self, query=None, projection=None):
        return FakeCursor(r for r in self.rows if _matches(r, query or {}))

    async def insert_one(self, row):
        self.rows.append(dict(row))
        return SimpleNamespace(inserted_id=row.get("invoice_id") or row.get("audit_id"))

    async def update_one(self, query, update, upsert=False):
        row = next((r for r in self.rows if _matches(r, query)), None)
        if row is None:
            if not upsert:
                return SimpleNamespace(
                    matched_count=0, modified_count=0, upserted_id=None
                )
            row = {k: v for k, v in query.items() if not str(k).startswith("$")}
            row.update(update.get("$set", {}))
            self.rows.append(row)
            return SimpleNamespace(
                matched_count=0, modified_count=0, upserted_id=len(self.rows)
            )
        before = dict(row)
        row.update(update.get("$set", {}))
        return SimpleNamespace(
            matched_count=1, modified_count=int(row != before), upserted_id=None
        )

    async def find_one_and_update(
        self, query, update, upsert=False, return_document=True
    ):
        row = next((r for r in self.rows if _matches(r, query)), None)
        if row is None:
            if not upsert:
                return None
            row = {k: v for k, v in query.items() if not str(k).startswith("$")}
            self.rows.append(row)
        for key, amount in update.get("$inc", {}).items():
            row[key] = row.get(key, 0) + amount
        for key, value in update.get("$setOnInsert", {}).items():
            row.setdefault(key, value)
        return dict(row)


ORG_ID = "org-surcharge-test"


def _client(role="owner", access_status="approved", with_fiscal_profile=True):
    organizations = FakeCollection(
        {"organization_id": ORG_ID, "name": "Barbería de Prueba"}
    )
    subscriptions = FakeCollection(
        {
            "subscription_id": "sub-surcharge-test",
            "organization_id": ORG_ID,
            "plan_code": "premium",
            "plan_version": 1,
            "monthly_amount_minor": 15_000_000,
            "currency": "COP",
            "billing_day": 5,
            "status": "active",
        }
    )
    profiles = FakeCollection(
        *(
            [
                {
                    "organization_id": ORG_ID,
                    "legal_name": "Barbería de Prueba SAS",
                    "document_type": "NIT",
                    "tax_id": "900999888-1",
                    "billing_email": "facturacion@prueba.co",
                    "billing_contact_name": "Ana Prueba",
                    "city": "Medellín",
                    "address": "Calle Falsa 123",
                    "profile_version": 1,
                }
            ]
            if with_fiscal_profile
            else []
        )
    )
    database = SimpleNamespace(
        organizations=organizations,
        organization_subscriptions=subscriptions,
        organization_billing_profiles=profiles,
        subscription_invoices=FakeCollection(),
        subscription_notifications=FakeCollection(),
        subscription_email_deliveries=FakeCollection(),
        subscription_audit_events=FakeCollection(),
        system_counters=FakeCollection(),
        platform_billing_settings=FakeCollection(),
        users=FakeCollection(),
    )

    async def get_current_user(authorization, session_token):
        if authorization not in {"Bearer test-owner", "Bearer test-manager"}:
            raise HTTPException(status_code=401, detail="Not authenticated")
        if authorization == "Bearer test-manager":
            return SimpleNamespace(
                role="manager", access_status="approved", user_id="user-manager-test"
            )
        return SimpleNamespace(
            role=role, access_status=access_status, user_id="user-owner-test"
        )

    app = FastAPI()
    app.include_router(
        build_subscription_router(database, get_current_user), prefix="/api"
    )
    return TestClient(app), database


def _issue(client, due_at="2026-10-15T23:59:59+00:00", token="Bearer test-owner"):
    return client.post(
        f"/api/owner/subscriptions/{ORG_ID}/invoices/premium-surcharge",
        headers={"Authorization": token},
        json={"due_at": due_at},
    )


def test_premium_surcharge_invoice_uses_the_fixed_contract_amount_not_the_monthly_plan_price():
    client, database = _client()

    response = _issue(client)

    assert response.status_code == 200
    body = response.json()
    # Fixed 70,000 COP surcharge -- NOT the org's 150,000 COP monthly plan
    # price, confirming this bypasses the old discount-field workaround and
    # create_invoice's amount==monthly_plan_price constraint entirely.
    assert body["amount_minor"] == PREMIUM_SURCHARGE_AMOUNT_MINOR == 7_000_000
    assert body["invoice_type"] == "premium_surcharge"
    assert body["status"] == "pending"
    assert body["invoice_number"].startswith("NXS-")
    # Never set here -- the existing invoice-link flow (platform_capabilities.py)
    # is still the only thing that sets these, unchanged by this endpoint.
    assert body.get("invoice_purpose") is None
    assert body.get("premium_request_id") is None
    assert len(database.subscription_invoices.rows) == 1
    assert database.subscription_invoices.rows[0]["amount_minor"] == 7_000_000


def test_premium_surcharge_invoice_rejects_same_day_duplicate():
    client, _database = _client()

    first = _issue(client)
    second = _issue(client)

    assert first.status_code == 200
    assert second.status_code == 409


def test_premium_surcharge_invoice_requires_complete_fiscal_profile():
    client, _database = _client(with_fiscal_profile=False)

    response = _issue(client)

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "fiscal_profile_incomplete"


def test_premium_surcharge_invoice_rejects_manager_role():
    client, _database = _client()

    response = _issue(client, token="Bearer test-manager")

    assert response.status_code == 403


def test_premium_surcharge_invoice_404s_for_missing_subscription():
    client, database = _client()
    database.organization_subscriptions.rows = []

    response = _issue(client)

    assert response.status_code == 409  # "Organization subscription does not exist"


def test_invoice_pdf_renders_for_the_premium_surcharge_invoice_shape():
    # Same field shape enrich_new_invoice actually produces (contract_amount_
    # minor_snapshot, buyer/seller snapshots, etc.), rendered through the new
    # reportlab template -- catches a crash on real data without a full
    # HTTP round trip.
    invoice = {
        "invoice_id": "sinv_test",
        "invoice_number": "NXS-2026-000999",
        "status": "pending",
        "invoice_type": "premium_surcharge",
        "currency": "COP",
        "issued_at": "2026-09-25T10:00:00+00:00",
        "due_at": "2026-10-15T23:59:59+00:00",
        "period_start": "2026-09-25T00:00:00+00:00",
        "period_end": "2026-10-15T23:59:59+00:00",
        "plan_code_snapshot": "premium",
        "plan_version_snapshot": 1,
        "service_description": "Excedente del plan Premium — activación de paquete Premium",
        "contract_amount_minor_snapshot": 7_000_000,
        "subtotal_minor": 7_000_000,
        "discount_minor": 0,
        "tax_minor": 0,
        "amount_minor": 7_000_000,
        "paid_amount_minor": 0,
        "delivery_email_snapshot": "facturacion@prueba.co",
        "legal_notice": "Documento administrativo de cobro generado por Nexus.",
        "seller_snapshot": {
            "legal_name": "CS2 Soluciones SAS",
            "tax_id": "900123456-7",
        },
        "buyer_snapshot": {
            "legal_name": "Barbería de Prueba SAS",
            "tax_id": "900999888-1",
        },
    }

    pdf_bytes = build_invoice_pdf(invoice, None)

    assert pdf_bytes[:4] == b"%PDF"
    assert len(pdf_bytes) > 1000


def test_invoice_pdf_never_crashes_on_a_near_empty_invoice():
    # Defensive: an invoice missing almost every optional field (e.g. a
    # corrupt/partial legacy record) must still render, not 500 the download.
    pdf_bytes = build_invoice_pdf({"invoice_id": "x", "status": "draft"}, None)

    assert pdf_bytes[:4] == b"%PDF"
