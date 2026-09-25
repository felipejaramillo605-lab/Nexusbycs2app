"""Shared, bounded image decoding and WebP normalization for Nexus uploads."""
from __future__ import annotations

import asyncio
import hashlib
import io
import logging

from fastapi import HTTPException, UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError, features
from starlette.concurrency import run_in_threadpool

logger = logging.getLogger(__name__)

try:
    import pillow_heif

    pillow_heif.register_heif_opener()
    HEIF_SUPPORTED = True
except (ImportError, OSError) as exc:
    HEIF_SUPPORTED = False
    logger.warning("pillow-heif no está disponible (%s); las cargas HEIF/HEIC no estarán disponibles", exc)

MAX_UPLOAD_BYTES = 12 * 1024 * 1024
MAX_INPUT_PIXELS = 50_000_000
MAX_SIDE = 10_000
Image.MAX_IMAGE_PIXELS = MAX_INPUT_PIXELS

ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP", "HEIF", "AVIF", "GIF", "BMP", "TIFF"}
FORMAT_ERROR = "Formato no admitido. Usa JPG, PNG, WebP, HEIC, AVIF, GIF, BMP o TIFF"
UPLOAD_ERROR = "La imagen supera 12 MB"
DIMENSION_ERROR = "La imagen es demasiado grande (máx. 50 MP)"
INVALID_ERROR = "Imagen inválida o dañada"

PROFILES: dict[str, tuple[int, int]] = {
    "logo": (1024, 90),
    "avatar": (1200, 85),
    "photo": (1600, 85),
    "background": (2560, 82),
}
_IMAGE_SEMAPHORE = asyncio.Semaphore(2)
_IMAGE_FTYP_BRANDS = {b"heic", b"heix", b"heim", b"heis", b"hevc", b"mif1", b"msf1", b"avif", b"avis"}
_HEIF_FTYP_BRANDS = _IMAGE_FTYP_BRANDS - {b"avif", b"avis"}


def is_heif_or_avif_container(data: bytes) -> bool:
    """Check the ISO-BMFF major brand before a background is treated as video."""
    return len(data) >= 12 and data[4:8] == b"ftyp" and data[8:12].lower() in _IMAGE_FTYP_BRANDS


def _looks_like_svg(data: bytes) -> bool:
    prefix = data[:1024].lstrip(b"\xef\xbb\xbf\x00\t\r\n ").lower()
    if prefix.startswith(b"<svg"):
        return True
    return prefix.startswith(b"<?xml") and b"<svg" in prefix


async def read_upload_limited(upload: UploadFile) -> bytes:
    data = await upload.read(MAX_UPLOAD_BYTES + 1)
    await upload.close()
    if not data:
        raise HTTPException(status_code=400, detail=INVALID_ERROR)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=UPLOAD_ERROR)
    if _looks_like_svg(data):
        raise HTTPException(status_code=415, detail=FORMAT_ERROR)
    return data


def normalize_image(data: bytes, profile: str = "avatar", *, preserve_alpha: bool = False) -> tuple[bytes, dict]:
    if profile not in PROFILES:
        raise ValueError(f"Unknown image profile: {profile}")
    target_side, quality = PROFILES[profile]
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=UPLOAD_ERROR)
    if _looks_like_svg(data):
        raise HTTPException(status_code=415, detail=FORMAT_ERROR)
    major_brand = data[8:12].lower() if len(data) >= 12 and data[4:8] == b"ftyp" else b""
    if major_brand in _HEIF_FTYP_BRANDS and not HEIF_SUPPORTED:
        raise HTTPException(status_code=415, detail=FORMAT_ERROR)
    if major_brand in {b"avif", b"avis"} and not (HEIF_SUPPORTED or features.check("avif")):
        raise HTTPException(status_code=415, detail=FORMAT_ERROR)
    try:
        with Image.open(io.BytesIO(data)) as probe:
            source_format = (probe.format or "").upper()
            if source_format not in ALLOWED_FORMATS:
                raise HTTPException(status_code=415, detail=FORMAT_ERROR)
            frames = getattr(probe, "n_frames", 1)
            if frames != 1 or getattr(probe, "is_animated", False):
                raise HTTPException(status_code=415, detail=FORMAT_ERROR)
            width, height = probe.size
            if width < 1 or height < 1 or width > MAX_SIDE or height > MAX_SIDE or width * height > MAX_INPUT_PIXELS:
                raise HTTPException(status_code=400, detail=DIMENSION_ERROR)
            probe.verify()

        with Image.open(io.BytesIO(data)) as image:
            if source_format == "JPEG":
                image.draft("RGB", (target_side * 2, target_side * 2))
            image.load()
            image = ImageOps.exif_transpose(image)
            has_alpha = "A" in image.getbands() or image.mode in {"PA", "LA"} or "transparency" in image.info
            if preserve_alpha and has_alpha:
                if image.mode != "RGBA":
                    image = image.convert("RGBA")
            else:
                if image.mode not in {"RGB", "RGBA"}:
                    image = image.convert("RGBA" if has_alpha else "RGB")
                if image.mode == "RGBA":
                    flattened = Image.new("RGB", image.size, "white")
                    flattened.paste(image, mask=image.getchannel("A"))
                    image = flattened
            image.thumbnail((target_side, target_side), Image.Resampling.LANCZOS)
            output = io.BytesIO()
            image.save(output, format="WEBP", quality=quality, method=6, exif=b"")
            payload = output.getvalue()
            return payload, {
                "source_format": source_format,
                "width": image.width,
                "height": image.height,
                "bytes": len(payload),
                "sha256": hashlib.sha256(payload).hexdigest(),
                "has_transparency": image.mode == "RGBA",
            }
    except HTTPException:
        raise
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise HTTPException(status_code=400, detail=INVALID_ERROR)


async def normalize_image_async(data: bytes, profile: str = "avatar", *, preserve_alpha: bool = False) -> tuple[bytes, dict]:
    async with _IMAGE_SEMAPHORE:
        return await run_in_threadpool(normalize_image, data, profile, preserve_alpha=preserve_alpha)
