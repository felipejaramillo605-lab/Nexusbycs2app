import ast
import struct
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[2] / "backend" / "organization_background_media.py"


class TestHTTPException(Exception):
    def __init__(self, status_code, detail=None, **kwargs):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def _functions(*names):
    tree = ast.parse(MODULE_PATH.read_text(encoding="utf-8"))
    selected = [
        node for node in tree.body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name in names
    ]
    namespace = {"unpack": struct.unpack, "HTTPException": TestHTTPException, "MAX_VIDEO_SECONDS": 15.0}
    exec(compile(ast.Module(body=selected, type_ignores=[]), str(MODULE_PATH), "exec"), namespace)
    return namespace


def _box(kind, payload):
    return (len(payload) + 8).to_bytes(4, "big") + kind + payload


def _mp4_with_duration(seconds, moov_at_end=False):
    mvhd = b"\x00\x00\x00\x00" + b"\x00" * 8 + (1000).to_bytes(4, "big") + int(seconds * 1000).to_bytes(4, "big")
    ftyp = _box(b"ftyp", b"isom\x00\x00\x00\x00")
    moov = _box(b"moov", _box(b"mvhd", mvhd))
    return ftyp + (_box(b"mdat", b"\x00" * 12) if moov_at_end else b"") + moov


def _webm_with_duration(seconds):
    scale = b"\x2a\xd7\xb1\x83" + (1_000_000).to_bytes(3, "big")
    duration = b"\x44\x89\x84" + struct.pack(">f", seconds * 1000)
    return b"\x1a\x45\xdf\xa3" + scale + duration


def test_mp4_is_accepted_when_moov_is_after_media_data():
    functions = _functions("_mp4_duration", "_read_vint", "_webm_duration", "validate_video")
    extension, duration = functions["validate_video"](_mp4_with_duration(8, moov_at_end=True))

    assert extension == "mp4"
    assert duration == 8


def test_webm_is_accepted_with_valid_duration_metadata():
    functions = _functions("_mp4_duration", "_read_vint", "_webm_duration", "validate_video")
    extension, duration = functions["validate_video"](_webm_with_duration(7))

    assert extension == "webm"
    assert duration == 7


def test_corrupt_or_durationless_containers_are_rejected():
    functions = _functions("_mp4_duration", "_read_vint", "_webm_duration", "validate_video")
    corrupt_mp4 = _box(b"ftyp", b"isom\x00\x00\x00\x00") + b"\x00" * 16
    corrupt_webm = b"\x1a\x45\xdf\xa3" + b"\x00" * 16

    for payload in (corrupt_mp4, corrupt_webm):
        try:
            functions["validate_video"](payload)
        except TestHTTPException as error:
            assert error.status_code in {400, 415}
        else:
            raise AssertionError("Invalid video was accepted")


def test_webm_with_repeated_marker_is_bounded_not_hung():
    # A crafted file that repeats the 2-byte duration marker at every offset
    # used to make _webm_duration scan without any cap on match count.
    functions = _functions("_mp4_duration", "_read_vint", "_webm_duration", "validate_video")
    payload = b"\x1a\x45\xdf\xa3" + (b"\x44\x89" * 200_000)

    try:
        functions["validate_video"](payload)
    except TestHTTPException as error:
        assert error.status_code in {400, 415}
    else:
        raise AssertionError("Video with no real duration metadata was accepted")


def test_general_organization_update_cannot_set_a_background_url():
    tree = ast.parse((MODULE_PATH.parents[0] / "server.py").read_text(encoding="utf-8"))
    update_model = next(node for node in tree.body if isinstance(node, ast.ClassDef) and node.name == "OrganizationUpdate")
    fields = {
        target.id
        for node in update_model.body
        if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name)
        for target in [node.target]
    }

    assert "portal_background_url" not in fields
