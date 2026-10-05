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
