"""Retencion y supresion de clientes finales (sin red, base simulada)."""

import asyncio
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import data_retention as subject  # noqa: E402

NOW = datetime(2026, 10, 5, 12, 0, tzinfo=timezone.utc)


class Clients:
    def __init__(self, docs):
        self.docs = docs

    async def find(self, query, projection=None):
        for doc in self.docs:
            if "anonymized_at" in query and doc.get("anonymized_at"):
                continue
            yield dict(doc)

    async def update_one(self, query, update):
        for doc in self.docs:
            if doc["client_id"] == query["client_id"]:
                doc.update(update["$set"])


class Appointments:
    def __init__(self, docs):
        self.docs = docs

    async def update_many(self, query, update):
        for doc in self.docs:
            if doc["organization_id"] == query["organization_id"] and doc["client_phone"] == query["client_phone"]:
                doc.update(update["$set"])


class Requests:
    def __init__(self):
        self.docs = [{"client_id": "c_req", "type": "deletion", "status": "pending_review"}]

    async def update_many(self, query, update):
        for doc in self.docs:
            if doc["client_id"] == query["client_id"] and doc["status"] != "completed":
                doc.update(update["$set"])


class Audit:
    def __init__(self):
        self.docs = [{"created_at": "2020-01-01T00:00:00+00:00"}, {"created_at": NOW.isoformat()}]

    async def count_documents(self, query):
        cutoff = query["created_at"]["$lt"]
        return len([d for d in self.docs if d["created_at"] < cutoff])

    async def insert_one(self, doc):
        self.docs.append(dict(doc))


class Runs:
    def __init__(self):
        self.docs = []

    async def insert_one(self, doc):
        self.docs.append(dict(doc))


def fresh_db():
    old = (NOW - timedelta(days=900)).date().isoformat()
    recent = (NOW - timedelta(days=30)).date().isoformat()
    clients = [
        {
            "client_id": "c_req",
            "organization_id": "o1",
            "phone": "3001",
            "name": "Ana",
            "email": "a@x.co",
            "pin_hash": "h",
            "deletion_requested_at": NOW.isoformat(),
            "last_visit": recent,
            "total_visits": 4,
        },
        {
            "client_id": "c_old",
            "organization_id": "o1",
            "phone": "3002",
            "name": "Beto",
            "email": "b@x.co",
            "last_visit": old,
            "total_visits": 9,
            "birthday": "1990-01-01",
            "accepts_marketing": True,
        },
        {"client_id": "c_new", "organization_id": "o1", "phone": "3003", "name": "Caro", "last_visit": recent},
        {
            "client_id": "c_never",
            "organization_id": "o1",
            "phone": "3004",
            "name": "Dani",
            "created_at": (NOW - timedelta(days=10)).isoformat(),
        },
    ]
    appointments = [
        {"organization_id": "o1", "client_phone": "3001", "client_name": "Ana", "client_email": "a@x.co"},
        {"organization_id": "o2", "client_phone": "3001", "client_name": "Otra org", "client_email": "z@x.co"},
    ]
    return SimpleNamespace(
        clients=Clients(clients),
        appointments=Appointments(appointments),
        data_requests=Requests(),
        platform_audit_log=Audit(),
        retention_runs=Runs(),
    )


def test_plan_counts_requests_and_inactive_clients_without_touching_anything():
    db = fresh_db()
    plan = asyncio.run(subject.build_plan(db, NOW))
    assert plan["deletion_requests"] == 1 and plan["inactive_clients"] == 1
    assert plan["audit_events_older_than_retention"] == 1
    assert all(not c.get("anonymized_at") for c in db.clients.docs)


def test_a_client_without_visits_is_judged_by_the_creation_date():
    client = {"client_id": "x", "created_at": (NOW - timedelta(days=800)).isoformat()}
    assert subject.classify(client, NOW) == "inactive"
    assert subject.classify({"client_id": "y", "created_at": NOW.isoformat()}, NOW) is None
    assert subject.classify({"client_id": "z", "anonymized_at": "x", "deletion_requested_at": "x"}, NOW) is None


def test_running_anonymizes_personal_fields_and_keeps_aggregates():
    db = fresh_db()
    result = asyncio.run(subject.run_retention(db, "u_owner", NOW))
    assert result["anonymized_deletion_requests"] == 1 and result["anonymized_inactive"] == 1
    by_id = {c["client_id"]: c for c in db.clients.docs}
    ana = by_id["c_req"]
    assert ana["name"] == subject.DELETED_NAME and ana["email"] is None and ana["pin_hash"] is None
    assert ana["phone"] == "anonimizado-c_req" and ana["total_visits"] == 4
    beto = by_id["c_old"]
    assert beto["birthday"] is None and beto["accepts_marketing"] is False and beto["total_visits"] == 9
    assert by_id["c_new"]["name"] == "Caro" and by_id["c_never"]["name"] == "Dani"
    assert db.data_requests.docs[0]["status"] == "completed"
    assert db.retention_runs.docs[0]["executed_by"] == "u_owner"


def test_appointments_of_the_client_are_anonymized_only_inside_the_same_organization():
    db = fresh_db()
    asyncio.run(subject.run_retention(db, "u_owner", NOW))
    mine, other = db.appointments.docs
    assert mine["client_name"] == subject.DELETED_NAME and mine["client_email"] == ""
    assert other["client_name"] == "Otra org" and other["client_phone"] == "3001"


def test_running_twice_does_nothing_the_second_time():
    db = fresh_db()
    asyncio.run(subject.run_retention(db, "u_owner", NOW))
    second = asyncio.run(subject.run_retention(db, "u_owner", NOW))
    assert second["anonymized_deletion_requests"] == 0 and second["anonymized_inactive"] == 0


def build_app(db):
    users = {
        "owner": SimpleNamespace(user_id="u_owner", role="owner"),
        "manager": SimpleNamespace(user_id="u_m", role="manager"),
    }

    async def current_user(authorization=None, session_token=None):
        token = authorization or session_token
        if token not in users:
            raise HTTPException(status_code=401, detail="Not authenticated")
        return users[token]

    app = FastAPI()
    app.include_router(subject.build_retention_router(db, current_user), prefix="/api")
    return TestClient(app)


def test_only_the_owner_can_see_the_plan_and_running_needs_the_exact_phrase():
    client = build_app(fresh_db())
    assert client.get("/api/owner/retention/plan", headers={"Authorization": "manager"}).status_code == 403
    assert client.get("/api/owner/retention/plan").status_code == 401
    assert client.get("/api/owner/retention/plan", headers={"Authorization": "owner"}).status_code == 200
    wrong = client.post("/api/owner/retention/run", json={"confirmation": "si"}, headers={"Authorization": "owner"})
    assert wrong.status_code == 400
    denied = client.post(
        "/api/owner/retention/run",
        json={"confirmation": subject.CONFIRMATION_PHRASE},
        headers={"Authorization": "manager"},
    )
    assert denied.status_code == 403
