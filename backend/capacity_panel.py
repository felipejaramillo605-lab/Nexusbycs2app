"""Panel semanal de capacidad y demanda.

Responde: que horas y profesionales estan llenos o vacios, cuanto se cancela y que clases tienen lista de espera, para
decidir que abrir, cerrar o promocionar. Todo se calcula al consultar a partir de citas, horarios y clases.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Dict, List, Optional

from fastapi import APIRouter, Cookie, Header, HTTPException

DEFAULT_SERVICE_MINUTES = 30
WEEKDAYS_ES = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
LOW_OCCUPANCY = 0.4
HIGH_OCCUPANCY = 0.85
HIGH_CANCELLATION = 0.2


def _minutes(value, default=None):
    try:
        hours, minutes = str(value).split(":")[:2]
        return int(hours) * 60 + int(minutes)
    except (ValueError, TypeError):
        return default


def monday_of(day: date) -> date:
    return day - timedelta(days=day.weekday())


def _ratio(booked: float, available: float) -> Optional[float]:
    return round(booked / available, 3) if available > 0 else None


def compute_week(barbers, services, appointments, sessions, waitlist_by_session, week_start: date) -> dict:
    days = [week_start + timedelta(days=i) for i in range(7)]
    duration = {s["service_id"]: int(s.get("duration") or DEFAULT_SERVICE_MINUTES) for s in services}
    by_barber: Dict[str, dict] = {}
    for barber in barbers:
        start, end = _minutes(barber.get("start_time"), 540), _minutes(barber.get("end_time"), 1080)
        by_barber[barber["barber_id"]] = {
            "barber_id": barber["barber_id"],
            "name": barber.get("display_name") or barber.get("name"),
            "available": 0.0,
            "booked": 0.0,
            "appointments": 0,
            "cancellations": 0,
            "start": start,
            "end": end,
            "weekdays": {int(d) for d in barber.get("available_days") or []},
        }
    per_day = {
        d.isoformat(): {"date": d.isoformat(), "weekday": WEEKDAYS_ES[d.weekday()], "available": 0.0, "booked": 0.0}
        for d in days
    }

    for info in by_barber.values():
        for d in days:
            if (d.weekday() + 1) % 7 in info["weekdays"] and info["end"] > info["start"]:
                hours = (info["end"] - info["start"]) / 60
                info["available"] += hours
                per_day[d.isoformat()]["available"] += hours

    for appointment in appointments:
        info = by_barber.get(appointment.get("barber_id"))
        if not info or appointment.get("date") not in per_day:
            continue
        if appointment.get("status") == "cancelled":
            info["cancellations"] += 1
            continue
        hours = duration.get(appointment.get("service_id"), DEFAULT_SERVICE_MINUTES) / 60
        info["booked"] += hours
        info["appointments"] += 1
        per_day[appointment["date"]]["booked"] += hours

    professionals = []
    for info in by_barber.values():
        total = info["appointments"] + info["cancellations"]
        professionals.append(
            {
                "barber_id": info["barber_id"],
                "name": info["name"],
                "available_hours": round(info["available"], 1),
                "booked_hours": round(info["booked"], 1),
                "free_hours": round(max(0.0, info["available"] - info["booked"]), 1),
                "occupancy": _ratio(info["booked"], info["available"]),
                "appointments": info["appointments"],
                "cancellations": info["cancellations"],
                "cancellation_rate": round(info["cancellations"] / total, 3) if total else None,
            }
        )
    professionals.sort(key=lambda p: (p["occupancy"] is None, p["occupancy"] or 0))

    day_rows = [
        {
            "date": row["date"],
            "weekday": row["weekday"],
            "available_hours": round(row["available"], 1),
            "booked_hours": round(row["booked"], 1),
            "occupancy": _ratio(row["booked"], row["available"]),
        }
        for row in per_day.values()
    ]

    class_rows, seats, booked_seats, waiting = [], 0, 0, 0
    for session in sessions:
        if session.get("status") == "cancelled" or session.get("date") not in per_day:
            continue
        capacity, booked = int(session.get("capacity") or 0), int(session.get("booked_count") or 0)
        wait = waitlist_by_session.get(session.get("class_session_id"), 0)
        seats, booked_seats, waiting = seats + capacity, booked_seats + booked, waiting + wait
        class_rows.append(
            {
                "class_session_id": session.get("class_session_id"),
                "date": session.get("date"),
                "time": session.get("time"),
                "capacity": capacity,
                "booked": booked,
                "waitlist": wait,
                "occupancy": _ratio(booked, capacity),
            }
        )
    class_rows.sort(key=lambda r: (r["date"], r["time"] or ""))

    available = sum(p["available_hours"] for p in professionals)
    booked = sum(p["booked_hours"] for p in professionals)
    cancellations = sum(p["cancellations"] for p in professionals)
    appointments_total = sum(p["appointments"] for p in professionals)
    insights = build_insights(day_rows, professionals, class_rows)
    return {
        "week_start": days[0].isoformat(),
        "week_end": days[-1].isoformat(),
        "totals": {
            "available_hours": round(available, 1),
            "booked_hours": round(booked, 1),
            "free_hours": round(max(0.0, available - booked), 1),
            "occupancy": _ratio(booked, available),
            "appointments": appointments_total,
            "cancellations": cancellations,
        },
        "professionals": professionals,
        "days": day_rows,
        "classes": {
            "sessions": len(class_rows),
            "seats": seats,
            "booked": booked_seats,
            "occupancy": _ratio(booked_seats, seats),
            "waitlist": waiting,
            "items": class_rows,
        },
        "insights": insights,
    }


def pct(value: float) -> str:
    return f"{round(value * 100)}%"


def build_insights(day_rows, professionals, class_rows) -> List[str]:
    tips = []
    open_days = [d for d in day_rows if d["occupancy"] is not None]
    if open_days:
        quiet = min(open_days, key=lambda d: d["occupancy"])
        busy = max(open_days, key=lambda d: d["occupancy"])
        if quiet["occupancy"] < LOW_OCCUPANCY:
            tips.append(
                f"El {quiet['weekday']} {quiet['date']} tiene solo {pct(quiet['occupancy'])} de ocupación "
                f"({quiet['available_hours'] - quiet['booked_hours']:g} h libres): buen día para promocionar."
            )
        if busy["occupancy"] >= HIGH_OCCUPANCY and busy is not quiet:
            tips.append(
                f"El {busy['weekday']} {busy['date']} está al {pct(busy['occupancy'])}: "
                f"considera abrir más horas o profesionales."
            )
    for pro in professionals:
        if pro["occupancy"] is not None and pro["occupancy"] < LOW_OCCUPANCY and pro["available_hours"] >= 8:
            tips.append(
                f"{pro['name']} tiene {pro['free_hours']:g} h libres esta semana "
                f"({pct(pro['occupancy'])} de ocupación)."
            )
        if (
            pro["cancellation_rate"] is not None
            and pro["cancellation_rate"] >= HIGH_CANCELLATION
            and pro["cancellations"] >= 2
        ):
            tips.append(
                f"{pro['name']} tiene {pct(pro['cancellation_rate'])} de citas canceladas: "
                f"revisa recordatorios y política de cancelación."
            )
    for row in class_rows:
        if row["waitlist"] > 0:
            tips.append(
                f"La clase del {row['date']} {row['time']} tiene {row['waitlist']} en lista de espera: "
                f"considera abrir otra sesión."
            )
    return tips[:8]


def build_capacity_router(db, get_current_user, require_management_role, resolve_team_organization):
    router = APIRouter()

    @router.get("/capacity/weekly", tags=["capacity"])
    async def weekly_capacity(
        organization_id: Optional[str] = None,
        week_start: Optional[str] = None,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        user = await get_current_user(authorization, session_token)
        require_management_role(user)
        org_id = await resolve_team_organization(user, organization_id)
        try:
            anchor = date.fromisoformat(week_start) if week_start else datetime.now(timezone.utc).date()
        except ValueError:
            raise HTTPException(status_code=400, detail="week_start debe tener formato AAAA-MM-DD")
        start = monday_of(anchor)
        end = start + timedelta(days=6)
        date_range = {"$gte": start.isoformat(), "$lte": end.isoformat()}
        barbers = await db.barbers.find({"organization_id": org_id, "active": {"$ne": False}}, {"_id": 0}).to_list(500)
        services = await db.services.find(
            {"organization_id": org_id}, {"_id": 0, "service_id": 1, "duration": 1}
        ).to_list(1000)
        appointments = await db.appointments.find({"organization_id": org_id, "date": date_range}, {"_id": 0}).to_list(
            20000
        )
        sessions = await db.class_sessions.find({"organization_id": org_id, "date": date_range}, {"_id": 0}).to_list(
            2000
        )
        waiting = await db.class_waitlist.find(
            {"organization_id": org_id, "status": "waiting"}, {"_id": 0, "class_session_id": 1}
        ).to_list(5000)
        waitlist_by_session: Dict[str, int] = {}
        for entry in waiting:
            waitlist_by_session[entry.get("class_session_id")] = (
                waitlist_by_session.get(entry.get("class_session_id"), 0) + 1
            )
        return compute_week(barbers, services, appointments, sessions, waitlist_by_session, start)

    return router
