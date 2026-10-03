"""Durable MongoDB mirror for public media stored in ephemeral containers."""

from __future__ import annotations

import os
from datetime import datetime, timezone
from pathlib import Path

from bson import Binary

MAX_MIRROR_BYTES = 20 * 1024 * 1024
ALLOWED_NAMESPACES = {"platform", "organizations", "professionals", "catalog", "portal-backgrounds"}


def _validate(namespace: str, relative_key: str, payload: bytes | None = None) -> None:
    if (
        namespace not in ALLOWED_NAMESPACES
        or not relative_key
        or relative_key.startswith("/")
        or ".." in Path(relative_key).parts
    ):
        raise ValueError("Invalid media mirror key")
    if payload is not None and len(payload) > MAX_MIRROR_BYTES:
        raise ValueError("Media exceeds durable mirror limit")


async def mirror_put(db, namespace: str, relative_key: str, payload: bytes, content_type: str) -> None:
    _validate(namespace, relative_key, payload)
    await db.media_blobs.update_one(
        {"namespace": namespace, "key": relative_key},
        {
            "$set": {
                "data": Binary(payload),
                "content_type": content_type,
                "size": len(payload),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        },
        upsert=True,
    )


async def mirror_restore(db, namespace: str, relative_key: str, destination: Path) -> bool:
    _validate(namespace, relative_key)
    if destination.is_file():
        return True
    doc = await db.media_blobs.find_one({"namespace": namespace, "key": relative_key}, {"_id": 0, "data": 1, "size": 1})
    if not doc or not isinstance(doc.get("data"), (bytes, bytearray, Binary)):
        return False
    payload = bytes(doc["data"])
    _validate(namespace, relative_key, payload)
    destination.parent.mkdir(parents=True, exist_ok=True, mode=0o750)
    temporary = destination.with_suffix(destination.suffix + ".tmp")
    try:
        with temporary.open("xb") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, destination)
        os.chmod(destination, 0o640)
    finally:
        temporary.unlink(missing_ok=True)
    return True


async def mirror_delete(db, namespace: str, relative_key: str) -> None:
    _validate(namespace, relative_key)
    await db.media_blobs.delete_one({"namespace": namespace, "key": relative_key})
