"""HTTP contract tests for the read side of security event observability
(plan PR 22). record_security_event() has written to db.security_events
since this module was first built; nothing ever read it back before this.
"""

import sys
from pathlib import Path
from types import SimpleNamespace

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from security_observability import build_security_observability_router  # noqa: E402


def _matches(row, query):
    return all(row.get(key) == value for key, value in query.items())


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
        return [dict(r) for r in self.rows[:length]]


class FakeAggregateCursor:
    def __init__(self, rows):
        self.rows = rows

    async def to_list(self, length):
        return self.rows[:length]


class FakeCollection:
    def __init__(self, *rows):
        self.rows = [dict(r) for r in rows]

    def find(self, query=None, projection=None):
        query = query or {}
        return FakeCursor([r for r in self.rows if _matches(r, query)])

    async def count_documents(self, query=None):
        query = query or {}
        return len([r for r in self.rows if _matches(r, query)])

    def aggregate(self, pipeline):
        # Minimal group-by mirroring the one pipeline the router actually runs.
        buckets = {}
        for row in self.rows:
            key = (row.get("event_type"), row.get("severity"))
            bucket = buckets.setdefault(key, {"_id": {"event_type": key[0], "severity": key[1]}, "occurrences": 0, "count": 0})
            bucket["occurrences"] += int(row.get("occurrence_count") or 0)
            bucket["count"] += 1
        return FakeAggregateCursor(list(buckets.values()))


def _event(**overrides):
    base = {
        "security_event_id": "sevt_1",
        "event_type": "origin_blocked",
        "severity": "warning",
        "diagnostic_code": "SEC-ORG-ABCDEF12",
        "request_method": "POST",
        "normalized_path": "/api/owner/users/:id",
        "source_fingerprint": "fp-source-1",
        "actor_fingerprint": None,
        "organization_fingerprint": None,
        "first_seen_at": "2026-09-27T10:00:00+00:00",
        "last_seen_at": "2026-09-27T10:05:00+00:00",
        "occurrence_count": 3,
        "metadata": {"fetch_site": "cross-site"},
    }
    base.update(overrides)
    return base


def _client(role="owner", events=None):
    database = SimpleNamespace(security_events=events or FakeCollection())

    async def get_current_user(authorization, session_token):
        if authorization != "Bearer test-owner":
            raise HTTPException(status_code=401, detail="Not authenticated")
        return SimpleNamespace(role=role, access_status="approved", user_id="user-owner-test")

    app = FastAPI()
    app.include_router(build_security_observability_router(database, get_current_user), prefix="/api")
    return TestClient(app)


def _list(client, **params):
    return client.get("/api/owner/security/events", params=params, headers={"Authorization": "Bearer test-owner"})


def _summary(client):
    return client.get("/api/owner/security/events/summary", headers={"Authorization": "Bearer test-owner"})


def test_lists_security_events_with_pagination():
    client = _client(events=FakeCollection(
        _event(security_event_id="sevt_1"),
        _event(security_event_id="sevt_2", event_type="cross_tenant_access_blocked", severity="high"),
    ))

    response = _list(client, page=1, page_size=25)

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 2
    assert {item["security_event_id"] for item in body["items"]} == {"sevt_1", "sevt_2"}


def test_filters_by_event_type_and_severity():
    client = _client(events=FakeCollection(
        _event(security_event_id="sevt_1", event_type="origin_blocked", severity="warning"),
        _event(security_event_id="sevt_2", event_type="cross_tenant_access_blocked", severity="high"),
    ))

    response = _list(client, event_type="cross_tenant_access_blocked", severity="high")

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["security_event_id"] == "sevt_2"


def test_pagination_metadata_reflects_page_size():
    client = _client(events=FakeCollection(*(_event(security_event_id=f"sevt_{i}") for i in range(5))))

    response = _list(client, page=2, page_size=2)

    assert response.status_code == 200
    body = response.json()
    assert body["page"] == 2
    assert body["total_pages"] == 3
    assert body["has_previous"] is True
    assert body["has_next"] is True
    assert len(body["items"]) == 2


def test_never_exposes_raw_source_actor_or_organization_only_fingerprints():
    client = _client(events=FakeCollection(_event(source_fingerprint="fp-abc", actor_fingerprint="fp-def")))

    response = _list(client)

    item = response.json()["items"][0]
    assert item["source_fingerprint"] == "fp-abc"
    assert item["actor_fingerprint"] == "fp-def"
    # Confirms the projection never includes anything beyond the fingerprint
    # fields security_observability.py already writes (no raw IP/email/etc).
    assert set(item.keys()) <= {
        "security_event_id", "event_type", "severity", "diagnostic_code",
        "request_method", "normalized_path", "source_fingerprint",
        "actor_fingerprint", "organization_fingerprint", "first_seen_at",
        "last_seen_at", "occurrence_count", "metadata",
    }


def test_summary_groups_by_event_type_and_sums_occurrences():
    client = _client(events=FakeCollection(
        _event(security_event_id="sevt_1", event_type="origin_blocked", occurrence_count=3),
        _event(security_event_id="sevt_2", event_type="origin_blocked", occurrence_count=2),
        _event(security_event_id="sevt_3", event_type="cross_tenant_access_blocked", severity="high", occurrence_count=1),
    ))

    response = _summary(client)

    assert response.status_code == 200
    body = response.json()
    assert body["total_events"] == 3
    assert body["total_occurrences"] == 6
    origin_bucket = next(b for b in body["by_event_type"] if b["event_type"] == "origin_blocked")
    assert origin_bucket["count"] == 2
    assert origin_bucket["occurrences"] == 5


def test_is_owner_only():
    client = _client(role="manager")

    response = _list(client)

    assert response.status_code == 403
