"""Durable object storage for public media on Cloudflare R2 (S3-compatible, portable to any S3 provider).

Configured only through server-side environment variables; when they are absent every call is a no-op
and `media_mirror` keeps using its MongoDB copy. The bucket is private: files are always served through
our own `/api/media/...` endpoints, never through public bucket URLs.
"""

from __future__ import annotations

import asyncio
import logging
import os
from functools import lru_cache

logger = logging.getLogger(__name__)

# Defensive ceiling (the largest allowed upload today is a ~15 MB portal background video).
MAX_OBJECT_BYTES = 50 * 1024 * 1024
KEY_PREFIX = "nexus/"


def _settings() -> dict | None:
    values = {
        "bucket": os.getenv("R2_BUCKET", "").strip(),
        "key_id": os.getenv("R2_ACCESS_KEY_ID", "").strip(),
        "secret": os.getenv("R2_SECRET_ACCESS_KEY", "").strip(),
        "endpoint": os.getenv("R2_ENDPOINT", "").strip(),
    }
    account = os.getenv("R2_ACCOUNT_ID", "").strip()
    if not values["endpoint"] and account:
        values["endpoint"] = f"https://{account}.r2.cloudflarestorage.com"
    if not all(values.values()):
        return None
    return values


def enabled() -> bool:
    return _settings() is not None


@lru_cache(maxsize=1)
def _client_for(endpoint: str, key_id: str, secret: str):
    import boto3
    from botocore.config import Config

    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=key_id,
        aws_secret_access_key=secret,
        region_name="auto",
        config=Config(
            signature_version="s3v4",
            retries={"max_attempts": 3, "mode": "standard"},
            connect_timeout=5,
            read_timeout=20,
        ),
    )


def _client():
    settings = _settings()
    if not settings:
        raise RuntimeError("Object storage is not configured")
    return _client_for(settings["endpoint"], settings["key_id"], settings["secret"]), settings["bucket"]


def object_key(namespace: str, relative_key: str) -> str:
    return f"{KEY_PREFIX}{namespace}/{relative_key}"


def _put(key: str, payload: bytes, content_type: str) -> None:
    client, bucket = _client()
    client.put_object(
        Bucket=bucket,
        Key=key,
        Body=payload,
        ContentType=content_type,
        CacheControl="public, max-age=31536000, immutable",
    )


def _get(key: str) -> bytes | None:
    client, bucket = _client()
    try:
        return client.get_object(Bucket=bucket, Key=key)["Body"].read()
    except Exception as exc:
        code = getattr(exc, "response", {}).get("Error", {}).get("Code")
        if code in {"404", "NoSuchKey", "NotFound"}:
            return None
        raise


def _delete(key: str) -> None:
    client, bucket = _client()
    client.delete_object(Bucket=bucket, Key=key)


async def put_object(namespace: str, relative_key: str, payload: bytes, content_type: str) -> bool:
    """Store the object; returns False when storage is not configured. Raises on a real failure."""
    if not enabled():
        return False
    if len(payload) > MAX_OBJECT_BYTES:
        raise ValueError("Media exceeds object storage limit")
    await asyncio.to_thread(_put, object_key(namespace, relative_key), payload, content_type)
    return True


async def get_object(namespace: str, relative_key: str) -> bytes | None:
    if not enabled():
        return None
    return await asyncio.to_thread(_get, object_key(namespace, relative_key))


async def delete_object(namespace: str, relative_key: str) -> None:
    if not enabled():
        return
    try:
        await asyncio.to_thread(_delete, object_key(namespace, relative_key))
    except Exception as exc:
        logger.warning("object_storage_delete_failed diagnostic_code=%s", type(exc).__name__)
