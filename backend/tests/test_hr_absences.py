"""Ausentismos y vacaciones (base simulada)."""

import sys
from datetime import date, timedelta
from pathlib import Path
from types import SimpleNamespace

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import hr_absences as subject  # noqa: E402


class Cursor:
    def __init__(self, rows):
        self.rows = rows

    async def to_list(self, limit):
        return [dict(r) for r in self.rows[:limit]]


class Coll:
    def __init__(self, docs=()):
        self.docs = [dict(d) for d in docs]

    def _select(self, query):
        return [d for d in self.docs if all(d.get(k) == v for k, v in query.items())]

    def find(self, query, projection=None):
        return Cursor(self._select(query))

    async def find_one(self, query, projection=None):
        found = self._select(query)
        return dict(found[0]) if found else None

    async def insert_one(self, doc):
        self.docs.append(dict(doc))

    async def update_one(self, query, update):
        for doc in self._select(query):
            doc.update(update.get("$set", {}))
            return


TODAY = date.today()
USERS = {
    "boss": SimpleNamespace(user_id="u_boss", role="manager", organization_id="org_a"),
    "ana": SimpleNamespace(user_id="u_ana", role="staff", organization_id="org_a"),
    "luis": SimpleNamespace(user_id="u_luis", role="staff", organization_id="org_a"),
}


def next_weekday(start: date, weekday: int = 0) -> date:
    """Primer lunes desde `start` cuya semana laboral (lunes a viernes) no tiene festivos."""
    cursor = start
    while cursor.weekday() != weekday or subject.count_days(cursor, cursor + timedelta(days=4), "vacation") != 5:
        cursor += timedelta(days=1)
    return cursor


def build(hire=None):
    db = SimpleNamespace(
        barbers=Coll(
            [
                {"organization_id": "org_a", "barber_id": "b1", "name": "Ana", "user_id": "u_ana"},
                {"organization_id": "org_a", "barber_id": "b2", "name": "Luis", "user_id": "u_luis"},
            ]
        ),
        payroll_contracts=Coll(
            [
                {
                    "organization_id": "org_a",
                    "barber_id": "b1",
                    "start_date": (hire or TODAY - timedelta(days=360)).isoformat(),
                    "birth_date": (TODAY + timedelta(days=5)).replace(year=1995).isoformat(),
                },
            ]
        ),
        hr_requests=Coll(),
        hr_documents=Coll(),
    )

    async def get_current_user(authorization=None, session_token=None):
        user = USERS.get(authorization)
        if not user:
            raise HTTPException(status_code=401, detail="Not authenticated")
        return user

    def require_management_role(user):
        if user.role not in ("manager", "admin", "owner"):
            raise HTTPException(status_code=403, detail="Management only")

    async def resolve_team_organization(user, requested):
        return user.organization_id

    app = FastAPI()
    app.include_router(
        subject.build_hr_router(db, get_current_user, require_management_role, resolve_team_organization), prefix="/api"
    )
    return db, TestClient(app)


def H(who):
    return {"Authorization": who}


# ---------------------------------------------------------------- logica pura


def test_colombian_holidays_2026_match_the_official_calendar():
    expected = {
        "2026-01-01",
        "2026-01-12",
        "2026-03-23",
        "2026-04-02",
        "2026-04-03",
        "2026-05-01",
        "2026-05-18",
        "2026-06-08",
        "2026-06-15",
        "2026-06-29",
        "2026-07-20",
        "2026-08-07",
        "2026-08-17",
        "2026-10-12",
        "2026-11-02",
        "2026-11-16",
        "2026-12-08",
        "2026-12-25",
    }
    assert {d.isoformat() for d in subject.colombian_holidays(2026)} == expected


def test_business_days_skip_weekends_and_holidays_and_calendar_kinds_count_every_day():
    # semana del 6 al 12 de octubre de 2026: el lunes 12 es festivo
    assert (
        subject.count_days(date(2026, 10, 6), date(2026, 10, 12), "vacation") == 4
    )  # mar a vie + (lun festivo no cuenta)
    assert subject.count_days(date(2026, 10, 6), date(2026, 10, 12), "sick_leave") == 7
    assert subject.count_days(date(2026, 10, 12), date(2026, 10, 10), "vacation") == 0


def test_vacation_calculator_returns_last_day_and_return_date():
    result = subject.end_for_business_days(date(2026, 10, 1), 5)
    assert result["end_date"] == "2026-10-07" and result["return_date"] == "2026-10-08"
    over_holiday = subject.end_for_business_days(date(2026, 10, 9), 2)  # viernes 9 y martes 13 (lunes 12 festivo)
    assert over_holiday["end_date"] == "2026-10-13" and over_holiday["return_date"] == "2026-10-14"


def test_vacation_balance_accrues_fifteen_days_per_360_and_discounts_taken_days():
    balance = subject.vacation_balance(date(2026, 1, 1), 3, date(2026, 6, 30))  # 181 dias
    assert balance["accrued"] == round(15 * 181 / 360, 2) and balance["available"] == round(balance["accrued"] - 3, 2)
    assert subject.vacation_balance(None, 0, TODAY)["available"] is None


