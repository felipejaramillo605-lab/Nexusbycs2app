"""HTTP contract tests for the global Cartera summary endpoint (plan PR 14).

Same in-memory-fake-collection pattern as test_billing_plan_catalog.py.
"""

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from owner_subscriptions import build_subscription_router  # noqa: E402


class FakeCollection:
    def __init__(self, *rows):
        self.rows = [dict(r) for r in rows]

    async def find_one(self, query, projection=None):
        for row in self.rows:
            if all(row.get(k) == v for k, v in query.items()):
                return dict(row)
        return None

    class _Cursor:
        def __init__(self, rows):
            self.rows = rows

        async def to_list(self, length):
            return [dict(r) for r in self.rows[:length]]

    def find(self, query=None, projection=None):
        query = query or {}
        matched = []
        for row in self.rows:
            ok = True
            for key, value in query.items():
                if isinstance(value, dict) and "$in" in value:
                    if row.get(key) not in value["$in"]:
                        ok = False
                        break
                elif row.get(key) != value:
                    ok = False
                    break
            if ok:
                matched.append(row)
        return self._Cursor(matched)


def _iso_days_ago(days):
    return (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()


def _client(role="owner", invoices=None):
    database = SimpleNamespace(subscription_invoices=invoices or FakeCollection())

    async def get_current_user(authorization, session_token):
        if authorization != "Bearer test-owner":
            raise HTTPException(status_code=401, detail="Not authenticated")
        return SimpleNamespace(
            role=role, access_status="approved", user_id="user-owner-test"
        )

    app = FastAPI()
    app.include_router(
        build_subscription_router(database, get_current_user), prefix="/api"
    )
    return TestClient(app)


def _get_summary(client):
    return client.get(
        "/api/owner/billing/summary", headers={"Authorization": "Bearer test-owner"}
    )


def test_summary_is_zeroed_out_with_no_pending_invoices():
    client = _client(
        invoices=FakeCollection(
            {
                "organization_id": "org-1",
                "status": "paid",
                "amount_minor": 15_000_000,
                "currency": "COP",
                "due_at": _iso_days_ago(5),
            },
            {
                "organization_id": "org-2",
                "status": "void",
                "amount_minor": 8_000_000,
                "currency": "COP",
                "due_at": _iso_days_ago(5),
            },
        )
    )

    response = _get_summary(client)

    assert response.status_code == 200
    body = response.json()
    assert body["total_pending_minor"] == 0
    assert body["organizations_with_balance"] == 0
    assert body["invoice_count"] == 0
    assert all(bucket["total_minor"] == 0 for bucket in body["buckets"].values())


def test_summary_sums_pending_balance_across_organizations_and_buckets_by_age():
    client = _client(
        invoices=FakeCollection(
            {
                "organization_id": "org-1",
                "status": "pending",
                "amount_minor": 10_000_000,
                "currency": "COP",
                "due_at": _iso_days_ago(-5),
            },
            {
                "organization_id": "org-1",
                "status": "overdue",
                "amount_minor": 5_000_000,
                "currency": "COP",
                "due_at": _iso_days_ago(15),
            },
            {
                "organization_id": "org-2",
                "status": "overdue",
                "amount_minor": 3_000_000,
                "currency": "COP",
                "due_at": _iso_days_ago(45),
            },
            {
                "organization_id": "org-3",
                "status": "issued",
                "amount_minor": 2_000_000,
                "currency": "COP",
                "due_at": _iso_days_ago(90),
            },
            {
                "organization_id": "org-3",
                "status": "paid",
                "amount_minor": 99_000_000,
                "currency": "COP",
                "due_at": _iso_days_ago(90),
            },
        )
    )

    response = _get_summary(client)

    assert response.status_code == 200
    body = response.json()
    # Excludes the paid invoice -- 10 + 5 + 3 + 2 = 20 million, not 119 million.
    assert body["total_pending_minor"] == 20_000_000
    assert body["organizations_with_balance"] == 3
    assert body["invoice_count"] == 4
    assert body["buckets"]["current"] == {"total_minor": 10_000_000, "count": 1}
    assert body["buckets"]["d1_30"] == {"total_minor": 5_000_000, "count": 1}
    assert body["buckets"]["d31_60"] == {"total_minor": 3_000_000, "count": 1}
    assert body["buckets"]["d60_plus"] == {"total_minor": 2_000_000, "count": 1}


def test_summary_is_owner_only():
    client = _client(role="manager")

    response = _get_summary(client)

    assert response.status_code == 403


def test_summary_handles_a_missing_or_malformed_due_at_without_crashing():
    client = _client(
        invoices=FakeCollection(
            {
                "organization_id": "org-1",
                "status": "pending",
                "amount_minor": 1_000_000,
                "currency": "COP",
                "due_at": None,
            },
            {
                "organization_id": "org-2",
                "status": "pending",
                "amount_minor": 1_000_000,
                "currency": "COP",
                "due_at": "not-a-date",
            },
        )
    )

    response = _get_summary(client)

    assert response.status_code == 200
    body = response.json()
    # Both fall back to "today" (no crash), landing in the current bucket.
    assert body["buckets"]["current"]["count"] == 2
    assert body["total_pending_minor"] == 2_000_000
