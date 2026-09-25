"""HTTP regressions for Owner access-session administration."""
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from owner_access_sessions import build_owner_access_sessions_router  # noqa: E402


def _matches(row, query):
    for key, expected in query.items():
        actual = row.get(key)
        if isinstance(expected, dict):
            if "$gt" in expected and not (actual and actual > expected["$gt"]):
                return False
            if "$exists" in expected and ((key in row) is not expected["$exists"]):
                return False
        elif actual != expected:
            return False
    return True


class Cursor:
    def __init__(self, rows):
        self.rows = [dict(row) for row in rows]

    async def to_list(self, length):
        return self.rows[:length]


class Collection:
    def __init__(self, rows=()):
        self.rows = [dict(row) for row in rows]

    async def find_one(self, query, *_args, **_kwargs):
        row = next((row for row in self.rows if _matches(row, query)), None)
        return dict(row) if row else None

    def find(self, query, *_args, **_kwargs):
        return Cursor(row for row in self.rows if _matches(row, query))

    async def count_documents(self, query):
        return sum(_matches(row, query) for row in self.rows)

    async def delete_many(self, query):
        kept = [row for row in self.rows if not _matches(row, query)]
        deleted = len(self.rows) - len(kept)
        self.rows = kept
        return SimpleNamespace(deleted_count=deleted)

    async def insert_one(self, row):
        self.rows.append(dict(row))

    async def update_one(self, query, update, upsert=False):
        row = next((row for row in self.rows if _matches(row, query)), None)
        if row is None and upsert:
            row = {**query, **update.get("$setOnInsert", {})}
            self.rows.append(row)
        elif row:
            row.update(update.get("$set", {}))


class Database:
    def __init__(self, users=(), sessions=(), client_sessions=()):
        self.users = Collection(users)
        self.user_sessions = Collection(sessions)
        self.client_sessions = Collection(client_sessions)
        self.owner_access_session_operations = Collection()


@pytest.fixture
def setup(monkeypatch):
    monkeypatch.setenv("SECURITY_OBSERVABILITY_KEY", "test-security-key-" + "x" * 32)
    now = datetime.now(timezone.utc)
    db = Database(
        users=[
            {"user_id": "owner-1", "role": "owner", "access_status": "approved"},
            {"user_id": "manager-1", "role": "manager", "access_status": "approved"},
            {"user_id": "inactive", "role": "manager", "access_status": "approved", "active": False},
        ],
        sessions=[
            {"_id": "s1", "user_id": "manager-1", "session_token_hash": "hash-one", "created_at": now, "expires_at": now + timedelta(days=1)},
            {"_id": "s2", "user_id": "manager-1", "session_token_hash": "hash-two", "created_at": now - timedelta(hours=1), "expires_at": now + timedelta(days=2)},
            {"_id": "expired", "user_id": "manager-1", "session_token_hash": "expired-hash", "created_at": now, "expires_at": now - timedelta(seconds=1)},
        ],
        client_sessions=[{"_id": "client-1", "session_token": "client-token", "client_id": "client-1"}],
    )
    audit = []
    state = SimpleNamespace(
        actor=SimpleNamespace(user_id="owner-1", role="owner", access_status="approved", active=True),
        db=db,
        audit=audit,
    )

    async def get_user(*_args):
        return state.actor

    async def owner_audit(*args):
        audit.append(args)

    app = FastAPI()
    app.include_router(build_owner_access_sessions_router(db, get_user, owner_audit), prefix="/api")
    state.client = TestClient(app)
    return state


