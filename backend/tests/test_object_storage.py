"""Cloudflare R2 layer behind media_mirror (no network: object_storage is replaced by an in-memory fake)."""

import asyncio
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import media_mirror  # noqa: E402
import object_storage  # noqa: E402
from media_mirror import (  # noqa: E402
    MAX_MIRROR_BYTES,
    backfill_to_object_storage,
    mirror_delete,
    mirror_put,
    mirror_restore,
)  # noqa: E402


class Blobs:
    def __init__(self, docs=None):
        self.docs = docs or {}

    async def update_one(self, query, update, upsert=False):
        self.docs[(query["namespace"], query["key"])] = {**query, **update["$set"]}

    async def find_one(self, query, projection=None):
        return self.docs.get((query["namespace"], query["key"]))

    async def delete_one(self, query):
        self.docs.pop((query["namespace"], query["key"]), None)

    def find(self, query, projection=None):
        rows = list(self.docs.values())

        class It:
            def __aiter__(self_inner):
                async def gen():
                    for row in rows:
                        yield row

                return gen()

        return It()


class DB:
    def __init__(self, blobs=None):
        self.media_blobs = Blobs(blobs)


@pytest.fixture
def fake_r2(monkeypatch):
    store = {}
    state = {"fail_put": False}

    async def put(namespace, key, payload, content_type):
        if state["fail_put"]:
            raise RuntimeError("r2 down")
        store[(namespace, key)] = payload
        return True

    async def get(namespace, key):
        return store.get((namespace, key))

    async def delete(namespace, key):
        store.pop((namespace, key), None)

    monkeypatch.setattr(object_storage, "put_object", put)
    monkeypatch.setattr(object_storage, "get_object", get)
    monkeypatch.setattr(object_storage, "delete_object", delete)
    monkeypatch.setattr(object_storage, "enabled", lambda: True)
    return store, state


def test_unconfigured_storage_is_a_no_op(monkeypatch):
    for name in ("R2_BUCKET", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_ENDPOINT", "R2_ACCOUNT_ID"):
        monkeypatch.delenv(name, raising=False)
    assert object_storage.enabled() is False
    assert asyncio.run(object_storage.put_object("platform", "a.webp", b"x", "image/webp")) is False
    assert asyncio.run(object_storage.get_object("platform", "a.webp")) is None


def test_endpoint_is_built_from_the_account_id(monkeypatch):
    monkeypatch.setenv("R2_ACCOUNT_ID", "abc123")
    monkeypatch.setenv("R2_BUCKET", "nexus")
    monkeypatch.setenv("R2_ACCESS_KEY_ID", "k")
    monkeypatch.setenv("R2_SECRET_ACCESS_KEY", "s")
    monkeypatch.delenv("R2_ENDPOINT", raising=False)
    assert object_storage._settings()["endpoint"] == "https://abc123.r2.cloudflarestorage.com"
    assert object_storage.object_key("catalog", "org_1/p.webp") == "nexus/catalog/org_1/p.webp"


def test_put_writes_both_layers_and_restore_prefers_r2(fake_r2, tmp_path):
    store, _ = fake_r2
    db = DB()
    asyncio.run(mirror_put(db, "organizations", "org_1/logo.webp", b"webp", "image/webp"))
    assert store[("organizations", "org_1/logo.webp")] == b"webp"
    assert ("organizations", "org_1/logo.webp") in db.media_blobs.docs
    db.media_blobs.docs.clear()  # Mongo lost it: R2 still restores the file
    destination = tmp_path / "logo.webp"
    assert asyncio.run(mirror_restore(db, "organizations", "org_1/logo.webp", destination)) is True
    assert destination.read_bytes() == b"webp"


def test_restore_falls_back_to_mongo_when_r2_is_down_or_empty(fake_r2, tmp_path):
    store, _ = fake_r2
    db = DB()
    asyncio.run(mirror_put(db, "platform", "logo.webp", b"data", "image/webp"))
    store.clear()
    destination = tmp_path / "logo.webp"
    assert asyncio.run(mirror_restore(db, "platform", "logo.webp", destination)) is True
    assert destination.read_bytes() == b"data"


def test_a_video_over_the_mongo_limit_lives_only_in_r2(fake_r2, tmp_path):
    store, _ = fake_r2
    db = DB()
    big = b"v" * (MAX_MIRROR_BYTES + 1)
    asyncio.run(mirror_put(db, "portal-backgrounds", "org_1/bg.webm", big, "video/webm"))
    assert db.media_blobs.docs == {}
    destination = tmp_path / "bg.webm"
    assert asyncio.run(mirror_restore(db, "portal-backgrounds", "org_1/bg.webm", destination)) is True
    assert destination.stat().st_size == len(big)


def test_oversize_without_r2_is_still_rejected(monkeypatch):
    monkeypatch.setattr(object_storage, "enabled", lambda: False)
    with pytest.raises(ValueError):
        asyncio.run(mirror_put(DB(), "platform", "x.webp", b"x" * (MAX_MIRROR_BYTES + 1), "image/webp"))


def test_r2_outage_is_tolerated_when_mongo_holds_the_copy_but_not_for_oversize(fake_r2):
    store, state = fake_r2
    state["fail_put"] = True
    db = DB()
    asyncio.run(mirror_put(db, "platform", "x.webp", b"small", "image/webp"))
    assert ("platform", "x.webp") in db.media_blobs.docs
    with pytest.raises(ValueError):
        asyncio.run(mirror_put(db, "platform", "y.webm", b"x" * (MAX_MIRROR_BYTES + 1), "video/webm"))


def test_delete_cleans_both_layers(fake_r2):
    store, _ = fake_r2
    db = DB()
    asyncio.run(mirror_put(db, "catalog", "org_1/p.webp", b"x", "image/webp"))
    asyncio.run(mirror_delete(db, "catalog", "org_1/p.webp"))
    assert store == {} and db.media_blobs.docs == {}


def test_unsafe_keys_are_rejected_before_touching_storage(fake_r2):
    store, _ = fake_r2
    with pytest.raises(ValueError):
        asyncio.run(mirror_put(DB(), "platform", "../x.webp", b"x", "image/webp"))
    with pytest.raises(ValueError):
        asyncio.run(mirror_put(DB(), "secrets", "x.webp", b"x", "image/webp"))
    assert store == {}


def test_backfill_copies_existing_mongo_files_idempotently(fake_r2):
    store, _ = fake_r2
    db = DB(
        {
            ("catalog", "org_1/p.webp"): {
                "namespace": "catalog",
                "key": "org_1/p.webp",
                "data": b"p",
                "content_type": "image/webp",
            }
        }
    )
    assert asyncio.run(backfill_to_object_storage(db)) == {"enabled": True, "copied": 1, "failed": 0}
    assert asyncio.run(backfill_to_object_storage(db))["copied"] == 1
    assert store == {("catalog", "org_1/p.webp"): b"p"}


def test_backfill_reports_disabled_when_unconfigured(monkeypatch):
    monkeypatch.setattr(object_storage, "enabled", lambda: False)
    assert asyncio.run(media_mirror.backfill_to_object_storage(DB())) == {"enabled": False, "copied": 0, "failed": 0}
