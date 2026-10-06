"""Novedades de nomina: horas extra con topes legales, bonos y su paso a la nomina (base simulada)."""

import sys
from datetime import date
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import payroll as payroll_module  # noqa: E402
import payroll_co  # noqa: E402
import payroll_novelties as subject  # noqa: E402

SMMLV = payroll_co.params_for(2026)["smmlv"]


def matches(doc, key, condition):
    value = doc.get(key)
    if isinstance(condition, dict):
        if "$ne" in condition:
            return value != condition["$ne"]
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

    def _select(self, query):
        return [d for d in self.docs if all(matches(d, k, v) for k, v in query.items())]

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


USERS = {
    "boss": SimpleNamespace(user_id="u_boss", role="manager", organization_id="org_a"),
    "ana": SimpleNamespace(user_id="u_ana", role="staff", organization_id="org_a"),
}


def build():
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
                    "contract_type": "fixed_salary",
                    "base_salary": SMMLV,
                    "pay_frequency": "monthly",
                },
                {"organization_id": "org_a", "barber_id": "b2", "contract_type": "service_commission"},
            ]
        ),
        payroll_novelties=Coll(),
        payroll_settings=Coll(),
        payroll_extras=Coll(),
        payroll_runs=Coll(),
        staff_settlements=Coll(),
        hr_requests=Coll(),
        organizations=Coll([{"organization_id": "org_a", "name": "Barbería Norte"}]),
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
    for router in (subject.build_novelties_router, payroll_module.build_payroll_router):
        app.include_router(
            router(db, get_current_user, require_management_role, resolve_team_organization), prefix="/api"
        )
    return db, TestClient(app)


def H(who="boss"):
    return {"Authorization": who}


def overtime(client, kind="overtime_day", day="2026-10-07", hours=1, barber="b1", who="boss"):
    return client.post(
        "/api/payroll/novelties/overtime",
        json={"barber_id": barber, "kind": kind, "date": day, "hours": hours},
        headers=H(who),
    )


# ---------------------------------------------------------------- reglas puras


def test_legal_schedule_changes_over_time():
    assert subject.sunday_surcharge(date(2025, 6, 30)) == 0.75
    assert subject.sunday_surcharge(date(2025, 7, 1)) == 0.8
    assert subject.sunday_surcharge(date(2026, 10, 1)) == 0.9
    assert subject.sunday_surcharge(date(2027, 7, 1)) == 1.0
    assert subject.weekly_hours_limit(date(2025, 7, 14)) == 46
    assert subject.weekly_hours_limit(date(2025, 7, 15)) == 44
    assert subject.weekly_hours_limit(date(2026, 7, 15)) == 42
    assert subject.monthly_hours(date(2026, 10, 1)) == 210
    assert subject.monthly_hours(date(2025, 8, 1)) == 220


def test_multipliers_follow_the_colombian_formulas():
    day, sunday = date(2026, 10, 7), date(2026, 10, 11)
    assert subject.multiplier("overtime_day", day) == 1.25 and subject.multiplier("overtime_night", day) == 1.75
    assert subject.multiplier("night_surcharge", day) == 0.35
    assert subject.multiplier("sunday_surcharge", sunday) == 0.9
    assert subject.multiplier("sunday_night_surcharge", sunday) == pytest.approx(1.25)
    assert subject.multiplier("sunday_overtime_day", sunday) == pytest.approx(2.15)
    assert subject.multiplier("sunday_overtime_night", sunday) == pytest.approx(2.65)
    assert subject.overtime_amount(SMMLV, "overtime_day", 2, day) == pytest.approx(SMMLV / 210 * 1.25 * 2, abs=0.01)


# ---------------------------------------------------------------- API


def test_overtime_requires_a_fixed_contract_and_respects_daily_and_weekly_limits():
    _, client = build()
    assert overtime(client, barber="b2").status_code == 400  # contrato por servicio
    assert overtime(client, barber="nadie").status_code == 400 or overtime(client, barber="nadie").status_code == 404
    first = overtime(client, hours=2)
    assert first.status_code == 200 and first.json()["status"] == "pending" and first.json()["multiplier"] == 1.25
    assert first.json()["amount"] == pytest.approx(SMMLV / 210 * 1.25 * 2, abs=0.01)
    over_day = overtime(client, hours=0.5)
    assert over_day.status_code == 409 and "por día" in over_day.json()["detail"]
    for day in ("2026-10-05", "2026-10-06", "2026-10-08", "2026-10-09"):  # completa 2 h por dia = 10 h en la semana
        assert overtime(client, day=day, hours=2).status_code == 200
    assert overtime(client, day="2026-10-10", hours=2).status_code == 200  # 12 h: justo en el tope
    over_week = overtime(client, day="2026-10-11", hours=1)
    assert over_week.status_code == 409 and "por semana" in over_week.json()["detail"]
    assert (
        overtime(client, kind="night_surcharge", day="2026-10-07", hours=8).status_code == 200
    )  # el recargo no cuenta como extra


