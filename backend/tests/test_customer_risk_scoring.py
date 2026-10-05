import asyncio
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from customer_risk_scoring import (
    ensure_customer_risk_indexes,
    refresh_scores,
    score_client,
)

NOW = datetime(2026, 10, 3, tzinfo=timezone.utc)


def client(**extra):
    return {
        "client_id": "c1",
        "organization_id": "o1",
        "total_visits": 4,
        "created_at": (NOW - timedelta(days=90)).isoformat(),
        "last_visit": (NOW - timedelta(days=45)).isoformat(),
        **extra,
    }


class Cursor:
    def __init__(self, documents):
        self.documents = documents

    def sort(self, key, _direction):
        self.documents.sort(key=lambda document: document.get(key, ""))
        return self

    def limit(self, count):
        self.documents = self.documents[:count]
        return self

    async def to_list(self, _count):
        return [dict(document) for document in self.documents]

    def __aiter__(self):
        self.iterator = iter(self.documents)
        return self

    async def __anext__(self):
        try:
            return next(self.iterator)
        except StopIteration as error:
            raise StopAsyncIteration from error


def matches(document, query):
    for key, expected in query.items():
        if key == "$or":
            if not any(matches(document, option) for option in expected):
                return False
            continue
        value = document.get(key)
        if isinstance(expected, dict):
            if "$exists" in expected and (key in document) != expected["$exists"]:
                return False
            if "$gt" in expected and not value > expected["$gt"]:
                return False
            if "$nin" in expected and value in expected["$nin"]:
                return False
        elif value != expected:
            return False
    return True


class Collection:
    def __init__(self, documents=()):
        self.documents = [dict(document) for document in documents]
        self.indexes = []

    def find(self, query, _projection=None):
        return Cursor(
            [document for document in self.documents if matches(document, query)]
        )

    async def update_one(self, query, update, upsert=False):
        for document in self.documents:
            if matches(document, query):
                document.update(update["$set"])
                return
        if upsert:
            self.documents.append({**query, **update["$set"]})

    async def delete_many(self, query):
        previous = len(self.documents)
        self.documents = [
            document for document in self.documents if not matches(document, query)
        ]
        return type(
            "DeleteResult", (), {"deleted_count": previous - len(self.documents)}
        )()

    async def create_index(self, *args, **kwargs):
        self.indexes.append((args, kwargs))


class DB:
    def __init__(self, organizations, clients, appointments, scores=()):
        self.organizations = Collection(organizations)
        self.clients = Collection(clients)
        self.appointments = Collection(appointments)
        self.decision_scores = Collection(scores)


def test_overdue_client_gets_transparent_risk_score():
    score = score_client(client(), NOW)
    assert score["band"] in {"medium", "high"}
    assert score["signals"]["days_since_last_visit"] == 45


def test_recent_client_without_no_shows_is_not_scored():
    assert (
        score_client(client(last_visit=(NOW - timedelta(days=10)).isoformat()), NOW)
        is None
    )


def test_date_normalization_accepts_datetime_date_and_z_suffix():
    base = client(created_at=date(2026, 7, 1), last_visit="2026-08-19T00:00:00Z")
    assert score_client(base, NOW)["signals"]["days_since_last_visit"] == 45


def test_refresh_counts_no_show_appointments_and_cleans_stale_scores():
    db = DB(
        organizations=[{"organization_id": "o1"}],
        clients=[
            client(),
            client(
                client_id="recent", last_visit=(NOW - timedelta(days=10)).isoformat()
            ),
        ],
        appointments=[
            {"organization_id": "o1", "client_id": "recent", "status": "no_show"},
            {"organization_id": "o1", "client_id": "recent", "status": "no_show"},
        ],
        scores=[
            {"organization_id": "o1", "client_id": "stale", "kind": "retention_risk"},
            {"organization_id": "o1", "client_id": "other", "kind": "different_kind"},
        ],
    )

    result = asyncio.run(refresh_scores(db, NOW, batch_size=1))

    retention = [
        score
        for score in db.decision_scores.documents
        if score.get("kind") == "retention_risk"
    ]
    assert result == {
        "scanned": 2,
        "saved": 2,
        "deleted": 1,
        "organizations": 1,
        "mode": "recommendation_only",
    }
    assert {score["client_id"] for score in retention} == {"c1", "recent"}
    assert (
        next(score for score in retention if score["client_id"] == "recent")["signals"][
            "no_show_count"
        ]
        == 2
    )
    assert any(
        score["kind"] == "different_kind" for score in db.decision_scores.documents
    )


def test_refresh_skips_deleted_organizations_and_is_idempotent():
    db = DB(
        organizations=[
            {"organization_id": "active"},
            {"organization_id": "deleted", "deleted_at": NOW.isoformat()},
        ],
        clients=[
            client(client_id="active-client", organization_id="active"),
            client(client_id="deleted-client", organization_id="deleted"),
        ],
        appointments=[],
    )

    first = asyncio.run(refresh_scores(db, NOW))
    second = asyncio.run(refresh_scores(db, NOW))

    assert first["organizations"] == second["organizations"] == 1
    assert {score["organization_id"] for score in db.decision_scores.documents} == {
        "active"
    }
    assert len(db.decision_scores.documents) == 1


def test_refresh_creates_unique_retention_score_index():
    db = DB([], [], [])

    asyncio.run(ensure_customer_risk_indexes(db))

    args, kwargs = db.decision_scores.indexes[0]
    assert args[0] == [("organization_id", 1), ("client_id", 1), ("kind", 1)]
    assert kwargs["unique"] is True
    assert kwargs["name"] == "decision_scores_retention_risk_unique"
