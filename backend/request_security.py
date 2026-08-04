from collections import defaultdict, deque
from dataclasses import dataclass
from time import monotonic
from urllib.parse import urlsplit
import asyncio
import os
from fastapi import HTTPException, Request
from security_observability import record_security_event

MUTATING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
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


TRUSTED_ORIGINS = trusted_origins()
if not TRUSTED_ORIGINS:
    raise RuntimeError("CORS_ORIGINS must contain at least one explicit http(s) origin")


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

    # Bearer and X-Session-ID integrations are not ambient cookie credentials.
    # CSRF validation is mandatory when the browser authenticates with the session cookie.
    if not request.cookies.get("session_token"):
        return

    origin = (request.headers.get("origin") or "").rstrip("/")
    fetch_site = (request.headers.get("sec-fetch-site") or "").lower()
    if not origin or origin not in TRUSTED_ORIGINS:
        await record_security_event(event_type="origin_blocked", request_method=request.method, path=request.url.path, source=_client_source(request), metadata={"fetch_site":fetch_site or "missing"})
        raise HTTPException(403, "Request origin is not allowed")
    if fetch_site and fetch_site not in {"same-origin", "same-site", "none"}:
        await record_security_event(event_type="cross_site_request_blocked", request_method=request.method, path=request.url.path, source=_client_source(request), metadata={"fetch_site":fetch_site})
        raise HTTPException(403, "Cross-site request blocked")
