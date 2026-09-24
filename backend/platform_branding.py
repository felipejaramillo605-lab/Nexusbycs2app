# NEXUS_PLATFORM_BRANDING_V1
# The Nexus PLATFORM's own logo/identity -- controlled only by the "owner"
# role (the software provider, CS2), applies app-wide (favicon, sidebar
# fallback brand, "powered by" badge on every tenant's public pages). This
# is deliberately a single global record, not per-organization: there is
# exactly one Nexus to brand. Contrast with organization_media.py, which
# lets each TENANT (barbershop/salon) set their own store logo that only
# ever shows on that tenant's own pages -- the two are independent and
# must never be confused with one another in a multi-tenant app.
#
# Reuses the same secure-upload pipeline as organization_media.py /
# professional_media.py (safe filename regex, atomic writes, Pillow
# normalization to WebP, SVG explicitly rejected).
from __future__ import annotations

import os
import re
import secrets
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Cookie, File, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse
from image_pipeline import MAX_UPLOAD_BYTES, MAX_SIDE, MAX_INPUT_PIXELS, read_upload_limited, normalize_image as _normalize_image, normalize_image_async

MAX_PIXELS = MAX_INPUT_PIXELS
OUTPUT_SIDE = 1024
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP", "HEIF", "AVIF", "GIF", "BMP", "TIFF"}
SAFE_FILE = re.compile(r"^[a-f0-9]{32}\.webp$")
PUBLIC_PREFIX = "/api/media/platform"
SETTINGS_ID = "platform_branding"


def media_root() -> Path:
    return Path(os.getenv("NEXUS_PLATFORM_MEDIA_ROOT", "/app/data/platform-media")).resolve()


def _safe_path(filename: str) -> Path:
    if not SAFE_FILE.fullmatch(filename or ""):
        raise HTTPException(status_code=404, detail="Image not found")
    root = media_root()
    candidate = (root / filename).resolve()
    if candidate.parent != root:
        raise HTTPException(status_code=404, detail="Image not found")
    return candidate


def managed_filename(value: str | None) -> str | None:
    if not value or not value.startswith(PUBLIC_PREFIX + "/"):
        return None
    filename = value[len(PUBLIC_PREFIX) + 1:]
    return filename if SAFE_FILE.fullmatch(filename) else None


async def _read_limited(upload: UploadFile) -> bytes:
    return await read_upload_limited(upload)


def normalize_platform_logo(data: bytes) -> tuple[bytes, dict]:
    """Identical pipeline to organization_media.normalize_logo: keeps
    transparency (no white-background flatten), since the Nexus mark is
    shown over varied surfaces (sidebar, favicon, public header)."""
    return _normalize_image(data, "logo", preserve_alpha=True)


def _write_atomic(payload: bytes) -> tuple[str, Path]:
    filename = secrets.token_hex(16) + ".webp"
    root = media_root()
    root.mkdir(parents=True, exist_ok=True, mode=0o750)
    destination = _safe_path(filename)
    temporary = destination.with_suffix(".tmp")
    try:
        with temporary.open("xb") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, destination)
        os.chmod(destination, 0o640)
    finally:
        temporary.unlink(missing_ok=True)
    return f"{PUBLIC_PREFIX}/{filename}", destination


def _delete_managed(value: str | None):
    filename = managed_filename(value)
    if filename:
        _safe_path(filename).unlink(missing_ok=True)


def build_platform_branding_router(db, get_current_user):
    router = APIRouter()

    async def owner(authorization, session_token):
        user = await get_current_user(authorization, session_token)
        if user.role != "owner":
            raise HTTPException(status_code=403, detail="Owner access required")
        return user

    async def current_branding() -> dict:
        doc = await db.platform_settings.find_one({"settings_id": SETTINGS_ID}, {"_id": 0})
        return {"platform_logo_url": (doc or {}).get("platform_logo_url")}

    # Public + unauthenticated: every page (including the login screen and
    # every tenant's booking/portal pages) needs to read this to render the
    # Nexus mark, well before any user is signed in.
    @router.get("/platform/branding", tags=["platform-branding"])
    async def get_branding():
        return await current_branding()

    @router.post("/owner/platform-logo", tags=["platform-branding"])
    async def upload_platform_logo(file: UploadFile = File(...), authorization: str | None = Header(None), session_token: str | None = Cookie(None)):
        user = await owner(authorization, session_token)
        payload, metadata = await normalize_image_async(await _read_limited(file), "logo", preserve_alpha=True)
        old_url = (await current_branding())["platform_logo_url"]
        new_url, new_path = _write_atomic(payload)
        now = datetime.now(timezone.utc).isoformat()
        try:
            await db.platform_settings.update_one(
                {"settings_id": SETTINGS_ID},
                {"$set": {"platform_logo_url": new_url, "updated_at": now, "updated_by": user.user_id}, "$setOnInsert": {"created_at": now}},
                upsert=True,
            )
        except Exception:
            new_path.unlink(missing_ok=True)
            raise HTTPException(status_code=500, detail="Logo could not be saved")
        _delete_managed(old_url)
        return {"platform_logo_url": new_url, "content_type": "image/webp", **metadata}

    @router.delete("/owner/platform-logo", tags=["platform-branding"])
    async def delete_platform_logo(authorization: str | None = Header(None), session_token: str | None = Cookie(None)):
        await owner(authorization, session_token)
        old_url = (await current_branding())["platform_logo_url"]
        now = datetime.now(timezone.utc).isoformat()
        await db.platform_settings.update_one(
            {"settings_id": SETTINGS_ID},
            {"$set": {"platform_logo_url": None, "updated_at": now}},
            upsert=True,
        )
        _delete_managed(old_url)
        return {"platform_logo_url": None}

    @router.get("/media/platform/{filename}", include_in_schema=False)
    async def get_platform_media(filename: str):
        path = _safe_path(filename)
        if not path.is_file():
            raise HTTPException(status_code=404, detail="Image not found")
        return FileResponse(path, media_type="image/webp", headers={"Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff"})

    return router
