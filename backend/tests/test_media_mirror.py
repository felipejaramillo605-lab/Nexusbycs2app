import asyncio
from pathlib import Path
import sys

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from media_mirror import MAX_MIRROR_BYTES, mirror_delete, mirror_put, mirror_restore  # noqa: E402


class Blobs:
    def __init__(self):
        self.docs = {}

    async def update_one(self, query, update, upsert=False):
        self.docs[(query["namespace"], query["key"])] = dict(update["$set"])

    async def find_one(self, query, projection=None):
        return self.docs.get((query["namespace"], query["key"]))

    async def delete_one(self, query):
        self.docs.pop((query["namespace"], query["key"]), None)


class DB:
    def __init__(self):
        self.media_blobs = Blobs()


def test_mirror_restores_deleted_file_and_delete_cleans_blob(tmp_path):
    async def run():
        db = DB()
        destination = tmp_path / "org-a" / "photo.webp"
        await mirror_put(db, "organizations", "org-a/photo.webp", b"webp-data", "image/webp")
        assert await mirror_restore(db, "organizations", "org-a/photo.webp", destination) is True
        assert destination.read_bytes() == b"webp-data"
        destination.unlink()
        assert await mirror_restore(db, "organizations", "org-a/photo.webp", destination) is True
        await mirror_delete(db, "organizations", "org-a/photo.webp")
        destination.unlink()
        assert await mirror_restore(db, "organizations", "org-a/photo.webp", destination) is False

    asyncio.run(run())


def test_mirror_rejects_unsafe_keys_and_oversize_payload():
    async def run():
        db = DB()
        with pytest.raises(ValueError):
            await mirror_put(db, "unknown", "x.webp", b"x", "image/webp")
        with pytest.raises(ValueError):
            await mirror_put(db, "platform", "../x.webp", b"x", "image/webp")
        with pytest.raises(ValueError):
            await mirror_put(db, "platform", "x.webp", b"x" * (MAX_MIRROR_BYTES + 1), "image/webp")

    asyncio.run(run())
