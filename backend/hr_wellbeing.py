"""Bienestar y cultura: billetera de beneficios, programa de referidos, linea etica anonima y datos de beneficiarios.

Herramienta de gestion interna. No es soporte de nomina electronica, facturas electronicas ni de auditorias de la UGPP,
ni reemplaza el Comite de Convivencia Laboral (Ley 1010 de 2006): solo ayuda a recibir y escalar los casos.
"""

from __future__ import annotations

import base64
import hashlib
import os
import secrets
import uuid
from datetime import date, datetime, timezone
from typing import Dict, Literal, Optional

from cryptography.fernet import Fernet
from fastapi import APIRouter, Cookie, Header, HTTPException
from pydantic import BaseModel, Field

STAGES = ["received", "interview", "trial", "hired", "rejected"]
STAGE_LABELS = {
    "received": "Recibida",
    "interview": "En entrevista",
    "trial": "En prueba",
    "hired": "Contratado",
    "rejected": "No continúa",
}
ETHICS_CATEGORIES = {
    "workplace_climate": "Clima laboral",
    "harassment": "Acoso laboral",
    "safety_risk": "Riesgo o seguridad",
    "misconduct": "Conducta indebida",
    "other": "Otro",
}
ETHICS_STATUS = {"received": "Recibida", "in_review": "En revisión", "escalated": "Escalada", "resolved": "Resuelta"}
RELATIONSHIPS = {"spouse": "Cónyuge o compañero(a)", "child": "Hijo(a)", "parent": "Padre o madre", "other": "Otro"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:14]}"


# ----------------------------------------------------------------------------------------------- cifrado


def fernet_from_secret(secret: str) -> Fernet:
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(secret.encode("utf-8")).digest()))


async def get_cipher(db) -> Fernet:
    """Clave de cifrado de la linea etica: HR_ENCRYPTION_KEY o, si no existe, una clave propia guardada aparte."""
    secret = os.environ.get("HR_ENCRYPTION_KEY")
    if secret:
        return fernet_from_secret(secret)
    holder = await db.hr_secrets.find_one({"secret_id": "ethics"}, {"_id": 0})
    if not holder:
        holder = {"secret_id": "ethics", "value": secrets.token_urlsafe(48), "created_at": _now()}
        await db.hr_secrets.insert_one(dict(holder))
    return fernet_from_secret(holder["value"])


def encrypt(cipher: Fernet, text: str) -> str:
    return cipher.encrypt(text.encode("utf-8")).decode("ascii")


def decrypt(cipher: Fernet, token: str) -> str:
    return cipher.decrypt(token.encode("ascii")).decode("utf-8")


# ----------------------------------------------------------------------------------------------- modelos


class BenefitIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    description: Optional[str] = Field(default=None, max_length=300)
    points_cost: int = Field(gt=0, le=1_000_000)
    active: bool = True
    organization_id: Optional[str] = None


class GrantIn(BaseModel):
    barber_id: str
    points: int = Field(ge=-1_000_000, le=1_000_000)
    reason: str = Field(min_length=3, max_length=200)
    organization_id: Optional[str] = None


class DecideIn(BaseModel):
    approve: bool
    note: Optional[str] = Field(default=None, max_length=300)


class VacancyIn(BaseModel):
    title: str = Field(min_length=2, max_length=80)
    description: Optional[str] = Field(default=None, max_length=500)
    reward_type: Literal["amount", "points", "text"] = "amount"
    reward_value: float = Field(default=0, ge=0)
    reward_text: Optional[str] = Field(default=None, max_length=120)
    open: bool = True
    organization_id: Optional[str] = None


class ReferralIn(BaseModel):
    vacancy_id: str
    candidate_name: str = Field(min_length=2, max_length=100)
    candidate_contact: str = Field(min_length=4, max_length=100)
    note: Optional[str] = Field(default=None, max_length=300)
    document_id: Optional[str] = None


class StageIn(BaseModel):
    stage: Literal["received", "interview", "trial", "hired", "rejected"]
    note: Optional[str] = Field(default=None, max_length=300)


