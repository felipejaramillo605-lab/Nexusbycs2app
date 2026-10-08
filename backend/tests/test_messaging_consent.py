"""Consentimiento y baja (STOP) de textos/WhatsApp: Estados Unidos lo exige, Colombia solo respeta la baja."""

import sys
from pathlib import Path
from types import SimpleNamespace

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import messaging_consent as subject  # noqa: E402

US = {"operating_country": "US"}
CO = {"operating_country": "CO"}


def test_consent_fields_record_when_where_and_the_exact_text_and_clear_a_previous_stop():
    fields = subject.consent_fields(True, "  I agree to receive texts  ", "203.0.113.9", "2026-10-08T10:00:00+00:00")
    assert fields["messaging_consent"] is True
    assert fields["messaging_consent_at"] == "2026-10-08T10:00:00+00:00"
    assert fields["messaging_consent_text"] == "I agree to receive texts"
    assert fields["messaging_consent_ip"] == "203.0.113.9"
    assert fields["messaging_consent_version"] == subject.CONSENT_VERSION
    assert fields["messaging_opt_out_at"] is None
    assert subject.consent_fields(False, "text", "ip") == {}


def test_consent_text_is_capped():
    fields = subject.consent_fields(True, "x" * 5000, None)
    assert len(fields["messaging_consent_text"]) == subject.MAX_TEXT


def test_us_needs_consent_but_colombia_does_not():
    assert subject.messaging_status({}, US) == (False, "no_consent")
    assert subject.messaging_status({"messaging_consent": True}, US) == (True, None)
    assert subject.messaging_status({}, CO) == (True, None)
    assert subject.messaging_status({}, None) == (True, None)


def test_a_stop_blocks_messages_in_every_country_until_a_new_express_consent():
    stopped = {"messaging_consent": True, "messaging_opt_out_at": "2026-10-08T10:00:00+00:00"}
    assert subject.messaging_status(stopped, US) == (False, "opted_out")
    assert subject.messaging_status(stopped, CO) == (False, "opted_out")
    renewed = {**stopped, **subject.consent_fields(True, "again", None)}
    assert subject.messaging_status(renewed, US) == (True, None)


def test_footer_follows_the_language():
    assert subject.stop_footer("en") == "Reply STOP to opt out."
    assert subject.stop_footer("es").startswith("Responde STOP")


class Coll:
    def __init__(self, docs):
        self.docs = docs

    async def find_one(self, query, projection=None):
        for doc in self.docs:
            if all(doc.get(k) == v for k, v in query.items()):
                return dict(doc)
        return None

    async def update_one(self, query, update):
        for doc in self.docs:
            if all(doc.get(k) == v for k, v in query.items()):
                doc.update(update["$set"])


def build(country="US"):
    db = SimpleNamespace(
        clients=Coll(
            [
                {"client_id": "c1", "organization_id": "org_a"},
                {"client_id": "c2", "organization_id": "org_b"},
            ]
        ),
        organizations=Coll([{"organization_id": "org_a", "operating_country": country}]),
    )

    async def get_user(*_):
        return SimpleNamespace(role="manager", organization_id="org_a")

    def management(user):
        if user.role not in ("manager", "owner", "admin"):
            raise HTTPException(403, "no")

    async def resolve(user, requested):
        if requested and requested != user.organization_id:
            raise HTTPException(403, "cross")
        return user.organization_id

    async def get_client():
        return SimpleNamespace(client_id="c1", organization_id="org_a")

    app = FastAPI()
    app.include_router(subject.build_messaging_consent_router(db, get_user, management, resolve, get_client))
    return TestClient(app), db


def test_manager_records_and_reverts_a_stop_only_for_clients_of_their_organization():
    client, db = build()
    assert client.post("/clients/c1/messaging-opt-out", json={"opted_out": True}).json() == {
        "client_id": "c1",
        "opted_out": True,
    }
    assert db.clients.docs[0]["messaging_opt_out_at"]
    assert db.clients.docs[0]["messaging_opt_out_source"] == "manager"
    client.post("/clients/c1/messaging-opt-out", json={"opted_out": False})
    assert db.clients.docs[0]["messaging_opt_out_at"] is None
    assert client.post("/clients/c2/messaging-opt-out", json={}).status_code == 404  # otra organizacion
    assert client.post("/clients/c1/messaging-opt-out", json={"organization_id": "org_b"}).status_code == 403


def test_client_portal_reads_and_changes_its_own_text_preference():
    client, db = build("US")
    assert client.get("/public/clients/messaging-consent").json() == {
        "required": True,
        "enabled": False,
        "reason": "no_consent",
    }
    assert client.put("/public/clients/messaging-consent", json={"enabled": True, "text": "I agree"}).json() == {
        "enabled": True
    }
    stored = db.clients.docs[0]
    assert stored["messaging_consent"] is True and stored["messaging_consent_text"] == "I agree"
    assert stored["messaging_consent_source"] == "client_portal"
    assert client.get("/public/clients/messaging-consent").json()["enabled"] is True
    client.put("/public/clients/messaging-consent", json={"enabled": False})
    assert db.clients.docs[0]["messaging_opt_out_at"]
    assert client.get("/public/clients/messaging-consent").json() == {
        "required": True,
        "enabled": False,
        "reason": "opted_out",
    }
    assert db.clients.docs[1].get("messaging_consent") is None  # no toca a otros clientes


def test_colombia_reports_that_consent_is_not_required():
    client, _ = build("CO")
    assert client.get("/public/clients/messaging-consent").json() == {
        "required": False,
        "enabled": True,
        "reason": None,
    }
