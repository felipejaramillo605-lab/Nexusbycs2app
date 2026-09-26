"""Regressions for the new class-booking confirmation email (event contract,
email rendering, and the server.py dispatch helper) and the client-portal
projection fix that finally surfaces the client's own spot/code.
"""

import ast
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from appointment_email_dispatcher import (
    EVENT_CONTRACTS,
    DispatchContractError,
    build_sender,
)  # noqa: E402
from email_service import EmailService  # noqa: E402

# ---------------------------------------------------------------------------
# 1. Event contract wiring (appointment_email_dispatcher.py -- standalone module)
# ---------------------------------------------------------------------------


def test_class_confirmation_event_contract_requires_the_real_fields():
    contract = EVENT_CONTRACTS["class_confirmation"]
    assert contract["required"] == {
        "customer_name",
        "class_name",
        "professional_name",
        "date",
        "time",
        "organization_name",
    }
    assert "cancellation_url" in contract["forbidden"]


def test_build_sender_routes_class_confirmation_to_the_new_email_method():
    fake_service = MagicMock()
    delivery = {
        "event_type": "class_confirmation",
        "recipient": "client@example.com",
        "payload": {
            "customer_name": "Felipe",
            "class_name": "Clase de pilates",
            "professional_name": "Fausto Murillo",
            "date": "2026-09-29",
            "time": "10:00",
            "organization_name": "CS2",
            "organization_address": "Calle 1",
            "spot_label": "Box2",
            "confirmation_code": "A1B2C3",
        },
    }

    sender = build_sender(delivery, service=fake_service)
    sender()

    fake_service.send_class_booking_confirmation.assert_called_once_with(
        to_email="client@example.com",
        customer_name="Felipe",
        class_name="Clase de pilates",
        barber_name="Fausto Murillo",
        date="2026-09-29",
        time="10:00",
        organization_name="CS2",
        organization_address="Calle 1",
        spot_label="Box2",
        confirmation_code="A1B2C3",
    )


def test_build_sender_rejects_class_confirmation_missing_required_fields():
    delivery = {
        "event_type": "class_confirmation",
        "recipient": "client@example.com",
        "payload": {"customer_name": "Felipe"},
    }
    with pytest.raises(DispatchContractError):
        build_sender(delivery, service=MagicMock())


# ---------------------------------------------------------------------------
# 2. Email rendering (email_service.py -- standalone module, _send_email mocked)
# ---------------------------------------------------------------------------


def _service():
    service = EmailService()
    service._send_email = MagicMock(return_value=True)
    return service


def test_send_class_booking_confirmation_includes_spot_and_code_when_present():
    service = _service()

    result = service.send_class_booking_confirmation(
        to_email="client@example.com",
        customer_name="Felipe",
        class_name="Clase de pilates",
        barber_name="Fausto Murillo",
        date="2026-09-29",
        time="10:00",
        organization_name="CS2",
        organization_address="Calle 1",
        spot_label="Box2",
        confirmation_code="A1B2C3",
    )

    assert result is True
    (to_email, subject, html_body, text_body), _kwargs = service._send_email.call_args
    assert to_email == "client@example.com"
    assert "Cupo Confirmado" in subject
    assert "Box2" in html_body
    assert "A1B2C3" in html_body
    assert "Box2" in text_body
    assert "A1B2C3" in text_body


def test_send_class_booking_confirmation_omits_code_section_when_not_required():
    service = _service()

    service.send_class_booking_confirmation(
        to_email="client@example.com",
        customer_name="Felipe",
        class_name="Clase de pilates",
        barber_name="Fausto Murillo",
        date="2026-09-29",
        time="10:00",
        organization_name="CS2",
    )

    _args, _kwargs = service._send_email.call_args
    html_body = _args[2]
    assert "Código de confirmación" not in html_body


# ---------------------------------------------------------------------------
# 3. server.py dispatch helper (_send_class_booking_confirmation) -- extracted
#    via AST, same technique test_class_cancellation_authz.py already uses,
#    since importing server.py directly needs packages this environment
#    doesn't have (emergentintegrations) and isn't what's under test here.
# ---------------------------------------------------------------------------


