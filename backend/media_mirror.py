"""Durable copies of public media stored in ephemeral containers.

Two layers: Cloudflare R2 (`object_storage`, when configured; no size problem) and a MongoDB mirror
(`media_blobs`, files up to 15 MB). Restores try R2 first and fall back to MongoDB.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from pathlib import Path

from bson import Binary

import object_storage

logger = logging.getLogger(__name__)

# MongoDB rejects documents over 16 MB (BSON limit); stay below it with headroom for metadata.
MAX_MIRROR_BYTES = 15 * 1024 * 1024
ALLOWED_NAMESPACES = object_storage.ALLOWED_NAMESPACES


def _validate(namespace: str, relative_key: str, payload: bytes | None = None, check_size: bool = True) -> None:
    if (
        namespace not in ALLOWED_NAMESPACES
        or not relative_key
        or relative_key.startswith("/")
        or ".." in Path(relative_key).parts
    ):
        raise ValueError("Invalid media mirror key")
    if check_size and payload is not None and len(payload) > MAX_MIRROR_BYTES:
        raise ValueError("Media exceeds durable mirror limit")


async def mirror_put(db, namespace: str, relative_key: str, payload: bytes, content_type: str) -> None:
    """Keep a durable copy: object storage (R2) when configured, plus MongoDB when it fits."""
    _validate(namespace, relative_key, payload, check_size=False)
    in_object_storage = False
    try:
        in_object_storage = await object_storage.put_object(namespace, relative_key, payload, content_type)
    except Exception as exc:
        logger.warning("object_storage_put_failed diagnostic_code=%s", type(exc).__name__)
    if len(payload) > MAX_MIRROR_BYTES:
        if not in_object_storage:
            raise ValueError("Media exceeds durable mirror limit")
        return
    try:
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
    except Exception:
        if not in_object_storage:
            raise
        logger.warning("media_blob_mirror_failed (object storage holds the copy)")


def _write_restored(destination: Path, payload: bytes) -> None:
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


async def mirror_restore(db, namespace: str, relative_key: str, destination: Path) -> bool:
    _validate(namespace, relative_key)
    if destination.is_file():
        return True
    payload = None
    try:
        payload = await object_storage.get_object(namespace, relative_key)
    except Exception as exc:
        logger.warning("object_storage_get_failed diagnostic_code=%s", type(exc).__name__)
    if payload is None:
        doc = await db.media_blobs.find_one(
            {"namespace": namespace, "key": relative_key}, {"_id": 0, "data": 1, "size": 1}
        )
        if not doc or not isinstance(doc.get("data"), (bytes, bytearray, Binary)):
            return False
        payload = bytes(doc["data"])
    _validate(namespace, relative_key, payload, check_size=False)
    _write_restored(destination, payload)
    return True


async def mirror_delete(db, namespace: str, relative_key: str) -> None:
    _validate(namespace, relative_key)
    await object_storage.delete_object(namespace, relative_key)
    await db.media_blobs.delete_one({"namespace": namespace, "key": relative_key})


async def backfill_to_object_storage(db) -> dict:
    """Copy every MongoDB-mirrored file into object storage (idempotent; safe to re-run)."""
    if not object_storage.enabled():
        return {"enabled": False, "copied": 0, "failed": 0}
    copied = failed = 0
    async for doc in db.media_blobs.find({}, {"_id": 0}):
        try:
            data = doc.get("data")
            if doc.get("namespace") in ALLOWED_NAMESPACES and isinstance(data, (bytes, bytearray, Binary)):
                await object_storage.put_object(
                    doc["namespace"], doc["key"], bytes(data), doc.get("content_type") or "application/octet-stream"
                )
                copied += 1
        except Exception as exc:
            failed += 1
            logger.warning("backfill_failed diagnostic_code=%s", type(exc).__name__)
    return {"enabled": True, "copied": copied, "failed": failed}
