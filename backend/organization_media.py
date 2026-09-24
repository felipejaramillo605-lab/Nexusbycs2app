# NEXUS_ORGANIZATION_LOGO_UPLOAD_V1
# Mirrors professional_media.py's security model (safe paths, atomic writes,
# Pillow-based normalization to a single trusted output format) applied to
# organization logos instead of professional avatars. Two separate media
# roots/URL namespaces on purpose -- logos and avatars have different
# lifecycle/ownership rules and mixing them would make the safe-path
# validation harder to reason about.
from __future__ import annotations

import os
import re
import secrets
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Cookie, File, Header, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from image_pipeline import MAX_UPLOAD_BYTES, MAX_SIDE, MAX_INPUT_PIXELS, read_upload_limited, normalize_image as _normalize_image, normalize_image_async

MAX_PIXELS = MAX_INPUT_PIXELS
OUTPUT_SIDE = 1024
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP", "HEIF", "AVIF", "GIF", "BMP", "TIFF"}
SAFE_ORG = re.compile(r"^[A-Za-z0-9_-]{1,128}$")
SAFE_FILE = re.compile(r"^[a-f0-9]{32}\.webp$")
PUBLIC_PREFIX = "/api/media/organizations"


def media_root() -> Path:
    return Path(os.getenv("NEXUS_LOGO_MEDIA_ROOT", "/app/data/organization-media")).resolve()


def _safe_path(organization_id: str, filename: str) -> Path:
    if not SAFE_ORG.fullmatch(organization_id or "") or not SAFE_FILE.fullmatch(filename or ""):
        raise HTTPException(status_code=404, detail="Image not found")
    root = media_root()
    candidate = (root / organization_id / filename).resolve()
    if root not in candidate.parents:
        raise HTTPException(status_code=404, detail="Image not found")
    return candidate


def managed_parts(value: str | None):
    if not value or not value.startswith(PUBLIC_PREFIX + "/"):
        return None
    parts = value[len(PUBLIC_PREFIX) + 1:].split("/")
    if len(parts) != 2 or not SAFE_ORG.fullmatch(parts[0]) or not SAFE_FILE.fullmatch(parts[1]):
        return None
    return parts[0], parts[1]


async def _read_limited(upload: UploadFile) -> bytes:
    return await read_upload_limited(upload)


def normalize_logo(data: bytes) -> tuple[bytes, dict]:
    """Same normalization pipeline as professional_media.normalize_image,
    with one difference: logos keep transparency (RGBA -> WebP alpha)
    instead of flattening onto a white background, since a logo is usually
    placed over a colored nav bar / themed background, not a plain page."""
    return _normalize_image(data, "logo", preserve_alpha=True)


def _write_atomic(organization_id: str, payload: bytes) -> tuple[str, Path]:
    filename = secrets.token_hex(16) + ".webp"
    destination = _safe_path(organization_id, filename)
    destination.parent.mkdir(parents=True, exist_ok=True, mode=0o750)
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
    return f"{PUBLIC_PREFIX}/{organization_id}/{filename}", destination


def _delete_managed(value: str | None):
    parts = managed_parts(value)
    if parts:
        _safe_path(*parts).unlink(missing_ok=True)


def build_organization_media_router(db, get_current_user, require_management_role, resolve_team_organization):
    router = APIRouter()

    async def management_target(user, requested_org):
        require_management_role(user)
        org_id = await resolve_team_organization(user, requested_org)
        item = await db.organizations.find_one({"organization_id": org_id}, {"_id": 0})
        if not item:
            raise HTTPException(status_code=404, detail="Organization not found")
        return item

    @router.post("/organizations/{organization_id}/logo", tags=["organizations"])
    async def upload_organization_logo(organization_id: str, file: UploadFile = File(...), authorization: str | None = Header(None), session_token: str | None = Cookie(None)):
        user = await get_current_user(authorization, session_token)
        org = await management_target(user, organization_id)
        real_org_id = org["organization_id"]
        payload, metadata = await normalize_image_async(await _read_limited(file), "logo", preserve_alpha=True)
        old_url = org.get("logo_url")
        new_url, new_path = _write_atomic(real_org_id, payload)
        now = datetime.now(timezone.utc).isoformat()
        try:
            result = await db.organizations.update_one({"organization_id": real_org_id}, {"$set": {"logo_url": new_url, "updated_at": now}})
            if result.matched_count != 1:
                raise RuntimeError("organization logo update conflict")
        except Exception:
            new_path.unlink(missing_ok=True)
            raise HTTPException(status_code=500, detail="Logo could not be saved")
        _delete_managed(old_url)
        return {"logo_url": new_url, "content_type": "image/webp", **metadata}

    @router.delete("/organizations/{organization_id}/logo", tags=["organizations"])
    async def delete_organization_logo(organization_id: str, authorization: str | None = Header(None), session_token: str | None = Cookie(None)):
        user = await get_current_user(authorization, session_token)
        org = await management_target(user, organization_id)
        real_org_id = org["organization_id"]
        old_url = org.get("logo_url")
        now = datetime.now(timezone.utc).isoformat()
        result = await db.organizations.update_one({"organization_id": real_org_id}, {"$set": {"logo_url": None, "updated_at": now}})
        if result.matched_count != 1:
            raise HTTPException(status_code=500, detail="Logo could not be deleted")
        _delete_managed(old_url)
        return {"logo_url": None}

    @router.get("/media/organizations/{organization_id}/{filename}", include_in_schema=False)
    async def get_organization_media(organization_id: str, filename: str):
        path = _safe_path(organization_id, filename)
        if not path.is_file():
            raise HTTPException(status_code=404, detail="Image not found")
        return FileResponse(path, media_type="image/webp", headers={"Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff"})

    return router
