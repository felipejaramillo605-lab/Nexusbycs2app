"""Modulo de nomina: contratos del staff, auxilios extras, corridas mensuales/quincenales, Excel y colillas.

Dos tipos de contrato: ``service_commission`` (por servicio, se paga con las liquidaciones de comision que ya existen) y
``fixed_salary`` (salario fijo con prestaciones y aportes de Colombia, ver ``payroll_co``). No reemplaza un software de
nomina: es una herramienta de apoyo para organizar y estimar los costos de personal.
"""

from __future__ import annotations

import calendar
import uuid
from datetime import date, datetime, timezone
from typing import List, Literal, Optional

from fastapi import APIRouter, Cookie, Header, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

import payroll_co
from hr_absences import unpaid_days_in_period
from payroll_novelties import collect_novelty_adjustments
from payroll_reports import build_payroll_workbook, build_slip_pdf, period_label

CONTRACT_TYPES = ("service_commission", "fixed_salary")
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:14]}"


# ----------------------------------------------------------------------------------------------- modelos


class SettingsIn(BaseModel):
    exonerated: bool = True
    default_arl_class: Literal["I", "II", "III", "IV", "V"] = "I"
    params_overrides: Optional[dict] = None
    organization_id: Optional[str] = None


class ExtraIn(BaseModel):
    name: str = Field(min_length=2, max_length=60)
    kind: Literal["fixed", "percent"]
    value: float = Field(gt=0)
    constitutes_salary: bool = False
    applies_to: Literal["all", "selected"] = "all"
    barber_ids: List[str] = Field(default_factory=list)
    active: bool = True
    organization_id: Optional[str] = None


class ContractIn(BaseModel):
    contract_type: Literal["service_commission", "fixed_salary"]
    base_salary: Optional[float] = Field(default=None, ge=0)
    pay_frequency: Literal["monthly", "biweekly"] = "monthly"
    arl_risk_class: Literal["I", "II", "III", "IV", "V"] = "I"
    start_date: Optional[str] = None
    birth_date: Optional[str] = None
    cost_center: Optional[str] = Field(default=None, max_length=60)
    withholding_enabled: bool = False
    withholding_dependents: bool = False
    withholding_prepaid_health: float = Field(default=0, ge=0)
    withholding_housing_interest: float = Field(default=0, ge=0)
    withholding_voluntary: float = Field(default=0, ge=0)
    bank_name: Optional[str] = Field(default=None, max_length=60)
    account_type: Optional[Literal["savings", "checking"]] = None
    account_number: Optional[str] = Field(default=None, max_length=30)
    document: Optional[str] = Field(default=None, max_length=30)
    position: Optional[str] = Field(default=None, max_length=60)
    notes: Optional[str] = Field(default=None, max_length=300)
    organization_id: Optional[str] = None


class RunIn(BaseModel):
    year: int = Field(ge=2020, le=2100)
    month: int = Field(ge=1, le=12)
    frequency: Literal["monthly", "biweekly"] = "monthly"
    half: Optional[Literal[1, 2]] = None
    organization_id: Optional[str] = None


class AdjustmentIn(BaseModel):
    label: str = Field(min_length=2, max_length=60)
    amount: float = Field(gt=0)
    kind: Literal["earning", "deduction"] = "earning"
    constitutes_salary: bool = False


class LineIn(BaseModel):
    days_worked: Optional[float] = Field(default=None, ge=0, le=30)
    adjustments: Optional[List[AdjustmentIn]] = None
    note: Optional[str] = Field(default=None, max_length=300)


class ReasonIn(BaseModel):
    reason: str = Field(min_length=5, max_length=500)


# ----------------------------------------------------------------------------------------------- logica pura


def period_bounds(year: int, month: int, frequency: str, half: Optional[int]) -> tuple[date, date]:
    last = calendar.monthrange(year, month)[1]
    if frequency == "monthly":
        return date(year, month, 1), date(year, month, last)
    if half not in (1, 2):
        raise HTTPException(status_code=400, detail="Indica la quincena (1 o 2)")
    return (
        (date(year, month, 1), date(year, month, 15)) if half == 1 else (date(year, month, 16), date(year, month, last))
    )


