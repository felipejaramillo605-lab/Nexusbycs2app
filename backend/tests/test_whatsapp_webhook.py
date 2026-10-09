"""Webhook de WhatsApp: verificacion, firma y baja automatica (STOP)."""

import hashlib
import hmac
import json
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import whatsapp_webhook as subject  # noqa: E402

SECRET = "app-secret"


class Clients:
    def __init__(self, docs):
        self.docs = docs

    async def update_many(self, query, update):
        wanted = query["phone"]["$in"]
        modified = 0
        for doc in self.docs:
            if doc.get("phone") in wanted and doc.get("messaging_opt_out_at") is None:
                doc.update(update["$set"])
                modified += 1
        return SimpleNamespace(modified_count=modified)


def build(monkeypatch, secret=SECRET, token="verify-me"):
    for key, value in (("WHATSAPP_APP_SECRET", secret), ("WHATSAPP_VERIFY_TOKEN", token)):
        if value:
            monkeypatch.setenv(key, value)
        else:
            monkeypatch.delenv(key, raising=False)
    sent = []

    async def send_text(to, text):
        sent.append((to, text))

    db = SimpleNamespace(
        clients=Clients(
            [
                {"client_id": "a", "organization_id": "org1", "phone": "+573001112233", "messaging_opt_out_at": None},
                {"client_id": "b", "organization_id": "org2", "phone": "+573001112233", "messaging_opt_out_at": None},
                {"client_id": "c", "organization_id": "org1", "phone": "+573009998877", "messaging_opt_out_at": None},
            ]
        )
    )
    app = FastAPI()
    app.include_router(subject.build_whatsapp_webhook_router(db, send_text), prefix="/api")
    return TestClient(app), db, sent


def payload(text, wa_id="573001112233", kind="text"):
    message = {"from": wa_id, "id": "wamid.1", "type": kind}
    if kind == "text":
        message["text"] = {"body": text}
    else:
        message["button"] = {"text": text}
    return {"entry": [{"changes": [{"field": "messages", "value": {"messages": [message]}}]}]}


def signed(client, body, secret=SECRET, header=True):
    raw = json.dumps(body).encode()
    headers = {"Content-Type": "application/json"}
    if header:
        headers["X-Hub-Signature-256"] = "sha256=" + hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
    return client.post("/api/webhooks/whatsapp", content=raw, headers=headers)


def test_meta_challenge_is_answered_only_with_the_right_token(monkeypatch):
    client, _, _ = build(monkeypatch)
    ok = client.get(
        "/api/webhooks/whatsapp",
        params={"hub.mode": "subscribe", "hub.verify_token": "verify-me", "hub.challenge": "1234"},
    )
    assert ok.status_code == 200 and ok.text == "1234"
    bad = client.get(
        "/api/webhooks/whatsapp", params={"hub.mode": "subscribe", "hub.verify_token": "nope", "hub.challenge": "1234"}
    )
    assert bad.status_code == 403
    assert client.get("/api/webhooks/whatsapp").status_code == 403


def test_nothing_is_accepted_without_configuration(monkeypatch):
    client, _, _ = build(monkeypatch, secret="", token="")
    assert (
        client.get(
            "/api/webhooks/whatsapp", params={"hub.mode": "subscribe", "hub.verify_token": "", "hub.challenge": "1"}
        ).status_code
        == 503
    )
    assert signed(client, payload("STOP")).status_code == 503


def test_unsigned_or_wrongly_signed_requests_are_rejected_and_change_nothing(monkeypatch):
    client, db, sent = build(monkeypatch)
    assert signed(client, payload("STOP"), header=False).status_code == 401
    assert signed(client, payload("STOP"), secret="other").status_code == 401
    assert all(doc["messaging_opt_out_at"] is None for doc in db.clients.docs)
    assert sent == []


def test_oversized_signed_payload_is_rejected_before_processing(monkeypatch):
    client, db, sent = build(monkeypatch)
    raw = b"{" + (b" " * subject.MAX_BODY_BYTES) + b"}"
    signature = "sha256=" + hmac.new(SECRET.encode(), raw, hashlib.sha256).hexdigest()

    response = client.post(
        "/api/webhooks/whatsapp",
        content=raw,
        headers={"Content-Type": "application/json", "X-Hub-Signature-256": signature},
    )

    assert response.status_code == 413
    assert all(doc["messaging_opt_out_at"] is None for doc in db.clients.docs)
    assert sent == []


def test_stop_opts_out_every_client_with_that_phone_in_every_organization_and_confirms(monkeypatch):
    client, db, sent = build(monkeypatch)
    response = signed(client, payload("  Stop. "))
    assert response.status_code == 200 and response.json() == {"received": True, "opted_out": 2}
    by_id = {doc["client_id"]: doc for doc in db.clients.docs}
    assert by_id["a"]["messaging_opt_out_at"] and by_id["b"]["messaging_opt_out_at"]
    assert by_id["a"]["messaging_opt_out_source"] == "whatsapp_stop"
    assert by_id["c"]["messaging_opt_out_at"] is None  # otro telefono: no se toca
    assert sent == [("+573001112233", subject.CONFIRMATION_EN)]


def test_spanish_keywords_get_a_spanish_confirmation_and_buttons_count_too(monkeypatch):
    client, db, sent = build(monkeypatch)
    assert signed(client, payload("Baja", kind="button")).json()["opted_out"] == 2
    assert sent[0][1] == subject.CONFIRMATION_ES


@pytest.mark.parametrize(
    "text", ["para cancelar mi cita", "no quiero parar", "stop by tomorrow", "hola", "cancelar", ""]
)
def test_ordinary_messages_never_opt_anyone_out(monkeypatch, text):
    client, db, sent = build(monkeypatch)
    response = signed(client, payload(text))
    assert response.status_code == 200 and response.json()["opted_out"] == 0
    assert all(doc["messaging_opt_out_at"] is None for doc in db.clients.docs)
    assert sent == []


def test_status_updates_and_other_fields_are_acknowledged_without_side_effects(monkeypatch):
    client, db, sent = build(monkeypatch)
    body = {
        "entry": [
            {
                "changes": [
                    {"field": "message_template_status_update", "value": {}},
                    {"field": "messages", "value": {"statuses": [{"status": "delivered"}]}},
                ]
            }
        ]
    }
    assert signed(client, body).json() == {"received": True, "opted_out": 0}


def test_signature_helper_is_constant_time_and_strict():
    assert subject.verify_signature(
        SECRET, "sha256=" + hmac.new(SECRET.encode(), b"x", hashlib.sha256).hexdigest(), b"x"
    )
    assert not subject.verify_signature(SECRET, "sha1=abc", b"x")
    assert not subject.verify_signature("", "sha256=abc", b"x")
    assert not subject.verify_signature(SECRET, None, b"x")