# ---------------------------------------------------------------- empleado


def test_employee_summary_requests_and_cancellation_with_overlap_protection():
    _, client = build()
    summary = client.get("/api/staff/hr/summary", headers=H("ana")).json()
    assert summary["vacation"]["accrued"] > 14 and "UGPP" in summary["disclaimer"]
    monday = next_weekday(TODAY + timedelta(days=30))
    body = {"kind": "vacation", "start_date": monday.isoformat(), "end_date": (monday + timedelta(days=4)).isoformat()}
    created = client.post("/api/staff/hr/requests", json=body, headers=H("ana"))
    assert (
        created.status_code == 200
        and created.json()["status"] == "pending"
        and created.json()["kind_label"] == "Vacaciones"
    )
    assert client.post("/api/staff/hr/requests", json=body, headers=H("ana")).status_code == 409
    rid = created.json()["request_id"]
    assert client.delete(f"/api/staff/hr/requests/{rid}", headers=H("luis")).status_code == 404  # no es suya
    assert client.delete(f"/api/staff/hr/requests/{rid}", headers=H("ana")).json() == {"cancelled": True}
    assert client.delete(f"/api/staff/hr/requests/{rid}", headers=H("ana")).status_code == 409
    assert client.post("/api/staff/hr/requests", json=body, headers=H("ana")).status_code == 200  # ya libre


def test_validation_of_dates_and_sick_leave_needs_a_photo_of_the_incapacity():
    _, client = build()
    day = TODAY.isoformat()
    assert (
        client.post(
            "/api/staff/hr/requests",
            json={"kind": "permission", "start_date": "ayer", "end_date": day},
            headers=H("ana"),
        ).status_code
        == 400
    )
    assert (
        client.post(
            "/api/staff/hr/requests",
            json={"kind": "permission", "start_date": day, "end_date": (TODAY - timedelta(days=1)).isoformat()},
            headers=H("ana"),
        ).status_code
        == 400
    )
    sick = {"kind": "sick_leave", "start_date": day, "end_date": day}
    assert client.post("/api/staff/hr/requests", json=sick, headers=H("ana")).status_code == 400
    upload = client.post(
        "/api/staff/hr/documents", files={"file": ("inc.jpg", b"\xff\xd8\xff fake", "image/jpeg")}, headers=H("ana")
    )
    assert upload.status_code == 200
    ok = client.post(
        "/api/staff/hr/requests", json={**sick, "document_id": upload.json()["document_id"]}, headers=H("ana")
    )
    assert ok.status_code == 200 and ok.json()["days"] == 1 and ok.json()["paid"] is True
    assert (
        client.post(
            "/api/staff/hr/documents", files={"file": ("x.exe", b"MZ", "application/x-msdownload")}, headers=H("ana")
        ).status_code
        == 400
    )
    assert (
        client.post(
            "/api/staff/hr/documents",
            files={"file": ("big.jpg", b"0" * (6 * 1024 * 1024), "image/jpeg")},
            headers=H("ana"),
        ).status_code
        == 413
    )
    assert (
        client.post(
            "/api/staff/hr/requests",
            json={
                **sick,
                "start_date": (TODAY + timedelta(days=9)).isoformat(),
                "end_date": (TODAY + timedelta(days=9)).isoformat(),
                "document_id": upload.json()["document_id"],
            },
            headers=H("luis"),
        ).status_code
        == 404
    )


def test_vacation_calc_endpoint_and_non_vacation_permissions_can_be_unpaid():
    _, client = build()
    calc = client.get(
        "/api/staff/hr/vacation-calc", params={"start_date": "2026-10-01", "days": 5}, headers=H("ana")
    ).json()
    assert calc["return_date"] == "2026-10-08"
    assert (
        client.get(
            "/api/staff/hr/vacation-calc", params={"start_date": "2026-10-01", "days": 0}, headers=H("ana")
        ).status_code
        == 400
    )
    monday = next_weekday(TODAY + timedelta(days=40))
    permission = client.post(
        "/api/staff/hr/requests",
        json={"kind": "permission", "start_date": monday.isoformat(), "end_date": monday.isoformat(), "paid": False},
        headers=H("ana"),
    ).json()
    assert permission["paid"] is False
    vacation = client.post(
        "/api/staff/hr/requests",
        json={
            "kind": "vacation",
            "start_date": (monday + timedelta(days=7)).isoformat(),
            "end_date": (monday + timedelta(days=7)).isoformat(),
            "paid": False,
        },
        headers=H("ana"),
    ).json()
    assert vacation["paid"] is True  # las vacaciones siempre son remuneradas


# ---------------------------------------------------------------- manager


