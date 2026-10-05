"""Exercise actual ASGI routes, without DB/network or real customer data."""

import asyncio
import sys
from datetime import datetime, timedelta
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock
from zoneinfo import ZoneInfo

import httpx
from fastapi import FastAPI, HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from client_whatsapp import build_client_whatsapp_router  # noqa: E402
import client_whatsapp  # noqa: E402


def matches(row, query):
    for key, value in query.items():
        if key == "$or":
            if not any(matches(row, branch) for branch in value):
                return False
        elif isinstance(value, dict):
            if "$gt" in value and row.get(key, "") <= value["$gt"]:
                return False
        elif row.get(key) != value:
            return False
    return True


class Collection:
    def __init__(self, rows):
        self.rows = rows
        self.queries = []

    async def find_one(self, query, projection=None, sort=None):
        self.queries.append(query)
        rows = [row for row in self.rows if matches(row, query)]
        if sort:
            rows.sort(key=lambda row: tuple(row[key] for key, _ in sort))
        return dict(rows[0]) if rows else None


def setup(monkeypatch, *, consent=True, role="manager", authenticated=True):
    org = {"organization_id": "org-a", "name": "Empresa A", "timezone": "America/Bogota"}
    db = SimpleNamespace(
        clients=Collection(
            [
                {
                    "client_id": "client-a",
                    "organization_id": "org-a",
                    "name": "Ana",
                    "phone": "+573001234567",
                    "accepts_marketing": consent,
                },
                {
                    "client_id": "client-b",
                    "organization_id": "org-b",
                    "name": "Otro",
                    "phone": "999",
                    "accepts_marketing": True,
                },
            ]
        ),
        organizations=Collection([org]),
        appointments=Collection([]),
        services=Collection([{"organization_id": "org-a", "service_id": "svc-a", "name": "Consulta"}]),
    )
    user = SimpleNamespace(role=role, organization_id="org-a")

    async def get_user(*_):
        if not authenticated:
            raise HTTPException(401, "Authentication required")
        return user

    def management(current):
        if current.role not in ("owner", "manager", "admin"):
            raise HTTPException(403, "Management required")

    async def resolve(current, requested):
        if current.role != "owner" and requested and requested != current.organization_id:
            raise HTTPException(403, "Cross organization denied")
        return requested or current.organization_id

    app = FastAPI()
    app.include_router(
        build_client_whatsapp_router(
            db, get_user, management, resolve, lambda _: ("America/Bogota", ZoneInfo("America/Bogota"))
        )
    )
    sender = AsyncMock(return_value={"accepted": True, "provider": "mock", "status": "sent_mock"})
    monkeypatch.setattr(client_whatsapp.whatsapp_service, "send_whatsapp_message", sender)
    # La ventana de la Ley 2300 depende de la hora: cada prueba la fija de forma explicita.
    monkeypatch.setattr(client_whatsapp, "marketing_allowed", lambda *args, **kwargs: True)
    return app, db, sender


def post(app, payload, client_id="client-a"):
    async def run():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            return await client.post(f"/clients/{client_id}/messages/whatsapp", json=payload)

    return asyncio.run(run())


def test_success_uses_database_recipient_and_actual_text(monkeypatch):
    app, db, sender = setup(monkeypatch)
    result = post(app, {"kind": "promotion", "message": "  Oferta real  ", "organization_id": "org-a"})
    assert result.status_code == 200
    assert result.json() == {"accepted": True, "provider": "mock", "status": "sent_mock"}
    assert sender.await_args.kwargs["to_phone"] == "+573001234567"
    assert sender.await_args.kwargs["message"] == "Oferta real"
    assert db.clients.queries[0] == {"client_id": "client-a", "organization_id": "org-a"}


def test_promotion_requires_explicit_consent(monkeypatch):
    for consent in (False, None):
        app, _, sender = setup(monkeypatch, consent=consent)
        result = post(app, {"kind": "promotion", "message": "Oferta"})
        assert result.status_code == 403
        assert "autorizó" in result.json()["detail"]
        sender.assert_not_awaited()


def test_cross_organization_request_is_rejected(monkeypatch):
    app, _, sender = setup(monkeypatch)
    assert (
        post(app, {"kind": "promotion", "message": "Oferta", "organization_id": "org-b"}, "client-b").status_code == 403
    )
    sender.assert_not_awaited()


