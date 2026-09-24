"""HTTP contract tests for Owner notifications scoped to one organization."""
from copy import deepcopy
from types import SimpleNamespace
import sys
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from owner_billing_hub import build_billing_hub_router


class MemoryCursor:
    def __init__(self, rows):
        self.rows = rows

    def sort(self, key, direction):
        self.rows.sort(key=lambda row: row.get(key) or "", reverse=direction < 0)
        return self

    async def to_list(self, length):
        return deepcopy(self.rows[:length])


class MemoryCollection:
    def __init__(self, rows=()):
        self.rows = [deepcopy(row) for row in rows]

    async def find_one(self, query, projection=None):
        for row in self.rows:
            if all(row.get(key) == value for key, value in query.items()):
                return deepcopy(row)
        return None

    def find(self, query, projection=None):
        matching = [
            deepcopy(row)
            for row in self.rows
            if all(row.get(key) == value for key, value in query.items())
        ]
        return MemoryCursor(matching)


def _app_for(role="owner", access_status="approved"):
    organizations = MemoryCollection([
        {"organization_id": "org-a"},
        {"organization_id": "org-b"},
    ])
    notices = [
        {
            "_id": f"mongo-{index}",
            "notification_id": f"notice-{index}",
            "organization_id": "org-a" if index < 205 else "org-b",
            "event_type": "owner_announcement",
            "created_at": f"2026-09-{(index % 28) + 1:02d}T10:00:00+00:00",
            "title": f"Aviso {index}",
        }
        for index in range(206)
    ]
    database = SimpleNamespace(
        organizations=organizations,
        subscription_notifications=MemoryCollection(notices),
    )

    async def get_current_user(authorization, session_token):
        if authorization == "Bearer unauthenticated":
            raise HTTPException(status_code=401, detail="Not authenticated")
        return SimpleNamespace(
            role=role,
            access_status=access_status,
            user_id="user-owner-test",
            organization_id="org-b",
        )

    app = FastAPI()
    app.include_router(build_billing_hub_router(database, get_current_user), prefix="/api")
    return TestClient(app), database


def test_owner_notifications_are_limited_to_requested_organization():
    client, _ = _app_for()

    response = client.get("/api/owner/billing/organizations/org-a/notifications?limit=3")

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 3
    assert all(item["organization_id"] == "org-a" for item in body)
    assert all("_id" not in item for item in body)
    assert [item["created_at"] for item in body] == sorted(
        (item["created_at"] for item in body), reverse=True
    )


def test_owner_notification_limit_is_capped_at_200():
    client, _ = _app_for()

    response = client.get("/api/owner/billing/organizations/org-a/notifications?limit=999")

    assert response.status_code == 200
    assert len(response.json()) == 200


def test_unapproved_or_non_owner_cannot_read_owner_notifications():
    for role, status in (("manager", "approved"), ("owner", "pending")):
        client, _ = _app_for(role=role, access_status=status)
        response = client.get("/api/owner/billing/organizations/org-a/notifications")
        assert response.status_code == 403


def test_missing_organization_returns_404():
    client, _ = _app_for()

    response = client.get("/api/owner/billing/organizations/missing/notifications")

    assert response.status_code == 404


def test_manager_notifications_route_keeps_its_existing_organization_scope():
    client, _ = _app_for(role="manager")

    response = client.get("/api/billing/notifications")

    assert response.status_code == 200
    assert response.json()
    assert all(item["organization_id"] == "org-b" for item in response.json())
