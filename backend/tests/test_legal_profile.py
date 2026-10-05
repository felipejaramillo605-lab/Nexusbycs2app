"""Datos legales del Responsable: solo visibles tras aceptar el contrato (sin red, base simulada)."""

import json
import sys
from pathlib import Path
from types import SimpleNamespace

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import legal_profile as subject  # noqa: E402

SECRET_ID = "1234567890"
SECRET_ADDRESS = "Calle Privada 1 # 2-3, Apto 404"
PROFILE = {
    "full_name": "Felipe Jaramillo Parra",
    "municipality": "La Estrella, Antioquia",
    "email": "nexusbycs2@gmail.com",
    "phone": "+57 323 907 0485",
    "document_type": "CC",
    "document_number": SECRET_ID,
    "full_address": SECRET_ADDRESS,
}


class Settings:
    def __init__(self):
        self.docs = {}

    async def find_one(self, query, projection=None):
        doc = self.docs.get(query["settings_id"])
        return dict(doc) if doc else None

    async def update_one(self, query, update, upsert=False):
        self.docs.setdefault(query["settings_id"], {}).update(update["$set"])


class Acceptances:
    def __init__(self):
        self.docs = []

    async def find_one(self, query, projection=None):
        for doc in self.docs:
            if all(doc.get(k) == v for k, v in query.items()):
                return dict(doc)
        return None

    async def insert_one(self, doc):
        self.docs.append(dict(doc))

    async def count_documents(self, query):
        return len([d for d in self.docs if all(d.get(k) == v for k, v in query.items())])


class Audit:
    def __init__(self):
        self.docs = []

    async def insert_one(self, doc):
        self.docs.append(dict(doc))


def build(users):
    db = SimpleNamespace(platform_settings=Settings(), legal_acceptances=Acceptances(), platform_audit_log=Audit())

    async def current_user(authorization=None, session_token=None):
        token = authorization or session_token
        if token not in users:
            raise HTTPException(status_code=401, detail="Not authenticated")
        return users[token]

    app = FastAPI()
    app.include_router(subject.build_legal_router(db, current_user), prefix="/api")
    return TestClient(app), db


def user(user_id, role="manager", status="approved"):
    return SimpleNamespace(user_id=user_id, role=role, access_status=status, organization_id="org_1")


USERS = {
    "owner": user("u_owner", "owner"),
    "manager_a": user("u_a"),
    "manager_b": user("u_b"),
    "pending": user("u_p", status="pending"),
}


def auth(name):
    return {"Authorization": name}


def seeded():
    client, db = build(USERS)
    assert client.put("/api/owner/legal-profile", json=PROFILE, headers=auth("owner")).status_code == 200
    return client, db


def test_anonymous_and_unapproved_users_cannot_read_anything():
    client, _ = seeded()
    assert client.get("/api/legal/responsible").status_code == 401
    assert client.get("/api/legal/responsible", headers=auth("pending")).status_code == 403


def test_a_registered_user_sees_only_the_public_data_until_accepting():
    client, _ = seeded()
    body = client.get("/api/legal/responsible", headers=auth("manager_a")).json()
    assert body["accepted"] is False and body["private"] is None
    assert body["public"]["phone"] == "+57 323 907 0485" and body["public"]["full_name"] == "Felipe Jaramillo Parra"
    text = json.dumps(body)
    assert SECRET_ID not in text and SECRET_ADDRESS not in text


def test_accepting_reveals_the_private_data_only_to_the_user_who_accepted():
    client, db = seeded()
    version = subject.current_version()
    accepted = client.post(
        "/api/legal/accept", json={"version": version, "document_hash": "abc"}, headers=auth("manager_a")
    )
    assert accepted.status_code == 200 and accepted.json()["already"] is False
    mine = client.get("/api/legal/responsible", headers=auth("manager_a")).json()
    assert mine["accepted"] is True and mine["private"]["document_number"] == SECRET_ID
    other = client.get("/api/legal/responsible", headers=auth("manager_b")).json()
    assert other["private"] is None and SECRET_ID not in json.dumps(other)
    record = db.legal_acceptances.docs[0]
    assert record["user_id"] == "u_a" and record["version"] == version and record["ip"] and record["accepted_at"]


def test_acceptance_is_idempotent_and_rejects_a_stale_version():
    client, db = seeded()
    version = subject.current_version()
    client.post("/api/legal/accept", json={"version": version}, headers=auth("manager_a"))
    again = client.post("/api/legal/accept", json={"version": version}, headers=auth("manager_a"))
    assert again.json()["already"] is True and len(db.legal_acceptances.docs) == 1
    assert client.post("/api/legal/accept", json={"version": "0.0-viejo"}, headers=auth("manager_b")).status_code == 409


def test_a_new_contract_version_requires_accepting_again(monkeypatch):
    client, _ = seeded()
    client.post("/api/legal/accept", json={"version": subject.current_version()}, headers=auth("manager_a"))
    monkeypatch.setenv("LEGAL_DOCS_VERSION", "2.1")
    body = client.get("/api/legal/responsible", headers=auth("manager_a")).json()
    assert body["accepted"] is False and body["private"] is None and body["version"] == "2.1"


