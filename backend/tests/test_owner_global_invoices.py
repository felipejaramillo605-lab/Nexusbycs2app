"""HTTP contract tests for the global (cross-organization) invoices list
endpoint (plan PR 17). Same in-memory-fake-collection pattern as
test_billing_summary.py, extended with sort/skip/limit/count_documents and a
minimal dotted-path + $regex/$or matcher since this endpoint searches and
paginates instead of just aggregating everything in one pass.
"""

import re
import sys
from copy import deepcopy
from pathlib import Path
from types import SimpleNamespace

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from owner_subscriptions import build_subscription_router  # noqa: E402


def _get(row, dotted_key):
    value = row
    for part in dotted_key.split("."):
        if not isinstance(value, dict):
            return None
        value = value.get(part)
    return value


def _matches(row, query):
    for key, condition in query.items():
        if key == "$or":
            if not any(_matches(row, clause) for clause in condition):
                return False
            continue
        actual = _get(row, key)
        if isinstance(condition, dict) and "$regex" in condition:
            flags = re.IGNORECASE if condition.get("$options") == "i" else 0
            if not actual or not re.search(condition["$regex"], str(actual), flags):
                return False
        elif isinstance(condition, dict) and "$exists" in condition:
            if (key in row) != condition["$exists"]:
                return False
        elif actual != condition:
            return False
    return True


class FakeCursor:
    def __init__(self, rows):
        self.rows = rows

    def sort(self, *_args, **_kwargs):
        return self

    def skip(self, n):
        self.rows = self.rows[n:]
        return self

    def limit(self, n):
        self.rows = self.rows[:n]
        return self

    async def to_list(self, length):
        return [deepcopy(r) for r in self.rows[:length]]


class FakeCollection:
    def __init__(self, *rows):
        self.rows = [dict(r) for r in rows]

    def find(self, query=None, projection=None):
        query = query or {}
        return FakeCursor([r for r in self.rows if _matches(r, query)])

    async def count_documents(self, query=None):
        query = query or {}
        return len([r for r in self.rows if _matches(r, query)])


def _invoice(**overrides):
    base = {
        "invoice_id": "inv-1",
        "invoice_number": "NEX-0001",
        "organization_id": "org-1",
        "status": "pending",
        "amount_minor": 8_000_000,
        "paid_amount_minor": 0,
        "currency": "COP",
        "due_at": "2026-09-10T00:00:00+00:00",
        "issued_at": "2026-09-01T00:00:00+00:00",
        "period_start": "2026-09-01T00:00:00+00:00",
        "period_end": "2026-09-30T00:00:00+00:00",
        "buyer_snapshot": {"organization_name": "Org Uno", "legal_name": "Org Uno SAS"},
        "created_at": "2026-09-01T00:00:00+00:00",
    }
    base.update(overrides)
    return base


def _client(role="owner", invoices=None):
    database = SimpleNamespace(subscription_invoices=invoices or FakeCollection())

    async def get_current_user(authorization, session_token):
        if authorization != "Bearer test-owner":
            raise HTTPException(status_code=401, detail="Not authenticated")
        return SimpleNamespace(role=role, access_status="approved", user_id="user-owner-test")

    app = FastAPI()
    app.include_router(build_subscription_router(database, get_current_user), prefix="/api")
    return TestClient(app)


def _list(client, **params):
    return client.get(
        "/api/owner/billing/invoices", params=params, headers={"Authorization": "Bearer test-owner"}
    )


def test_lists_invoices_across_organizations_with_pagination():
    client = _client(
        invoices=FakeCollection(
            _invoice(invoice_id="inv-1", organization_id="org-1"),
            _invoice(invoice_id="inv-2", organization_id="org-2"),
        )
    )

    response = _list(client, page=1, page_size=25)

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 2
    assert {item["organization_id"] for item in body["items"]} == {"org-1", "org-2"}
    assert body["items"][0]["buyer_snapshot"]["organization_name"] == "Org Uno"


def test_filters_by_status():
    client = _client(
        invoices=FakeCollection(
            _invoice(invoice_id="inv-1", status="pending"),
            _invoice(invoice_id="inv-2", status="paid"),
        )
    )

    response = _list(client, status="paid")

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["invoice_id"] == "inv-2"


def test_invoice_type_premium_surcharge_filters_to_only_surcharge_invoices():
    client = _client(
        invoices=FakeCollection(
            _invoice(invoice_id="inv-regular"),
            _invoice(invoice_id="inv-surcharge", invoice_type="premium_surcharge"),
        )
    )

    response = _list(client, invoice_type="premium_surcharge")

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["invoice_id"] == "inv-surcharge"


def test_default_listing_with_no_invoice_type_filter_includes_both_kinds():
    client = _client(
        invoices=FakeCollection(
            _invoice(invoice_id="inv-regular"),
            _invoice(invoice_id="inv-surcharge", invoice_type="premium_surcharge"),
        )
    )

    response = _list(client)

    assert response.status_code == 200
    assert response.json()["total"] == 2


def test_search_matches_organization_name_or_invoice_number():
    client = _client(
        invoices=FakeCollection(
            _invoice(invoice_id="inv-1", invoice_number="NEX-0001", buyer_snapshot={"organization_name": "Barbería Central", "legal_name": "Central SAS"}),
            _invoice(invoice_id="inv-2", invoice_number="NEX-0002", buyer_snapshot={"organization_name": "Otra Org", "legal_name": "Otra SAS"}),
        )
    )

    response = _list(client, search="central")

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["invoice_id"] == "inv-1"


def test_pagination_metadata_reflects_page_size():
    client = _client(
        invoices=FakeCollection(*(_invoice(invoice_id=f"inv-{i}") for i in range(5)))
    )

    response = _list(client, page=2, page_size=2)

    assert response.status_code == 200
    body = response.json()
    assert body["page"] == 2
    assert body["total_pages"] == 3
    assert body["has_previous"] is True
    assert body["has_next"] is True
    assert len(body["items"]) == 2


def test_rejects_an_unsupported_status():
    client = _client()

    response = _list(client, status="not-a-real-status")

    assert response.status_code == 400


def test_is_owner_only():
    client = _client(role="manager")

    response = _list(client)

    assert response.status_code == 403
