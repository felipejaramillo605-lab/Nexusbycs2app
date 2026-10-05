"""Hardening from the Codex audit: archived organizations on every public path, R2 key/size checks, mail headers."""

import ast
import asyncio
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import email_providers  # noqa: E402
import object_storage  # noqa: E402
import owner_account_management as accounts  # noqa: E402

SERVER = Path(__file__).resolve().parents[1] / "server.py"

# Every public / client-portal entry point that receives an organization (or something that leads to one).
GUARDED = [
    "get_current_client",
    "passwordless_login",
    "get_client_history_public",
    "unsubscribe_client",
    "register_client_with_pin",
    "login_client_with_pin",
    "forgot_client_pin",
    "reset_client_pin",
    "_get_public_appointment_with_token",
    "leave_class_waitlist",
    "cancel_class_booking",
]


def test_every_public_entry_point_checks_the_organization_is_active():
    source = SERVER.read_text(encoding="utf-8")
    tree = ast.parse(source)
    functions = {n.name: n for n in ast.walk(tree) if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))}
    missing = [
        name
        for name in GUARDED
        if "assert_organization_active" not in (ast.get_source_segment(source, functions[name]) or "")
    ]
    assert missing == []


class Organizations:
    def __init__(self, docs):
        self.docs = docs

    async def find_one(self, query, projection=None):
        for doc in self.docs:
            if doc["organization_id"] == query["organization_id"] and doc.get("deleted_at"):
                return doc
        return None


def db_with(*docs):
    return SimpleNamespace(organizations=Organizations(list(docs)))


def test_archived_organization_is_a_404_and_active_ones_pass():
    db = db_with(
        {"organization_id": "org_gone", "deleted_at": "2026-10-04T00:00:00+00:00"}, {"organization_id": "org_ok"}
    )
    with pytest.raises(HTTPException) as caught:
        asyncio.run(accounts.assert_organization_active(db, "org_gone"))
    assert caught.value.status_code == 404
    asyncio.run(accounts.assert_organization_active(db, "org_ok"))
    asyncio.run(
        accounts.assert_organization_active(db, None)
    )  # tokens without organization are left to their own checks


@pytest.mark.parametrize(
    "namespace,key",
    [
        ("platform", "../x.webp"),
        ("platform", "a/../b.webp"),
        ("platform", "/abs.webp"),
        ("platform", "a//b.webp"),
        ("platform", "a\\b.webp"),
        ("platform", "a\nb.webp"),
        ("secrets", "x.webp"),
        ("platform", ""),
    ],
)
def test_object_storage_rejects_non_canonical_keys(namespace, key):
    with pytest.raises(ValueError):
        object_storage.validate_key(namespace, key)
    with pytest.raises(ValueError):
        asyncio.run(object_storage.put_object(namespace, key, b"x", "image/webp"))
    with pytest.raises(ValueError):
        asyncio.run(object_storage.get_object(namespace, key))


def test_object_storage_accepts_the_real_key_shapes():
    object_storage.validate_key("catalog", "org_1/0123456789abcdef0123456789abcdef.webp")
    object_storage.validate_key("platform", "0123456789abcdef0123456789abcdef.webp")


def test_oversized_stored_objects_are_refused(monkeypatch):
    class Body:
        def __init__(self, size):
            self.size = size

        def read(self, limit=None):
            return b"x" * min(self.size, limit if limit is not None else self.size)

    class Client:
        def __init__(self, length, size):
            self.length, self.size = length, size

        def get_object(self, Bucket, Key):  # noqa: N803
            return {"ContentLength": self.length, "Body": Body(self.size)}

    too_big = object_storage.MAX_OBJECT_BYTES + 1
    monkeypatch.setattr(object_storage, "_client", lambda: (Client(too_big, too_big), "bucket"))
    with pytest.raises(ValueError):
        object_storage._get("nexus/platform/a.webp")
    # a lying ContentLength cannot make us read an unbounded body
    monkeypatch.setattr(object_storage, "_client", lambda: (Client(10, too_big), "bucket"))
    with pytest.raises(ValueError):
        object_storage._get("nexus/platform/a.webp")
    monkeypatch.setattr(object_storage, "_client", lambda: (Client(3, 3), "bucket"))
    assert object_storage._get("nexus/platform/a.webp") == b"xxx"


@pytest.fixture
def resend_env(monkeypatch):
    monkeypatch.setenv("EMAIL_PROVIDER", "resend")
    monkeypatch.setenv("RESEND_API_KEY", "re_x")
    monkeypatch.setenv("RESEND_FROM_EMAIL", "no-reply@mail.nexusbycs2.com")


def test_mail_headers_and_addresses_are_validated_before_calling_the_provider(resend_env, monkeypatch):
    calls = []
    monkeypatch.setattr(email_providers.requests, "post", lambda *a, **k: calls.append(1))
    send = email_providers.send_via_resend
    assert send("a@b.co", "Hola\r\nBcc: x@y.co", "<p>h</p>") == (False, "invalid_header")
    assert send("a@b.co", "Hola", "<p>h</p>", from_name="Nexus\nEvil") == (False, "invalid_header")
    assert send("a@b.co\nbcc: x@y.co", "Hola", "<p>h</p>") == (False, "invalid_address")
    assert send("not-an-address", "Hola", "<p>h</p>") == (False, "invalid_address")
    assert send("a@b.co", "Hola", "<p>h</p>", cc=["ok@b.co", "bad,list@b.co"]) == (False, "invalid_address")
    assert calls == []