def _load_dispatch_helper(execute_compatibility_delivery, email_service):
    tree = ast.parse((BACKEND / "server.py").read_text(encoding="utf-8"))
    node = next(
        n
        for n in tree.body
        if isinstance(n, ast.AsyncFunctionDef)
        and n.name == "_send_class_booking_confirmation"
    )
    node.decorator_list = []
    # execute_compatibility_delivery and email_service are free variables the
    # real function reads from server.py's module scope (imported at the top
    # of that file) -- providing them here directly is the same technique
    # test_class_cancellation_authz.py already uses for its own free variables.
    scope = {
        "logger": __import__("logging").getLogger("test_class_booking_confirmation"),
        "execute_compatibility_delivery": execute_compatibility_delivery,
        "email_service": email_service,
    }
    exec(compile(ast.Module(body=[node], type_ignores=[]), "server.py", "exec"), scope)
    return scope["_send_class_booking_confirmation"]


class _FakeDb:
    def __init__(self, organization=None, barber=None):
        self.organizations = SimpleNamespace(find_one=self._find_org)
        self.barbers = SimpleNamespace(find_one=self._find_barber)
        self._organization = organization or {}
        self._barber = barber or {}

    async def _find_org(self, *_args, **_kwargs):
        return self._organization

    async def _find_barber(self, *_args, **_kwargs):
        return self._barber


def _session_service_booking():
    session = {"barber_id": "barber-1", "date": "2026-09-29", "time": "10:00"}
    service = {"name": "Clase de pilates"}
    booking = {
        "class_booking_id": "cbk_1",
        "client_name": "Felipe",
        "client_email": "felipe@example.com",
        "spot_label": "Box2",
        "confirmation_code": "A1B2C3",
    }
    return session, service, booking


@pytest.mark.asyncio
async def test_dispatch_helper_sends_a_correctly_shaped_payload():
    captured = {}

    async def fake_execute_compatibility_delivery(_db, **kwargs):
        captured.update(kwargs)
        kwargs["sender"]()  # exercise the lambda the same way the real dispatcher would

    fake_email_service = MagicMock()
    fn = _load_dispatch_helper(fake_execute_compatibility_delivery, fake_email_service)
    db = _FakeDb(
        organization={"name": "CS2", "address": "Calle 1"},
        barber={"display_name": "Fausto Murillo"},
    )
    session, service, booking = _session_service_booking()

    await fn(
        db, organization_id="org-1", session=session, service=service, booking=booking
    )

    assert captured["organization_id"] == "org-1"
    assert captured["appointment_id"] == "cbk_1"
    assert captured["event_type"] == "class_confirmation"
    assert captured["recipient"] == "felipe@example.com"
    assert captured["payload"] == {
        "customer_name": "Felipe",
        "class_name": "Clase de pilates",
        "professional_name": "Fausto Murillo",
        "date": "2026-09-29",
        "time": "10:00",
        "organization_name": "CS2",
        "organization_address": "Calle 1",
        "spot_label": "Box2",
        "confirmation_code": "A1B2C3",
    }
    fake_email_service.send_class_booking_confirmation.assert_called_once_with(
        to_email="felipe@example.com",
        customer_name="Felipe",
        class_name="Clase de pilates",
        barber_name="Fausto Murillo",
        date="2026-09-29",
        time="10:00",
        organization_name="CS2",
        organization_address="Calle 1",
        spot_label="Box2",
        confirmation_code="A1B2C3",
    )


@pytest.mark.asyncio
async def test_dispatch_helper_swallows_delivery_failures_without_raising():
    # A booking is already confirmed by the time this runs -- an email/DB
    # error here must never surface as a 500 on an already-successful booking.
    async def raising_delivery(_db, **_kwargs):
        raise RuntimeError("smtp exploded")

    fn = _load_dispatch_helper(raising_delivery, MagicMock())
    db = _FakeDb(
        organization={"name": "CS2"}, barber={"display_name": "Fausto Murillo"}
    )
    session, service, booking = _session_service_booking()

    await fn(
        db, organization_id="org-1", session=session, service=service, booking=booking
    )  # must not raise


@pytest.mark.asyncio
async def test_dispatch_helper_skips_silently_when_booking_has_no_email():
    delivery_calls = []

    async def fake_execute_compatibility_delivery(_db, **kwargs):
        delivery_calls.append(kwargs)

    fn = _load_dispatch_helper(fake_execute_compatibility_delivery, MagicMock())
    db = _FakeDb()
    session, service, booking = _session_service_booking()
    booking["client_email"] = None

    await fn(
        db, organization_id="org-1", session=session, service=service, booking=booking
    )

    assert delivery_calls == []
