"""Resend/Svix webhook: signature, idempotency, suppression, privacy, Owner summary (no network, fake Mongo)."""

import base64
import hashlib
import hmac
import json
import sys
import time
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pymongo.errors import DuplicateKeyError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import resend_webhooks as subject  # noqa: E402

SECRET_BYTES = b"super-secret-key-bytes-1234567890"
SECRET = "whsec_" + base64.b64encode(SECRET_BYTES).decode()


def sign(body: bytes, msg_id="msg_1", timestamp=None, secret_bytes=SECRET_BYTES):
    timestamp = str(int(time.time()) if timestamp is None else timestamp)
    mac = hmac.new(secret_bytes, f"{msg_id}.{timestamp}.".encode() + body, hashlib.sha256).digest()
    return {"svix-id": msg_id, "svix-timestamp": timestamp, "svix-signature": "v1," + base64.b64encode(mac).decode()}


class Cursor:
    def __init__(self, rows):
        self.rows = rows

    async def to_list(self, _n):
        return [dict(r) for r in self.rows]


class Collection:
    def __init__(self):
        self.docs = []

    async def insert_one(self, doc):
        if "event_id" in doc and any(d.get("event_id") == doc["event_id"] for d in self.docs):
            raise DuplicateKeyError("dup")
        self.docs.append(dict(doc))

    async def update_one(self, query, update, upsert=False):
        for d in self.docs:
            if all(d.get(k) == v for k, v in query.items()):
                d.update(update["$set"])
                return
        if upsert:
            self.docs.append({**query, **update.get("$setOnInsert", {}), **update["$set"]})

    def find(self, query=None, projection=None):
        rows = self.docs
        cond = (query or {}).get("created_at_dt")
        if cond:
            rows = [d for d in rows if d["created_at_dt"] >= cond["$gte"]]
        return Cursor(rows)


def build(role="owner"):
    db = SimpleNamespace(email_events=Collection(), email_suppressions=Collection())

    async def current_user(*_):
        return SimpleNamespace(role=role, access_status="approved")

    app = FastAPI()
    app.include_router(subject.build_resend_webhook_router(db, current_user), prefix="/api")
    return TestClient(app), db


@pytest.fixture(autouse=True)
def secret(monkeypatch):
    monkeypatch.setenv("RESEND_WEBHOOK_SECRET", SECRET)


def post(client, payload, **kwargs):
    body = json.dumps(payload).encode()
    return client.post("/api/webhooks/resend", content=body, headers=sign(body, **kwargs))


BOUNCE = {
    "type": "email.bounced",
    "data": {"email_id": "em_1", "to": ["cliente@example.com"], "bounce": {"type": "Permanent"}},
}


def test_without_a_secret_the_endpoint_refuses_everything(monkeypatch):
    monkeypatch.delenv("RESEND_WEBHOOK_SECRET")
    client, db = build()
    assert post(client, BOUNCE).status_code == 503 and db.email_events.docs == []


def test_signature_must_verify_and_be_fresh():
    client, db = build()
    body = json.dumps(BOUNCE).encode()
    assert client.post("/api/webhooks/resend", content=body).status_code == 401
    assert post(client, BOUNCE, secret_bytes=b"another-secret").status_code == 401
    assert post(client, BOUNCE, timestamp=int(time.time()) - 3600).status_code == 401
    tampered = sign(body)
    assert client.post("/api/webhooks/resend", content=body + b" ", headers=tampered).status_code == 401
    assert db.email_events.docs == []


def test_verify_signature_accepts_any_listed_version_and_rejects_garbage():
    body = b"{}"
    headers = sign(body)
    multi = "v1,AAAA " + headers["svix-signature"]
    assert subject.verify_signature(SECRET, "msg_1", headers["svix-timestamp"], multi, body) is True
    assert subject.verify_signature(SECRET, "msg_1", "not-a-number", multi, body) is False
    assert subject.verify_signature("", "msg_1", headers["svix-timestamp"], multi, body) is False


def test_a_hard_bounce_is_stored_masked_and_suppresses_the_address():
    client, db = build()
    assert post(client, BOUNCE).json() == {"received": True, "stored": True}
    event = db.email_events.docs[0]
    assert event["address_masked"] == "c***@example.com" and "cliente@example.com" not in json.dumps(event, default=str)
    assert db.email_suppressions.docs[0]["reason"] == "email.bounced"
    assert "cliente@example.com" not in json.dumps(db.email_suppressions.docs, default=str)


def test_a_transient_bounce_is_recorded_but_does_not_suppress():
    client, db = build()
    soft = {"type": "email.bounced", "data": {"to": ["a@example.com"], "bounce": {"type": "Transient"}}}
    post(client, soft, msg_id="msg_soft")
    assert len(db.email_events.docs) == 1 and db.email_suppressions.docs == []


def test_replayed_events_are_idempotent():
    client, db = build()
    post(client, BOUNCE)
    assert post(client, BOUNCE).json()["duplicate"] is True
    assert len(db.email_events.docs) == 1


def test_untracked_events_and_bad_json_are_handled():
    client, db = build()
    assert post(client, {"type": "email.opened", "data": {}}).json() == {"received": True, "stored": False}
    body = b"not json"
    assert client.post("/api/webhooks/resend", content=body, headers=sign(body)).status_code == 400
    assert db.email_events.docs == []


def test_owner_summary_is_owner_only_and_masked():
    client, db = build()
    post(client, BOUNCE)
    post(client, {"type": "email.delivered", "data": {"to": ["b@example.com"]}}, msg_id="msg_2")
    summary = client.get("/api/owner/email-events").json()
    assert summary["configured"] is True and summary["counts"] == {"email.bounced": 1, "email.delivered": 1}
    assert summary["suppressed"][0]["address_masked"] == "c***@example.com"
    assert "cliente@example.com" not in json.dumps(summary)
    manager, _ = build(role="manager")
    assert manager.get("/api/owner/email-events").status_code == 403


def test_oversized_payloads_are_rejected_before_the_signature_is_even_checked():
    client, db = build()
    body = b"x" * (subject.MAX_BODY_BYTES + 1)
    response = client.post("/api/webhooks/resend", content=body, headers=sign(body))
    assert response.status_code == 413 and db.email_events.docs == []


def test_a_body_without_content_length_is_capped_while_streaming():
    client, db = build()

    def chunks():
        for _ in range(8):
            yield b"y" * (subject.MAX_BODY_BYTES // 4)

    response = client.post("/api/webhooks/resend", content=chunks(), headers=sign(b"unused"))
    assert response.status_code == 413 and db.email_events.docs == []
