"""Ley 2300 de 2023 ("Dejen de fregar"): ventana horaria para mensajes publicitarios.

Publicidad por SMS, mensajería (WhatsApp), correo o llamada solo puede enviarse de lunes a viernes de
7:00 a 19:00 y los sabados de 8:00 a 15:00 (hora de Colombia); nunca domingos ni festivos. Los mensajes
transaccionales (confirmaciones y recordatorios de una cita real) no son publicidad y no pasan por aqui.

Los festivos se calculan con la Ley 51 de 1983 (Emiliani): fijos, trasladados al lunes siguiente y los
dependientes de la Pascua. Esto es apoyo tecnico, no asesoria legal: la ventana es configurable aqui.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from functools import lru_cache
from zoneinfo import ZoneInfo

BOGOTA = ZoneInfo("America/Bogota")
WEEKDAY_WINDOW = (7, 19)  # lunes a viernes
SATURDAY_WINDOW = (8, 15)

DAY_NAMES = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]


def _easter(year: int) -> date:
    """Domingo de Pascua (algoritmo gregoriano anonimo)."""
    a, b, c = year % 19, year // 100, year % 100
    d, e = b // 4, b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = c // 4, c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7  # noqa: E741
    m = (a + 11 * h + 22 * l) // 451
    month = (h + l - 7 * m + 114) // 31
    day = ((h + l - 7 * m + 114) % 31) + 1
    return date(year, month, day)


def _next_monday(day: date) -> date:
    """Lunes igual o siguiente (regla Emiliani: si ya es lunes no se traslada)."""
    return day + timedelta(days=(7 - day.weekday()) % 7)


@lru_cache(maxsize=32)
def colombian_holidays(year: int) -> frozenset[date]:
    easter = _easter(year)
    fixed = {
        date(year, 1, 1),
        date(year, 5, 1),
        date(year, 7, 20),
        date(year, 8, 7),
        date(year, 12, 8),
        date(year, 12, 25),
    }
    moved = {
        _next_monday(date(year, 1, 6)),  # Reyes Magos
        _next_monday(date(year, 3, 19)),  # San Jose
        _next_monday(date(year, 6, 29)),  # San Pedro y San Pablo
        _next_monday(date(year, 8, 15)),  # Asuncion
        _next_monday(date(year, 10, 12)),  # Dia de la Raza
        _next_monday(date(year, 11, 1)),  # Todos los Santos
        _next_monday(date(year, 11, 11)),  # Independencia de Cartagena
        _next_monday(easter + timedelta(days=39)),  # Ascension
        _next_monday(easter + timedelta(days=60)),  # Corpus Christi
        _next_monday(easter + timedelta(days=68)),  # Sagrado Corazon
    }
    holy_week = {easter - timedelta(days=3), easter - timedelta(days=2)}  # Jueves y Viernes Santo
    return frozenset(fixed | moved | holy_week)


def is_holiday(day: date) -> bool:
    return day in colombian_holidays(day.year)


def _window_for(day: date):
    if is_holiday(day) or day.weekday() == 6:
        return None
    return SATURDAY_WINDOW if day.weekday() == 5 else WEEKDAY_WINDOW


def marketing_allowed(moment: datetime | None = None) -> bool:
    moment = (moment or datetime.now(BOGOTA)).astimezone(BOGOTA)
    window = _window_for(moment.date())
    if window is None:
        return False
    start, end = window
    return start <= moment.hour + moment.minute / 60 < end


def next_allowed(moment: datetime | None = None) -> datetime:
    """Primer instante (hora de Bogota) en que se permite la publicidad, desde `moment`."""
    moment = (moment or datetime.now(BOGOTA)).astimezone(BOGOTA)
    if marketing_allowed(moment):
        return moment
    for offset in range(0, 15):
        day = moment.date() + timedelta(days=offset)
        window = _window_for(day)
        if window is None:
            continue
        start = datetime(day.year, day.month, day.day, window[0], 0, tzinfo=BOGOTA)
        if start > moment:
            return start
    raise RuntimeError("No marketing window found in the next 15 days")


def blocked_message(moment: datetime | None = None) -> str:
    moment = (moment or datetime.now(BOGOTA)).astimezone(BOGOTA)
    nxt = next_allowed(moment)
    return (
        "Por la Ley 2300 de 2023 los mensajes publicitarios solo pueden enviarse de lunes a viernes de 7:00 a. m. a "
        "7:00 p. m. y los sábados de 8:00 a. m. a 3:00 p. m. (hora de Colombia), nunca domingos ni festivos. "
        f"Podrás enviarlo el {DAY_NAMES[nxt.weekday()]} {nxt.strftime('%d/%m/%Y')} desde las {nxt.strftime('%H:%M')}."
    )