def test_sunday_overtime_uses_the_surcharge_of_that_date():
    _, client = build()
    row = overtime(client, kind="sunday_overtime_day", day="2026-10-11", hours=1).json()
    assert row["multiplier"] == pytest.approx(2.15)
    reference = client.get("/api/payroll/novelties/reference", params={"day": "2027-07-05"}, headers=H("ana")).json()
    assert reference["sunday_surcharge"] == 1.0 and reference["weekly_hours_limit"] == 42
    assert reference["kinds"]["overtime_day"]["multiplier"] == 1.25


def test_staff_can_request_overtime_and_see_it_but_only_managers_decide():
    _, client = build()
    mine = client.post(
        "/api/staff/hr/overtime", json={"kind": "overtime_night", "date": "2026-10-07", "hours": 1}, headers=H("ana")
    )
    assert mine.status_code == 200 and mine.json()["barber_id"] == "b1" and mine.json()["status"] == "pending"
    assert (
        client.get("/api/staff/hr/novelties", headers=H("ana")).json()["items"][0]["kind_label"]
        == "Hora extra nocturna"
    )
    nid = mine.json()["novelty_id"]
    assert (
        client.post(f"/api/payroll/novelties/{nid}/decide", json={"approve": True}, headers=H("ana")).status_code == 403
    )
    assert (
        client.post(f"/api/payroll/novelties/{nid}/decide", json={"approve": True, "note": "ok"}, headers=H()).json()[
            "status"
        ]
        == "approved"
    )
    assert client.post(f"/api/payroll/novelties/{nid}/decide", json={"approve": False}, headers=H()).status_code == 409
    assert client.post("/api/payroll/novelties/otra/decide", json={"approve": True}, headers=H()).status_code == 404


def test_approved_novelties_flow_into_the_payroll_run_once_and_cancelling_frees_them():
    db, client = build()
    ot = overtime(client, hours=2).json()
    bonus = client.post(
        "/api/payroll/novelties/bonus",
        json={"barber_id": "b1", "concept": "Bono de metas", "amount": 100000, "date": "2026-10-20"},
        headers=H(),
    ).json()
    pending = overtime(client, day="2026-10-08", hours=1).json()
    assert (
        client.post(
            "/api/payroll/novelties/bonus", json={"barber_id": "b2", "concept": "Bono x", "amount": 5}, headers=H()
        ).status_code
        == 400
    )
    for item in (ot, bonus):
        client.post(f"/api/payroll/novelties/{item['novelty_id']}/decide", json={"approve": True}, headers=H())
    run = client.post("/api/payroll/runs", json={"year": 2026, "month": 10}, headers=H()).json()
    labels = [e["label"] for e in run["lines"][0]["computed"]["earnings"]]
    assert (
        any(label.startswith("Hora extra diurna (2 h, 2026-10-07)") for label in labels) and "Bono de metas" in labels
    )
    assert all("2026-10-08" not in label for label in labels)  # la pendiente no entra
    applied = {n["novelty_id"]: n["applied_run_id"] for n in db.payroll_novelties.docs}
    assert (
        applied[ot["novelty_id"]] == run["run_id"]
        and applied[bonus["novelty_id"]] == run["run_id"]
        and applied[pending["novelty_id"]] is None
    )
    base_gross = payroll_co.compute_line(
        base_salary=SMMLV, frequency="monthly", risk_class="I", params=payroll_co.params_for(2026)
    )["gross"]
    assert run["lines"][0]["computed"]["gross"] == pytest.approx(base_gross + ot["amount"] + 100000, abs=0.02)
    assert (
        run["lines"][0]["computed"]["ibc"] > SMMLV
    )  # las horas extra constituyen salario; el bono, no (salvo exceso del 40 %)
    client.post(f"/api/payroll/runs/{run['run_id']}/cancel", headers=H())
    assert all(n["applied_run_id"] is None for n in db.payroll_novelties.docs)
    again = client.post("/api/payroll/runs", json={"year": 2026, "month": 10}, headers=H()).json()
    assert any(
        label.startswith("Hora extra diurna")
        for label in [e["label"] for e in again["lines"][0]["computed"]["earnings"]]
    )