def days_in_period(start: date, end: date, hire: Optional[date], frequency: str) -> float:
    """Dias a pagar: periodo completo, o desde la fecha de ingreso si empezo dentro del periodo."""
    full = payroll_co.PERIOD_DAYS[frequency]
    if not hire or hire <= start:
        return float(full)
    if hire > end:
        return 0.0
    if frequency == "monthly":
        return float(max(0, 30 - (hire.day - 1)))
    return float(max(0, full - (hire.day - start.day)))  # quincena: dias desde el ingreso hasta el cierre


def withholding_options(contract: dict) -> Optional[dict]:
    """Opciones de la estimacion de retencion en la fuente del contrato (None = no se estima)."""
    if not contract.get("withholding_enabled"):
        return None
    return {
        "dependents": bool(contract.get("withholding_dependents")),
        "prepaid_health": float(contract.get("withholding_prepaid_health") or 0),
        "housing_interest": float(contract.get("withholding_housing_interest") or 0),
        "voluntary": float(contract.get("withholding_voluntary") or 0),
    }


def selected_extras(extras: List[dict], barber_id: str) -> List[dict]:
    return [
        x
        for x in extras
        if x.get("active", True) and (x.get("applies_to") == "all" or barber_id in (x.get("barber_ids") or []))
    ]


def compute_totals(lines: List[dict]) -> dict:
    fixed = [x["computed"] for x in lines if x.get("computed")]
    commissions = sum(
        float(x.get("settlement_total") or 0) for x in lines if x.get("contract_type") == "service_commission"
    )
    totals = {
        "gross": round(sum(c["gross"] for c in fixed), 2),
        "deductions": round(sum(c["deductions_total"] for c in fixed), 2),
        "net": round(sum(c["net_pay"] for c in fixed), 2),
        "employer": round(sum(c["employer_total"] for c in fixed), 2),
        "provisions": round(sum(c["provisions_total"] for c in fixed), 2),
        "employer_cost": round(sum(c["employer_cost"] for c in fixed), 2),
        "commissions": round(commissions, 2),
    }
    totals["total_personnel_cost"] = round(totals["employer_cost"] + totals["commissions"], 2)
    return totals


def recompute_line(line: dict, params: dict, exonerated: bool, extras: List[dict]) -> dict:
    """Recalcula una linea de contrato fijo con sus novedades vigentes."""
    computed = payroll_co.compute_line(
        base_salary=line["base_salary"],
        frequency=line["frequency"],
        risk_class=line.get("arl_risk_class", "I"),
        params=params,
        days_worked=line.get("days_worked"),
        extras=selected_extras(extras, line["barber_id"]) if line.get("use_extras", True) else [],
        adjustments=line.get("adjustments") or [],
        exonerated=exonerated,
        withholding=line.get("withholding"),
    )
    return {**line, "computed": computed}


async def load_logo_bytes(db, organization: dict) -> Optional[bytes]:
    """Logo definido por el negocio (si existe y es legible); cualquier fallo devuelve None."""
    try:
        from media_mirror import mirror_restore
        from organization_media import _safe_path, managed_parts

        parts = managed_parts(organization.get("logo_url"))
        if not parts:
            return None
        path = _safe_path(*parts)
        if not path.is_file() and not await mirror_restore(db, "organizations", f"{parts[0]}/{parts[1]}", path):
            return None
        return path.read_bytes()
    except Exception:
        return None


# ----------------------------------------------------------------------------------------------- router


