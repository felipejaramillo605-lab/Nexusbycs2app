"""Panel semanal de capacidad y demanda (base simulada)."""

import sys
from datetime import date
from pathlib import Path
from types import SimpleNamespace

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import capacity_panel as subject  # noqa: E402

MONDAY = date(2026, 10, 5)  # lunes


def matches(doc, key, condition):
    value = doc.get(key)
    if isinstance(condition, dict):
        if "$gte" in condition and not (value is not None and value >= condition["$gte"]):
            return False
        if "$lte" in condition and not (value is not None and value <= condition["$lte"]):
            return False
        if "$ne" in condition and value == condition["$ne"]:
            return False
        return True
    return value == condition


class Cursor:
    def __init__(self, rows):
        self.rows = rows

    async def to_list(self, limit):
        return [dict(r) for r in self.rows[:limit]]


class Coll:
    def __init__(self, docs=()):
        self.docs = [dict(d) for d in docs]

    def find(self, query, projection=None):
        return Cursor([d for d in self.docs if all(matches(d, k, v) for k, v in query.items())])


def appt(day, barber="b1", service="s1", status="confirmed", org="org_a"):
    return {
        "organization_id": org,
        "barber_id": barber,
        "service_id": service,
        "date": day,
        "time": "10:00",
        "status": status,
    }


def build(appointments=(), sessions=(), waitlist=()):
    db = SimpleNamespace(
        barbers=Coll(
            [
                {
                    "organization_id": "org_a",
                    "barber_id": "b1",
                    "name": "Fausto",
                    "available_days": [1, 2, 3, 4, 5],
                    "start_time": "09:00",
                    "end_time": "17:00",
                },
                {
                    "organization_id": "org_a",
                    "barber_id": "b2",
                    "name": "Inactivo",
                    "active": False,
                    "available_days": [1],
                    "start_time": "09:00",
                    "end_time": "17:00",
                },
            ]
        ),
        services=Coll([{"organization_id": "org_a", "service_id": "s1", "duration": 60}]),
        appointments=Coll(appointments),
        class_sessions=Coll(sessions),
        class_waitlist=Coll(waitlist),
    )

    async def get_current_user(authorization=None, session_token=None):
        role = "staff" if authorization == "staff" else "manager"
        return SimpleNamespace(user_id="u1", role=role, organization_id="org_a")

    def require_management_role(user):
        if user.role not in ("manager", "owner", "admin"):
            raise HTTPException(status_code=403, detail="Management only")

    async def resolve_team_organization(user, requested):
        return user.organization_id

    app = FastAPI()
    app.include_router(
        subject.build_capacity_router(db, get_current_user, require_management_role, resolve_team_organization),
        prefix="/api",
    )
    return TestClient(app)


def test_week_starts_on_monday_and_counts_available_hours_per_working_day():
    body = build().get("/api/capacity/weekly", params={"week_start": "2026-10-08"}).json()
    assert body["week_start"] == "2026-10-05" and body["week_end"] == "2026-10-11"
    assert body["totals"]["available_hours"] == 40  # 5 dias x 8 h; el profesional inactivo no cuenta
    assert [d["available_hours"] for d in body["days"]] == [8, 8, 8, 8, 8, 0, 0]
    assert body["days"][0]["weekday"] == "lunes"


def test_booked_hours_use_the_service_duration_and_cancellations_are_counted_apart():
    rows = [appt("2026-10-05"), appt("2026-10-05"), appt("2026-10-06", status="cancelled"), appt("2026-10-20")]
    body = build(appointments=rows).get("/api/capacity/weekly", params={"week_start": "2026-10-05"}).json()
    pro = body["professionals"][0]
    assert pro["booked_hours"] == 2 and pro["appointments"] == 2 and pro["cancellations"] == 1
    assert pro["cancellation_rate"] == 0.333 and pro["occupancy"] == 0.05
    assert body["days"][0]["occupancy"] == 0.25
    assert body["totals"]["free_hours"] == 38


def test_insights_flag_quiet_days_busy_days_and_waitlists():
    full_monday = [appt("2026-10-05") for _ in range(7)]  # 7 h de 8 = 87 %
    sessions = [
        {
            "organization_id": "org_a",
            "class_session_id": "c1",
            "date": "2026-10-07",
            "time": "18:00",
            "capacity": 10,
            "booked_count": 10,
            "status": "scheduled",
        }
    ]
    waitlist = [
        {"organization_id": "org_a", "class_session_id": "c1", "status": "waiting"},
        {"organization_id": "org_a", "class_session_id": "c1", "status": "waiting"},
    ]
    body = (
        build(appointments=full_monday, sessions=sessions, waitlist=waitlist)
        .get("/api/capacity/weekly", params={"week_start": "2026-10-05"})
        .json()
    )
    text = " ".join(body["insights"])
    assert "lunes 2026-10-05 está al 88%" in text
    assert "buen día para promocionar" in text
    assert "2 en lista de espera" in text
    assert body["classes"] == {
        "sessions": 1,
        "seats": 10,
        "booked": 10,
        "occupancy": 1.0,
        "waitlist": 2,
        "items": body["classes"]["items"],
    }


def test_other_organizations_and_cancelled_sessions_are_left_out_and_staff_is_refused():
    other = [appt("2026-10-05", org="org_b")]
    sessions = [
        {
            "organization_id": "org_a",
            "class_session_id": "c9",
            "date": "2026-10-07",
            "time": "18:00",
            "capacity": 5,
            "booked_count": 5,
            "status": "cancelled",
        }
    ]
    api = build(appointments=other, sessions=sessions)
    body = api.get("/api/capacity/weekly", params={"week_start": "2026-10-05"}).json()
    assert body["totals"]["booked_hours"] == 0 and body["classes"]["sessions"] == 0
    assert api.get("/api/capacity/weekly", headers={"Authorization": "staff"}).status_code == 403
    assert api.get("/api/capacity/weekly", params={"week_start": "hoy"}).status_code == 400
