"""Tests for the unified audit contract (plan PR 21): record_audit_event()
writes the new envelope, and the read endpoint merges it with the three
legacy sources (db.audit_events' user_account slice, subscription_audit_events,
organization_billing_profile_audits, and the capability grant audit chain).
"""

import sys
from pathlib import Path
from types import SimpleNamespace

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from audit_contracts import build_audit_log_router, record_audit_event, CATEGORIES  # noqa: E402


def _matches(row, query):
    return all(row.get(key) == value for key, value in query.items())


class FakeCursor:
    def __init__(self, rows):
        self.rows = rows

    def sort(self, *_args, **_kwargs):
        return self

    async def to_list(self, length):
        return [dict(r) for r in self.rows[:length]]


class FakeCollection:
    def __init__(self, *rows):
        self.rows = [dict(r) for r in rows]

    def find(self, query=None, projection=None):
        query = query or {}
        return FakeCursor([r for r in self.rows if _matches(r, query)])

    async def find_one(self, query=None, projection=None):
        query = query or {}
        for row in self.rows:
            if _matches(row, query):
                return dict(row)
        return None

    async def insert_one(self, doc):
        self.rows.append(dict(doc))
        return SimpleNamespace(inserted_id=doc.get("audit_id"))

    async def create_index(self, *_args, **_kwargs):
        return None


def _capability_authority_collection(events):
    return FakeCollection({"audit_events": events})


def _database(**collections):
    defaults = dict(
        platform_audit_log=FakeCollection(),
        audit_events=FakeCollection(),
        subscription_audit_events=FakeCollection(),
        organization_billing_profile_audits=FakeCollection(),
        platform_capability_authority=_capability_authority_collection([]),
    )
    defaults.update(collections)
    return SimpleNamespace(**defaults)


def _client(database, role="owner"):
    async def get_current_user(authorization, session_token):
        if authorization != "Bearer test-owner":
            raise HTTPException(status_code=401, detail="Not authenticated")
        return SimpleNamespace(role=role, access_status="approved", user_id="owner-1")

    app = FastAPI()
    app.include_router(build_audit_log_router(database, get_current_user), prefix="/api")
    return TestClient(app)


def _list(client, **params):
    return client.get("/api/owner/audit/events", params=params, headers={"Authorization": "Bearer test-owner"})


async def _async_test_record_writes_the_contract_envelope():
    database = _database()
    event = await record_audit_event(
        database,
        category="account",
        event_type="user_role_updated",
        actor_user_id="owner-1",
        organization_id="org-1",
        entity_type="user_account",
        entity_id="user-2",
        new_value={"role": "manager"},
    )
    assert event["category"] == "account"
    assert event["audit_id"].startswith("paud_")
    assert database.platform_audit_log.rows[0]["event_type"] == "user_role_updated"


def test_record_writes_the_contract_envelope():
    import asyncio

    asyncio.run(_async_test_record_writes_the_contract_envelope())


def test_record_rejects_an_unknown_category():
    import asyncio

    async def _run():
        database = _database()
        try:
            await record_audit_event(database, category="not-a-real-category", event_type="x", actor_user_id="owner-1")
            assert False, "expected ValueError"
        except ValueError:
            pass

    asyncio.run(_run())


def test_lists_events_merged_across_sources_sorted_by_created_at():
    database = _database(
        platform_audit_log=FakeCollection(
            {
                "audit_id": "paud_1",
                "category": "account",
                "event_type": "user_role_updated",
                "actor_user_id": "owner-1",
                "organization_id": "org-1",
                "entity_type": "user_account",
                "entity_id": "u2",
                "reason": None,
                "previous_value": None,
                "new_value": {"role": "manager"},
                "metadata": {},
                "created_at": "2026-09-28T12:00:00+00:00",
            },
        ),
        subscription_audit_events=FakeCollection(
            {
                "audit_event_id": "saudit_1",
                "organization_id": "org-1",
                "event_type": "invoice_created",
                "entity_type": "invoice",
                "entity_id": "inv-1",
                "actor_user_id": "owner-1",
                "previous_value": None,
                "new_value": {},
                "reason": "Monthly invoice",
                "created_at": "2026-09-28T11:00:00+00:00",
            },
        ),
    )
    client = _client(database)

    response = _list(client)

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 2
    # Most recent first across BOTH sources.
    assert [item["category"] for item in body["items"]] == ["account", "billing"]


