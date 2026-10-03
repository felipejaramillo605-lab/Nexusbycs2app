import asyncio
import sys
from pathlib import Path
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import organization_background_media  # noqa: E402
import organization_media  # noqa: E402
import platform_branding  # noqa: E402
import product_catalog  # noqa: E402
import professional_media  # noqa: E402
from media_mirror import mirror_put  # noqa: E402


class Blobs:
    def __init__(self):
        self.docs = {}

    async def update_one(self, query, update, upsert=False):
        self.docs[(query["namespace"], query["key"])] = update["$set"]

    async def find_one(self, query, projection=None):
        return self.docs.get((query["namespace"], query["key"]))

    async def delete_one(self, query):
        self.docs.pop((query["namespace"], query["key"]), None)


def _app(router):
    app = FastAPI()
    app.include_router(router)
    return TestClient(app, raise_server_exceptions=False)


def _db():
    return SimpleNamespace(media_blobs=Blobs())


def test_platform_route_restores_from_mirror(tmp_path, monkeypatch):
    db = _db()
    monkeypatch.setattr(platform_branding, "media_root", lambda: tmp_path / "platform")
    asyncio.run(mirror_put(db, "platform", "a" * 32 + ".webp", b"platform", "image/webp"))
    client = _app(platform_branding.build_platform_branding_router(db, lambda *_: None))
    response = client.get(f"/media/platform/{'a' * 32}.webp")
    assert response.status_code == 200 and response.content == b"platform"


def test_organization_route_restores_from_mirror(tmp_path, monkeypatch):
    db = _db()
    monkeypatch.setattr(organization_media, "media_root", lambda: tmp_path / "organizations")
    filename = "b" * 32 + ".webp"
    asyncio.run(mirror_put(db, "organizations", f"org_a/{filename}", b"organization", "image/webp"))
    client = _app(organization_media.build_organization_media_router(db, None, None, None))
    response = client.get(f"/media/organizations/org_a/{filename}")
    assert response.status_code == 200 and response.content == b"organization"


def test_professional_route_restores_from_mirror(tmp_path, monkeypatch):
    db = _db()
    monkeypatch.setattr(professional_media, "media_root", lambda: tmp_path / "professionals")
    filename = "c" * 32 + ".webp"
    asyncio.run(mirror_put(db, "professionals", f"org_a/{filename}", b"professional", "image/webp"))
    client = _app(professional_media.build_professional_media_router(db, None, None, None, None, None))
    response = client.get(f"/media/professionals/org_a/{filename}")
    assert response.status_code == 200 and response.content == b"professional"


def test_background_route_restores_from_mirror(tmp_path, monkeypatch):
    db = _db()
    monkeypatch.setattr(organization_background_media, "media_root", lambda: tmp_path / "backgrounds")
    filename = "d" * 32 + ".webp"
    asyncio.run(mirror_put(db, "portal-backgrounds", f"org_a/{filename}", b"background", "image/webp"))
    client = _app(organization_background_media.build_organization_background_media_router(db, None, None, None))
    response = client.get(f"/media/portal-backgrounds/org_a/{filename}")
    assert response.status_code == 200 and response.content == b"background"


def test_catalog_route_restores_from_mirror(tmp_path, monkeypatch):
    db = _db()
    monkeypatch.setattr(product_catalog, "catalog_media_root", lambda: tmp_path / "catalog")
    filename = "e" * 32 + ".webp"
    asyncio.run(mirror_put(db, "catalog", f"org_a/{filename}", b"catalog", "image/webp"))
    client = _app(product_catalog.build_product_catalog_router(db, None, None, None))
    response = client.get(f"/media/catalog/org_a/{filename}")
    assert response.status_code == 200 and response.content == b"catalog"


def test_background_upload_over_mirror_limit_stays_on_disk_instead_of_failing(tmp_path, monkeypatch):
    # Videos up to 20 MB are allowed but MongoDB documents cap at 16 MB: the upload must succeed unmirrored.
    from media_mirror import MAX_MIRROR_BYTES

    class Orgs:
        def __init__(self):
            self.doc = {"organization_id": "org_a"}

        async def find_one(self, query, projection=None):
            return dict(self.doc)

        async def update_one(self, query, update):
            self.doc.update(update["$set"])

    db = SimpleNamespace(media_blobs=Blobs(), organizations=Orgs())
    monkeypatch.setattr(organization_background_media, "media_root", lambda: tmp_path / "backgrounds")

    async def fake_prepare(source):
        return b"v" * (MAX_MIRROR_BYTES + 1), "mp4", 5.0, "video"

    monkeypatch.setattr(organization_background_media, "prepare_background_upload", fake_prepare)

    async def current_user(*_):
        return SimpleNamespace(role="manager", organization_id="org_a")

    async def resolve(user, requested):
        return "org_a"

    router = organization_background_media.build_organization_background_media_router(
        db, current_user, lambda user: None, resolve
    )
    files = {"file": ("bg.mp4", b"x", "video/mp4")}
    response = _app(router).post("/organizations/org_a/portal-background", files=files)
    assert response.status_code == 200, response.text
    assert db.media_blobs.docs == {}
    assert db.organizations.doc["portal_background_type"] == "video"
