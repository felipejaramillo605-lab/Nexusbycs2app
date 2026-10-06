"""Ausentismos y vacaciones: solicitudes del empleado, aprobacion del manager y calendario del equipo.

Herramienta de apoyo de gestion interna. No es soporte de nomina electronica, facturacion electronica ni auditorias de
la UGPP; los pagos de incapacidades y licencias se registran como novedades manuales de la nomina.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Dict, List, Literal, Optional

from fastapi import APIRouter, Cookie, File, Header, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field

KINDS = {
    "vacation": {"label": "Vacaciones", "calendar": False, "evidence": False, "default_paid": True},
    "sick_leave": {"label": "Incapacidad médica", "calendar": True, "evidence": True, "default_paid": True},
    "permission": {"label": "Permiso", "calendar": False, "evidence": False, "default_paid": True},
    "paternity": {"label": "Licencia de paternidad", "calendar": True, "evidence": True, "default_paid": True},
    "maternity": {"label": "Licencia de maternidad", "calendar": True, "evidence": True, "default_paid": True},
    "mourning": {"label": "Licencia por luto", "calendar": False, "evidence": True, "default_paid": True},
    "calamity": {"label": "Calamidad doméstica", "calendar": False, "evidence": False, "default_paid": True},
    "study": {"label": "Permiso de estudio", "calendar": False, "evidence": False, "default_paid": True},
}
VACATION_DAYS_PER_YEAR = 15
ALLOWED_DOCUMENTS = {"image/jpeg", "image/png", "image/webp", "application/pdf"}
MAX_DOCUMENT_BYTES = 5 * 1024 * 1024
DISCLAIMER = (
    "Herramienta de gestión interna. No sirve como soporte de nómina electrónica, facturas electrónicas ni para "
    "auditorías de la UGPP."
)


def looks_like(content_type: str, data: bytes) -> bool:
    """Comprueba la firma del archivo: el tipo que declara el navegador no basta."""
    if content_type == "image/jpeg":
        return data[:3] == b"\xff\xd8\xff"
    if content_type == "image/png":
        return data[:8] == b"\x89PNG\r\n\x1a\n"
    if content_type == "image/webp":
        return data[:4] == b"RIFF" and data[8:12] == b"WEBP"
    if content_type == "application/pdf":
        return data[:5] == b"%PDF-"
    return False


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:14]}"


# ----------------------------------------------------------------------------------------------- calendario CO


def easter(year: int) -> date:
    """Domingo de Pascua (algoritmo gregoriano anonimo)."""
    a, b, c = year % 19, year // 100, year % 100
    d, e = b // 4, b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = c // 4, c % 4
    el = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * el) // 451
    month = (h + el - 7 * m + 114) // 31
    day = ((h + el - 7 * m + 114) % 31) + 1
    return date(year, month, day)


def _next_monday(day: date) -> date:
    return day if day.weekday() == 0 else day + timedelta(days=7 - day.weekday())


def colombian_holidays(year: int) -> set:
    """Festivos de Colombia (Ley Emiliani): fijos, trasladados al lunes y los que dependen de la Semana Santa."""
    fixed = [
        date(year, 1, 1),
        date(year, 5, 1),
        date(year, 7, 20),
        date(year, 8, 7),
        date(year, 12, 8),
        date(year, 12, 25),
    ]
    moved = [
        date(year, 1, 6),
        date(year, 3, 19),
        date(year, 6, 29),
        date(year, 8, 15),
        date(year, 10, 12),
        date(year, 11, 1),
        date(year, 11, 11),
    ]
    pascua = easter(year)
    holy = [pascua - timedelta(days=3), pascua - timedelta(days=2)]
    after_easter = [pascua + timedelta(days=39), pascua + timedelta(days=60), pascua + timedelta(days=68)]
    return set(fixed + holy + [_next_monday(d) for d in moved + after_easter])


def is_business_day(day: date, saturdays: bool = False) -> bool:
    if day.weekday() == 6 or (day.weekday() == 5 and not saturdays):
        return False
    return day not in colombian_holidays(day.year)


def count_days(start: date, end: date, kind: str, saturdays: bool = False) -> int:
    """Dias de la solicitud: habiles para vacaciones y permisos; calendario para incapacidades y licencias."""
    if end < start:
        return 0
    if KINDS[kind]["calendar"]:
        return (end - start).days + 1
    return sum(1 for i in range((end - start).days + 1) if is_business_day(start + timedelta(days=i), saturdays))


def end_for_business_days(start: date, days: int, saturdays: bool = False) -> dict:
    """Calculadora: ultimo dia de vacaciones y fecha de regreso a partir del inicio y los dias habiles solicitados."""
    if days < 1:
        raise ValueError("Los días deben ser al menos 1")
    cursor, counted, last = start, 0, start
    while counted < days:
        if is_business_day(cursor, saturdays):
            counted += 1
            last = cursor
        cursor += timedelta(days=1)
    back = last + timedelta(days=1)
    while not is_business_day(back, saturdays):
        back += timedelta(days=1)
    return {
        "start_date": start.isoformat(),
        "end_date": last.isoformat(),
        "return_date": back.isoformat(),
        "days": days,
    }


def vacation_balance(hire: Optional[date], taken_days: float, today: date) -> dict:
    """15 dias habiles por cada 360 dias trabajados (causados) menos los ya disfrutados."""
    if not hire:
        return {"accrued": None, "taken": taken_days, "available": None, "start_date": None}
    worked = max(0, min((today - hire).days + 1, 360 * 50))
    accrued = round(VACATION_DAYS_PER_YEAR * worked / 360, 2)
    return {
        "accrued": accrued,
        "taken": taken_days,
        "available": round(accrued - taken_days, 2),
        "start_date": hire.isoformat(),
    }


def overlap_days(a_start: date, a_end: date, b_start: date, b_end: date, saturdays: bool = False) -> int:
    """Dias habiles en comun entre dos rangos (para descontar permisos no remunerados de la nomina)."""
    start, end = max(a_start, b_start), min(a_end, b_end)
    if end < start:
        return 0
    return sum(1 for i in range((end - start).days + 1) if is_business_day(start + timedelta(days=i), saturdays))


# ----------------------------------------------------------------------------------------------- modelos


class RequestIn(BaseModel):
    kind: Literal["vacation", "sick_leave", "permission", "paternity", "maternity", "mourning", "calamity", "study"]
    start_date: str
    end_date: str
    note: Optional[str] = Field(default=None, max_length=500)
    document_id: Optional[str] = None
    paid: Optional[bool] = None


class DecisionIn(BaseModel):
    approve: bool
    note: Optional[str] = Field(default=None, max_length=300)
    allow_over_balance: bool = False


def _parse(value: str, label: str) -> date:
    try:
        return date.fromisoformat(value)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail=f"{label} debe tener formato AAAA-MM-DD")


def build_hr_router(db, get_current_user, require_management_role, resolve_team_organization):
    router = APIRouter()

    async def manager_org(user, requested):
        require_management_role(user)
        return await resolve_team_organization(user, requested)

    async def own_barber(user):
        barber = await db.barbers.find_one(
            {"organization_id": getattr(user, "organization_id", None), "user_id": user.user_id}, {"_id": 0}
        )
        if not barber:
            raise HTTPException(status_code=404, detail="No encontramos tu perfil de profesional")
        return barber

    async def hire_date(org_id, barber_id) -> Optional[date]:
        contract = await db.payroll_contracts.find_one({"organization_id": org_id, "barber_id": barber_id}, {"_id": 0})
        try:
            return date.fromisoformat(contract["start_date"]) if contract and contract.get("start_date") else None
        except ValueError:
            return None

    async def taken_vacation(org_id, barber_id) -> float:
        rows = await db.hr_requests.find(
            {"organization_id": org_id, "barber_id": barber_id, "kind": "vacation", "status": "approved"}, {"_id": 0}
        ).to_list(2000)
        return float(sum(r.get("days", 0) for r in rows))

    def public_view(row: dict) -> dict:
        return {**row, "kind_label": KINDS[row["kind"]]["label"]}

    # ------------------------------------------------------------------ empleado (ESS)
    @router.get("/staff/hr/summary", tags=["hr"])
    async def my_summary(authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
        user = await get_current_user(authorization, session_token)
        barber = await own_barber(user)
        org_id = barber["organization_id"]
        balance = vacation_balance(
            await hire_date(org_id, barber["barber_id"]),
            await taken_vacation(org_id, barber["barber_id"]),
            datetime.now(timezone.utc).date(),
        )
        rows = await db.hr_requests.find(
            {"organization_id": org_id, "barber_id": barber["barber_id"]}, {"_id": 0}
        ).to_list(500)
        rows.sort(key=lambda r: r["created_at"], reverse=True)
        contract = await db.payroll_contracts.find_one(
            {"organization_id": org_id, "barber_id": barber["barber_id"]}, {"_id": 0, "contract_type": 1}
        )
        return {
            "vacation": balance,
            "fixed_contract": bool(contract and contract.get("contract_type") == "fixed_salary"),
            "requests": [public_view(r) for r in rows],
            "kinds": {k: {"label": v["label"], "evidence": v["evidence"]} for k, v in KINDS.items()},
            "disclaimer": DISCLAIMER,
        }

    @router.get("/staff/hr/vacation-calc", tags=["hr"])
    async def vacation_calc(
        start_date: str,
        days: int,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        await get_current_user(authorization, session_token)
        try:
            return end_for_business_days(_parse(start_date, "La fecha de inicio"), days)
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error))

    @router.post("/staff/hr/documents", tags=["hr"])
    async def upload_document(
        file: UploadFile = File(...),
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        user = await get_current_user(authorization, session_token)
        barber = await own_barber(user)
        if file.content_type not in ALLOWED_DOCUMENTS:
            raise HTTPException(status_code=400, detail="Sube una foto (JPG, PNG, WebP) o un PDF")
        data = await file.read(MAX_DOCUMENT_BYTES + 1)
        if len(data) > MAX_DOCUMENT_BYTES:
            raise HTTPException(status_code=413, detail="El archivo supera 5 MB")
        if not data:
            raise HTTPException(status_code=400, detail="El archivo está vacío")
        if not looks_like(file.content_type, data):
            raise HTTPException(status_code=400, detail="El contenido no corresponde a una foto o PDF válidos")
        doc = {
            "document_id": _id("hrdoc"),
            "organization_id": barber["organization_id"],
            "barber_id": barber["barber_id"],
            "content_type": file.content_type,
            "size": len(data),
            "data": data,
            "created_at": _now(),
        }
        await db.hr_documents.insert_one(dict(doc))
        return {"document_id": doc["document_id"], "size": doc["size"], "content_type": doc["content_type"]}

    @router.post("/staff/hr/requests", tags=["hr"])
    async def create_request(
        data: RequestIn, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)
    ):
        user = await get_current_user(authorization, session_token)
        barber = await own_barber(user)
        org_id = barber["organization_id"]
        start, end = _parse(data.start_date, "La fecha de inicio"), _parse(data.end_date, "La fecha de fin")
        if end < start:
            raise HTTPException(status_code=400, detail="La fecha de fin no puede ser anterior al inicio")
        if (end - start).days > 400:
            raise HTTPException(status_code=400, detail="El rango de fechas es demasiado largo")
        days = count_days(start, end, data.kind)
        if days < 1:
            raise HTTPException(status_code=400, detail="Ese rango no incluye días hábiles")
        if data.document_id:
            document = await db.hr_documents.find_one(
                {"document_id": data.document_id, "organization_id": org_id, "barber_id": barber["barber_id"]},
                {"_id": 0, "document_id": 1},
            )
            if not document:
                raise HTTPException(status_code=404, detail="Documento no encontrado")
        if KINDS[data.kind]["evidence"] and data.kind == "sick_leave" and not data.document_id:
            raise HTTPException(status_code=400, detail="Adjunta la foto de la incapacidad (EPS o ARL)")
        overlapping = await db.hr_requests.find(
            {"organization_id": org_id, "barber_id": barber["barber_id"]}, {"_id": 0}
        ).to_list(2000)
        for row in overlapping:
            if row["status"] in ("pending", "approved") and not (
                end < date.fromisoformat(row["start_date"]) or start > date.fromisoformat(row["end_date"])
            ):
                raise HTTPException(status_code=409, detail="Ya tienes una solicitud en esas fechas")
        paid = KINDS[data.kind]["default_paid"] if data.paid is None else bool(data.paid)
        if data.kind in ("vacation", "sick_leave", "paternity", "maternity", "mourning", "calamity"):
            paid = True  # estas siempre son remuneradas; solo permisos y estudio pueden ser no remunerados
        row = {
            "request_id": _id("hrq"),
            "organization_id": org_id,
            "barber_id": barber["barber_id"],
            "employee_name": barber.get("display_name") or barber.get("name"),
            "kind": data.kind,
            "start_date": start.isoformat(),
            "end_date": end.isoformat(),
            "days": days,
            "paid": paid,
            "note": (data.note or "").strip() or None,
            "document_id": data.document_id,
            "status": "pending",
            "created_at": _now(),
        }
        await db.hr_requests.insert_one(dict(row))
        return public_view(row)

    @router.delete("/staff/hr/requests/{request_id}", tags=["hr"])
    async def cancel_request(
        request_id: str, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)
    ):
        user = await get_current_user(authorization, session_token)
        barber = await own_barber(user)
        row = await db.hr_requests.find_one(
            {"request_id": request_id, "organization_id": barber["organization_id"], "barber_id": barber["barber_id"]},
            {"_id": 0},
        )
        if not row:
            raise HTTPException(status_code=404, detail="Solicitud no encontrada")
        if row["status"] != "pending":
            raise HTTPException(status_code=409, detail="Solo puedes cancelar solicitudes pendientes")
        await db.hr_requests.update_one(
            {"request_id": request_id}, {"$set": {"status": "cancelled", "decided_at": _now()}}
        )
        return {"cancelled": True}

    # ------------------------------------------------------------------ manager (MSS)
    @router.get("/hr/requests", tags=["hr"])
    async def list_requests(
        organization_id: Optional[str] = None,
        status: Optional[str] = None,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        user = await get_current_user(authorization, session_token)
        org_id = await manager_org(user, organization_id)
        query: Dict = {"organization_id": org_id}
        if status:
            query["status"] = status
        rows = await db.hr_requests.find(query, {"_id": 0}).to_list(2000)
        rows.sort(key=lambda r: r["created_at"], reverse=True)
        return {"items": [public_view(r) for r in rows]}

    @router.post("/hr/requests/{request_id}/decide", tags=["hr"])
    async def decide(
        request_id: str,
        data: DecisionIn,
        organization_id: Optional[str] = None,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        user = await get_current_user(authorization, session_token)
        org_id = await manager_org(user, organization_id)
        row = await db.hr_requests.find_one({"request_id": request_id, "organization_id": org_id}, {"_id": 0})
        if not row:
            raise HTTPException(status_code=404, detail="Solicitud no encontrada")
        if row["status"] != "pending":
            raise HTTPException(status_code=409, detail="Esta solicitud ya fue resuelta")
        if data.approve and row["kind"] == "vacation" and not data.allow_over_balance:
            balance = vacation_balance(
                await hire_date(org_id, row["barber_id"]),
                await taken_vacation(org_id, row["barber_id"]),
                datetime.now(timezone.utc).date(),
            )
            if balance["available"] is not None and row["days"] > balance["available"] + 1e-9:
                raise HTTPException(
                    status_code=409,
                    detail={
                        "code": "VACATION_OVER_BALANCE",
                        "message": (
                            f"Solicita {row['days']} días y tiene {balance['available']:g} disponibles. "
                            "Confirma si quieres aprobarla igual."
                        ),
                    },
                )
        changes = {
            "status": "approved" if data.approve else "rejected",
            "decided_by": user.user_id,
            "decided_at": _now(),
            "decision_note": (data.note or "").strip() or None,
        }
        await db.hr_requests.update_one({"request_id": request_id}, {"$set": changes})
        return public_view({**row, **changes})

    @router.get("/hr/calendar", tags=["hr"])
    async def team_calendar(
        start: str,
        end: str,
        organization_id: Optional[str] = None,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        """Quien estara ausente en el rango (aprobadas y pendientes) y cuantas personas coinciden cada dia."""
        user = await get_current_user(authorization, session_token)
        org_id = await manager_org(user, organization_id)
        first, last = _parse(start, "start"), _parse(end, "end")
        if last < first or (last - first).days > 120:
            raise HTTPException(status_code=400, detail="Rango de fechas no válido (máximo 120 días)")
        rows = await db.hr_requests.find({"organization_id": org_id}, {"_id": 0}).to_list(5000)
        items, per_day = [], {}
        for row in rows:
            if row["status"] not in ("approved", "pending"):
                continue
            r_start, r_end = date.fromisoformat(row["start_date"]), date.fromisoformat(row["end_date"])
            if r_end < first or r_start > last:
                continue
            items.append(public_view(row))
            if row["status"] == "approved":
                for i in range((min(r_end, last) - max(r_start, first)).days + 1):
                    day = (max(r_start, first) + timedelta(days=i)).isoformat()
                    per_day.setdefault(day, set()).add(row["barber_id"])
        today = datetime.now(timezone.utc).date().isoformat()
        return {
            "items": items,
            "overlap_by_day": {day: len(people) for day, people in sorted(per_day.items())},
            "out_today": sorted(
                {
                    r["employee_name"]
                    for r in items
                    if r["status"] == "approved" and r["start_date"] <= today <= r["end_date"]
                }
            ),
            "holidays": sorted(
                d.isoformat()
                for d in colombian_holidays(first.year) | colombian_holidays(last.year)
                if first <= d <= last
            ),
        }

    @router.get("/hr/documents/{document_id}", tags=["hr"])
    async def get_document(
        document_id: str,
        organization_id: Optional[str] = None,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        user = await get_current_user(authorization, session_token)
        org_id = await manager_org(user, organization_id)
        doc = await db.hr_documents.find_one({"document_id": document_id, "organization_id": org_id}, {"_id": 0})
        if not doc:
            raise HTTPException(status_code=404, detail="Documento no encontrado")
        return Response(
            bytes(doc["data"]),
            media_type=doc["content_type"],
            headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"},
        )

    @router.get("/hr/overview", tags=["hr"])
    async def overview(
        organization_id: Optional[str] = None,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        """Tablero del equipo: pendientes por aprobar, quien esta fuera hoy, cumpleaños y aniversarios proximos."""
        user = await get_current_user(authorization, session_token)
        org_id = await manager_org(user, organization_id)
        today = datetime.now(timezone.utc).date()
        rows = await db.hr_requests.find({"organization_id": org_id}, {"_id": 0}).to_list(5000)
        pending = [r for r in rows if r["status"] == "pending"]
        out = sorted(
            {
                r["employee_name"]
                for r in rows
                if r["status"] == "approved" and r["start_date"] <= today.isoformat() <= r["end_date"]
            }
        )
        contracts = await db.payroll_contracts.find({"organization_id": org_id}, {"_id": 0}).to_list(500)
        names = {
            b["barber_id"]: b.get("display_name") or b.get("name")
            for b in await db.barbers.find({"organization_id": org_id}, {"_id": 0}).to_list(500)
        }

        def next_occurrence(value):
            try:
                parsed = date.fromisoformat(value)
                upcoming = date(today.year, parsed.month, parsed.day)
                if upcoming < today:
                    upcoming = date(today.year + 1, parsed.month, parsed.day)
                return (upcoming - today).days, upcoming.year - parsed.year
            except (TypeError, ValueError):
                return None, None

        birthdays, anniversaries = [], []
        for contract in contracts:
            name = names.get(contract["barber_id"])
            if not name:
                continue
            until, _ = next_occurrence(contract.get("birth_date"))
            if until is not None and until <= 30:
                birthdays.append({"name": name, "days_until": until})
            until, years = next_occurrence(contract.get("start_date"))
            if until is not None and until <= 30 and years > 0:
                anniversaries.append({"name": name, "days_until": until, "years": years})
        return {
            "pending_count": len(pending),
            "pending": [public_view(r) for r in pending][:20],
            "out_today": out,
            "birthdays": sorted(birthdays, key=lambda x: x["days_until"]),
            "anniversaries": sorted(anniversaries, key=lambda x: x["days_until"]),
            "disclaimer": DISCLAIMER,
        }

    return router


async def ensure_hr_indexes(db):
    await db.hr_requests.create_index(
        [("organization_id", 1), ("status", 1), ("created_at", -1)], name="hr_requests_org_status"
    )
    await db.hr_requests.create_index([("organization_id", 1), ("barber_id", 1)], name="hr_requests_barber")
    await db.hr_documents.create_index("document_id", unique=True, name="hr_documents_id_unique")


def unpaid_days_in_period(requests: List[dict], barber_id: str, start: date, end: date) -> float:
    """Dias habiles de permisos aprobados NO remunerados que caen dentro del periodo (para descontar en la nomina)."""
    total = 0
    for row in requests:
        if row.get("barber_id") != barber_id or row.get("status") != "approved" or row.get("paid", True):
            continue
        total += overlap_days(start, end, date.fromisoformat(row["start_date"]), date.fromisoformat(row["end_date"]))
    return float(total)
