"""Autorizacion de uso de imagenes antes de subirlas (sin red, base simulada)."""

import ast
import asyncio
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import media_rights as subject  # noqa: E402

BACKEND = Path(__file__).resolve().parents[1]


class Users:
    def __init__(self):
        self.docs = {"u1": {"user_id": "u1"}, "u2": {"user_id": "u2"}}

    async def find_one(self, query, projection=None):
        doc = self.docs.get(query["user_id"])
        return dict(doc) if doc else None

    async def update_one(self, query, update):
        self.docs[query["user_id"]].update(update["$set"])


class Audit:
    def __init__(self):
        self.docs = []

    async def insert_one(self, doc):
        self.docs.append(dict(doc))


def build():
    db = SimpleNamespace(users=Users(), platform_audit_log=Audit())

    async def current_user(authorization=None, session_token=None):
        token = authorization or session_token
        if token not in db.users.docs:
            raise HTTPException(status_code=401, detail="Not authenticated")
        return SimpleNamespace(user_id=token, organization_id="org_1")

    app = FastAPI()
    app.include_router(subject.build_media_rights_router(db, current_user), prefix="/api")
    return TestClient(app), db


def test_upload_is_blocked_until_the_user_accepts_and_the_error_carries_the_text():
    _, db = build()
    with pytest.raises(HTTPException) as caught:
        asyncio.run(subject.require_media_rights(db, SimpleNamespace(user_id="u1")))
    assert caught.value.status_code == 409
    assert caught.value.detail["code"] == "media_rights_required" and "autorización" in caught.value.detail["message"]


def test_accepting_unblocks_only_that_user_and_keeps_evidence():
    client, db = build()
    assert client.get("/api/account/media-rights", headers={"Authorization": "u1"}).json()["accepted"] is False
    assert (
        client.post("/api/account/media-rights", json={"accepted": True}, headers={"Authorization": "u1"}).status_code
        == 200
    )
    asyncio.run(subject.require_media_rights(db, SimpleNamespace(user_id="u1")))
    with pytest.raises(HTTPException):
        asyncio.run(subject.require_media_rights(db, SimpleNamespace(user_id="u2")))
    stored = db.users.docs["u1"]
    assert stored["media_rights_version"] == subject.MEDIA_RIGHTS_VERSION and stored["media_rights_text_sha256"]
    assert db.platform_audit_log.docs and db.platform_audit_log.docs[0]["event_type"] == "media_rights_accepted"


def test_accept_requires_the_checkbox_and_current_version():
    client, _ = build()
    headers = {"Authorization": "u1"}
    assert client.post("/api/account/media-rights", json={"accepted": False}, headers=headers).status_code == 400
    assert (
        client.post("/api/account/media-rights", json={"accepted": True, "version": "0"}, headers=headers).status_code
        == 400
    )
    assert client.post("/api/account/media-rights", json={"accepted": True}).status_code == 401


def test_fakes_without_a_users_collection_are_not_blocked():
    asyncio.run(subject.require_media_rights(SimpleNamespace(), SimpleNamespace(user_id="x")))


UPLOADS = {
    "organization_media.py": ["upload_organization_logo"],
    "organization_background_media.py": ["upload_background"],
    "product_catalog.py": ["upload_product_photo", "add_product_photo_url"],
    "service_media.py": ["upload_service_photo"],
    "professional_media.py": ["upload_my_avatar", "upload_professional_avatar"],
}


@pytest.mark.parametrize("module,handlers", UPLOADS.items())
def test_every_org_upload_endpoint_checks_media_rights_before_touching_the_file(module, handlers):
    source = (BACKEND / module).read_text(encoding="utf-8")
    tree = ast.parse(source)
    for name in handlers:
        node = next(n for n in ast.walk(tree) if isinstance(n, ast.AsyncFunctionDef) and n.name == name)
        body = ast.get_source_segment(source, node)
        assert "require_media_rights(db, user)" in body, name
        gate = body.index("require_media_rights")
        for later in (
            "_read_limited",
            "normalize_image_async",
            "persist(",
            "prepare_background_upload",
            "db.catalog_products.update_one",
        ):
            if later in body:
                assert gate < body.index(later), (name, later)


def test_the_owner_platform_logo_is_not_gated():
    assert "require_media_rights" not in (BACKEND / "platform_branding.py").read_text(encoding="utf-8")
