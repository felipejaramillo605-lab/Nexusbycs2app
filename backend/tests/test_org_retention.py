"""Supresion definitiva de organizaciones dadas de baja: imagenes y clientes (sin red, base simulada)."""

import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
for key, value in {
    "MONGO_URL": "mongodb://localhost:27017",
    "DB_NAME": "t",
    "EMERGENT_LLM_KEY": "k",
    "CORS_ORIGINS": "http://localhost:3000",
}.items():
    os.environ.setdefault(key, value)

import org_retention as subject  # noqa: E402

NOW = datetime(2026, 10, 5, 12, 0, tzinfo=timezone.utc)
FILE_A = "0123456789abcdef0123456789abcdef.webp"
FILE_B = "fedcba9876543210fedcba9876543210.webp"
FILE_C = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.webp"
OLD = (NOW - timedelta(days=120)).isoformat()
RECENT = (NOW - timedelta(days=10)).isoformat()


def matches(doc, key, condition):
    value = doc.get(key)
    if isinstance(condition, dict):
        if "$exists" in condition and (key in doc) != condition["$exists"]:
            return False
        if "$lt" in condition and not (value is not None and value < condition["$lt"]):
            return False
        return True
    return value == condition


class Coll:
    def __init__(self, docs=()):
        self.docs = [dict(d) for d in docs]
        self.inserts = []

    def _select(self, query):
        return [d for d in self.docs if all(matches(d, k, v) for k, v in query.items())]

    async def find(self, query, projection=None):
        for doc in self._select(query):
            yield dict(doc)

    async def find_one(self, query, projection=None):
        found = self._select(query)
        return dict(found[0]) if found else None

    async def count_documents(self, query):
        return len(self._select(query))

    async def update_one(self, query, update, upsert=False):
        for doc in self._select(query)[:1]:
            doc.update(update["$set"])

    async def update_many(self, query, update):
        for doc in self._select(query):
            doc.update(update["$set"])

    async def delete_many(self, query):
        keep = [d for d in self.docs if d not in self._select(query)]
        self.docs = keep

    async def insert_one(self, doc):
        self.inserts.append(dict(doc))


def build_db():
    return SimpleNamespace(
        organizations=Coll(
            [
                {
                    "organization_id": "org_old",
                    "name": "Vieja",
                    "deleted_at": OLD,
                    "logo_url": f"/api/media/organizations/org_old/{FILE_A}",
                },
                {"organization_id": "org_recent", "name": "Reciente", "deleted_at": RECENT},
                {"organization_id": "org_live", "name": "Activa"},
                {"organization_id": "org_done", "name": "Hecha", "deleted_at": OLD, "purged_at": RECENT},
            ]
        ),
        services=Coll(
            [{"organization_id": "org_old", "service_id": "s1", "photos": [f"/api/media/catalog/org_old/{FILE_B}"]}]
        ),
        barbers=Coll(
            [{"organization_id": "org_old", "barber_id": "b1", "avatar": f"/api/media/professionals/org_old/{FILE_C}"}]
        ),
        catalog_products=Coll(),
        clients=Coll(
            [
                {"client_id": "c1", "organization_id": "org_old", "phone": "3001", "name": "Ana", "email": "a@x.co"},
                {
                    "client_id": "c2",
                    "organization_id": "org_old",
                    "phone": "3002",
                    "name": "Beto",
                    "anonymized_at": "x",
                },
                {"client_id": "c3", "organization_id": "org_live", "phone": "3003", "name": "Caro"},
            ]
        ),
        appointments=Coll(
            [{"organization_id": "org_old", "client_phone": "3001", "client_name": "Ana", "client_email": "a@x.co"}]
        ),
        data_requests=Coll(),
        client_sessions=Coll(
            [{"organization_id": "org_old", "client_id": "c1"}, {"organization_id": "org_live", "client_id": "c3"}]
        ),
        retention_runs=Coll(),
        platform_audit_log=Coll(),
    )


@pytest.fixture()
def deleted(monkeypatch):
    calls = []

    async def fake_mirror_delete(db, namespace, key):
        calls.append((namespace, key))

    monkeypatch.setattr(subject, "mirror_delete", fake_mirror_delete)
    return calls


def test_plan_lists_only_organizations_deleted_more_than_90_days_ago_and_not_yet_purged(deleted):
    plan = asyncio.run(subject.build_plan(build_db(), NOW))
    assert [item["organization_id"] for item in plan["organizations"]] == ["org_old"]
    item = plan["organizations"][0]
    assert item["name"] == "Vieja" and item["media_files"] == 3 and item["clients"] == 1
    assert deleted == []


