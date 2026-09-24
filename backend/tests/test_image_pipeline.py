import asyncio
import io
import struct
import zlib

import pytest
from fastapi import HTTPException
from PIL import Image, features

import image_pipeline as pipeline
from organization_background_media import MAX_VIDEO_BYTES, prepare_background_upload


def _encoded(image, format_name, **options):
    output = io.BytesIO()
    image.save(output, format=format_name, **options)
    return output.getvalue()


def _small_image(mode="RGB", size=(64, 40), color=None):
    color = color or ((255, 0, 0, 96) if mode == "RGBA" else (120, 60, 30))
    return Image.new(mode, size, color)


@pytest.mark.parametrize("format_name", ["GIF", "BMP", "TIFF"])
def test_single_frame_legacy_formats_normalize_to_webp(format_name):
    source = _encoded(_small_image(), format_name)

    output, metadata = pipeline.normalize_image(source, "photo")

    with Image.open(io.BytesIO(output)) as image:
        assert image.format == "WEBP"
        assert image.size == (64, 40)
    assert metadata["source_format"] == format_name


def test_animated_gif_and_multipage_tiff_are_rejected():
    frames = [_small_image(color=color) for color in ((255, 0, 0), (0, 0, 255))]
    animated = _encoded(frames[0], "GIF", save_all=True, append_images=frames[1:])
    multipage = _encoded(frames[0], "TIFF", save_all=True, append_images=frames[1:])

    for source in (animated, multipage):
        with pytest.raises(HTTPException) as error:
            pipeline.normalize_image(source)
        assert error.value.status_code == 415
        assert error.value.detail == pipeline.FORMAT_ERROR


def test_logo_preserves_transparency_while_avatar_flattens_it():
    source = _encoded(_small_image("RGBA"), "PNG")

    logo, logo_metadata = pipeline.normalize_image(source, "logo", preserve_alpha=True)
    avatar, avatar_metadata = pipeline.normalize_image(source, "avatar")

    with Image.open(io.BytesIO(logo)) as image:
        assert image.mode == "RGBA"
    with Image.open(io.BytesIO(avatar)) as image:
        assert image.mode == "RGB"
    assert logo_metadata["has_transparency"] is True
    assert avatar_metadata["has_transparency"] is False


@pytest.mark.parametrize(
    ("profile", "expected_side"),
    [("logo", 1024), ("avatar", 1200), ("photo", 1600), ("background", 2560)],
)
def test_profiles_apply_their_output_size(profile, expected_side):
    source = _encoded(_small_image(size=(3000, 2000)), "PNG")

    output, _ = pipeline.normalize_image(source, profile)

    with Image.open(io.BytesIO(output)) as image:
        assert max(image.size) == expected_side


def test_exif_orientation_is_applied_and_metadata_is_removed():
    source_image = _small_image(size=(6000, 4000))
    exif = Image.Exif()
    exif[274] = 6
    source = _encoded(source_image, "JPEG", quality=80, exif=exif)

    output, metadata = pipeline.normalize_image(source, "avatar")

    with Image.open(io.BytesIO(output)) as image:
        assert image.size == (800, 1200)
        assert not image.getexif()
    assert metadata["source_format"] == "JPEG"


def _png_header(width, height):
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    crc = zlib.crc32(b"IHDR" + ihdr) & 0xFFFFFFFF
    return b"\x89PNG\r\n\x1a\n" + struct.pack(">I", len(ihdr)) + b"IHDR" + ihdr + struct.pack(">I", crc)


def test_decompression_bomb_dimensions_return_a_safe_400():
    source = _png_header(20_000, 10_000)

    with pytest.raises(HTTPException) as error:
        pipeline.normalize_image(source)

    assert error.value.status_code == 400
    assert error.value.detail in {pipeline.DIMENSION_ERROR, pipeline.INVALID_ERROR}


def test_oversized_upload_and_invalid_image_have_spanish_errors():
    with pytest.raises(HTTPException) as too_large:
        pipeline.normalize_image(b"x" * (pipeline.MAX_UPLOAD_BYTES + 1))
    assert (too_large.value.status_code, too_large.value.detail) == (413, pipeline.UPLOAD_ERROR)

    with pytest.raises(HTTPException) as invalid:
        pipeline.normalize_image(b"not an image")
    assert (invalid.value.status_code, invalid.value.detail) == (400, pipeline.INVALID_ERROR)

    with pytest.raises(HTTPException) as svg:
        pipeline.normalize_image(b"<?xml version='1.0'?><svg xmlns='http://www.w3.org/2000/svg'/>")
    assert (svg.value.status_code, svg.value.detail) == (415, pipeline.FORMAT_ERROR)


