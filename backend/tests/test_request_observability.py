import logging
from types import SimpleNamespace

from request_observability import log_request_latency, normalized_route


def test_normalized_route_uses_template_not_identifier():
    request = SimpleNamespace(
        method="GET",
        scope={"route": SimpleNamespace(path="/api/clients/{client_id}")},
    )
    assert normalized_route(request) == "/api/clients/{client_id}"


def test_unmatched_route_never_logs_raw_path():
    request = SimpleNamespace(method="GET", scope={})
    assert normalized_route(request) == "<unmatched>"


def test_latency_log_has_only_safe_route_metadata(caplog):
    request = SimpleNamespace(
        method="POST",
        scope={"route": SimpleNamespace(path="/api/appointments/{appointment_id}")},
    )
    with caplog.at_level(logging.INFO):
        log_request_latency(logging.getLogger("nexus.test"), request, 201, 0)
    message = caplog.messages[-1]
    assert "method=POST" in message
    assert "route=/api/appointments/{appointment_id}" in message
    assert "status=201" in message
    assert "latency_ms=" in message