def test_media_collection_never_includes_external_urls_or_platform_branding():
    db = build_db()
    db.organizations.docs[0]["logo_url"] = "https://example.com/logo.png"
    db.services.docs[0]["photos"] = ["/api/media/platform/logo.webp", f"/api/media/catalog/org_old/{FILE_B}"]
    keys = [(ns, key) for ns, key, _ in asyncio.run(subject.collect_media(db, "org_old"))]
    assert all(ns != "platform" for ns, _ in keys) and ("catalog", f"org_old/{FILE_B}") in keys
    assert len(keys) == 2


def test_purge_deletes_media_anonymizes_clients_and_marks_the_organization(deleted):
    db = build_db()
    run = asyncio.run(subject.run_purge(db, "u_owner", NOW))
    assert sorted(deleted) == sorted(
        [
            ("organizations", f"org_old/{FILE_A}"),
            ("catalog", f"org_old/{FILE_B}"),
            ("professionals", f"org_old/{FILE_C}"),
        ]
    )
    result = run["organizations"][0]
    assert result["completed"] is True and result["media_deleted"] == 3 and result["clients_anonymized"] == 1
    org = next(o for o in db.organizations.docs if o["organization_id"] == "org_old")
    assert org["purged_at"] == NOW.isoformat() and org["logo_url"] is None
    assert db.services.docs[0]["photos"] == [] and db.barbers.docs[0]["avatar"] is None
    ana = next(c for c in db.clients.docs if c["client_id"] == "c1")
    assert (
        ana["name"] == "Cliente eliminado"
        and ana["email"] is None
        and ana["anonymization_reason"] == "organization_deleted"
    )
    assert db.appointments.docs[0]["client_name"] == "Cliente eliminado"
    assert [s["client_id"] for s in db.client_sessions.docs] == ["c3"]
    assert db.platform_audit_log.inserts[0]["event_type"] == "organization_data_purged"
    assert db.retention_runs.inserts[0]["kind"] == "organization_purge"


def test_other_organizations_are_untouched(deleted):
    db = build_db()
    asyncio.run(subject.run_purge(db, "u_owner", NOW))
    live_client = next(c for c in db.clients.docs if c["client_id"] == "c3")
    assert live_client["name"] == "Caro"
    for org_id in ("org_recent", "org_live"):
        org = next(o for o in db.organizations.docs if o["organization_id"] == org_id)
        assert "purged_at" not in org


def test_a_media_failure_keeps_the_organization_pending_and_keeps_the_urls(monkeypatch):
    async def failing(db, namespace, key):
        if namespace == "catalog":
            raise RuntimeError("r2 down")

    monkeypatch.setattr(subject, "mirror_delete", failing)
    db = build_db()
    run = asyncio.run(subject.run_purge(db, "u_owner", NOW))
    result = run["organizations"][0]
    assert result["completed"] is False and result["media_failed"] == 1
    org = next(o for o in db.organizations.docs if o["organization_id"] == "org_old")
    assert "purged_at" not in org and org["logo_url"]  # se reintenta en la proxima ejecucion
    # los datos personales de los clientes si se anonimizaron
    assert next(c for c in db.clients.docs if c["client_id"] == "c1")["name"] == "Cliente eliminado"


def test_running_twice_does_nothing_new(deleted):
    db = build_db()
    asyncio.run(subject.run_purge(db, "u_owner", NOW))
    deleted.clear()
    second = asyncio.run(subject.run_purge(db, "u_owner", NOW))
    assert second["organizations"] == [] and deleted == []


def test_only_the_owner_can_use_the_routes_and_the_phrase_is_required(deleted):
    users = {
        "owner": SimpleNamespace(user_id="u_o", role="owner"),
        "manager": SimpleNamespace(user_id="u_m", role="manager"),
    }

    async def current_user(authorization=None, session_token=None):
        if (authorization or session_token) not in users:
            raise HTTPException(status_code=401, detail="Not authenticated")
        return users[authorization or session_token]

    app = FastAPI()
    app.include_router(subject.build_org_retention_router(build_db(), current_user), prefix="/api")
    client = TestClient(app)
    assert client.get("/api/owner/retention/organizations").status_code == 401
    assert client.get("/api/owner/retention/organizations", headers={"Authorization": "manager"}).status_code == 403
    assert client.get("/api/owner/retention/organizations", headers={"Authorization": "owner"}).status_code == 200
    bad = client.post(
        "/api/owner/retention/purge-organizations", json={"confirmation": "si"}, headers={"Authorization": "owner"}
    )
    assert bad.status_code == 400 and deleted == []
    denied = client.post(
        "/api/owner/retention/purge-organizations",
        json={"confirmation": subject.CONFIRMATION_PHRASE},
        headers={"Authorization": "manager"},
    )
    assert denied.status_code == 403
