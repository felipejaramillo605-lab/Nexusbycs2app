# NEXUS_8A7D3A_SECURE_PROFESSIONAL_MEDIA_V1
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

# NEXUS_PROFESSIONAL_MEDIA_HEIC_V1: iPhones store camera photos as HEIC/HEIF by
# default, and depending on iOS version/browser the file picked via <input
# type="file"> can arrive at the backend still in that format instead of
# being auto-converted to JPEG. Pillow has no built-in HEIC decoder, so
# without this registration every HEIC upload from an iPhone failed with
# "Only JPEG, PNG and WebP images are allowed" -- a mobile-only failure
# that never reproduced from a PC/Android upload using a JPEG/PNG file.
try:
    import pillow_heif
    pillow_heif.register_heif_opener()
    _HEIC_SUPPORTED = True
except ImportError:
    _HEIC_SUPPORTED = False

MAX_UPLOAD_BYTES = 5 * 1024 * 1024
MAX_SIDE = 4096
MAX_PIXELS = 16_000_000
OUTPUT_SIDE = 1200
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"} | ({"HEIF"} if _HEIC_SUPPORTED else set())
SAFE_ORG = re.compile(r"^[A-Za-z0-9_-]{1,128}$")
SAFE_FILE = re.compile(r"^[a-f0-9]{32}\.webp$")
PUBLIC_PREFIX = "/api/media/professionals"
Image.MAX_IMAGE_PIXELS = MAX_PIXELS


def media_root() -> Path:
    return Path(os.getenv("NEXUS_MEDIA_ROOT", "/app/data/professional-media")).resolve()


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


def normalize_image(data: bytes) -> tuple[bytes, dict]:
    try:
        with Image.open(io.BytesIO(data)) as probe:
            source_format = (probe.format or "").upper()
            if source_format not in ALLOWED_FORMATS:
                raise HTTPException(status_code=415, detail="Only JPEG, PNG and WebP images are allowed")
            if getattr(probe, "is_animated", False) or getattr(probe, "n_frames", 1) != 1:
                raise HTTPException(status_code=415, detail="Animated images are not allowed")
            width, height = probe.size
            if width < 1 or height < 1 or width > MAX_SIDE or height > MAX_SIDE or width * height > MAX_PIXELS:
                raise HTTPException(status_code=400, detail="Image dimensions are not allowed")
            probe.verify()
        with Image.open(io.BytesIO(data)) as image:
            image.load()
            image = ImageOps.exif_transpose(image)
            if image.mode not in ("RGB", "RGBA"):
                image = image.convert("RGBA" if "A" in image.getbands() else "RGB")
            image.thumbnail((OUTPUT_SIDE, OUTPUT_SIDE), Image.Resampling.LANCZOS)
            if image.mode == "RGBA":
                background = Image.new("RGB", image.size, "white")
                background.paste(image, mask=image.getchannel("A"))
                image = background
            elif image.mode != "RGB":
                image = image.convert("RGB")
            output = io.BytesIO()
            image.save(output, format="WEBP", quality=85, method=6, exif=b"")
            payload = output.getvalue()
            return payload, {"source_format": source_format, "width": image.width, "height": image.height, "bytes": len(payload), "sha256": hashlib.sha256(payload).hexdigest()}
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


