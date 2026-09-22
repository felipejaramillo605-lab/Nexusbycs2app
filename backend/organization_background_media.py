"""Tenant-scoped portal background media.

Images use the established logo normalizer. Videos are stored without
transcoding only after a bounded container/duration check; this keeps the
upload path independent from ffmpeg and rejects unknown binary formats.
"""
from __future__ import annotations

import os
import re
import secrets
from datetime import datetime, timezone
from pathlib import Path
from struct import unpack

from fastapi import APIRouter, Cookie, File, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse

from organization_media import SAFE_ORG, normalize_logo

MAX_VIDEO_BYTES = 20 * 1024 * 1024
MAX_VIDEO_SECONDS = 15.0
SAFE_FILE = re.compile(r"^[a-f0-9]{32}\.(?:webp|mp4|webm)$")
PUBLIC_PREFIX = "/api/media/portal-backgrounds"


def media_root() -> Path:
    return Path(os.getenv("NEXUS_PORTAL_BACKGROUND_MEDIA_ROOT", "/app/data/portal-backgrounds")).resolve()


def _safe_path(organization_id: str, filename: str) -> Path:
    if not SAFE_ORG.fullmatch(organization_id or "") or not SAFE_FILE.fullmatch(filename or ""):
        raise HTTPException(status_code=404, detail="Background media not found")
    root = media_root()
    candidate = (root / organization_id / filename).resolve()
    if root not in candidate.parents:
        raise HTTPException(status_code=404, detail="Background media not found")
    return candidate


def managed_parts(value: str | None):
    if not value or not value.startswith(PUBLIC_PREFIX + "/"):
        return None
    parts = value[len(PUBLIC_PREFIX) + 1:].split("/")
    if len(parts) != 2 or not SAFE_ORG.fullmatch(parts[0]) or not SAFE_FILE.fullmatch(parts[1]):
        return None
    return parts[0], parts[1]


async def _read_limited(upload: UploadFile, limit: int) -> bytes:
    data = await upload.read(limit + 1)
    await upload.close()
    if not data:
        raise HTTPException(status_code=400, detail="Background file is empty")
    if len(data) > limit:
        raise HTTPException(status_code=413, detail=f"Background video exceeds the {limit // (1024 * 1024)} MB limit")
    return data


def _mp4_duration(data: bytes) -> float | None:
    """Read mvhd from a small ISO-BMFF file without invoking an external parser."""
    def walk(start: int, end: int, depth: int = 0):
        pos = start
        while pos + 8 <= end and depth < 8:
            size = int.from_bytes(data[pos:pos + 4], "big")
            kind = data[pos + 4:pos + 8]
            header = 8
            if size == 1:
                if pos + 16 > end: return None
                size = int.from_bytes(data[pos + 8:pos + 16], "big"); header = 16
            elif size == 0:
                size = end - pos
            if size < header or pos + size > end: return None
            payload = pos + header
            if kind == b"mvhd" and payload + 20 <= pos + size:
                version = data[payload]
                if version == 0 and payload + 20 <= pos + size:
                    timescale = int.from_bytes(data[payload + 12:payload + 16], "big")
                    duration = int.from_bytes(data[payload + 16:payload + 20], "big")
                elif version == 1 and payload + 32 <= pos + size:
                    timescale = int.from_bytes(data[payload + 20:payload + 24], "big")
                    duration = int.from_bytes(data[payload + 24:payload + 32], "big")
                else: return None
                return duration / timescale if timescale else None
            if kind in {b"moov", b"trak", b"mdia", b"udta"}:
                value = walk(payload, pos + size, depth + 1)
                if value is not None: return value
            pos += size
        return None
    return walk(0, len(data))


def _read_vint(data: bytes, pos: int, for_id: bool = False):
    if pos >= len(data): return None
    first = data[pos]
    mask = 0x80; length = 1
    while length <= 8 and not (first & mask): mask >>= 1; length += 1
    if length > 8 or pos + length > len(data): return None
    value = int.from_bytes(data[pos:pos + length], "big")
    if not for_id: value &= (1 << (7 * length)) - 1
    return value, length


def _webm_duration(data: bytes) -> float | None:
    # Parses EBML Info -> TimecodeScale/Duration only; unknown nesting is skipped.
    if not data.startswith(b"\x1a\x45\xdf\xa3"): return None
    scale = 1_000_000
    duration = None
    # Info lives under Segment, whose payload is a stream of EBML children.
    # Scan bounded element headers rather than trusting filename/MIME metadata.
    for marker, target in ((b"\x2a\xd7\xb1", "scale"), (b"\x44\x89", "duration")):
        pos = 0
        while True:
            pos = data.find(marker, pos)
            if pos < 0: break
            length_item = _read_vint(data, pos + len(marker))
            if length_item:
                size, size_len = length_item; start = pos + len(marker) + size_len; end = start + size
                if end <= len(data):
                    value = data[start:end]
                    if target == "scale" and len(value) <= 8: scale = int.from_bytes(value, "big")
                    if target == "duration" and len(value) in {4, 8}: duration = unpack(">f" if len(value) == 4 else ">d", value)[0]
            pos += len(marker)
    return (duration * scale / 1_000_000_000) if duration is not None else None