def test_manager_decides_requests_and_over_balance_vacations_need_confirmation():
    _, client = build(hire=TODAY - timedelta(days=30))  # solo ~1,25 dias causados
    monday = next_weekday(TODAY + timedelta(days=20))
    request = client.post(
        "/api/staff/hr/requests",
        json={
            "kind": "vacation",
            "start_date": monday.isoformat(),
            "end_date": (monday + timedelta(days=4)).isoformat(),
        },
        headers=H("ana"),
    ).json()
    rid = request["request_id"]
    assert client.get("/api/hr/requests", headers=H("ana")).status_code == 403
    assert (
        client.get("/api/hr/requests", params={"status": "pending"}, headers=H("boss")).json()["items"][0]["request_id"]
        == rid
    )
    refused = client.post(f"/api/hr/requests/{rid}/decide", json={"approve": True}, headers=H("boss"))
    assert refused.status_code == 409 and refused.json()["detail"]["code"] == "VACATION_OVER_BALANCE"
    approved = client.post(
        f"/api/hr/requests/{rid}/decide",
        json={"approve": True, "allow_over_balance": True, "note": "Aprobada"},
        headers=H("boss"),
    )
    assert approved.json()["status"] == "approved" and approved.json()["decision_note"] == "Aprobada"
    assert client.post(f"/api/hr/requests/{rid}/decide", json={"approve": False}, headers=H("boss")).status_code == 409
    assert client.get("/api/staff/hr/summary", headers=H("ana")).json()["vacation"]["taken"] == 5


def test_calendar_shows_overlaps_holidays_and_who_is_out_today_and_documents_are_manager_only():
    db, client = build()
    upload = client.post(
        "/api/staff/hr/documents", files={"file": ("inc.jpg", b"\xff\xd8\xff fake", "image/jpeg")}, headers=H("ana")
    ).json()
    sick = client.post(
        "/api/staff/hr/requests",
        json={
            "kind": "sick_leave",
            "start_date": TODAY.isoformat(),
            "end_date": (TODAY + timedelta(days=2)).isoformat(),
            "document_id": upload["document_id"],
        },
        headers=H("ana"),
    ).json()
    client.post(f"/api/hr/requests/{sick['request_id']}/decide", json={"approve": True}, headers=H("boss"))
    monday = next_weekday(TODAY + timedelta(days=15))
    client.post(
        "/api/staff/hr/requests",
        json={"kind": "permission", "start_date": TODAY.isoformat(), "end_date": TODAY.isoformat()},
        headers=H("luis"),
    )
    cal = client.get(
        "/api/hr/calendar",
        params={"start": TODAY.isoformat(), "end": (TODAY + timedelta(days=10)).isoformat()},
        headers=H("boss"),
    ).json()
    assert cal["out_today"] == ["Ana"] and cal["overlap_by_day"][TODAY.isoformat()] == 1
    assert len(cal["items"]) == 2  # incapacidad aprobada + permiso pendiente
    assert (
        client.get(
            "/api/hr/calendar", params={"start": "2026-01-01", "end": "2027-12-31"}, headers=H("boss")
        ).status_code
        == 400
    )
    fetched = client.get(f"/api/hr/documents/{upload['document_id']}", headers=H("boss"))
    assert (
        fetched.status_code == 200
        and fetched.headers["content-type"] == "image/jpeg"
        and "no-store" in fetched.headers["cache-control"]
    )
    assert client.get(f"/api/hr/documents/{upload['document_id']}", headers=H("ana")).status_code == 403
    assert monday  # silencia el linter


def test_overview_lists_pending_out_today_birthdays_and_anniversaries():
    _, client = build(hire=date(TODAY.year - 3, TODAY.month, TODAY.day) + timedelta(days=0))
    client.post(
        "/api/staff/hr/requests",
        json={"kind": "permission", "start_date": TODAY.isoformat(), "end_date": TODAY.isoformat()},
        headers=H("ana"),
    )
    data = client.get("/api/hr/overview", headers=H("boss")).json()
    assert data["pending_count"] == 1 and "UGPP" in data["disclaimer"]
    assert data["birthdays"][0]["name"] == "Ana" and data["birthdays"][0]["days_until"] == 5
    assert data["anniversaries"][0] == {"name": "Ana", "days_until": 0, "years": 3}


def test_unpaid_permission_days_are_counted_for_payroll():
    rows = [
        {"barber_id": "b1", "status": "approved", "paid": False, "start_date": "2026-10-05", "end_date": "2026-10-09"},
        {"barber_id": "b1", "status": "approved", "paid": True, "start_date": "2026-10-13", "end_date": "2026-10-14"},
        {"barber_id": "b1", "status": "pending", "paid": False, "start_date": "2026-10-15", "end_date": "2026-10-16"},
        {"barber_id": "b2", "status": "approved", "paid": False, "start_date": "2026-10-05", "end_date": "2026-10-05"},
    ]
    assert subject.unpaid_days_in_period(rows, "b1", date(2026, 10, 1), date(2026, 10, 31)) == 5
    assert subject.unpaid_days_in_period(rows, "b1", date(2026, 10, 7), date(2026, 10, 31)) == 3