def test_category_filter_excludes_other_sources():
    database = _database(
        platform_audit_log=FakeCollection(
            {
                "audit_id": "paud_1",
                "category": "account",
                "event_type": "x",
                "actor_user_id": "owner-1",
                "organization_id": None,
                "entity_type": None,
                "entity_id": None,
                "reason": None,
                "previous_value": None,
                "new_value": None,
                "metadata": {},
                "created_at": "2026-09-28T12:00:00+00:00",
            },
        ),
        subscription_audit_events=FakeCollection(
            {
                "audit_event_id": "saudit_1",
                "organization_id": "org-1",
                "event_type": "invoice_created",
                "entity_type": "invoice",
                "entity_id": "inv-1",
                "actor_user_id": "owner-1",
                "previous_value": None,
                "new_value": {},
                "reason": None,
                "created_at": "2026-09-28T11:00:00+00:00",
            },
        ),
    )
    client = _client(database)

    response = _list(client, category="billing")

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["category"] == "billing"


def test_account_source_never_mixes_in_unrelated_audit_events_entity_types():
    # db.audit_events is also written by inventory/procurement/professional
    # media/support/transactions -- confirms those rows never leak into the
    # "account" category just because they share the same physical collection.
    database = _database(
        audit_events=FakeCollection(
            {
                "audit_id": "a1",
                "organization_id": "org-1",
                "event_type": "user_role_updated",
                "entity_type": "user_account",
                "entity_id": "u2",
                "actor_user_id": "owner-1",
                "previous_value": None,
                "new_value": {"role": "manager"},
                "created_at": "2026-09-28T10:00:00+00:00",
            },
            {
                "audit_id": "a2",
                "organization_id": "org-1",
                "event_type": "purchase_order_auto_generated",
                "entity_type": "purchase_order",
                "entity_id": "po-1",
                "actor_user_id": "owner-1",
                "previous_value": None,
                "new_value": {},
                "created_at": "2026-09-28T10:05:00+00:00",
            },
        ),
    )
    client = _client(database)

    response = _list(client, category="account")

    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["entity_type"] == "user_account"


def test_capability_events_are_skipped_when_filtering_by_organization():
    database = _database(
        platform_capability_authority=_capability_authority_collection(
            [
                {
                    "event_id": "pcau_1",
                    "type": "granted",
                    "actor_user_id": "owner-1",
                    "target_user_id": "owner-2",
                    "organization_id": None,
                    "before": None,
                    "after": {"active": True},
                    "reason": "Bootstrap",
                    "created_at": "2026-09-28T09:00:00+00:00",
                },
            ]
        ),
    )
    client = _client(database)

    response = _list(client, organization_id="org-1")

    assert response.json()["total"] == 0


def test_capability_events_appear_when_not_scoped_to_an_organization():
    database = _database(
        platform_capability_authority=_capability_authority_collection(
            [
                {
                    "event_id": "pcau_1",
                    "type": "granted",
                    "actor_user_id": "owner-1",
                    "target_user_id": "owner-2",
                    "organization_id": None,
                    "before": None,
                    "after": {"active": True},
                    "reason": "Bootstrap",
                    "created_at": "2026-09-28T09:00:00+00:00",
                },
            ]
        ),
    )
    client = _client(database)

    response = _list(client, category="capability")

    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["category"] == "capability"


def test_rejects_an_unsupported_category():
    database = _database()
    client = _client(database)

    response = _list(client, category="not-a-real-category")

    assert response.status_code == 400


def test_is_owner_only():
    database = _database()
    client = _client(database, role="manager")

    response = _list(client)

    assert response.status_code == 403
