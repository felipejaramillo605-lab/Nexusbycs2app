"""Resend delivery with SMTP fallback (no network: requests.post and smtplib are replaced by fakes)."""

import base64
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest
import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import email_providers  # noqa: E402
import email_service as email_module  # noqa: E402
import owner_subscription_lifecycle as lifecycle  # noqa: E402


@pytest.fixture
def resend_env(monkeypatch):
    monkeypatch.setenv("EMAIL_PROVIDER", "resend")
    monkeypatch.setenv("RESEND_API_KEY", "re_test_key")
    monkeypatch.setenv("RESEND_FROM_EMAIL", "no-reply@mail.nexusbycs2.com")
    monkeypatch.setenv("SMTP_FROM_NAME", "Nexus by CS2")


@pytest.fixture
def posts(monkeypatch):
    calls = []
    state = {"status": 200, "raise": None}

    def fake_post(url, json=None, headers=None, timeout=None):
        calls.append({"url": url, "json": json, "headers": headers, "timeout": timeout})
        if state["raise"]:
            raise state["raise"]
        return SimpleNamespace(status_code=state["status"])

    monkeypatch.setattr(email_providers.requests, "post", fake_post)
    return calls, state


@pytest.fixture
def smtp(monkeypatch):
    sent = []

    class FakeSMTP:
        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def starttls(self, *args, **kwargs):
            pass

        def ehlo(self):
            pass

        def login(self, *args):
            pass

        def send_message(self, msg):
            sent.append(msg["To"])

    monkeypatch.setattr(email_module.smtplib, "SMTP", FakeSMTP)
    monkeypatch.setattr(lifecycle.smtplib, "SMTP", FakeSMTP)
    return sent


def test_resend_is_off_unless_fully_configured(monkeypatch):
    for name in ("EMAIL_PROVIDER", "RESEND_API_KEY", "RESEND_FROM_EMAIL"):
        monkeypatch.delenv(name, raising=False)
    assert email_providers.resend_enabled() is False
    monkeypatch.setenv("EMAIL_PROVIDER", "resend")
    monkeypatch.setenv("RESEND_API_KEY", "re_x")
    assert email_providers.resend_enabled() is False  # still no verified sender
    assert email_providers.send_via_resend("a@b.co", "s", "<p>h</p>") == (False, "resend_not_configured")


def test_payload_has_sender_recipient_text_cc_and_base64_attachment(resend_env, posts):
    calls, _ = posts
    ok, code = email_providers.send_via_resend(
        "cliente@example.com",
        "Factura",
        "<p>hola</p>",
        "hola",
        cc=["conta@example.com", ""],
        attachments=[("F-1.pdf", b"%PDF-data", "application/pdf")],
    )
    assert (ok, code) == (True, None)
    call = calls[0]
    assert call["url"] == "https://api.resend.com/emails"
    assert call["headers"] == {"Authorization": "Bearer re_test_key"}
    body = call["json"]
    assert body["from"] == "Nexus by CS2 <no-reply@mail.nexusbycs2.com>"
    assert body["to"] == ["cliente@example.com"] and body["cc"] == ["conta@example.com"]
    assert body["text"] == "hola" and body["html"] == "<p>hola</p>"
    assert base64.b64decode(body["attachments"][0]["content"]) == b"%PDF-data"


@pytest.mark.parametrize("status", [429, 500, 422])
def test_http_errors_are_reported_without_raising(resend_env, posts, status):
    _, state = posts
    state["status"] = status
    assert email_providers.send_via_resend("a@b.co", "s", "<p>h</p>") == (False, f"http_{status}")


def test_network_errors_are_reported_without_raising(resend_env, posts):
    _, state = posts
    state["raise"] = requests.ConnectTimeout()
    assert email_providers.send_via_resend("a@b.co", "s", "<p>h</p>") == (False, "ConnectTimeout")


def test_logs_never_contain_the_recipient(resend_env, posts, caplog):
    _, state = posts
    state["status"] = 500
    with caplog.at_level("INFO"):
        email_providers.send_via_resend("secreto@example.com", "s", "<p>h</p>")
    assert "secreto@example.com" not in caplog.text


def test_email_service_uses_resend_and_skips_smtp_on_success(resend_env, posts, smtp):
    calls, _ = posts
    assert email_module.email_service._send_email("c@example.com", "Hola", "<p>x</p>", "x") is True
    assert len(calls) == 1 and smtp == []


def test_email_service_falls_back_to_smtp_when_resend_fails(resend_env, posts, smtp, monkeypatch):
    _, state = posts
    state["status"] = 503
    monkeypatch.setenv("SMTP_PASSWORD", "x")
    assert email_module.email_service._send_email("c@example.com", "Hola", "<p>x</p>", "x") is True
    assert smtp == ["c@example.com"]


def test_email_service_is_unchanged_when_resend_is_off(posts, smtp, monkeypatch):
    calls, _ = posts
    monkeypatch.delenv("EMAIL_PROVIDER", raising=False)
    assert email_module.email_service._send_email("c@example.com", "Hola", "<p>x</p>", "x") is True
    assert calls == [] and smtp == ["c@example.com"]


def test_invoice_email_goes_through_resend_with_the_pdf_and_cc(resend_env, posts, smtp):
    calls, _ = posts
    invoice = {"invoice_id": "inv_1", "invoice_number": "NXS-1", "total": 1000, "due_date": "2026-11-01"}
    ok, error = lifecycle.send_invoice_email(invoice, "c@example.com", ["conta@example.com"], "invoice_issued", b"%PDF")
    assert (ok, error) == (True, None)
    body = calls[0]["json"]
    assert body["attachments"][0]["filename"] == "NXS-1.pdf" and body["cc"] == ["conta@example.com"]
    assert smtp == []


def test_invoice_email_falls_back_to_smtp_when_resend_is_down(resend_env, posts, smtp, monkeypatch):
    _, state = posts
    state["status"] = 500
    for name, value in (
        ("SMTP_HOST", "smtp.test"),
        ("SMTP_USER", "u"),
        ("SMTP_PASSWORD", "p"),
        ("SMTP_FROM_EMAIL", "f@x.co"),
    ):
        monkeypatch.setenv(name, value)
    invoice = {"invoice_id": "inv_1", "invoice_number": "NXS-1", "total": 1000, "due_date": "2026-11-01"}
    assert lifecycle.send_invoice_email(invoice, "c@example.com", [], "invoice_issued", b"%PDF") == (True, None)
    assert smtp == ["c@example.com"]