def build_payroll_router(db, get_current_user, require_management_role, resolve_team_organization):
    router = APIRouter()

    async def manager_org(user, requested):
        require_management_role(user)
        return await resolve_team_organization(user, requested)

    async def settings_for(org_id):
        item = await db.payroll_settings.find_one({"organization_id": org_id}, {"_id": 0})
        return item or {"organization_id": org_id, "exonerated": True, "default_arl_class": "I", "params_overrides": {}}

    # ------------------------------------------------------------------ parametros y ajustes
    @router.get("/payroll/settings", tags=["payroll"])
    async def get_settings(
        organization_id: Optional[str] = None,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        user = await get_current_user(authorization, session_token)
        org_id = await manager_org(user, organization_id)
        settings = await settings_for(org_id)
        year = datetime.now(timezone.utc).year
        return {
            **settings,
            "params": payroll_co.params_for(year, settings.get("params_overrides")),
            "known_years": sorted(payroll_co.DEFAULT_PARAMS),
            "risk_classes": payroll_co.RISK_CLASS_LABELS,
            "disclaimer": payroll_co.DISCLAIMER,
        }

    @router.put("/payroll/settings", tags=["payroll"])
    async def put_settings(
        data: SettingsIn, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)
    ):
        user = await get_current_user(authorization, session_token)
        org_id = await manager_org(user, data.organization_id)
        overrides = {}
        for year, values in (data.params_overrides or {}).items():
            if not str(year).isdigit() or not isinstance(values, dict):
                raise HTTPException(status_code=400, detail="Parámetros por año no válidos")
            smmlv, aid = float(values.get("smmlv") or 0), float(values.get("transport_aid") or 0)
            if smmlv <= 0 or aid < 0:
                raise HTTPException(
                    status_code=400, detail="El salario mínimo y el auxilio deben ser valores positivos"
                )
            overrides[str(year)] = {
                "smmlv": smmlv,
                "transport_aid": aid,
                **({"uvt": float(values["uvt"])} if float(values.get("uvt") or 0) > 0 else {}),
            }
        doc = {
            "organization_id": org_id,
            "exonerated": data.exonerated,
            "default_arl_class": data.default_arl_class,
            "params_overrides": overrides,
            "updated_at": _now(),
            "updated_by": user.user_id,
        }
        existing = await db.payroll_settings.find_one({"organization_id": org_id}, {"_id": 0})
        if existing:
            await db.payroll_settings.update_one({"organization_id": org_id}, {"$set": doc})
        else:
            await db.payroll_settings.insert_one(dict(doc))
        return doc

    # ------------------------------------------------------------------ auxilios extras
    @router.get("/payroll/extras", tags=["payroll"])
    async def list_extras(
        organization_id: Optional[str] = None,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        user = await get_current_user(authorization, session_token)
        org_id = await manager_org(user, organization_id)
        return {"items": await db.payroll_extras.find({"organization_id": org_id}, {"_id": 0}).to_list(500)}

    def clean_extra(data: ExtraIn):
        if data.kind == "percent" and data.value > 100:
            raise HTTPException(status_code=400, detail="El porcentaje no puede superar 100")
        if data.applies_to == "selected" and not data.barber_ids:
            raise HTTPException(status_code=400, detail="Elige a quién aplica el auxilio")

    @router.post("/payroll/extras", tags=["payroll"])
    async def create_extra(
        data: ExtraIn, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)
    ):
        user = await get_current_user(authorization, session_token)
        org_id = await manager_org(user, data.organization_id)
        clean_extra(data)
        doc = {
            **data.model_dump(exclude={"organization_id"}),
            "extra_id": _id("ext"),
            "organization_id": org_id,
            "name": data.name.strip(),
            "created_at": _now(),
            "updated_at": _now(),
        }
        await db.payroll_extras.insert_one(dict(doc))
        return doc

    @router.put("/payroll/extras/{extra_id}", tags=["payroll"])
    async def update_extra(
        extra_id: str,
        data: ExtraIn,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        user = await get_current_user(authorization, session_token)
        org_id = await manager_org(user, data.organization_id)
        clean_extra(data)
        found = await db.payroll_extras.find_one({"extra_id": extra_id, "organization_id": org_id}, {"_id": 0})
        if not found:
            raise HTTPException(status_code=404, detail="Auxilio no encontrado")
        changes = {**data.model_dump(exclude={"organization_id"}), "name": data.name.strip(), "updated_at": _now()}
        await db.payroll_extras.update_one({"extra_id": extra_id, "organization_id": org_id}, {"$set": changes})
        return {**found, **changes}

    @router.delete("/payroll/extras/{extra_id}", tags=["payroll"])
    async def delete_extra(
        extra_id: str,
        organization_id: Optional[str] = None,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        user = await get_current_user(authorization, session_token)
        org_id = await manager_org(user, organization_id)
        found = await db.payroll_extras.find_one({"extra_id": extra_id, "organization_id": org_id}, {"_id": 0})
        if not found:
            raise HTTPException(status_code=404, detail="Auxilio no encontrado")
        await db.payroll_extras.delete_one({"extra_id": extra_id, "organization_id": org_id})
        return {"deleted": True}

    # ------------------------------------------------------------------ contratos
    @router.get("/payroll/contracts", tags=["payroll"])
    async def list_contracts(
        organization_id: Optional[str] = None,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        user = await get_current_user(authorization, session_token)
        org_id = await manager_org(user, organization_id)
        barbers = await db.barbers.find({"organization_id": org_id, "active": {"$ne": False}}, {"_id": 0}).to_list(500)
        contracts = {
            c["barber_id"]: c
            for c in await db.payroll_contracts.find({"organization_id": org_id}, {"_id": 0}).to_list(500)
        }
        rows = []
        for barber in barbers:
            contract = contracts.get(barber["barber_id"]) or {
                "contract_type": "service_commission",
                "pay_frequency": "monthly",
                "arl_risk_class": "I",
                "base_salary": None,
            }
            rows.append(
                {
                    **contract,
                    "barber_id": barber["barber_id"],
                    "name": barber.get("display_name") or barber.get("name"),
                    "configured": barber["barber_id"] in contracts,
                }
            )
        return {"items": rows}

    @router.put("/payroll/contracts/{barber_id}", tags=["payroll"])
    async def put_contract(
        barber_id: str,
        data: ContractIn,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        user = await get_current_user(authorization, session_token)
        org_id = await manager_org(user, data.organization_id)
        barber = await db.barbers.find_one({"organization_id": org_id, "barber_id": barber_id}, {"_id": 0})
        if not barber:
            raise HTTPException(status_code=404, detail="Profesional no encontrado")
        settings = await settings_for(org_id)
        if data.contract_type == "fixed_salary":
            params = payroll_co.params_for(datetime.now(timezone.utc).year, settings.get("params_overrides"))
            if not data.base_salary:
                raise HTTPException(status_code=400, detail="El contrato fijo necesita un salario básico")
            try:
                payroll_co.validate_contract(float(data.base_salary), params["smmlv"])
            except ValueError as error:
                raise HTTPException(status_code=400, detail=str(error))
        for value, label in ((data.start_date, "La fecha de ingreso"), (data.birth_date, "La fecha de nacimiento")):
            if value:
                try:
                    date.fromisoformat(value)
                except ValueError:
                    raise HTTPException(status_code=400, detail=f"{label} debe ser AAAA-MM-DD")
        doc = {
            "organization_id": org_id,
            "barber_id": barber_id,
            **data.model_dump(exclude={"organization_id"}),
            "base_salary": float(data.base_salary) if data.contract_type == "fixed_salary" else None,
            "updated_at": _now(),
            "updated_by": user.user_id,
        }
        existing = await db.payroll_contracts.find_one({"organization_id": org_id, "barber_id": barber_id}, {"_id": 0})
        if existing:
            await db.payroll_contracts.update_one({"organization_id": org_id, "barber_id": barber_id}, {"$set": doc})
        else:
            await db.payroll_contracts.insert_one(dict(doc))
        return doc

    # ------------------------------------------------------------------ corridas
    async def get_run(org_id, run_id):
        run = await db.payroll_runs.find_one({"run_id": run_id, "organization_id": org_id}, {"_id": 0})
        if not run:
            raise HTTPException(status_code=404, detail="Corrida de nómina no encontrada")
        return run

    async def save_run(run):
        run["totals"] = compute_totals(run["lines"])
        run["updated_at"] = _now()
        await db.payroll_runs.update_one(
            {"run_id": run["run_id"]}, {"$set": {k: v for k, v in run.items() if k != "run_id"}}
        )
        return run

    async def commission_totals(org_id, start: date, end: date) -> dict:
        rows = await db.staff_settlements.find({"organization_id": org_id}, {"_id": 0}).to_list(20000)
        out: dict = {}
        for row in rows:
            if row.get("status") not in ("approved", "paid"):
                continue
            end_day = str(row.get("period_end") or "")[:10]
            if not (start.isoformat() <= end_day <= end.isoformat()):
                continue
            bucket = out.setdefault(row["barber_id"], {"count": 0, "total": 0.0})
            bucket["count"] += 1
            bucket["total"] += float(row.get("total_amount") or 0)
        return out

    @router.post("/payroll/runs", tags=["payroll"])
    async def create_run(
        data: RunIn, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)
    ):
        user = await get_current_user(authorization, session_token)
        org_id = await manager_org(user, data.organization_id)
        start, end = period_bounds(data.year, data.month, data.frequency, data.half)
        duplicate = await db.payroll_runs.find_one(
            {
                "organization_id": org_id,
                "year": data.year,
                "month": data.month,
                "frequency": data.frequency,
                "half": data.half,
                "status": {"$ne": "cancelled"},
            },
            {"_id": 0, "run_id": 1},
        )
        if duplicate:
            raise HTTPException(
                status_code=409, detail="Ya existe una nómina para ese periodo. Ábrela o cancélala antes de crear otra."
            )
        settings = await settings_for(org_id)
        params = payroll_co.params_for(data.year, settings.get("params_overrides"))
        exonerated = bool(settings.get("exonerated", True))
        extras = await db.payroll_extras.find({"organization_id": org_id}, {"_id": 0}).to_list(500)
        barbers = await db.barbers.find({"organization_id": org_id, "active": {"$ne": False}}, {"_id": 0}).to_list(500)
        contracts = {
            c["barber_id"]: c
            for c in await db.payroll_contracts.find({"organization_id": org_id}, {"_id": 0}).to_list(500)
        }
        commissions = (
            await commission_totals(org_id, start, end) if data.frequency == "monthly" or data.half == 2 else {}
        )
        unpaid_requests = await db.hr_requests.find(
            {"organization_id": org_id, "status": "approved", "paid": False}, {"_id": 0}
        ).to_list(5000)
        lines = []
        for barber in barbers:
            contract = contracts.get(barber["barber_id"]) or {"contract_type": "service_commission"}
            base = {
                "barber_id": barber["barber_id"],
                "name": barber.get("display_name") or barber.get("name"),
                "contract_type": contract["contract_type"],
                "document": contract.get("document"),
                "position": contract.get("position"),
                "cost_center": contract.get("cost_center"),
            }
            if contract["contract_type"] == "fixed_salary":
                if (contract.get("pay_frequency") or "monthly") != data.frequency:
                    continue
                hire = date.fromisoformat(contract["start_date"]) if contract.get("start_date") else None
                days = days_in_period(start, end, hire, data.frequency)
                novelty_adjustments, novelty_ids = await collect_novelty_adjustments(
                    db, org_id, barber["barber_id"], start, end
                )
                unpaid = unpaid_days_in_period(unpaid_requests, barber["barber_id"], start, end)
                if unpaid:
                    days = max(0.0, days - unpaid)
                if days <= 0:
                    continue
                line = {
                    **base,
                    "base_salary": float(contract["base_salary"]),
                    "frequency": data.frequency,
                    "arl_risk_class": contract.get("arl_risk_class") or settings.get("default_arl_class", "I"),
                    "days_worked": days,
                    "adjustments": novelty_adjustments,
                    "novelty_ids": novelty_ids,
                    "use_extras": True,
                    "withholding": withholding_options(contract),
                }
                lines.append(recompute_line(line, params, exonerated, extras))
            else:
                bucket = commissions.get(barber["barber_id"])
                if bucket:
                    lines.append(
                        {
                            **base,
                            "settlement_count": bucket["count"],
                            "settlement_total": round(bucket["total"], 2),
                            "computed": None,
                        }
                    )
        number = f"NOM-{data.year}-{data.month:02d}" + (f"-Q{data.half}" if data.frequency == "biweekly" else "")
        run = {
            "run_id": _id("pay"),
            "organization_id": org_id,
            "number": number,
            "year": data.year,
            "month": data.month,
            "frequency": data.frequency,
            "half": data.half,
            "period_start": start.isoformat(),
            "period_end": end.isoformat(),
            "status": "draft",
            "version": 1,
            "params": params,
            "exonerated": exonerated,
            "extras_snapshot": [x for x in extras if x.get("active", True)],
            "lines": lines,
            "corrections": [],
            "created_by": user.user_id,
            "created_at": _now(),
        }
        run["totals"] = compute_totals(lines)
        await db.payroll_runs.insert_one(dict(run))
        for line in lines:
            for novelty_id in line.get("novelty_ids") or []:
                await db.payroll_novelties.update_one(
                    {"novelty_id": novelty_id}, {"$set": {"applied_run_id": run["run_id"]}}
                )
        return run

    @router.get("/payroll/runs", tags=["payroll"])
    async def list_runs(
        organization_id: Optional[str] = None,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        user = await get_current_user(authorization, session_token)
        org_id = await manager_org(user, organization_id)
        rows = await db.payroll_runs.find(
            {"organization_id": org_id}, {"_id": 0, "lines": 0, "extras_snapshot": 0}
        ).to_list(500)
        rows.sort(key=lambda r: (r["year"], r["month"], r.get("half") or 0), reverse=True)
        return {"items": rows}

    @router.get("/payroll/runs/{run_id}", tags=["payroll"])
    async def run_detail(
        run_id: str,
        organization_id: Optional[str] = None,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        user = await get_current_user(authorization, session_token)
        return await get_run(await manager_org(user, organization_id), run_id)

    @router.put("/payroll/runs/{run_id}/lines/{barber_id}", tags=["payroll"])
    async def edit_line(
        run_id: str,
        barber_id: str,
        data: LineIn,
        organization_id: Optional[str] = None,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        user = await get_current_user(authorization, session_token)
        run = await get_run(await manager_org(user, organization_id), run_id)
        if run["status"] != "draft":
            raise HTTPException(
                status_code=409,
                detail="Solo se puede editar una nómina en borrador. Reábrela con un motivo para corregirla.",
            )
        for index, line in enumerate(run["lines"]):
            if line["barber_id"] == barber_id and line.get("computed"):
                updated = dict(line)
                if data.days_worked is not None:
                    updated["days_worked"] = data.days_worked
                if data.adjustments is not None:
                    updated["adjustments"] = [a.model_dump() for a in data.adjustments]
                if data.note is not None:
                    updated["note"] = data.note.strip() or None
                try:
                    run["lines"][index] = recompute_line(
                        updated, run["params"], run["exonerated"], run.get("extras_snapshot", [])
                    )
                except ValueError as error:
                    raise HTTPException(status_code=400, detail=str(error))
                return await save_run(run)
        raise HTTPException(status_code=404, detail="Ese empleado no tiene contrato fijo en esta nómina")

    async def transition(run_id, organization_id, user_token, allowed, new_status, extra=None):
        authorization, session_token = user_token
        user = await get_current_user(authorization, session_token)
        run = await get_run(await manager_org(user, organization_id), run_id)
        if run["status"] not in allowed:
            raise HTTPException(status_code=409, detail=f"No se puede pasar de {run['status']} a {new_status}")
        run["status"] = new_status
        run.update(extra or {})
        run[f"{new_status}_at"] = _now()
        run[f"{new_status}_by"] = user.user_id
        if new_status == "cancelled":  # las novedades vuelven a quedar disponibles para otra nomina
            for line in run["lines"]:
                for novelty_id in line.get("novelty_ids") or []:
                    await db.payroll_novelties.update_one(
                        {"novelty_id": novelty_id}, {"$set": {"applied_run_id": None}}
                    )
        return await save_run(run)

    @router.post("/payroll/runs/{run_id}/approve", tags=["payroll"])
    async def approve(
        run_id: str,
        organization_id: Optional[str] = None,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        return await transition(run_id, organization_id, (authorization, session_token), ("draft",), "approved")

    @router.post("/payroll/runs/{run_id}/pay", tags=["payroll"])
    async def pay(
        run_id: str,
        organization_id: Optional[str] = None,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        return await transition(run_id, organization_id, (authorization, session_token), ("approved",), "paid")

    @router.post("/payroll/runs/{run_id}/cancel", tags=["payroll"])
    async def cancel(
        run_id: str,
        organization_id: Optional[str] = None,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        return await transition(run_id, organization_id, (authorization, session_token), ("draft",), "cancelled")

    @router.post("/payroll/runs/{run_id}/reopen", tags=["payroll"])
    async def reopen(
        run_id: str,
        data: ReasonIn,
        organization_id: Optional[str] = None,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        """Correccion: reabre una nómina aprobada o pagada con un motivo; queda registro y sube la versión."""
        user = await get_current_user(authorization, session_token)
        run = await get_run(await manager_org(user, organization_id), run_id)
        if run["status"] not in ("approved", "paid"):
            raise HTTPException(status_code=409, detail="Solo se reabre una nómina aprobada o pagada")
        run["corrections"] = [
            *run.get("corrections", []),
            {
                "at": _now(),
                "by": user.user_id,
                "reason": data.reason.strip(),
                "from_status": run["status"],
                "previous_totals": run.get("totals"),
            },
        ]
        run["status"] = "draft"
        run["version"] = int(run.get("version", 1)) + 1
        return await save_run(run)

    # ------------------------------------------------------------------ descargas
    async def organization_of(org_id):
        return await db.organizations.find_one({"organization_id": org_id}, {"_id": 0}) or {
            "organization_id": org_id,
            "name": "Nexus",
        }

    @router.get("/payroll/runs/{run_id}/report/xlsx", tags=["payroll"])
    async def report(
        run_id: str,
        organization_id: Optional[str] = None,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        user = await get_current_user(authorization, session_token)
        org_id = await manager_org(user, organization_id)
        run = await get_run(org_id, run_id)
        organization = await organization_of(org_id)
        content = build_payroll_workbook(run, organization.get("name") or "Nexus")
        return Response(
            content,
            media_type=XLSX,
            headers={"Content-Disposition": f'attachment; filename="{run["number"]}_gastos_de_personal.xlsx"'},
        )

    async def slip_response(run, barber_id, organization):
        line = next((x for x in run["lines"] if x["barber_id"] == barber_id), None)
        if not line:
            raise HTTPException(status_code=404, detail="Colilla no encontrada")
        logo = await load_logo_bytes(db, organization)
        content = build_slip_pdf(run, line, organization, logo)
        safe = (
            "".join(ch for ch in (line.get("name") or "empleado") if ch.isalnum() or ch in "-_ ")
            .strip()
            .replace(" ", "_")
        )
        return Response(
            content,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="colilla_{run["number"]}_{safe}.pdf"'},
        )

    @router.get("/payroll/runs/{run_id}/slips/{barber_id}/pdf", tags=["payroll"])
    async def manager_slip(
        run_id: str,
        barber_id: str,
        organization_id: Optional[str] = None,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        user = await get_current_user(authorization, session_token)
        org_id = await manager_org(user, organization_id)
        return await slip_response(await get_run(org_id, run_id), barber_id, await organization_of(org_id))

    # ------------------------------------------------------------------ colillas del propio staff
    async def own_barber(user):
        barber = await db.barbers.find_one(
            {"organization_id": getattr(user, "organization_id", None), "user_id": user.user_id}, {"_id": 0}
        )
        if not barber:
            raise HTTPException(status_code=404, detail="No encontramos tu perfil de profesional")
        return barber

    @router.get("/staff/payroll/slips", tags=["payroll"])
    async def my_slips(authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
        user = await get_current_user(authorization, session_token)
        barber = await own_barber(user)
        runs = await db.payroll_runs.find({"organization_id": barber["organization_id"]}, {"_id": 0}).to_list(500)
        items = []
        for run in runs:
            if run["status"] not in ("approved", "paid"):
                continue
            line = next((x for x in run["lines"] if x["barber_id"] == barber["barber_id"]), None)
            if line:
                computed = line.get("computed") or {}
                items.append(
                    {
                        "run_id": run["run_id"],
                        "number": run["number"],
                        "label": period_label(run),
                        "status": run["status"],
                        "net_pay": computed.get("net_pay"),
                        "commission_total": line.get("settlement_total"),
                        "contract_type": line["contract_type"],
                        "version": run.get("version", 1),
                    }
                )
        items.sort(key=lambda item: item["number"], reverse=True)
        return {"items": items}

    @router.get("/staff/payroll/slips/{run_id}/pdf", tags=["payroll"])
    async def my_slip_pdf(
        run_id: str, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)
    ):
        user = await get_current_user(authorization, session_token)
        barber = await own_barber(user)
        run = await get_run(barber["organization_id"], run_id)
        if run["status"] not in ("approved", "paid"):
            raise HTTPException(status_code=404, detail="Colilla no encontrada")
        return await slip_response(run, barber["barber_id"], await organization_of(barber["organization_id"]))

    return router


async def ensure_payroll_indexes(db):
    await db.payroll_runs.create_index(
        [("organization_id", 1), ("year", -1), ("month", -1)], name="payroll_runs_period"
    )
    await db.payroll_runs.create_index("run_id", unique=True, name="payroll_runs_id_unique")
    await db.payroll_contracts.create_index(
        [("organization_id", 1), ("barber_id", 1)], unique=True, name="payroll_contracts_unique"
    )
    await db.payroll_extras.create_index([("organization_id", 1), ("extra_id", 1)], name="payroll_extras_org")