class EthicsIn(BaseModel):
    category: Literal["workplace_climate", "harassment", "safety_risk", "misconduct", "other"]
    message: str = Field(min_length=10, max_length=2000)
    anonymous: bool = True


class EthicsRespondIn(BaseModel):
    message: str = Field(min_length=2, max_length=1000)
    status: Literal["in_review", "resolved"] = "in_review"


class EscalateIn(BaseModel):
    to: Literal["hr", "convivencia"]
    note: Optional[str] = Field(default=None, max_length=300)


class BeneficiaryIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=100)
    relationship: Literal["spouse", "child", "parent", "other"]
    document_type: Literal["CC", "TI", "RC", "CE", "PA", "OTRO"] = "CC"
    document_number: str = Field(min_length=3, max_length=30)
    birth_date: Optional[str] = None
    document_id: Optional[str] = None


def build_wellbeing_router(db, get_current_user, require_management_role, resolve_team_organization):
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

    async def balance_of(org_id, barber_id) -> int:
        rows = await db.hr_points_ledger.find({"organization_id": org_id, "barber_id": barber_id}, {"_id": 0}).to_list(
            5000
        )
        return int(sum(r["points"] for r in rows))

    async def add_ledger(org_id, barber_id, points, reason, ref=None):
        await db.hr_points_ledger.insert_one(
            {
                "entry_id": _id("pts"),
                "organization_id": org_id,
                "barber_id": barber_id,
                "points": int(points),
                "reason": reason,
                "ref": ref,
                "created_at": _now(),
            }
        )

    async def employee_name(org_id, barber_id):
        barber = await db.barbers.find_one({"organization_id": org_id, "barber_id": barber_id}, {"_id": 0})
        if not barber:
            raise HTTPException(status_code=404, detail="Profesional no encontrado")
        return barber.get("display_name") or barber.get("name")

    # ================================================================== billetera de beneficios
    @router.get("/staff/benefits", tags=["hr"])
    async def my_wallet(authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
        user = await get_current_user(authorization, session_token)
        barber = await own_barber(user)
        org_id = barber["organization_id"]
        catalog = await db.hr_benefits.find({"organization_id": org_id, "active": True}, {"_id": 0}).to_list(500)
        redemptions = await db.hr_redemptions.find(
            {"organization_id": org_id, "barber_id": barber["barber_id"]}, {"_id": 0}
        ).to_list(500)
        ledger = await db.hr_points_ledger.find(
            {"organization_id": org_id, "barber_id": barber["barber_id"]}, {"_id": 0}
        ).to_list(5000)
        ledger.sort(key=lambda r: r["created_at"], reverse=True)
        redemptions.sort(key=lambda r: r["created_at"], reverse=True)
        return {
            "balance": await balance_of(org_id, barber["barber_id"]),
            "catalog": catalog,
            "redemptions": redemptions,
            "ledger": ledger[:20],
        }

    @router.post("/staff/benefits/{benefit_id}/redeem", tags=["hr"])
    async def redeem(
        benefit_id: str, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)
    ):
        user = await get_current_user(authorization, session_token)
        barber = await own_barber(user)
        org_id = barber["organization_id"]
        benefit = await db.hr_benefits.find_one(
            {"benefit_id": benefit_id, "organization_id": org_id, "active": True}, {"_id": 0}
        )
        if not benefit:
            raise HTTPException(status_code=404, detail="Beneficio no disponible")
        if await balance_of(org_id, barber["barber_id"]) < benefit["points_cost"]:
            raise HTTPException(status_code=409, detail="No tienes puntos suficientes para este beneficio")
        row = {
            "redemption_id": _id("red"),
            "organization_id": org_id,
            "barber_id": barber["barber_id"],
            "employee_name": barber.get("display_name") or barber.get("name"),
            "benefit_id": benefit_id,
            "benefit_name": benefit["name"],
            "points_cost": benefit["points_cost"],
            "status": "pending",
            "created_at": _now(),
        }
        await db.hr_redemptions.insert_one(dict(row))
        await add_ledger(
            org_id, barber["barber_id"], -benefit["points_cost"], f"Canje: {benefit['name']}", row["redemption_id"]
        )
        return row

    @router.get("/hr/benefits", tags=["hr"])
    async def manager_benefits(
        organization_id: Optional[str] = None,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        user = await get_current_user(authorization, session_token)
        org_id = await manager_org(user, organization_id)
        catalog = await db.hr_benefits.find({"organization_id": org_id}, {"_id": 0}).to_list(500)
        redemptions = await db.hr_redemptions.find({"organization_id": org_id}, {"_id": 0}).to_list(2000)
        redemptions.sort(key=lambda r: r["created_at"], reverse=True)
        barbers = await db.barbers.find({"organization_id": org_id}, {"_id": 0}).to_list(500)
        balances = [
            {
                "barber_id": b["barber_id"],
                "name": b.get("display_name") or b.get("name"),
                "balance": await balance_of(org_id, b["barber_id"]),
            }
            for b in barbers
        ]
        return {"catalog": catalog, "redemptions": redemptions, "balances": balances}

    @router.post("/hr/benefits", tags=["hr"])
    async def create_benefit(
        data: BenefitIn, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)
    ):
        user = await get_current_user(authorization, session_token)
        org_id = await manager_org(user, data.organization_id)
        doc = {
            **data.model_dump(exclude={"organization_id"}),
            "benefit_id": _id("ben"),
            "organization_id": org_id,
            "created_at": _now(),
        }
        await db.hr_benefits.insert_one(dict(doc))
        return doc

    @router.put("/hr/benefits/{benefit_id}", tags=["hr"])
    async def update_benefit(
        benefit_id: str,
        data: BenefitIn,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        user = await get_current_user(authorization, session_token)
        org_id = await manager_org(user, data.organization_id)
        found = await db.hr_benefits.find_one({"benefit_id": benefit_id, "organization_id": org_id}, {"_id": 0})
        if not found:
            raise HTTPException(status_code=404, detail="Beneficio no encontrado")
        changes = data.model_dump(exclude={"organization_id"})
        await db.hr_benefits.update_one({"benefit_id": benefit_id, "organization_id": org_id}, {"$set": changes})
        return {**found, **changes}

    @router.delete("/hr/benefits/{benefit_id}", tags=["hr"])
    async def delete_benefit(
        benefit_id: str,
        organization_id: Optional[str] = None,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        user = await get_current_user(authorization, session_token)
        org_id = await manager_org(user, organization_id)
        found = await db.hr_benefits.find_one({"benefit_id": benefit_id, "organization_id": org_id}, {"_id": 0})
        if not found:
            raise HTTPException(status_code=404, detail="Beneficio no encontrado")
        await db.hr_benefits.update_one(
            {"benefit_id": benefit_id, "organization_id": org_id}, {"$set": {"active": False}}
        )  # conserva el historial de canjes
        return {"archived": True}

    @router.post("/hr/benefits/grant", tags=["hr"])
    async def grant_points(
        data: GrantIn, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)
    ):
        user = await get_current_user(authorization, session_token)
        org_id = await manager_org(user, data.organization_id)
        await employee_name(org_id, data.barber_id)
        if data.points < 0 and await balance_of(org_id, data.barber_id) + data.points < 0:
            raise HTTPException(status_code=409, detail="El saldo no puede quedar negativo")
        await add_ledger(org_id, data.barber_id, data.points, data.reason.strip())
        return {"balance": await balance_of(org_id, data.barber_id)}

    @router.post("/hr/benefits/redemptions/{redemption_id}/decide", tags=["hr"])
    async def decide_redemption(
        redemption_id: str,
        data: DecideIn,
        organization_id: Optional[str] = None,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        user = await get_current_user(authorization, session_token)
        org_id = await manager_org(user, organization_id)
        row = await db.hr_redemptions.find_one({"redemption_id": redemption_id, "organization_id": org_id}, {"_id": 0})
        if not row:
            raise HTTPException(status_code=404, detail="Canje no encontrado")
        if row["status"] != "pending":
            raise HTTPException(status_code=409, detail="Este canje ya fue resuelto")
        changes = {
            "status": "approved" if data.approve else "rejected",
            "decided_by": user.user_id,
            "decided_at": _now(),
            "decision_note": (data.note or "").strip() or None,
        }
        await db.hr_redemptions.update_one({"redemption_id": redemption_id}, {"$set": changes})
        if not data.approve:  # se devuelven los puntos retenidos
            await add_ledger(
                org_id, row["barber_id"], row["points_cost"], f"Canje rechazado: {row['benefit_name']}", redemption_id
            )
        return {**row, **changes}

    # ================================================================== referidos
    @router.get("/hr/vacancies", tags=["hr"])
    async def list_vacancies(
        organization_id: Optional[str] = None,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        user = await get_current_user(authorization, session_token)
        org_id = await manager_org(user, organization_id)
        return {"items": await db.hr_vacancies.find({"organization_id": org_id}, {"_id": 0}).to_list(500)}

    @router.post("/hr/vacancies", tags=["hr"])
    async def create_vacancy(
        data: VacancyIn, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)
    ):
        user = await get_current_user(authorization, session_token)
        org_id = await manager_org(user, data.organization_id)
        if data.reward_type == "text" and not (data.reward_text or "").strip():
            raise HTTPException(status_code=400, detail="Describe la recompensa (ej: medio día libre)")
        if data.reward_type != "text" and data.reward_value <= 0:
            raise HTTPException(status_code=400, detail="Indica el valor de la recompensa")
        doc = {
            **data.model_dump(exclude={"organization_id"}),
            "vacancy_id": _id("vac"),
            "organization_id": org_id,
            "created_at": _now(),
        }
        await db.hr_vacancies.insert_one(dict(doc))
        return doc

    @router.post("/hr/vacancies/{vacancy_id}/toggle", tags=["hr"])
    async def toggle_vacancy(
        vacancy_id: str,
        organization_id: Optional[str] = None,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        user = await get_current_user(authorization, session_token)
        org_id = await manager_org(user, organization_id)
        found = await db.hr_vacancies.find_one({"vacancy_id": vacancy_id, "organization_id": org_id}, {"_id": 0})
        if not found:
            raise HTTPException(status_code=404, detail="Vacante no encontrada")
        await db.hr_vacancies.update_one({"vacancy_id": vacancy_id}, {"$set": {"open": not found["open"]}})
        return {**found, "open": not found["open"]}

    @router.get("/staff/referrals", tags=["hr"])
    async def my_referrals(authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
        user = await get_current_user(authorization, session_token)
        barber = await own_barber(user)
        org_id = barber["organization_id"]
        vacancies = await db.hr_vacancies.find({"organization_id": org_id, "open": True}, {"_id": 0}).to_list(500)
        rows = await db.hr_referrals.find(
            {"organization_id": org_id, "referrer_id": barber["barber_id"]}, {"_id": 0}
        ).to_list(1000)
        rows.sort(key=lambda r: r["created_at"], reverse=True)
        return {
            "vacancies": vacancies,
            "items": [{**r, "stage_label": STAGE_LABELS[r["stage"]]} for r in rows],
            "stages": STAGE_LABELS,
        }

    @router.post("/staff/referrals", tags=["hr"])
    async def submit_referral(
        data: ReferralIn, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)
    ):
        user = await get_current_user(authorization, session_token)
        barber = await own_barber(user)
        org_id = barber["organization_id"]
        vacancy = await db.hr_vacancies.find_one(
            {"vacancy_id": data.vacancy_id, "organization_id": org_id, "open": True}, {"_id": 0}
        )
        if not vacancy:
            raise HTTPException(status_code=404, detail="Esa vacante ya no está abierta")
        if data.document_id:
            document = await db.hr_documents.find_one(
                {"document_id": data.document_id, "organization_id": org_id, "barber_id": barber["barber_id"]},
                {"_id": 0, "document_id": 1},
            )
            if not document:
                raise HTTPException(status_code=404, detail="Documento no encontrado")
        row = {
            "referral_id": _id("ref"),
            "organization_id": org_id,
            "vacancy_id": vacancy["vacancy_id"],
            "vacancy_title": vacancy["title"],
            "referrer_id": barber["barber_id"],
            "referrer_name": barber.get("display_name") or barber.get("name"),
            "candidate_name": data.candidate_name.strip(),
            "candidate_contact": data.candidate_contact.strip(),
            "note": (data.note or "").strip() or None,
            "document_id": data.document_id,
            "stage": "received",
            "history": [{"stage": "received", "at": _now(), "note": None}],
            "reward_status": None,
            "created_at": _now(),
        }
        await db.hr_referrals.insert_one(dict(row))
        return row

    @router.get("/hr/referrals", tags=["hr"])
    async def manager_referrals(
        organization_id: Optional[str] = None,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        user = await get_current_user(authorization, session_token)
        org_id = await manager_org(user, organization_id)
        rows = await db.hr_referrals.find({"organization_id": org_id}, {"_id": 0}).to_list(2000)
        rows.sort(key=lambda r: r["created_at"], reverse=True)
        return {"items": [{**r, "stage_label": STAGE_LABELS[r["stage"]]} for r in rows], "stages": STAGE_LABELS}

    @router.post("/hr/referrals/{referral_id}/stage", tags=["hr"])
    async def move_referral(
        referral_id: str,
        data: StageIn,
        organization_id: Optional[str] = None,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        user = await get_current_user(authorization, session_token)
        org_id = await manager_org(user, organization_id)
        row = await db.hr_referrals.find_one({"referral_id": referral_id, "organization_id": org_id}, {"_id": 0})
        if not row:
            raise HTTPException(status_code=404, detail="Referido no encontrado")
        if row["stage"] in ("hired", "rejected"):
            raise HTTPException(status_code=409, detail="Este referido ya tiene resultado final")
        changes: Dict = {
            "stage": data.stage,
            "history": [
                *row["history"],
                {"stage": data.stage, "at": _now(), "note": (data.note or "").strip() or None},
            ],
        }
        if data.stage == "hired":
            changes.update(await grant_reward(org_id, row, user.user_id))
        await db.hr_referrals.update_one({"referral_id": referral_id}, {"$set": changes})
        return {**row, **changes, "stage_label": STAGE_LABELS[data.stage]}

    async def grant_reward(org_id, referral, actor) -> dict:
        """Al contratar al referido: puntos, bono no salarial en la proxima nomina, o recompensa en especie."""
        vacancy = (
            await db.hr_vacancies.find_one(
                {"vacancy_id": referral["vacancy_id"], "organization_id": org_id}, {"_id": 0}
            )
            or {}
        )
        kind = vacancy.get("reward_type", "text")
        if kind == "points":
            points = int(vacancy.get("reward_value") or 0)
            await add_ledger(
                org_id,
                referral["referrer_id"],
                points,
                f"Referido contratado: {referral['candidate_name']}",
                referral["referral_id"],
            )
            return {"reward_status": "granted_points", "reward_detail": f"{points} puntos"}
        if kind == "amount":
            contract = await db.payroll_contracts.find_one(
                {"organization_id": org_id, "barber_id": referral["referrer_id"]}, {"_id": 0}
            )
            amount = float(vacancy.get("reward_value") or 0)
            if contract and contract.get("contract_type") == "fixed_salary":
                await db.payroll_novelties.insert_one(
                    {
                        "novelty_id": _id("nov"),
                        "organization_id": org_id,
                        "barber_id": referral["referrer_id"],
                        "employee_name": referral["referrer_name"],
                        "type": "bonus",
                        "concept": f"Bono por referido: {referral['candidate_name']}",
                        "date": datetime.now(timezone.utc).date().isoformat(),
                        "amount": amount,
                        "constitutes_salary": False,  # bono no constitutivo de salario
                        "note": "Programa de referidos",
                        "status": "approved",
                        "applied_run_id": None,
                        "decided_by": actor,
                        "created_by": actor,
                        "created_at": _now(),
                    }
                )
                return {
                    "reward_status": "added_to_payroll",
                    "reward_detail": f"$ {amount:,.0f} en la próxima nómina (no constitutivo de salario)",
                }
            return {
                "reward_status": "pending_manual",
                "reward_detail": f"$ {amount:,.0f}: el contrato no es fijo, págalo manualmente",
            }
        return {"reward_status": "to_deliver", "reward_detail": vacancy.get("reward_text") or "Recompensa por entregar"}

    # ================================================================== linea etica
    @router.post("/staff/ethics/reports", tags=["hr"])
    async def submit_report(
        data: EthicsIn, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)
    ):
        user = await get_current_user(authorization, session_token)
        barber = await own_barber(user)
        cipher = await get_cipher(db)
        code = secrets.token_hex(5).upper()
        now = datetime.now(timezone.utc)
        row = {
            "report_id": _id("eth"),
            "organization_id": barber["organization_id"],
            "tracking_code": code,
            "category": data.category,
            "message": encrypt(cipher, data.message.strip()),
            "anonymous": data.anonymous,
            # En un reporte anonimo no se guarda quien es ni la hora exacta: solo el dia.
            "barber_id": None if data.anonymous else barber["barber_id"],
            "reporter_name": None if data.anonymous else (barber.get("display_name") or barber.get("name")),
            "status": "received",
            "replies": [],
            "escalations": [],
            "created_at": now.date().isoformat() if data.anonymous else now.isoformat(),
        }
        await db.hr_ethics_reports.insert_one(dict(row))
        return {
            "tracking_code": code,
            "anonymous": data.anonymous,
            "note": "Guarda este código: es la única forma de consultar la respuesta si elegiste el anonimato.",
        }

    @router.get("/staff/ethics/reports/{code}", tags=["hr"])
    async def report_status(
        code: str, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)
    ):
        user = await get_current_user(authorization, session_token)
        row = await db.hr_ethics_reports.find_one(
            {"tracking_code": code.strip().upper(), "organization_id": getattr(user, "organization_id", None)},
            {"_id": 0},
        )
        if not row:
            raise HTTPException(status_code=404, detail="No encontramos un reporte con ese código")
        return {
            "tracking_code": row["tracking_code"],
            "status": row["status"],
            "status_label": ETHICS_STATUS[row["status"]],
            "category_label": ETHICS_CATEGORIES[row["category"]],
            "replies": row["replies"],
            "created_at": row["created_at"],
        }

    @router.get("/hr/ethics", tags=["hr"])
    async def inbox(
        organization_id: Optional[str] = None,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        user = await get_current_user(authorization, session_token)
        org_id = await manager_org(user, organization_id)
        cipher = await get_cipher(db)
        rows = await db.hr_ethics_reports.find({"organization_id": org_id}, {"_id": 0}).to_list(2000)
        rows.sort(key=lambda r: r["created_at"], reverse=True)
        items = []
        for row in rows:
            try:
                message = decrypt(cipher, row["message"])
            except Exception:
                message = "(no se pudo descifrar este mensaje)"
            items.append(
                {
                    **row,
                    "message": message,
                    "category_label": ETHICS_CATEGORIES[row["category"]],
                    "status_label": ETHICS_STATUS[row["status"]],
                }
            )
        return {"items": items}

    @router.post("/hr/ethics/{report_id}/respond", tags=["hr"])
    async def respond(
        report_id: str,
        data: EthicsRespondIn,
        organization_id: Optional[str] = None,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        user = await get_current_user(authorization, session_token)
        org_id = await manager_org(user, organization_id)
        row = await db.hr_ethics_reports.find_one({"report_id": report_id, "organization_id": org_id}, {"_id": 0})
        if not row:
            raise HTTPException(status_code=404, detail="Reporte no encontrado")
        replies = [*row["replies"], {"message": data.message.strip(), "at": _now()}]
        await db.hr_ethics_reports.update_one(
            {"report_id": report_id}, {"$set": {"replies": replies, "status": data.status}}
        )
        return {"status": data.status, "replies": replies}

    @router.post("/hr/ethics/{report_id}/escalate", tags=["hr"])
    async def escalate(
        report_id: str,
        data: EscalateIn,
        organization_id: Optional[str] = None,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        user = await get_current_user(authorization, session_token)
        org_id = await manager_org(user, organization_id)
        row = await db.hr_ethics_reports.find_one({"report_id": report_id, "organization_id": org_id}, {"_id": 0})
        if not row:
            raise HTTPException(status_code=404, detail="Reporte no encontrado")
        label = "Recursos Humanos" if data.to == "hr" else "Comité de Convivencia Laboral"
        escalations = [
            *row["escalations"],
            {
                "to": data.to,
                "to_label": label,
                "note": (data.note or "").strip() or None,
                "at": _now(),
                "by": user.user_id,
            },
        ]
        await db.hr_ethics_reports.update_one(
            {"report_id": report_id}, {"$set": {"escalations": escalations, "status": "escalated"}}
        )
        return {"status": "escalated", "escalations": escalations}

    # ================================================================== beneficiarios (CCF)
    @router.get("/staff/beneficiaries", tags=["hr"])
    async def my_beneficiaries(
        authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)
    ):
        user = await get_current_user(authorization, session_token)
        barber = await own_barber(user)
        rows = await db.hr_beneficiaries.find(
            {"organization_id": barber["organization_id"], "barber_id": barber["barber_id"]}, {"_id": 0}
        ).to_list(100)
        return {
            "items": [{**r, "relationship_label": RELATIONSHIPS[r["relationship"]]} for r in rows],
            "relationships": RELATIONSHIPS,
        }

    @router.post("/staff/beneficiaries", tags=["hr"])
    async def add_beneficiary(
        data: BeneficiaryIn, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)
    ):
        user = await get_current_user(authorization, session_token)
        barber = await own_barber(user)
        if data.birth_date:
            try:
                date.fromisoformat(data.birth_date)
            except ValueError:
                raise HTTPException(status_code=400, detail="La fecha de nacimiento debe ser AAAA-MM-DD")
        if data.document_id:
            document = await db.hr_documents.find_one(
                {
                    "document_id": data.document_id,
                    "organization_id": barber["organization_id"],
                    "barber_id": barber["barber_id"],
                },
                {"_id": 0, "document_id": 1},
            )
            if not document:
                raise HTTPException(status_code=404, detail="Documento no encontrado")
        row = {
            **data.model_dump(),
            "beneficiary_id": _id("bnf"),
            "organization_id": barber["organization_id"],
            "barber_id": barber["barber_id"],
            "created_at": _now(),
        }
        await db.hr_beneficiaries.insert_one(dict(row))
        return {**row, "relationship_label": RELATIONSHIPS[row["relationship"]]}

    @router.delete("/staff/beneficiaries/{beneficiary_id}", tags=["hr"])
    async def remove_beneficiary(
        beneficiary_id: str, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)
    ):
        user = await get_current_user(authorization, session_token)
        barber = await own_barber(user)
        row = await db.hr_beneficiaries.find_one(
            {
                "beneficiary_id": beneficiary_id,
                "organization_id": barber["organization_id"],
                "barber_id": barber["barber_id"],
            },
            {"_id": 0},
        )
        if not row:
            raise HTTPException(status_code=404, detail="Beneficiario no encontrado")
        await db.hr_beneficiaries.delete_one({"beneficiary_id": beneficiary_id})
        return {"deleted": True}

    @router.get("/hr/beneficiaries", tags=["hr"])
    async def manager_beneficiaries(
        organization_id: Optional[str] = None,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        user = await get_current_user(authorization, session_token)
        org_id = await manager_org(user, organization_id)
        rows = await db.hr_beneficiaries.find({"organization_id": org_id}, {"_id": 0}).to_list(2000)
        names = {
            b["barber_id"]: b.get("display_name") or b.get("name")
            for b in await db.barbers.find({"organization_id": org_id}, {"_id": 0}).to_list(500)
        }
        return {
            "items": [
                {
                    **r,
                    "employee_name": names.get(r["barber_id"]),
                    "relationship_label": RELATIONSHIPS[r["relationship"]],
                }
                for r in rows
            ]
        }

    return router


async def ensure_wellbeing_indexes(db):
    await db.hr_points_ledger.create_index([("organization_id", 1), ("barber_id", 1)], name="hr_points_ledger_barber")
    await db.hr_ethics_reports.create_index("tracking_code", unique=True, name="hr_ethics_code_unique")
    await db.hr_referrals.create_index([("organization_id", 1), ("referrer_id", 1)], name="hr_referrals_referrer")
