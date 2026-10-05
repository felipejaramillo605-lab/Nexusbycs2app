"""Ley 2300 de 2023: ventana de publicidad y festivos colombianos (sin red)."""

import sys
from datetime import date, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import marketing_window as subject  # noqa: E402

BOGOTA = subject.BOGOTA


def at(year, month, day, hour=10, minute=0):
    return datetime(year, month, day, hour, minute, tzinfo=BOGOTA)


# Festivos oficiales de Colombia 2026 (Ley 51 de 1983).
HOLIDAYS_2026 = {
    date(2026, 1, 1), date(2026, 1, 12), date(2026, 3, 23), date(2026, 4, 2), date(2026, 4, 3),
    date(2026, 5, 1), date(2026, 5, 18), date(2026, 6, 8), date(2026, 6, 15), date(2026, 6, 29),
    date(2026, 7, 20), date(2026, 8, 7), date(2026, 8, 17), date(2026, 10, 12), date(2026, 11, 2),
    date(2026, 11, 16), date(2026, 12, 8), date(2026, 12, 25),
}  # fmt: skip


def test_the_computed_holidays_match_the_official_2026_calendar():
    assert set(subject.colombian_holidays(2026)) == HOLIDAYS_2026


def test_holidays_that_fall_on_monday_are_not_moved_and_easter_changes_each_year():
    assert date(2027, 3, 22) in subject.colombian_holidays(2027)  # San Jose (19-mar es viernes) -> lunes 22
    assert date(2025, 4, 17) in subject.colombian_holidays(2025)  # Jueves Santo 2025
    assert subject.is_holiday(date(2026, 6, 29))  # San Pedro cae lunes: no se traslada


def test_weekday_window_is_seven_to_seven():
    assert subject.marketing_allowed(at(2026, 10, 6, 7, 0))  # martes
    assert subject.marketing_allowed(at(2026, 10, 6, 18, 59))
    assert not subject.marketing_allowed(at(2026, 10, 6, 6, 59))
    assert not subject.marketing_allowed(at(2026, 10, 6, 19, 0))


def test_saturday_window_is_eight_to_three_and_sunday_is_closed():
    assert subject.marketing_allowed(at(2026, 10, 10, 8, 0))
    assert subject.marketing_allowed(at(2026, 10, 10, 14, 59))
    assert not subject.marketing_allowed(at(2026, 10, 10, 15, 0))
    assert not subject.marketing_allowed(at(2026, 10, 10, 7, 59))
    assert not subject.marketing_allowed(at(2026, 10, 11, 11, 0))


def test_holidays_are_closed_even_on_a_weekday():
    assert not subject.marketing_allowed(at(2026, 10, 12, 11, 0))  # lunes festivo
    assert not subject.marketing_allowed(at(2026, 12, 25, 11, 0))


def test_other_timezones_are_converted_to_colombian_time():
    from zoneinfo import ZoneInfo

    miami_late = datetime(2026, 10, 6, 20, 30, tzinfo=ZoneInfo("America/New_York"))  # 19:30 Bogota (UTC-5 vs EDT-4)
    assert not subject.marketing_allowed(miami_late)
    miami_ok = datetime(2026, 10, 6, 11, 0, tzinfo=ZoneInfo("America/New_York"))  # 10:00 Bogota
    assert subject.marketing_allowed(miami_ok)


def test_next_allowed_skips_nights_sundays_and_holidays():
    assert subject.next_allowed(at(2026, 10, 6, 20, 0)) == at(2026, 10, 7, 7, 0)  # martes noche -> miercoles
    assert subject.next_allowed(at(2026, 10, 10, 16, 0)) == at(
        2026, 10, 13, 7, 0
    )  # sabado tarde -> martes (lunes 12 festivo)
    assert subject.next_allowed(at(2026, 12, 24, 19, 30)) == at(2026, 12, 26, 8, 0)  # 25 festivo -> sabado 26
    inside = at(2026, 10, 6, 10, 0)
    assert subject.next_allowed(inside) == inside


def test_the_blocked_message_names_the_law_and_the_next_window():
    message = subject.blocked_message(at(2026, 10, 11, 11, 0))
    assert "Ley 2300" in message and "lunes 12" not in message  # el lunes 12 es festivo
    assert "martes 13/10/2026" in message and "07:00" in message


def test_campaigns_are_blocked_outside_the_window_and_consent_defaults_to_false():
    import ast

    server = Path(__file__).resolve().parents[1] / "server.py"
    source = server.read_text(encoding="utf-8")
    tree = ast.parse(source)
    campaign = next(n for n in ast.walk(tree) if isinstance(n, ast.AsyncFunctionDef) and n.name == "create_campaign")
    body = ast.get_source_segment(source, campaign) or ""
    guard = body.index("marketing_allowed()")
    assert guard < body.index("db.clients.find"), "the Ley 2300 guard must run before any recipient is read"
    end = guard + 200
    assert "status_code=409" in body[guard:end]
    client_model = next(n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == "Client")
    default = next(
        n.value.value for n in client_model.body if isinstance(n, ast.AnnAssign) and n.target.id == "accepts_marketing"
    )
    assert default is False
