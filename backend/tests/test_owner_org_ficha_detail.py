"""Regression for plan PR 15: the organization ficha detail endpoint now
embeds subscription + Premium status server-side (one call) instead of the
frontend making three separate client-side requests.
"""
from copy import deepcopy
from types import SimpleNamespace
import sys
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from owner_third_party_matrix import build_third_party_matrix_router


class MemoryCursor:
    def __init__(self, rows):
        self.rows = rows

    def sort(self, *_args, **_kwargs):
        return self

    async def to_list(self, length):
        return deepcopy(self.rows[:length])


class MemoryCollection:
    def __init__(self, rows=()):
        self.rows = [deepcopy(row) for row in rows]

    def _matches(self, query):
        return [
            row for row in self.rows
            if all(row.get(key) == value for key, value in query.items())
        ]

    async def find_one(self, query, projection=None, sort=None):
        matches = self._matches(_flatten(query))
        if not matches:
            return None
        if sort:
            key, direction = sort[0]
            matches.sort(key=lambda row: row.get(key) or "", reverse=direction < 0)
        return deepcopy(matches[0])

    def find(self, query, projection=None):
        return MemoryCursor(self._matches(_flatten(query)))


def _flatten(query):
    # Only the "$in" shape actually used by third_party_detail's own
    # premium_plan_requests lookup needs handling here.
    flat = {}
    for key, value in query.items():
        if isinstance(value, dict) and "$in" in value:
            continue  # matched separately below
        flat[key] = value
    return flat


def _app_for(subscription=None, premium_requests=()):
    organizations = MemoryCollection([{"organization_id": "org-a", "name": "Org A"}])
    profiles = MemoryCollection([])
    people = MemoryCollection([
        {"user_id": "u1", "organization_id": "org-a", "name": "Ana", "role": "manager"},
    ])
    audits = MemoryCollection([])
    subscriptions = MemoryCollection([subscription] if subscription else [])

    class PremiumRequests(MemoryCollection):
        async def find_one(self, query, projection=None, sort=None):
            allowed_statuses = query.get("status", {}).get("$in")
            matches = [
                row for row in self.rows
                if row.get("organization_id") == query.get("organization_id")
                and (allowed_statuses is None or row.get("status") in allowed_statuses)
            ]
            if not matches:
                return None
            if sort:
                key, direction = sort[0]
                matches.sort(key=lambda row: row.get(key) or "", reverse=direction < 0)
            return deepcopy(matches[0])

    database = SimpleNamespace(
        organizations=organizations,
        organization_billing_profiles=profiles,
        users=people,
        organization_billing_profile_audits=audits,
        organization_subscriptions=subscriptions,
        premium_plan_requests=PremiumRequests(premium_requests),
    )

    async def get_current_user(authorization, session_token):
        if authorization == "Bearer unauthenticated":
            raise HTTPException(status_code=401, detail="Not authenticated")
        return SimpleNamespace(role="owner", access_status="approved", user_id="owner-1")

    app = FastAPI()
    app.include_router(build_third_party_matrix_router(database, get_current_user), prefix="/api")
    return TestClient(app)


def test_detail_embeds_subscription_and_premium_status_in_one_call():
    client = _app_for(
        subscription={"organization_id": "org-a", "status": "suspended", "manual_access_blocked": True},
        premium_requests=[{"organization_id": "org-a", "status": "active", "created_at": "2026-09-01"}],
    )

    response = client.get("/api/owner/third-party-matrix/org-a")

    assert response.status_code == 200
    body = response.json()
    assert body["subscription"]["status"] == "suspended"
    assert body["subscription"]["manual_access_blocked"] is True
    assert body["premium_status"] == "active"


def test_detail_defaults_when_no_subscription_or_premium_request_exist():
    client = _app_for(subscription=None, premium_requests=[])

    response = client.get("/api/owner/third-party-matrix/org-a")

    assert response.status_code == 200
    body = response.json()
    assert body["subscription"] is None
    assert body["premium_status"] == "not_requested"


def test_detail_ignores_a_rejected_premium_request_same_as_the_old_default_listing():
    # list_premium_requests() without an explicit status filter only ever
    # returns pending/active rows -- a rejected request must not surface here
    # either, matching that existing default exactly.
    client = _app_for(
        subscription=None,
        premium_requests=[{"organization_id": "org-a", "status": "rejected", "created_at": "2026-09-01"}],
    )

    response = client.get("/api/owner/third-party-matrix/org-a")

    assert response.json()["premium_status"] == "not_requested"
