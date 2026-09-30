"""Tests for whatsapp_service.py: mock fallback when no Cloud API
credentials are configured, and the real WhatsApp Cloud API path (HTTP
mocked via httpx.MockTransport, no real network) once they are.
"""

import asyncio
import json
import sys
from pathlib import Path
from types import SimpleNamespace

import httpx
import pytest

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

import whatsapp_service  # noqa: E402


class FakeCollection:
    def __init__(self):
        self.rows = []

    async def insert_one(self, row):
        self.rows.append(dict(row))


def _database():
    return SimpleNamespace(whatsapp_mock_outbox=FakeCollection())


def _clear_env(monkeypatch):
    for key in (
        "WHATSAPP_ACCESS_TOKEN",
        "WHATSAPP_PHONE_NUMBER_ID",
        "WHATSAPP_GENERIC_TEMPLATE_NAME",
        "WHATSAPP_TEMPLATE_LANGUAGE",
    ):
        monkeypatch.delenv(key, raising=False)


def test_is_configured_is_false_without_credentials(monkeypatch):
    _clear_env(monkeypatch)
    assert whatsapp_service.is_configured() is False


def test_is_configured_is_true_once_both_credentials_are_set(monkeypatch):
    _clear_env(monkeypatch)
    monkeypatch.setenv("WHATSAPP_ACCESS_TOKEN", "token-123")
    monkeypatch.setenv("WHATSAPP_PHONE_NUMBER_ID", "phone-456")
    assert whatsapp_service.is_configured() is True


def test_mock_mode_logs_to_outbox_and_stdout_when_not_configured(monkeypatch, capsys):
    _clear_env(monkeypatch)
    db = _database()

    result = asyncio.run(
        whatsapp_service.send_whatsapp_message(
            db,
            to_phone="+573001234567",
            message="Hola, tienes stock bajo",
            organization_id="org-1",
            context="low_stock_alert",
        )
    )

    assert result == {"accepted": True, "provider": "mock", "status": "sent_mock"}
    assert len(db.whatsapp_mock_outbox.rows) == 1
    assert db.whatsapp_mock_outbox.rows[0]["message"] == "Hola, tienes stock bajo"
    assert db.whatsapp_mock_outbox.rows[0]["context"] == "low_stock_alert"
    captured = capsys.readouterr()
    assert "whatsapp_mock_sent" in captured.out
    assert "+573001234567" not in captured.out  # no raw phone number in logs, only its fingerprint


def test_missing_recipient_is_never_sent():
    db = _database()

    result = asyncio.run(
        whatsapp_service.send_whatsapp_message(db, to_phone="", message="hola", organization_id="org-1")
    )

    assert result["accepted"] is False
    assert result["status"] == "missing_recipient"
    assert db.whatsapp_mock_outbox.rows == []


def test_real_mode_missing_template_name_is_not_accepted(monkeypatch):
    _clear_env(monkeypatch)
    monkeypatch.setenv("WHATSAPP_ACCESS_TOKEN", "token-123")
    monkeypatch.setenv("WHATSAPP_PHONE_NUMBER_ID", "phone-456")
    db = _database()

    result = asyncio.run(
        whatsapp_service.send_whatsapp_message(db, to_phone="+573001234567", message="hola", organization_id="org-1")
    )

    assert result == {"accepted": False, "provider": "whatsapp_cloud_api", "status": "missing_template_configuration"}
    assert db.whatsapp_mock_outbox.rows == []


def _patch_transport(monkeypatch, handler):
    real_async_client = httpx.AsyncClient

    def _client_factory(*args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(handler)
        return real_async_client(*args, **kwargs)

    monkeypatch.setattr(whatsapp_service.httpx, "AsyncClient", _client_factory)


def test_real_mode_sends_the_free_text_message_as_the_generic_template_single_variable(monkeypatch):
    _clear_env(monkeypatch)
    monkeypatch.setenv("WHATSAPP_ACCESS_TOKEN", "token-123")
    monkeypatch.setenv("WHATSAPP_PHONE_NUMBER_ID", "phone-456")
    monkeypatch.setenv("WHATSAPP_GENERIC_TEMPLATE_NAME", "aviso_general")
    captured_request = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured_request["url"] = str(request.url)
        captured_request["headers"] = dict(request.headers)
        captured_request["body"] = json.loads(request.content)
        return httpx.Response(200, json={"messages": [{"id": "wamid.ABC123"}]})

    _patch_transport(monkeypatch, handler)
    db = _database()

    result = asyncio.run(
        whatsapp_service.send_whatsapp_message(
            db,
            to_phone="+573001234567",
            message="Tu cita es mañana a las 3pm",
            organization_id="org-1",
            context="reminder_24h",
        )
    )

    assert result == {
        "accepted": True,
        "provider": "whatsapp_cloud_api",
        "status": "sent",
        "message_id": "wamid.ABC123",
    }
    assert "phone-456" in captured_request["url"]
    assert captured_request["headers"]["authorization"] == "Bearer token-123"
    body = captured_request["body"]
    assert body["to"] == "+573001234567"
    assert body["type"] == "template"
    assert body["template"]["name"] == "aviso_general"
    assert body["template"]["components"][0]["parameters"][0]["text"] == "Tu cita es mañana a las 3pm"
    assert db.whatsapp_mock_outbox.rows == []  # never falls back to mock once configured


def test_real_mode_http_error_is_not_accepted_and_not_raised(monkeypatch):
    _clear_env(monkeypatch)
    monkeypatch.setenv("WHATSAPP_ACCESS_TOKEN", "token-123")
    monkeypatch.setenv("WHATSAPP_PHONE_NUMBER_ID", "phone-456")
    monkeypatch.setenv("WHATSAPP_GENERIC_TEMPLATE_NAME", "aviso_general")

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(400, json={"error": {"message": "Template not approved"}})

    _patch_transport(monkeypatch, handler)
    db = _database()

    result = asyncio.run(
        whatsapp_service.send_whatsapp_message(db, to_phone="+573001234567", message="hola", organization_id="org-1")
    )

    assert result["accepted"] is False
    assert result["status"] == "http_400"
    assert result["provider"] == "whatsapp_cloud_api"


def test_real_mode_network_failure_is_not_accepted_and_not_raised(monkeypatch):
    _clear_env(monkeypatch)
    monkeypatch.setenv("WHATSAPP_ACCESS_TOKEN", "token-123")
    monkeypatch.setenv("WHATSAPP_PHONE_NUMBER_ID", "phone-456")
    monkeypatch.setenv("WHATSAPP_GENERIC_TEMPLATE_NAME", "aviso_general")

    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused", request=request)

    _patch_transport(monkeypatch, handler)
    db = _database()

    result = asyncio.run(
        whatsapp_service.send_whatsapp_message(db, to_phone="+573001234567", message="hola", organization_id="org-1")
    )

    assert result == {"accepted": False, "provider": "whatsapp_cloud_api", "status": "request_failed"}


def test_send_whatsapp_template_raises_when_not_configured(monkeypatch):
    _clear_env(monkeypatch)

    with pytest.raises(RuntimeError):
        asyncio.run(
            whatsapp_service.send_whatsapp_template(
                to_phone="+573001234567", template_name="aviso_general", template_params=["hola"]
            )
        )
