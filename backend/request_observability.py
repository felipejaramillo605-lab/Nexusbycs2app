"""Privacy-safe request latency logging for operational monitoring."""

from __future__ import annotations

import logging
from time import perf_counter
from typing import Any


def request_started_at() -> float:
    return perf_counter()


def normalized_route(request: Any) -> str:
    """Return the route template, never a raw URL that might contain identifiers."""
    route = request.scope.get("route") if getattr(request, "scope", None) else None
    route_path = getattr(route, "path", None)
    return (
        route_path
        if isinstance(route_path, str) and route_path.startswith("/")
        else "<unmatched>"
    )


def log_request_latency(
    logger: logging.Logger, request: Any, status_code: int, started_at: float
) -> None:
    """Log only method, normalized route, status and elapsed time; never query/body/header data."""
    elapsed_ms = round((perf_counter() - started_at) * 1000, 2)
    logger.info(
        "request_completed method=%s route=%s status=%s latency_ms=%s",
        getattr(request, "method", "UNKNOWN"),
        normalized_route(request),
        status_code,
        elapsed_ms,
    )
