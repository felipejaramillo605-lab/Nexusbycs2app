import ast
import asyncio
import hashlib
from pathlib import Path


SERVER_PATH = Path(__file__).resolve().parents[2] / "backend" / "server.py"


def _function_source(name: str) -> ast.FunctionDef | ast.AsyncFunctionDef:
    tree = ast.parse(SERVER_PATH.read_text(encoding="utf-8"))
    return next(
        node
        for node in tree.body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == name
    )


def _calls(function_name: str) -> set[str]:
    node = _function_source(function_name)
    return {
        call.func.id
        for call in ast.walk(node)
        if isinstance(call, ast.Call) and isinstance(call.func, ast.Name)
    }


def test_guest_class_phone_key_hashes_phone_and_scopes_to_organization():
    node = _function_source("_guest_class_phone_rate_limit_key")
    namespace = {"hashlib": hashlib}
    exec(compile(ast.Module(body=[node], type_ignores=[]), str(SERVER_PATH), "exec"), namespace)
    key = namespace["_guest_class_phone_rate_limit_key"]("org_a", "+573001112233")

    assert key.startswith("guest-class-phone:")
    assert "+573001112233" not in key
    assert key != namespace["_guest_class_phone_rate_limit_key"]("org_b", "+573001112233")
    assert key != namespace["_guest_class_phone_rate_limit_key"]("org_a", "+573009998877")


def test_guest_class_phone_limit_uses_shared_strict_window():
    helper = _function_source("_enforce_guest_class_phone_rate_limit")

    class RecordingLimiter:
        def __init__(self):
            self.calls = []

        async def check(self, *args, **kwargs):
            self.calls.append((args, kwargs))

    limiter = RecordingLimiter()
    namespace = {
        "rate_limiter": limiter,
        "_guest_class_phone_rate_limit_key": lambda org, phone: f"key:{org}:{phone}",
        "GUEST_CLASS_PHONE_LIMIT": 5,
        "GUEST_CLASS_PHONE_WINDOW_SECONDS": 3600,
        "Request": object,
    }
    exec(compile(ast.Module(body=[helper], type_ignores=[]), str(SERVER_PATH), "exec"), namespace)

    request = object()
    asyncio.run(namespace["_enforce_guest_class_phone_rate_limit"]("org_a", "+573001112233", request))

    assert limiter.calls == [(("key:org_a:+573001112233", 5, 3600), {"request": request})]


def test_public_guest_booking_and_waitlist_apply_phone_limit_before_writes():
    for endpoint in ("book_class_session", "join_class_waitlist"):
        node = _function_source(endpoint)
        calls = [call for call in ast.walk(node) if isinstance(call, ast.Call)]
        limit_call = next(
            call
            for call in calls
            if isinstance(call, ast.Call)
            and isinstance(call.func, ast.Name)
            and call.func.id == "_enforce_guest_class_phone_rate_limit"
        )
        first_write = next(
            call
            for call in calls
            if isinstance(call, ast.Call)
            and isinstance(call.func, ast.Attribute)
            and call.func.attr in {"insert_one", "update_one"}
        )
        assert limit_call.lineno < first_write.lineno, endpoint
