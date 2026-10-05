"""Ventana de reserva de clases grupales: la lista publica la marca y el error explica cuando abre (sin red)."""

import asyncio
import os
import sys
from datetime import date
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
for key, value in {
    "MONGO_URL": "mongodb://localhost:27017",
    "DB_NAME": "t",
    "EMERGENT_LLM_KEY": "k",
    "CORS_ORIGINS": "http://localhost:3000",
}.items():
    os.environ.setdefault(key, value)

import server  # noqa: E402


def test_a_class_without_a_window_is_always_open():
    assert server._class_booking_window({"date": "2030-01-01"}, {"booking_window_days": None}) == (True, None)
    assert server._class_booking_window({"date": "2030-01-01"}, None) == (True, None)


def test_the_window_opens_exactly_window_days_before_the_class():
    session = {"date": "2026-10-08"}
    service = {"booking_window_days": 2}
    assert server._class_booking_window(session, service, today=date(2026, 10, 5)) == (False, "2026-10-06")
    assert server._class_booking_window(session, service, today=date(2026, 10, 6)) == (True, "2026-10-06")
    assert server._class_booking_window(session, service, today=date(2026, 10, 8)) == (True, "2026-10-06")


def test_the_error_is_structured_in_spanish_and_says_when_it_opens():
    error = server._class_not_open_error({"date": "2099-10-08"}, {"booking_window_days": 2})
    assert error.status_code == 409
    assert error.detail["code"] == "CLASS_NOT_OPEN_YET" and error.detail["opens_on"] == "2099-10-06"
    assert error.detail["message"] == "Las reservas de esta clase abren el 06/10/2099."


class Cursor:
    def __init__(self, rows):
        self.rows = rows

    def sort(self, *args, **kwargs):
        return self

    async def to_list(self, limit):
        return self.rows


class Rows:
    def __init__(self, rows):
        self.rows = rows

    def find(self, *args, **kwargs):
        return Cursor(self.rows)


def test_the_public_list_marks_sessions_that_are_not_open_yet(monkeypatch):
    sessions = [
        {
            "class_session_id": "far",
            "service_id": "svc",
            "date": "2099-10-08",
            "time": "10:00",
            "capacity": 5,
            "booked_count": 0,
        },
        {
            "class_session_id": "near",
            "service_id": "svc",
            "date": "2000-01-01",
            "time": "09:00",
            "capacity": 5,
            "booked_count": 1,
        },
    ]
    db = SimpleNamespace(
        class_sessions=Rows(sessions),
        services=Rows([{"service_id": "svc", "organization_id": "org", "booking_window_days": 2}]),
        class_bookings=Rows([]),
    )
    monkeypatch.setattr(server, "db", db)
    result = asyncio.run(server.get_public_class_sessions("org", None, None, None))
    by_id = {row["class_session_id"]: row for row in result}
    assert by_id["far"]["open_for_booking"] is False and by_id["far"]["booking_opens_on"] == "2099-10-06"
    assert by_id["near"]["open_for_booking"] is True and by_id["near"]["spots_available"] == 4


def test_class_booking_conflicts_are_structured_and_in_spanish():
    full = server._class_conflict("CLASS_FULL", "Esta clase ya no tiene cupos disponibles.")
    assert full.status_code == 409 and full.detail["code"] == "CLASS_FULL"
    source = (Path(__file__).resolve().parents[1] / "server.py").read_text(encoding="utf-8")
    assert "You already have a spot in this class" not in source and "This class is full" not in source
    assert source.count('_class_conflict("CLASS_ALREADY_BOOKED"') + source.count('"CLASS_ALREADY_BOOKED",') >= 2
    assert source.count('_class_conflict("CLASS_FULL"') == 2
