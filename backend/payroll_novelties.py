"""Novedades de nomina: horas extra y recargos (con topes legales) y bonos o compensacion variable, con aprobacion.

Las novedades aprobadas se incorporan solas como devengos en la siguiente nomina del periodo. Los factores
corresponden a la normativa laboral colombiana vigente (jornada reducida y recargo dominical gradual de la Ley
2101/2021 y la Ley 2466/2025); verifica los valores con tu contador. Herramienta de apoyo: no es soporte de nomina
electronica ni de UGPP.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Cookie, Header, HTTPException
from pydantic import BaseModel, Field

MAX_OVERTIME_PER_DAY = 2
MAX_OVERTIME_PER_WEEK = 12

OVERTIME_KINDS = {
    "night_surcharge": "Recargo nocturno",
    "overtime_day": "Hora extra diurna",
    "overtime_night": "Hora extra nocturna",
    "sunday_surcharge": "Recargo dominical o festivo",
    "sunday_night_surcharge": "Recargo nocturno dominical o festivo",
    "sunday_overtime_day": "Hora extra diurna dominical o festiva",
    "sunday_overtime_night": "Hora extra nocturna dominical o festiva",
}
COUNTS_AS_OVERTIME = {"overtime_day", "overtime_night", "sunday_overtime_day", "sunday_overtime_night"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def sunday_surcharge(day: date) -> float:
    """Recargo dominical/festivo: 80 % desde 1-jul-2025, 90 % desde 1-jul-2026 y 100 % desde 1-jul-2027."""
    if day >= date(2027, 7, 1):
        return 1.0
    if day >= date(2026, 7, 1):
        return 0.9
    if day >= date(2025, 7, 1):
        return 0.8
    return 0.75


def weekly_hours_limit(day: date) -> int:
    """Jornada maxima semanal: 44 h desde 15-jul-2025 y 42 h desde 15-jul-2026."""
    if day >= date(2026, 7, 15):
        return 42
    if day >= date(2025, 7, 15):
        return 44
    if day >= date(2024, 7, 15):
        return 46
    if day >= date(2023, 7, 15):
        return 47
    return 48


def monthly_hours(day: date) -> float:
    """Horas mensuales de referencia (jornada semanal x 5 = 30 dias / 6 dias de la semana laboral)."""
    return weekly_hours_limit(day) * 5.0


def multiplier(kind: str, day: date) -> float:
    sur = sunday_surcharge(day)
    return {
        "night_surcharge": 0.35,
        "overtime_day": 1.25,
        "overtime_night": 1.75,
        "sunday_surcharge": sur,
        "sunday_night_surcharge": sur + 0.35,
        "sunday_overtime_day": 1 + sur + 0.25,
        "sunday_overtime_night": 1 + sur + 0.75,
    }[kind]


def overtime_amount(base_salary: float, kind: str, hours: float, day: date) -> float:
    hourly = base_salary / monthly_hours(day)
    return round(hourly * multiplier(kind, day) * hours, 2)


def week_of(day: date) -> tuple:
    start = day - timedelta(days=day.weekday())
    return start, start + timedelta(days=6)


class OvertimeIn(BaseModel):
    barber_id: Optional[str] = None
    kind: Literal[
        "night_surcharge",
        "overtime_day",
        "overtime_night",
        "sunday_surcharge",
        "sunday_night_surcharge",
        "sunday_overtime_day",
        "sunday_overtime_night",
    ]
    date: str
    hours: float = Field(gt=0, le=12)
    note: Optional[str] = Field(default=None, max_length=300)
    organization_id: Optional[str] = None


class BonusIn(BaseModel):
    barber_id: str
    concept: str = Field(min_length=2, max_length=80)
    amount: float = Field(gt=0)
    constitutes_salary: bool = False
    date: Optional[str] = None
    note: Optional[str] = Field(default=None, max_length=300)
    organization_id: Optional[str] = None


class DecisionIn(BaseModel):
    approve: bool
    note: Optional[str] = Field(default=None, max_length=300)


def _parse(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="La fecha debe tener formato AAAA-MM-DD")


async def collect_novelty_adjustments(db, org_id: str, barber_id: str, start: date, end: date) -> tuple:
    """Novedades aprobadas del periodo que aun no se han aplicado: (ajustes para la linea, ids de novedades)."""
    rows = await db.payroll_novelties.find(
        {"organization_id": org_id, "barber_id": barber_id, "status": "approved", "applied_run_id": None}, {"_id": 0}
    ).to_list(2000)
    adjustments, ids = [], []
    for row in rows:
        if not (start.isoformat() <= row["date"] <= end.isoformat()):
            continue
        ids.append(row["novelty_id"])
        if row["type"] == "overtime":
            label = f"{OVERTIME_KINDS[row['kind']]} ({row['hours']:g} h, {row['date']})"
            adjustments.append({"label": label, "amount": row["amount"], "kind": "earning", "constitutes_salary": True})
        else:
            adjustments.append(
                {
                    "label": row["concept"],
                    "amount": row["amount"],
                    "kind": "earning",
                    "constitutes_salary": bool(row.get("constitutes_salary")),
                }
            )
    return adjustments, ids


def build_novelties_router(db, get_current_user, require_management_role, resolve_team_organization):
    router = APIRouter()

    async def manager_org(user, requested):
        require_management_role(user)
        return await resolve_team_organization(user, requested)

    async def contract_of(org_id, barber_id):
        contract = await db.payroll_contracts.find_one({"organization_id": org_id, "barber_id": barber_id}, {"_id": 0})
        if not contract or contract.get("contract_type") != "fixed_salary" or not contract.get("base_salary"):
            raise HTTPException(
                status_code=400, detail="Las horas extra aplican solo a contratos fijos con salario definido"
            )
        return contract

    async def employee_name(org_id, barber_id):
        barber = await db.barbers.find_one({"organization_id": org_id, "barber_id": barber_id}, {"_id": 0})
        if not barber:
            raise HTTPException(status_code=404, detail="Profesional no encontrado")
        return barber.get("display_name") or barber.get("name")

    async def create_overtime(org_id, barber_id, data: OvertimeIn, created_by, auto_approve):
        day = _parse(data.date)
        contract = await contract_of(org_id, barber_id)
        name = await employee_name(org_id, barber_id)
        if data.kind in COUNTS_AS_OVERTIME:
            week_start, week_end = week_of(day)
            existing = await db.payroll_novelties.find(
                {"organization_id": org_id, "barber_id": barber_id, "type": "overtime"}, {"_id": 0}
            ).to_list(5000)
            active = [r for r in existing if r["status"] in ("pending", "approved") and r["kind"] in COUNTS_AS_OVERTIME]
            same_day = sum(r["hours"] for r in active if r["date"] == day.isoformat())
            same_week = sum(r["hours"] for r in active if week_start.isoformat() <= r["date"] <= week_end.isoformat())
            if same_day + data.hours > MAX_OVERTIME_PER_DAY:
                raise HTTPException(
                    status_code=409, detail=f"Máximo {MAX_OVERTIME_PER_DAY} horas extra por día (ya hay {same_day:g})."
                )
            if same_week + data.hours > MAX_OVERTIME_PER_WEEK:
                raise HTTPException(
                    status_code=409,
                    detail=f"Máximo {MAX_OVERTIME_PER_WEEK} horas extra por semana (ya hay {same_week:g}).",
                )
        row = {
            "novelty_id": f"nov_{uuid.uuid4().hex[:14]}",
            "organization_id": org_id,
            "barber_id": barber_id,
            "employee_name": name,
            "type": "overtime",
            "kind": data.kind,
            "kind_label": OVERTIME_KINDS[data.kind],
            "date": day.isoformat(),
            "hours": data.hours,
            "multiplier": round(multiplier(data.kind, day), 4),
            "amount": overtime_amount(float(contract["base_salary"]), data.kind, data.hours, day),
            "note": (data.note or "").strip() or None,
            "status": "approved" if auto_approve else "pending",
            "applied_run_id": None,
            "created_by": created_by,
            "created_at": _now(),
        }
        await db.payroll_novelties.insert_one(dict(row))
        return row

    # ------------------------------------------------------------------ referencia legal
    @router.get("/payroll/novelties/reference", tags=["payroll"])
    async def reference(
        day: Optional[str] = None,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        await get_current_user(authorization, session_token)
        when = _parse(day) if day else datetime.now(timezone.utc).date()
        return {
            "date": when.isoformat(),
            "weekly_hours_limit": weekly_hours_limit(when),
            "sunday_surcharge": sunday_surcharge(when),
            "max_overtime_per_day": MAX_OVERTIME_PER_DAY,
            "max_overtime_per_week": MAX_OVERTIME_PER_WEEK,
            "kinds": {
                key: {"label": label, "multiplier": round(multiplier(key, when), 4)}
                for key, label in OVERTIME_KINDS.items()
            },
        }

    # ------------------------------------------------------------------ manager
    @router.get("/payroll/novelties", tags=["payroll"])
    async def list_novelties(
        organization_id: Optional[str] = None,
        status: Optional[str] = None,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        user = await get_current_user(authorization, session_token)
        org_id = await manager_org(user, organization_id)
        query = {"organization_id": org_id}
        if status:
            query["status"] = status
        rows = await db.payroll_novelties.find(query, {"_id": 0}).to_list(5000)
        rows.sort(key=lambda r: r["created_at"], reverse=True)
        return {"items": rows}

    @router.post("/payroll/novelties/overtime", tags=["payroll"])
    async def register_overtime(
        data: OvertimeIn, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)
    ):
        user = await get_current_user(authorization, session_token)
        org_id = await manager_org(user, data.organization_id)
        if not data.barber_id:
            raise HTTPException(status_code=400, detail="Indica a quién corresponde")
        return await create_overtime(org_id, data.barber_id, data, user.user_id, auto_approve=False)

    @router.post("/payroll/novelties/bonus", tags=["payroll"])
    async def register_bonus(
        data: BonusIn, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)
    ):
        user = await get_current_user(authorization, session_token)
        org_id = await manager_org(user, data.organization_id)
        name = await employee_name(org_id, data.barber_id)
        await contract_of(org_id, data.barber_id)
        when = _parse(data.date) if data.date else datetime.now(timezone.utc).date()
        row = {
            "novelty_id": f"nov_{uuid.uuid4().hex[:14]}",
            "organization_id": org_id,
            "barber_id": data.barber_id,
            "employee_name": name,
            "type": "bonus",
            "concept": data.concept.strip(),
            "date": when.isoformat(),
            "amount": round(float(data.amount), 2),
            "constitutes_salary": data.constitutes_salary,
            "note": (data.note or "").strip() or None,
            "status": "pending",
            "applied_run_id": None,
            "created_by": user.user_id,
            "created_at": _now(),
        }
        await db.payroll_novelties.insert_one(dict(row))
        return row

    @router.post("/payroll/novelties/{novelty_id}/decide", tags=["payroll"])
    async def decide(
        novelty_id: str,
        data: DecisionIn,
        organization_id: Optional[str] = None,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        user = await get_current_user(authorization, session_token)
        org_id = await manager_org(user, organization_id)
        row = await db.payroll_novelties.find_one({"novelty_id": novelty_id, "organization_id": org_id}, {"_id": 0})
        if not row:
            raise HTTPException(status_code=404, detail="Novedad no encontrada")
        if row["status"] != "pending":
            raise HTTPException(status_code=409, detail="Esta novedad ya fue resuelta")
        changes = {
            "status": "approved" if data.approve else "rejected",
            "decided_by": user.user_id,
            "decided_at": _now(),
            "decision_note": (data.note or "").strip() or None,
        }
        await db.payroll_novelties.update_one({"novelty_id": novelty_id}, {"$set": changes})
        return {**row, **changes}

    # ------------------------------------------------------------------ empleado
    @router.post("/staff/hr/overtime", tags=["payroll"])
    async def request_overtime(
        data: OvertimeIn, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)
    ):
        user = await get_current_user(authorization, session_token)
        barber = await db.barbers.find_one(
            {"organization_id": getattr(user, "organization_id", None), "user_id": user.user_id}, {"_id": 0}
        )
        if not barber:
            raise HTTPException(status_code=404, detail="No encontramos tu perfil de profesional")
        return await create_overtime(
            barber["organization_id"], barber["barber_id"], data, user.user_id, auto_approve=False
        )

    @router.get("/staff/hr/novelties", tags=["payroll"])
    async def my_novelties(authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
        user = await get_current_user(authorization, session_token)
        barber = await db.barbers.find_one(
            {"organization_id": getattr(user, "organization_id", None), "user_id": user.user_id}, {"_id": 0}
        )
        if not barber:
            raise HTTPException(status_code=404, detail="No encontramos tu perfil de profesional")
        rows = await db.payroll_novelties.find(
            {"organization_id": barber["organization_id"], "barber_id": barber["barber_id"]}, {"_id": 0}
        ).to_list(2000)
        rows.sort(key=lambda r: r["created_at"], reverse=True)
        return {"items": rows}

    return router


async def ensure_novelty_indexes(db):
    await db.payroll_novelties.create_index(
        [("organization_id", 1), ("status", 1), ("date", 1)], name="payroll_novelties_org"
    )
    await db.payroll_novelties.create_index("novelty_id", unique=True, name="payroll_novelties_id_unique")
