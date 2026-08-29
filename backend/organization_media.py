# NEXUS_ORGANIZATION_LOGO_UPLOAD_V1
# Mirrors professional_media.py's security model (safe paths, atomic writes,
# Pillow-based normalization to a single trusted output format) applied to
# organization logos instead of professional avatars. Two separate media
# roots/URL namespaces on purpose -- logos and avatars have different
# lifecycle/ownership rules and mixing them would make the safe-path
# validation harder to reason about.
from __future__ import annotations

import hashlib
import io
import os
import re
import secrets
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Cookie, File, Header, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from PIL import Image, ImageOps, UnidentifiedImageError

# NEXUS_PROFESSIONAL_MEDIA_HEIC_V1 pattern reused here: logos exported
# straight from an iPhone's Photos/Files app can also arrive as HEIC.
try:
    import pillow_heif
    pillow_heif.register_heif_opener()
    _HEIC_SUPPORTED = True
except ImportError:
    _HEIC_SUPPORTED = False

MAX_UPLOAD_BYTES = 5 * 1024 * 1024
MAX_SIDE = 4096
MAX_PIXELS = 16_000_000
OUTPUT_SIDE = 800  # logos render small (nav bars, favicons-ish contexts); no need for 1200px avatars use
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"} | ({"HEIF"} if _HEIC_SUPPORTED else set())
SAFE_ORG = re.compile(r"^[A-Za-z0-9_-]{1,128}$")
SAFE_FILE = re.compile(r"^[a-f0-9]{32}\.webp$")
PUBLIC_PREFIX = "/api/media/organizations"
Image.MAX_IMAGE_PIXELS = MAX_PIXELS


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
    data = await upload.read(MAX_UPLOAD_BYTES + 1)
    await upload.close()
    if not data:
        raise HTTPException(status_code=400, detail="Image file is empty")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Image exceeds the 5 MB limit")
    return data


def normalize_logo(data: bytes) -> tuple[bytes, dict]:
    """Same normalization pipeline as professional_media.normalize_image,
    with one difference: logos keep transparency (RGBA -> WebP alpha)
    instead of flattening onto a white background, since a logo is usually
    placed over a colored nav bar / themed background, not a plain page."""
    try:
        with Image.open(io.BytesIO(data)) as probe:
            source_format = (probe.format or "").upper()
            if source_format not in ALLOWED_FORMATS:
                allowed_label = "JPEG, PNG, WebP" + (" and HEIC" if _HEIC_SUPPORTED else "")
                raise HTTPException(status_code=415, detail=f"Only {allowed_label} images are allowed. SVG is not supported for security reasons.")
            if getattr(probe, "is_animated", False) or getattr(probe, "n_frames", 1) != 1:
                raise HTTPException(status_code=415, detail="Animated images are not allowed")
            width, height = probe.size
            if width < 1 or height < 1 or width > MAX_SIDE or height > MAX_SIDE or width * height > MAX_PIXELS:
                raise HTTPException(status_code=400, detail="Image dimensions are not allowed")
            probe.verify()
        with Image.open(io.BytesIO(data)) as image:
            image.load()
            image = ImageOps.exif_transpose(image)
            has_alpha = "A" in image.getbands() if image.mode not in ("RGB",) else False
            if image.mode not in ("RGB", "RGBA"):
                image = image.convert("RGBA" if has_alpha else "RGB")
            image.thumbnail((OUTPUT_SIDE, OUTPUT_SIDE), Image.Resampling.LANCZOS)
            output = io.BytesIO()
            image.save(output, format="WEBP", quality=90, method=6, lossless=False, exif=b"")
            payload = output.getvalue()
            return payload, {"source_format": source_format, "width": image.width, "height": image.height, "bytes": len(payload), "sha256": hashlib.sha256(payload).hexdigest(), "has_transparency": image.mode == "RGBA"}
    except HTTPException:
        raise
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise HTTPException(status_code=400, detail="Invalid or unsafe image")


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
        payload, metadata = normalize_logo(await _read_limited(file))
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