@pytest.mark.parametrize("format_name", ["JPEG", "PNG", "WEBP", "AVIF"])
def test_common_supported_formats_normalize(format_name):
    if format_name == "AVIF" and not features.check("avif"):
        pytest.skip("Pillow no tiene soporte AVIF en este entorno")
    source = _encoded(_small_image(), format_name)

    output, metadata = pipeline.normalize_image(source, "photo")

    assert metadata["source_format"] == format_name
    with Image.open(io.BytesIO(output)) as image:
        assert image.format == "WEBP"


def test_heif_support_when_decoder_is_installed():
    pillow_heif = pytest.importorskip("pillow_heif")
    source = _encoded(_small_image(), "HEIF")

    output, metadata = pipeline.normalize_image(source, "photo")

    assert metadata["source_format"] in {"HEIF", "AVIF"}
    with Image.open(io.BytesIO(output)) as image:
        assert image.format == "WEBP"
    assert pillow_heif is not None


def test_background_ftyp_major_brand_separates_heif_avif_from_mp4():
    heic = b"\x00\x00\x00\x18ftypheic\x00\x00\x00\x00mif1"
    avif = b"\x00\x00\x00\x18ftypavif\x00\x00\x00\x00mif1"
    mp4 = b"\x00\x00\x00\x18ftypisom\x00\x00\x00\x00isom"

    assert pipeline.is_heif_or_avif_container(heic)
    assert pipeline.is_heif_or_avif_container(avif)
    assert not pipeline.is_heif_or_avif_container(mp4)


def test_valid_avif_background_runs_through_image_profile():
    if not features.check("avif"):
        pytest.skip("Pillow no tiene soporte AVIF en este entorno")
    source = _encoded(_small_image(size=(3000, 2000)), "AVIF")

    payload, extension, duration, kind = asyncio.run(prepare_background_upload(source))

    assert (extension, duration, kind) == ("webp", None, "image")
    with Image.open(io.BytesIO(payload)) as image:
        assert image.format == "WEBP"
        assert max(image.size) == pipeline.PROFILES["background"][0]


def test_heic_background_runs_through_image_profile_when_decoder_exists():
    pytest.importorskip("pillow_heif")
    source = _encoded(_small_image(size=(3000, 2000)), "HEIF")

    payload, extension, duration, kind = asyncio.run(prepare_background_upload(source))

    assert (extension, duration, kind) == ("webp", None, "image")
    with Image.open(io.BytesIO(payload)) as image:
        assert image.format == "WEBP"
        assert max(image.size) == pipeline.PROFILES["background"][0]


def _mp4_with_duration(seconds):
    mvhd = b"\x00\x00\x00\x00" + b"\x00" * 8 + (1000).to_bytes(4, "big") + int(seconds * 1000).to_bytes(4, "big")
    ftyp = (16).to_bytes(4, "big") + b"ftypisom\x00\x00\x00\x00"
    moov = (len(mvhd) + 16).to_bytes(4, "big") + b"moov" + (len(mvhd) + 8).to_bytes(4, "big") + b"mvhd" + mvhd
    return ftyp + moov


def test_valid_mp4_background_remains_video():
    source = _mp4_with_duration(8)

    payload, extension, duration, kind = asyncio.run(prepare_background_upload(source))

    assert payload is source
    assert (extension, duration, kind) == ("mp4", 8, "video")
    assert MAX_VIDEO_BYTES == 20 * 1024 * 1024


def test_async_normalization_uses_the_shared_threadpool_path(monkeypatch):
    source = _encoded(_small_image(), "PNG")
    calls = []
    original = pipeline.run_in_threadpool

    async def wrapped(*args, **kwargs):
        calls.append(args[2])
        return await original(*args, **kwargs)

    monkeypatch.setattr(pipeline, "run_in_threadpool", wrapped)
    asyncio.run(pipeline.normalize_image_async(source, "photo"))

    assert calls == ["photo"]
