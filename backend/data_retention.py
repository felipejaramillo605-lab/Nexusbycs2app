"""Retencion y supresion de datos personales (Ley 1581/2012: finalidad, temporalidad y derecho de supresion).

Politica (docs/legal/07-retencion-y-subencargados.md):
* Solicitudes de supresion de clientes finales (`clients.deletion_requested_at`): se anonimiza al ejecutar.
* Clientes inactivos mas de 2 anos (sin visita ni actividad): se anonimizan.
* Registros de auditoria de mas de 2 anos: solo se REPORTAN (archivar/suprimir lo decide el Owner con el abogado).

Anonimizar = quitar los datos que identifican a la persona (nombre, telefono, correo, PIN, cumpleanos,
consentimientos con IP)
y conservar lo agregado (visitas, puntos). Las citas del cliente tambien se anonimizan; los soportes contables de cada
negocio no se tocan. Nada se ejecuta solo: el Owner revisa el plan (simulacion) y confirma con una frase.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Cookie, Header, HTTPException
from pydantic import BaseModel, Field

from audit_contracts import record_audit_event

INACTIVITY_DAYS = 730
AUDIT_RETENTION_DAYS = 730
CONFIRMATION_PHRASE = "EJECUTAR RETENCION"
DELETED_NAME = "Cliente eliminado"


def _parse(value):
    if not value:
        return None
    if isinstance(value, datetime):
        moment = value
    else:
        try:
            moment = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except ValueError:
            return None
    return moment if moment.tzinfo else moment.replace(tzinfo=timezone.utc)


def last_activity(client: dict):
    """Ultima actividad conocida: ultima visita o, si no hay, la creacion del registro."""
    return _parse(client.get("last_visit")) or _parse(client.get("created_at"))


def classify(client: dict, now: datetime):
    """Devuelve 'deletion_request', 'inactive' o None. Los ya anonimizados no vuelven a entrar."""
    if client.get("anonymized_at"):
        return None
    if client.get("deletion_requested_at"):
        return "deletion_request"
    activity = last_activity(client)
    if activity and activity < now - timedelta(days=INACTIVITY_DAYS):
        return "inactive"
    return None


def anonymized_fields(client: dict, now: datetime, reason: str) -> dict:
    return {
        "name": DELETED_NAME,
        "phone": "anonimizado-" + client["client_id"],
        "email": None,
        "pin_hash": None,
        "pin_reset_token": None,
        "birthday": None,
        "accepts_marketing": False,
        "marketing_consent_text": None,
        "marketing_consent_ip": None,
        "is_registered": False,
        "anonymized_at": now.isoformat(),
        "anonymization_reason": reason,
        "updated_at": now.isoformat(),
    }


async def build_plan(db, now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    counts = {"deletion_request": 0, "inactive": 0}
    samples = {"deletion_request": [], "inactive": []}
    async for client in db.clients.find({"anonymized_at": {"$exists": False}}, {"_id": 0}):
        reason = classify(client, now)
        if reason:
            counts[reason] += 1
            if len(samples[reason]) < 5:
                samples[reason].append(
                    {"client_id": client["client_id"], "organization_id": client.get("organization_id")}
                )
    cutoff = (now - timedelta(days=AUDIT_RETENTION_DAYS)).isoformat()
    old_audit = await db.platform_audit_log.count_documents({"created_at": {"$lt": cutoff}})
    return {
        "generated_at": now.isoformat(),
        "inactivity_days": INACTIVITY_DAYS,
        "deletion_requests": counts["deletion_request"],
        "inactive_clients": counts["inactive"],
        "audit_events_older_than_retention": old_audit,
        "samples": samples,
    }


async def anonymize_client(db, client: dict, now: datetime, reason: str):
    original_phone = client.get("phone")
    await db.clients.update_one({"client_id": client["client_id"]}, {"$set": anonymized_fields(client, now, reason)})
    if original_phone:
        await db.appointments.update_many(
            {"organization_id": client.get("organization_id"), "client_phone": original_phone},
            {
                "$set": {
                    "client_name": DELETED_NAME,
                    "client_phone": "anonimizado-" + client["client_id"],
                    "client_email": "",
                }
            },
        )
    await db.data_requests.update_many(
        {"client_id": client["client_id"], "type": "deletion", "status": {"$ne": "completed"}},
        {"$set": {"status": "completed", "completed_at": now.isoformat()}},
    )


async def run_retention(db, owner_user_id: str, now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    done = {"deletion_request": 0, "inactive": 0}
    async for client in db.clients.find({"anonymized_at": {"$exists": False}}, {"_id": 0}):
        reason = classify(client, now)
        if reason:
            await anonymize_client(db, client, now, reason)
            done[reason] += 1
    result = {
        "run_id": "ret_" + uuid.uuid4().hex,
        "executed_at": now.isoformat(),
        "executed_by": owner_user_id,
        "anonymized_deletion_requests": done["deletion_request"],
        "anonymized_inactive": done["inactive"],
    }
    await db.retention_runs.insert_one(dict(result))
    await record_audit_event(
        db,
        category="account",
        event_type="data_retention_executed",
        actor_user_id=owner_user_id,
        entity_type="retention_run",
        entity_id=result["run_id"],
        new_value={k: result[k] for k in ("anonymized_deletion_requests", "anonymized_inactive")},
    )
    return result


class RunIn(BaseModel):
    confirmation: str = Field(max_length=60)


def build_retention_router(db, get_current_user):
    router = APIRouter()

    async def _owner(authorization, session_token):
        user = await get_current_user(authorization, session_token)
        if user.role != "owner":
            raise HTTPException(status_code=403, detail="Owner access required")
        return user

    @router.get("/owner/retention/plan", tags=["owner-retention"])
    async def plan(authorization: str | None = Header(None), session_token: str | None = Cookie(None)):
        await _owner(authorization, session_token)
        return await build_plan(db)

    @router.post("/owner/retention/run", tags=["owner-retention"])
    async def run(data: RunIn, authorization: str | None = Header(None), session_token: str | None = Cookie(None)):
        owner = await _owner(authorization, session_token)
        if data.confirmation.strip() != CONFIRMATION_PHRASE:
            raise HTTPException(status_code=400, detail=f"Escribe exactamente: {CONFIRMATION_PHRASE}")
        return await run_retention(db, owner.user_id)

    return router