def test_only_an_owner_can_edit_the_profile_and_it_is_validated():
    client, _ = build(USERS)
    assert client.put("/api/owner/legal-profile", json=PROFILE, headers=auth("manager_a")).status_code == 403
    assert client.get("/api/owner/legal-profile", headers=auth("manager_a")).status_code == 403
    assert (
        client.put(
            "/api/owner/legal-profile", json={**PROFILE, "email": "no-es-correo"}, headers=auth("owner")
        ).status_code
        == 422
    )
    assert (
        client.put(
            "/api/owner/legal-profile", json={**PROFILE, "document_type": "XX"}, headers=auth("owner")
        ).status_code
        == 422
    )


def test_the_owner_always_sees_the_private_data_and_the_audit_never_stores_it():
    client, db = seeded()
    mine = client.get("/api/legal/responsible", headers=auth("owner")).json()
    assert mine["accepted"] is True and mine["private"]["full_address"] == SECRET_ADDRESS
    assert SECRET_ID not in json.dumps(db.platform_audit_log.docs, default=str)
    assert SECRET_ADDRESS not in json.dumps(db.platform_audit_log.docs, default=str)
    detail = client.get("/api/owner/legal-profile", headers=auth("owner")).json()
    assert detail["profile"]["document_number"] == SECRET_ID and detail["acceptances_current_version"] == 0


def test_unconfigured_profile_returns_empty_public_data_and_no_private_data():
    client, _ = build(USERS)
    body = client.get("/api/legal/responsible", headers=auth("manager_a")).json()
    assert body["configured"] is False and body["private"] is None


class Docs:
    def __init__(self):
        self.docs = {}

    async def find_one(self, query, projection=None):
        doc = self.docs.get(query["key"])
        return dict(doc) if doc else None

    async def update_one(self, query, update, upsert=False):
        self.docs.setdefault(query["key"], {}).update(update["$set"])

    async def delete_one(self, query):
        self.docs.pop(query["key"], None)


class Revisions:
    def __init__(self):
        self.docs = []

    async def insert_one(self, doc):
        self.docs.append(dict(doc))


BODY = "# Contrato\n\nTexto actualizado por el abogado con cambios importantes."


def with_documents():
    client, db = seeded()
    db.legal_documents = Docs()
    db.legal_document_revisions = Revisions()
    return client, db


def test_only_the_owner_can_edit_documents_and_unknown_keys_are_rejected():
    client, _ = with_documents()
    body = {"title": "Contrato", "body_md": BODY}
    assert client.put("/api/owner/legal-documents/terminos", json=body, headers=auth("manager_a")).status_code == 403
    assert client.put("/api/owner/legal-documents/otro", json=body, headers=auth("owner")).status_code == 404
    assert client.get("/api/owner/legal-documents", headers=auth("manager_a")).status_code == 403


def test_a_minor_edit_keeps_the_version_and_keeps_a_revision_with_its_hash():
    client, db = with_documents()
    before = client.get("/api/legal/status", headers=auth("manager_a")).json()["version"]
    saved = client.put(
        "/api/owner/legal-documents/terminos", json={"title": "Términos", "body_md": BODY}, headers=auth("owner")
    ).json()
    assert saved["version"] == before
    assert db.legal_document_revisions.docs[0]["sha256"] and db.legal_document_revisions.docs[0]["key"] == "terminos"
    shown = client.get("/api/legal/documents", headers=auth("manager_b")).json()
    assert shown["documents"]["terminos"]["body_md"] == BODY and shown["documents"]["contrato-transmision"] is None


def test_publishing_a_new_version_forces_everyone_to_accept_again():
    client, _ = with_documents()
    version = client.get("/api/legal/status", headers=auth("manager_a")).json()["version"]
    client.post("/api/legal/accept", json={"version": version}, headers=auth("manager_a"))
    assert client.get("/api/legal/status", headers=auth("manager_a")).json()["accepted"] is True
    saved = client.put(
        "/api/owner/legal-documents/contrato-transmision",
        json={"title": "Contrato", "body_md": BODY, "publish_new_version": True},
        headers=auth("owner"),
    ).json()
    assert saved["version"] != version
    status = client.get("/api/legal/status", headers=auth("manager_a")).json()
    assert status["accepted"] is False and status["version"] == saved["version"]
    assert client.get("/api/legal/status", headers=auth("owner")).json()["accepted"] is True
    stale = client.post("/api/legal/accept", json={"version": version}, headers=auth("manager_b"))
    assert stale.status_code == 409


def test_restoring_the_default_removes_the_custom_text():
    client, db = with_documents()
    client.put(
        "/api/owner/legal-documents/terminos", json={"title": "Términos", "body_md": BODY}, headers=auth("owner")
    )
    assert client.delete("/api/owner/legal-documents/terminos", headers=auth("owner")).json()["restored"] is True
    assert client.get("/api/legal/documents", headers=auth("manager_a")).json()["documents"]["terminos"] is None