def build_professional_media_router(db, get_current_user, require_management_role, resolve_team_organization, enforce_rls_on_write, record_security_event):
    router = APIRouter()

    async def staff_target(user):
        if user.role != "staff" or not user.organization_id:
            raise HTTPException(status_code=403, detail="Staff access required")
        item = await db.barbers.find_one({"user_id": user.user_id, "organization_id": user.organization_id, "active": {"$ne": False}}, {"_id": 0})
        if not item:
            raise HTTPException(status_code=404, detail="Professional profile not found")
        return item

    async def management_target(user, barber_id, requested_org):
        require_management_role(user)
        org_id = await resolve_team_organization(user, requested_org)
        item = await db.barbers.find_one({"barber_id": barber_id, "organization_id": org_id}, {"_id": 0})
        if not item:
            other = await db.barbers.find_one({"barber_id": barber_id}, {"_id": 0, "organization_id": 1})
            if other:
                await record_security_event(event_type="cross_tenant_access_blocked", severity="high", actor=user.user_id, organization=org_id, path="/barbers/avatar", metadata={"reason_code": "write_scope"})
                raise HTTPException(status_code=403, detail="Access denied to this organization")
            raise HTTPException(status_code=404, detail="Professional profile not found")
        await enforce_rls_on_write(user, item, org_id)
        return item

    async def persist(item, user, upload):
        payload, metadata = normalize_image(await _read_limited(upload))
        old_url = item.get("avatar")
        new_url, new_path = _write_atomic(item["organization_id"], payload)
        now = datetime.now(timezone.utc).isoformat()
        barber_filter = {"barber_id": item["barber_id"], "organization_id": item["organization_id"]}
        user_id = item.get("user_id")
        barber_changed = user_changed = audit_id = None
        try:
            result = await db.barbers.update_one(barber_filter, {"$set": {"avatar": new_url, "updated_at": now}})
            if result.matched_count != 1:
                raise RuntimeError("professional media update conflict")
            barber_changed = True
            if user_id:
                await db.users.update_one({"user_id": user_id, "organization_id": item["organization_id"]}, {"$set": {"picture": new_url}})
                user_changed = True
            audit_id = "audit_" + secrets.token_hex(6)
            await db.audit_events.insert_one({"audit_id": audit_id, "organization_id": item["organization_id"], "event_type": "professional_avatar_uploaded", "entity_type": "professional", "entity_id": item["barber_id"], "actor_user_id": user.user_id, "previous_value": {"avatar": old_url}, "new_value": {"avatar": new_url, **metadata}, "created_at": now})
        except Exception:
            if audit_id:
                await db.audit_events.delete_one({"audit_id": audit_id})
            if user_changed:
                await db.users.update_one({"user_id": user_id, "organization_id": item["organization_id"]}, {"$set": {"picture": old_url}})
            if barber_changed:
                await db.barbers.update_one(barber_filter, {"$set": {"avatar": old_url, "updated_at": item.get("updated_at")}})
            new_path.unlink(missing_ok=True)
            raise HTTPException(status_code=500, detail="Image could not be saved")
        _delete_managed(old_url)
        return {"avatar": new_url, "content_type": "image/webp", **metadata}

    async def remove(item, user):
        old_url = item.get("avatar")
        old_updated_at = item.get("updated_at")
        now = datetime.now(timezone.utc).isoformat()
        barber_filter = {"barber_id": item["barber_id"], "organization_id": item["organization_id"]}
        user_filter = {"user_id": item.get("user_id"), "organization_id": item["organization_id"]}
        audit_id = "audit_" + secrets.token_hex(6)
        barber_changed = user_changed = audit_changed = False
        try:
            result = await db.barbers.update_one(barber_filter, {"$set": {"avatar": None, "updated_at": now}})
            if result.matched_count != 1:
                raise RuntimeError("professional media delete conflict")
            barber_changed = True
            if item.get("user_id"):
                await db.users.update_one(user_filter, {"$set": {"picture": None}})
                user_changed = True
            await db.audit_events.insert_one({"audit_id": audit_id, "organization_id": item["organization_id"], "event_type": "professional_avatar_deleted", "entity_type": "professional", "entity_id": item["barber_id"], "actor_user_id": user.user_id, "previous_value": {"avatar": old_url}, "new_value": {"avatar": None}, "created_at": now})
            audit_changed = True
        except Exception:
            if audit_changed:
                await db.audit_events.delete_one({"audit_id": audit_id})
            if user_changed:
                await db.users.update_one(user_filter, {"$set": {"picture": old_url}})
            if barber_changed:
                await db.barbers.update_one(barber_filter, {"$set": {"avatar": old_url, "updated_at": old_updated_at}})
            raise HTTPException(status_code=500, detail="Image could not be deleted")
        _delete_managed(old_url)
        return {"avatar": None}

    @router.post("/barbers/me/avatar")
    async def upload_my_avatar(file: UploadFile = File(...), authorization: str | None = Header(None), session_token: str | None = Cookie(None)):
        user = await get_current_user(authorization, session_token)
        return await persist(await staff_target(user), user, file)

    @router.delete("/barbers/me/avatar")
    async def delete_my_avatar(authorization: str | None = Header(None), session_token: str | None = Cookie(None)):
        user = await get_current_user(authorization, session_token)
        return await remove(await staff_target(user), user)

    @router.post("/barbers/{barber_id}/avatar")
    async def upload_professional_avatar(barber_id: str, file: UploadFile = File(...), organization_id: str | None = Query(None), authorization: str | None = Header(None), session_token: str | None = Cookie(None)):
        user = await get_current_user(authorization, session_token)
        return await persist(await management_target(user, barber_id, organization_id), user, file)

    @router.delete("/barbers/{barber_id}/avatar")
    async def delete_professional_avatar(barber_id: str, organization_id: str | None = Query(None), authorization: str | None = Header(None), session_token: str | None = Cookie(None)):
        user = await get_current_user(authorization, session_token)
        return await remove(await management_target(user, barber_id, organization_id), user)

    @router.get("/media/professionals/{organization_id}/{filename}", include_in_schema=False)
    async def get_professional_media(organization_id: str, filename: str):
        path = _safe_path(organization_id, filename)
        if not path.is_file():
            raise HTTPException(status_code=404, detail="Image not found")
        return FileResponse(path, media_type="image/webp", headers={"Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff"})

    return router