def test_foreign_client_cannot_be_sent_with_own_organization(monkeypatch):
    app, _, sender = setup(monkeypatch)
    assert post(app, {"kind": "promotion", "message": "Oferta"}, "client-b").status_code == 404
    sender.assert_not_awaited()


def test_missing_client_is_404(monkeypatch):
    app, _, sender = setup(monkeypatch)
    assert post(app, {"kind": "reminder"}, "missing").status_code == 404
    sender.assert_not_awaited()


def test_authentication_and_management_role_required(monkeypatch):
    for kwargs, status in (({"authenticated": False}, 401), ({"role": "staff"}, 403)):
        app, _, sender = setup(monkeypatch, **kwargs)
        assert post(app, {"kind": "reminder"}).status_code == status
        sender.assert_not_awaited()


def test_reminder_uses_nearest_future_confirmed_appointment_and_ignores_supplied_text(monkeypatch):
    app, db, sender = setup(monkeypatch, consent=False)
    tomorrow = (datetime.now(ZoneInfo("America/Bogota")) + timedelta(days=1)).date().isoformat()
    base = {
        "organization_id": "org-a",
        "client_phone": "+573001234567",
        "status": "confirmed",
        "service_id": "svc-a",
        "date": tomorrow,
    }
    db.appointments.rows = [
        {**base, "time": "12:00"},
        {**base, "time": "10:00"},
        {**base, "time": "09:00", "status": "cancelled"},
        {**base, "time": "08:00", "organization_id": "org-b"},
        {**base, "time": "07:00", "client_phone": "999"},
        {**base, "date": "2000-01-01", "time": "06:00"},
    ]
    assert post(app, {"kind": "reminder", "message": "invented"}).status_code == 200
    message = sender.await_args.kwargs["message"]
    assert tomorrow in message and "10:00" in message and "Consulta" in message and "Empresa A" in message
    assert "invented" not in message and "Próximamente" not in message and "--:--" not in message


def test_reminder_without_future_appointment_is_not_sent(monkeypatch):
    app, _, sender = setup(monkeypatch)
    assert post(app, {"kind": "reminder"}).status_code == 400
    sender.assert_not_awaited()


def test_empty_promotional_message_is_rejected(monkeypatch):
    app, _, sender = setup(monkeypatch)
    assert post(app, {"kind": "promotion", "message": "  "}).status_code == 400
    sender.assert_not_awaited()


def test_contact_injection_unknown_kind_and_oversized_text_are_rejected(monkeypatch):
    app, _, sender = setup(monkeypatch)
    for payload in (
        {"kind": "promotion", "message": "Oferta", "phone": "attacker"},
        {"kind": "birthday", "message": "Oferta"},
        {"kind": "promotion", "message": "x" * 2001},
    ):
        assert post(app, payload).status_code == 422
    sender.assert_not_awaited()


def test_provider_failure_does_not_expose_provider_details(monkeypatch):
    app, _, sender = setup(monkeypatch)
    sender.return_value = {"accepted": False, "provider": "whatsapp_cloud_api", "detail": "sensitive-response"}
    result = post(app, {"kind": "operational_notice", "message": "Cerramos temprano"})
    assert result.status_code == 502
    assert "sensitive-response" not in result.text


def test_promotion_outside_the_ley_2300_window_is_blocked_with_a_clear_message(monkeypatch):
    app, _, sender = setup(monkeypatch)
    monkeypatch.setattr(client_whatsapp, "marketing_allowed", lambda *args, **kwargs: False)
    result = post(app, {"kind": "promotion", "message": "Oferta"})
    assert result.status_code == 409
    assert "Ley 2300" in result.json()["detail"] and "lunes a viernes" in result.json()["detail"]
    sender.assert_not_awaited()


def test_a_reminder_for_a_real_appointment_is_not_advertising_and_ignores_the_window(monkeypatch):
    app, _, sender = setup(monkeypatch)
    monkeypatch.setattr(client_whatsapp, "marketing_allowed", lambda *args, **kwargs: False)
    result = post(app, {"kind": "reminder", "organization_id": "org-a"})
    assert result.status_code != 409
