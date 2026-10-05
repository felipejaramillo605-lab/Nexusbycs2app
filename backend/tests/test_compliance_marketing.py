"""Focused compliance regressions; fixtures intentionally contain no real contact data."""

import ast
import os
import sys
from pathlib import Path

import pytest
from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test_database")
os.environ.setdefault("EMERGENT_LLM_KEY", "test-key")
os.environ.setdefault("CORS_ORIGINS", "http://localhost:3000")
import server  # noqa: E402


def test_unsubscribe_tokens_are_signed_and_expire(monkeypatch):
    monkeypatch.setenv("UNSUBSCRIBE_TOKEN_SECRET", "test-secret")
    token = server.create_unsubscribe_token("client_test", "org_test", expires_in_days=1)
    assert "client_test" not in token and "org_test" not in token
    assert server.verify_unsubscribe_token(token)["client_id"] == "client_test"
    with pytest.raises(HTTPException):
        server.verify_unsubscribe_token(token + "x")
    expired = server.create_unsubscribe_token("client_test", "org_test", expires_in_days=-1)
    with pytest.raises(HTTPException):
        server.verify_unsubscribe_token(expired)


def test_campaigns_have_one_click_headers_and_no_pii_prints():
    source = (Path(__file__).resolve().parents[1] / "server.py").read_text(encoding="utf-8")
    tree = ast.parse(source)
    campaign = next(
        node for node in ast.walk(tree) if isinstance(node, ast.AsyncFunctionDef) and node.name == "create_campaign"
    )
    body = ast.get_source_segment(source, campaign) or ""
    assert "List-Unsubscribe" in body and "List-Unsubscribe-Post" in body
    assert "unsubscribe?phone=" not in body
    assert '"accepts_marketing": False' in source
    assert not [
        node for node in ast.walk(campaign) if isinstance(node, ast.Call) and getattr(node.func, "id", None) == "print"
    ]


def test_business_registration_requires_adult_confirmation():
    source = (Path(__file__).resolve().parents[1] / "server.py").read_text(encoding="utf-8")
    assert "adult_confirmed: bool = False" in source
    assert '"adult_confirmed_at": now_iso' in source


def test_one_click_post_with_form_body_reaches_the_token_check():
    """RFC 8058: the mail client POSTs a form to the URL in List-Unsubscribe; it must not 422."""
    from fastapi.testclient import TestClient

    response = TestClient(server.app).post(
        "/api/public/clients/unsubscribe?token=invalid", data={"List-Unsubscribe": "One-Click"}
    )
    assert response.status_code == 400
