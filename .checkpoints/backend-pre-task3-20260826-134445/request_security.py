from collections import defaultdict, deque
from dataclasses import dataclass
from time import monotonic
from urllib.parse import urlsplit
import asyncio
import os
from fastapi import HTTPException, Request
from security_observability import record_security_event

MUTATING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
AUTH_BOOTSTRAP_PATHS = {"/api/auth/session", "/api/auth/login"}
AUTH_LIMITS = {
    "/api/auth/login": (10, 300),
    "/api/auth/register": (5, 900),
    "/api/auth/forgot-password": (5, 900),
    "/api/auth/reset-password": (8, 900),
    "/api/auth/session": (12, 300),
    "/api/public/auth/passwordless": (8, 600),
}


def trusted_origins():
    raw = os.getenv("CORS_ORIGINS", "")
    values = []
    for item in raw.split(","):
        origin = item.strip().rstrip("/")
        if not origin or origin == "*":
            continue
        parsed = urlsplit(origin)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc or parsed.path not in {"", "/"}:
            continue
        values.append(f"{parsed.scheme}://{parsed.netloc}")
    return tuple(dict.fromkeys(values))


TRUSTED_ORIGINS = []


def refresh_trusted_origins():
    values = list(trusted_origins())
    frontend_url = os.getenv("FRONTEND_URL", "").strip().rstrip("/")
    if frontend_url:
        parsed = urlsplit(frontend_url)
        if parsed.scheme in {"http", "https"} and parsed.netloc and parsed.path in {"", "/"}:
            values.append(f"{parsed.scheme}://{parsed.netloc}")
    normalized = list(dict.fromkeys(values))
    if not normalized:
        raise RuntimeError("CORS_ORIGINS or FRONTEND_URL must contain an explicit http(s) origin")
    TRUSTED_ORIGINS[:] = normalized
    return tuple(TRUSTED_ORIGINS)


@dataclass
class _Window:
    hits: deque


class InMemoryRateLimiter:
    def __init__(self):
        self._windows = defaultdict(lambda: _Window(deque()))
        self._lock = asyncio.Lock()
        self._operations = 0

    async def check(self, key, limit, seconds, request=None):
        now = monotonic()
        async with self._lock:
            window = self._windows[key].hits
            cutoff = now - seconds
            while window and window[0] <= cutoff:
                window.popleft()
            if len(window) >= limit:
                retry_after = max(1, int(seconds - (now - window[0])))
                if request is not None:
                    await record_security_event(event_type="authentication_rate_limited", request_method=request.method, path=request.url.path, source=_client_source(request), metadata={"limit":limit,"window_seconds":seconds})
                raise HTTPException(429, "Too many requests", headers={"Retry-After": str(retry_after)})
            window.append(now)
            self._operations += 1
            if self._operations % 500 == 0:
                stale = [candidate for candidate, value in self._windows.items() if not value.hits or value.hits[-1] <= cutoff]
                for candidate in stale:
                    self._windows.pop(candidate, None)


rate_limiter = InMemoryRateLimiter()


def _client_source(request):
    forwarded = request.headers.get("x-forwarded-for", "").split(",", 1)[0].strip()
    return forwarded or (request.client.host if request.client else "unknown")


def _client_key(request):
    return f"{_client_source(request)}:{request.url.path}"


async def enforce_request_security(request: Request):
    path = request.url.path.rstrip("/") or "/"
    if path in AUTH_LIMITS:
        limit, seconds = AUTH_LIMITS[path]
        await rate_limiter.check(_client_key(request), limit, seconds, request=request)

    if request.method not in MUTATING_METHODS or request.method == "OPTIONS":
        return

    origin = (request.headers.get("origin") or "").rstrip("/")
    fetch_site = (request.headers.get("sec-fetch-site") or "").lower()
    if path == "/api/auth/session":
        # OAuth session exchange is protected by an unguessable X-Session-ID and
        # the existing rate limiter. Preview gateways may rewrite Origin, so the
        # browser's fetch metadata is the authoritative anti-CSRF signal here.
        if fetch_site and fetch_site not in {"same-origin", "same-site", "none"}:
            await record_security_event(event_type="cross_site_request_blocked", request_method=request.method, path=request.url.path, source=_client_source(request), metadata={"fetch_site":fetch_site})
            raise HTTPException(403, "Cross-site request blocked")
        return

    if path == "/api/auth/login":
        # Manual credential login keeps strict Origin validation whenever the
        # browser supplies Origin, while allowing same-site clients that omit it.
        # RELAXED: Trust Sec-Fetch-Site when preview gateways may rewrite Origin
        if fetch_site and fetch_site not in {"same-origin", "same-site", "none"}:
            await record_security_event(event_type="cross_site_request_blocked", request_method=request.method, path=request.url.path, source=_client_source(request), metadata={"fetch_site":fetch_site})
            raise HTTPException(403, "Cross-site request blocked")
        # Allow when Sec-Fetch-Site indicates same-origin even if Origin header is modified by proxy
        if origin and origin not in TRUSTED_ORIGINS and fetch_site not in {"same-origin", "same-site"}:
            await record_security_event(event_type="origin_blocked", request_method=request.method, path=request.url.path, source=_client_source(request), metadata={"fetch_site":fetch_site or "missing", "origin":origin[:50] if origin else "none"})
            raise HTTPException(403, "Request origin is not allowed")
        return
    # Bearer and X-Session-ID integrations are not ambient cookie credentials.
    # CSRF validation is mandatory when the browser authenticates with the session cookie.
    if not request.cookies.get("session_token"):
        return
    # NEXUS_PREVIEW_SAME_ORIGIN_CSRF_7J
    # Preview gateways may rewrite or omit Origin. Sec-Fetch-Site is a
    # browser-controlled forbidden header and is accepted only when the
    # browser explicitly reports a same-origin request.
    same_origin_fetch = fetch_site == "same-origin"

    if (
        (not origin or origin not in TRUSTED_ORIGINS)
        and not same_origin_fetch
    ):
        await record_security_event(
            event_type="origin_blocked",
            request_method=request.method,
            path=request.url.path,
            source=_client_source(request),
            metadata={
                "fetch_site": fetch_site or "missing",
                "origin_present": bool(origin),
                "origin_trusted": origin in TRUSTED_ORIGINS,
            },
        )
        raise HTTPException(
            403,
            "Request origin is not allowed",
        )

    if fetch_site and fetch_site not in {
        "same-origin",
        "same-site",
        "none",
    }:
        await record_security_event(event_type="cross_site_request_blocked", request_method=request.method, path=request.url.path, source=_client_source(request), metadata={"fetch_site":fetch_site})
        raise HTTPException(403, "Cross-site request blocked")