def test_get_returns_count_page_and_never_token_or_hash(setup):
    response = setup.client.get("/api/owner/access/users/manager-1/sessions?limit=1")
    assert response.status_code == 200
    body = response.json()
    assert body["active_count"] == 2
    assert len(body["sessions"]) == 1
    assert body["next_cursor"]
    serialized = response.text.lower()
    assert "hash-one" not in serialized and "hash-two" not in serialized
    assert "session_token" not in serialized
    second_page = setup.client.get(
        "/api/owner/access/users/manager-1/sessions",
        params={"limit": 1, "cursor": body["next_cursor"]},
    )
    assert second_page.status_code == 200
    assert second_page.json()["active_count"] == 2
    assert len(second_page.json()["sessions"]) == 1
    assert second_page.json()["sessions"][0]["session_ref"] != body["sessions"][0]["session_ref"]
    assert second_page.json()["next_cursor"] is None


def test_get_allows_maximum_limit_200(setup):
    response = setup.client.get("/api/owner/access/users/manager-1/sessions?limit=200")
    assert response.status_code == 200
    assert len(response.json()["sessions"]) == 2
    assert response.json()["next_cursor"] is None


def test_get_rejects_invalid_cursor_and_out_of_range_limit(setup):
    base = "/api/owner/access/users/manager-1/sessions"
    assert setup.client.get(base + "?limit=0").status_code == 422
    assert setup.client.get(base + "?limit=201").status_code == 422
    assert setup.client.get(base + "?cursor=forged").status_code == 400


def test_non_owner_and_inactive_target_are_denied(setup):
    setup.actor = SimpleNamespace(user_id="m", role="manager", access_status="approved", active=True)
    assert setup.client.get("/api/owner/access/users/manager-1/sessions").status_code == 403
    setup.actor = SimpleNamespace(user_id="owner-1", role="owner", access_status="approved", active=True)
    assert setup.client.get("/api/owner/access/users/inactive/sessions").status_code == 404
    assert setup.client.get("/api/owner/access/users/missing/sessions").status_code == 404
    setup.actor = SimpleNamespace(user_id="owner-1", role="owner", access_status="pending", active=True)
    assert setup.client.get("/api/owner/access/users/manager-1/sessions").status_code == 403


def test_revoke_all_is_idempotent_and_audits_once(setup):
    url = "/api/owner/access/users/manager-1/sessions/revoke"
    headers = {"X-Request-ID": "sessions:revoke:001"}
    payload = {"reason": "Owner confirmed account security incident"}
    first = setup.client.post(url, headers=headers, json=payload)
    replay = setup.client.post(url, headers=headers, json=payload)
    assert first.status_code == 200 and first.json() == {"revoked_count": 3, "idempotent_replay": False}
    assert replay.status_code == 200 and replay.json() == {"revoked_count": 3, "idempotent_replay": True}
    assert len(setup.audit) == 1
    event_type, target, _actor, previous, new_value = setup.audit[0]
    assert event_type == "user_sessions_revoked"
    assert target["user_id"] == "manager-1"
    assert previous["active_session_count"] == 2
    assert new_value == {"revoked_count": 3, "reason": payload["reason"], "request_id": headers["X-Request-ID"]}
    assert setup.db.user_sessions.rows == []
    assert setup.db.client_sessions.rows[0]["session_token"] == "client-token"
    mismatch = setup.client.post(url, headers=headers, json={"reason": "Different reason for the same request"})
    assert mismatch.status_code == 409


def test_self_revoke_and_invalid_request_id_are_rejected(setup):
    url = "/api/owner/access/users/owner-1/sessions/revoke"
    body = {"reason": "Owner confirmed account security incident"}
    assert setup.client.post(url, headers={"X-Request-ID": "valid-id"}, json=body).status_code == 409
    url = "/api/owner/access/users/manager-1/sessions/revoke"
    assert setup.client.post(url, headers={"X-Request-ID": "bad id"}, json=body).status_code == 400
    assert setup.client.post(url, json=body).status_code == 400
    assert setup.client.post(url, headers={"X-Request-ID": "valid"}, json={"reason": "short"}).status_code == 422


def test_missing_security_key_fails_closed(setup, monkeypatch):
    monkeypatch.delenv("SECURITY_OBSERVABILITY_KEY", raising=False)
    response = setup.client.get("/api/owner/access/users/manager-1/sessions")
    assert response.status_code == 503