def validate_video(data: bytes) -> tuple[str, float]:
    if len(data) < 16:
        raise HTTPException(status_code=415, detail="Invalid video")
    if data[4:8] == b"ftyp":
        extension, duration = "mp4", _mp4_duration(data)
    elif data.startswith(b"\x1a\x45\xdf\xa3"):
        extension, duration = "webm", _webm_duration(data)
    else:
        raise HTTPException(status_code=415, detail="Only MP4 or WebM videos are allowed")
    if duration is None or duration <= 0 or duration > MAX_VIDEO_SECONDS:
        raise HTTPException(status_code=400, detail="Video duration must be between 1 second and 15 seconds")
    return extension, duration


def _write_atomic(organization_id: str, payload: bytes, extension: str) -> tuple[str, Path]:
    filename = f"{secrets.token_hex(16)}.{extension}"
    destination = _safe_path(organization_id, filename)
    destination.parent.mkdir(parents=True, exist_ok=True, mode=0o750)
    temporary = destination.with_suffix(".tmp")
    try:
        with temporary.open("xb") as handle:
            handle.write(payload); handle.flush(); os.fsync(handle.fileno())
        os.replace(temporary, destination); os.chmod(destination, 0o640)
    finally:
        temporary.unlink(missing_ok=True)
    return f"{PUBLIC_PREFIX}/{organization_id}/{filename}", destination


def _delete_managed(value: str | None):
    parts = managed_parts(value)
    if parts: _safe_path(*parts).unlink(missing_ok=True)


def build_organization_background_media_router(db, get_current_user, require_management_role, resolve_team_organization):
    router = APIRouter()

    async def target(user, requested_org):
        require_management_role(user)
        org_id = await resolve_team_organization(user, requested_org)
        org = await db.organizations.find_one({"organization_id": org_id}, {"_id": 0})
        if not org: raise HTTPException(status_code=404, detail="Organization not found")
        return org

    @router.post("/organizations/{organization_id}/portal-background", tags=["organizations"])
    async def upload_background(organization_id: str, file: UploadFile = File(...), authorization: str | None = Header(None), session_token: str | None = Cookie(None)):
        org = await target(await get_current_user(authorization, session_token), organization_id)
        source = await _read_limited(file, MAX_VIDEO_BYTES)
        if source[4:8] == b"ftyp" or source.startswith(b"\x1a\x45\xdf\xa3"):
            extension, duration = validate_video(source); payload, kind = source, "video"
        else:
            # Re-read image limits through the established normalizer; 5MB cap is enforced before decode.
            if len(source) > 5 * 1024 * 1024: raise HTTPException(status_code=413, detail="Background image exceeds the 5 MB limit")
            payload, _ = normalize_logo(source); extension, duration, kind = "webp", None, "image"
        new_url, path = _write_atomic(org["organization_id"], payload, extension)
        try:
            await db.organizations.update_one({"organization_id": org["organization_id"]}, {"$set": {"portal_background_type": kind, "portal_background_url": new_url, "updated_at": datetime.now(timezone.utc).isoformat()}})
        except Exception:
            path.unlink(missing_ok=True); raise HTTPException(status_code=500, detail="Background could not be saved")
        _delete_managed(org.get("portal_background_url"))
        return {"portal_background_type": kind, "portal_background_url": new_url, "duration_seconds": duration}

    @router.delete("/organizations/{organization_id}/portal-background", tags=["organizations"])
    async def delete_background(organization_id: str, authorization: str | None = Header(None), session_token: str | None = Cookie(None)):
        org = await target(await get_current_user(authorization, session_token), organization_id)
        await db.organizations.update_one({"organization_id": org["organization_id"]}, {"$set": {"portal_background_type": "none", "portal_background_url": None, "updated_at": datetime.now(timezone.utc).isoformat()}})
        _delete_managed(org.get("portal_background_url"))
        return {"portal_background_type": "none", "portal_background_url": None}

    @router.get("/media/portal-backgrounds/{organization_id}/{filename}", include_in_schema=False)
    async def get_background(organization_id: str, filename: str):
        path = _safe_path(organization_id, filename)
        if not path.is_file(): raise HTTPException(status_code=404, detail="Background media not found")
        media_type = {".webp": "image/webp", ".mp4": "video/mp4", ".webm": "video/webm"}[path.suffix]
        return FileResponse(path, media_type=media_type, headers={"Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff"})

    return router
