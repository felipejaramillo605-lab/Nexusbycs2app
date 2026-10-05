"""Owner connector status: booleans only, Owner-only (no network)."""

import json
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import owner_connector_status as subject  # noqa: E402

NAMES = (
    "R2_ACCOUNT_ID",
    "R2_BUCKET",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_ENDPOINT",
    "EMAIL_PROVIDER",
    "RESEND_API_KEY",
    "RESEND_FROM_EMAIL",
    "RESEND_WEBHOOK_SECRET",
    "DECISION_ENGINE_ENABLED",
    "JEV_API_KEY",
)


@pytest.fixture(autouse=True)
def clean_env(monkeypatch):
    for name in NAMES:
        monkeypatch.delenv(name, raising=False)


def client(role="owner"):
    async def current_user(*_):
        return SimpleNamespace(role=role, access_status="approved")

    app = FastAPI()
    app.include_router(subject.build_connector_status_router(current_user), prefix="/api")
    return TestClient(app)


def test_everything_is_off_by_default_and_email_falls_back_to_smtp():
    status = client().get("/api/owner/connectors/status").json()
    assert status["storage"] == {"durable_provider": None, "mongo_mirror": True}
    assert status["email"]["provider"] == "smtp" and status["email"]["resend_enabled"] is False
    assert status["decisions"] == {"engine_enabled": False, "jev_key_set": False}


def test_configured_connectors_are_reported_without_leaking_secrets(monkeypatch):
    values = {
        "R2_ACCOUNT_ID": "acct-secret-id",
        "R2_BUCKET": "bucket-name",
        "R2_ACCESS_KEY_ID": "key-id-secret",
        "R2_SECRET_ACCESS_KEY": "super-secret",
        "EMAIL_PROVIDER": "resend",
        "RESEND_API_KEY": "re_secret_key",
        "RESEND_FROM_EMAIL": "no-reply@mail.nexusbycs2.com",
        "RESEND_WEBHOOK_SECRET": "whsec_secret",
        "DECISION_ENGINE_ENABLED": "true",
    }
    for name, value in values.items():
        monkeypatch.setenv(name, value)
    response = client().get("/api/owner/connectors/status")
    status = response.json()
    assert status["storage"]["durable_provider"] == "cloudflare_r2"
    assert status["email"]["provider"] == "resend" and status["email"]["webhook_secret_set"] is True
    assert status["decisions"]["engine_enabled"] is True
    for secret in ("acct-secret-id", "key-id-secret", "super-secret", "re_secret_key", "whsec_secret", "bucket-name"):
        assert secret not in json.dumps(status)


def test_only_an_approved_owner_can_read_it():
    assert client(role="manager").get("/api/owner/connectors/status").status_code == 403


class _Mailer:
    def __init__(self, ok=True):
        self.calls = []
        self.ok = ok

    def _send_email(self, to, subject, html, text=None):
        self.calls.append(to)
        return self.ok


def _client_with_user(email="felipe@example.com", role="owner", user_id="owner_1"):
    async def current_user(*_):
        return SimpleNamespace(role=role, access_status="approved", user_id=user_id, email=email)

    app = FastAPI()
    app.include_router(subject.build_connector_status_router(current_user), prefix="/api")
    return TestClient(app)


def test_test_email_goes_only_to_the_signed_in_owner_through_resend(monkeypatch):
    sent = []
    monkeypatch.setenv("EMAIL_PROVIDER", "resend")
    monkeypatch.setenv("RESEND_API_KEY", "re_x")
    monkeypatch.setenv("RESEND_FROM_EMAIL", "no-reply@mail.nexusbycs2.com")
    monkeypatch.setattr(subject.email_providers, "send_via_resend", lambda to, *a, **k: sent.append(to) or (True, None))
    body = _client_with_user().post("/api/owner/connectors/test-email").json()
    assert sent == ["felipe@example.com"]
    assert body == {"sent": True, "provider": "resend", "resend_error": None, "recipient": "f***@example.com"}


def test_test_email_falls_back_to_smtp_and_reports_the_resend_error(monkeypatch):
    mailer = _Mailer()
    monkeypatch.setenv("EMAIL_PROVIDER", "resend")
    monkeypatch.setenv("RESEND_API_KEY", "re_x")
    monkeypatch.setenv("RESEND_FROM_EMAIL", "no-reply@mail.nexusbycs2.com")
    monkeypatch.setattr(subject.email_providers, "send_via_resend", lambda *a, **k: (False, "http_403"))
    import email_service as email_module

    monkeypatch.setattr(email_module, "email_service", mailer)
    body = _client_with_user().post("/api/owner/connectors/test-email").json()
    assert mailer.calls == ["felipe@example.com"]
    assert body["sent"] is True and body["provider"] == "smtp_fallback" and body["resend_error"] == "http_403"


def test_test_email_is_owner_only_and_rate_limited():
    assert _client_with_user(role="manager").post("/api/owner/connectors/test-email").status_code == 403
    import email_service as email_module

    client = _client_with_user(email="limit@example.com", user_id="owner_rate_limit")
    original = email_module.email_service
    email_module.email_service = _Mailer()
    try:
        statuses = [client.post("/api/owner/connectors/test-email").status_code for _ in range(7)]
    finally:
        email_module.email_service = original
    assert statuses[:5] == [200] * 5 and 429 in statuses[5:]


class _FakeLimits:
    def __init__(self):
        self.docs = {}

    async def find_one_and_update(self, query, update, upsert=False, return_document=None):
        doc = self.docs.setdefault(query["_id"], {"_id": query["_id"], "count": 0})
        doc["count"] += update["$inc"]["count"]
        return dict(doc)


def test_test_email_limit_is_shared_through_the_database_across_workers(monkeypatch):
    limits = _FakeLimits()
    db = SimpleNamespace(connector_rate_limits=limits)
    mailer = _Mailer()
    import email_service as email_module

    monkeypatch.setattr(email_module, "email_service", mailer)

    async def current_user(*_):
        return SimpleNamespace(role="owner", access_status="approved", user_id="owner_shared", email="a@example.com")

    def make_worker():
        app = FastAPI()
        app.include_router(subject.build_connector_status_router(current_user, db), prefix="/api")
        return TestClient(app)

    first, second = make_worker(), make_worker()
    statuses = [
        (first if i % 2 == 0 else second).post("/api/owner/connectors/test-email").status_code for i in range(7)
    ]
    assert statuses[:5] == [200] * 5 and statuses[5:] == [429, 429]


def test_test_email_rejects_a_malformed_owner_address_before_any_provider(monkeypatch):
    mailer = _Mailer()
    import email_service as email_module

    monkeypatch.setattr(email_module, "email_service", mailer)
    response = _client_with_user(email="not-an-address", user_id="owner_bad_mail").post(
        "/api/owner/connectors/test-email"
    )
    assert response.status_code == 422 and mailer.calls == []
