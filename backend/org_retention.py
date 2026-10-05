"""Supresion definitiva de los datos de organizaciones dadas de baja (Ley 1581/2012: temporalidad y supresion).

Una organizacion eliminada queda archivada (`deleted_at`) y sus miembros se anonimizan al instante. Pasados 90 dias
(docs/legal/07) este modulo borra lo que queda: las imagenes (Cloudflare R2, espejo `media_blobs` y disco) y los
datos personales de sus clientes finales (anonimizacion, sesiones del portal). Nada corre solo: el Owner revisa la
simulacion y confirma con una frase. Si falla el borrado de algun archivo, la organizacion no se marca como purgada
y se reintenta.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Cookie, Header, HTTPException
from pydantic import BaseModel, Field

from audit_contracts import record_audit_event
from data_retention import anonymize_client
from media_mirror import mirror_delete
from owner_media_integrity import _candidate

ORG_RETENTION_DAYS = 90
CONFIRMATION_PHRASE = "PURGAR ORGANIZACIONES"
logger = logging.getLogger(__name__)


async def collect_media(db, organization_id: str) -> list[tuple[str, str, object]]:
    """(namespace, clave, ruta local) de cada imagen administrada de la organizacion (no la marca de la plataforma)."""
    urls: list[str] = []
    org = await db.organizations.find_one({"organization_id": organization_id}, {"_id": 0}) or {}
    urls += [org.get("logo_url"), org.get("portal_background_url")]
    async for row in db.services.find({"organization_id": organization_id}, {"_id": 0}):
        urls += [*(row.get("photos") or []), row.get("cover_image_url"), row.get("banner_image_url")]
    async for row in db.barbers.find({"organization_id": organization_id}, {"_id": 0}):
        urls.append(row.get("avatar"))
    async for row in db.catalog_products.find({"organization_id": organization_id}, {"_id": 0}):
        urls += list(row.get("photos") or [])
    found, seen = [], set()
    for url in urls:
        candidate = _candidate(url) if url else None
        if candidate and candidate[0] != "platform" and (candidate[0], candidate[1]) not in seen:
            seen.add((candidate[0], candidate[1]))
            found.append(candidate)
    return found


def _due_query(now: datetime) -> dict:
    cutoff = (now - timedelta(days=ORG_RETENTION_DAYS)).isoformat()
    return {"deleted_at": {"$lt": cutoff}, "purged_at": {"$exists": False}}


async def build_plan(db, now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    items = []
    async for org in db.organizations.find(_due_query(now), {"_id": 0}):
        organization_id = org["organization_id"]
        items.append(
            {
                "organization_id": organization_id,
                "name": org.get("name"),
                "deleted_at": org.get("deleted_at"),
                "media_files": len(await collect_media(db, organization_id)),
                "clients": await db.clients.count_documents(
                    {"organization_id": organization_id, "anonymized_at": {"$exists": False}}
                ),
            }
        )
    return {"generated_at": now.isoformat(), "retention_days": ORG_RETENTION_DAYS, "organizations": items}


async def purge_organization(db, org: dict, now: datetime) -> dict:
    organization_id = org["organization_id"]
    deleted, failed = 0, 0
    for namespace, key, path in await collect_media(db, organization_id):
        try:
            await mirror_delete(db, namespace, key)
            path.unlink(missing_ok=True)
            deleted += 1
        except Exception as error:  # noqa: BLE001
            failed += 1
            logger.warning("org_media_purge_failed organization_id=%s code=%s", organization_id, type(error).__name__)
    if failed == 0:
        await db.organizations.update_one(
            {"organization_id": organization_id}, {"$set": {"logo_url": None, "portal_background_url": None}}
        )
        await db.services.update_many(
            {"organization_id": organization_id},
            {"$set": {"photos": [], "cover_image_url": None, "banner_image_url": None}},
        )
        await db.barbers.update_many({"organization_id": organization_id}, {"$set": {"avatar": None}})
        await db.catalog_products.update_many({"organization_id": organization_id}, {"$set": {"photos": []}})
    anonymized = 0
    async for client in db.clients.find(
        {"organization_id": organization_id, "anonymized_at": {"$exists": False}}, {"_id": 0}
    ):
        await anonymize_client(db, client, now, "organization_deleted")
        anonymized += 1
    await db.client_sessions.delete_many({"organization_id": organization_id})
    summary = {"media_deleted": deleted, "media_failed": failed, "clients_anonymized": anonymized}
    if failed == 0:
        await db.organizations.update_one(
            {"organization_id": organization_id}, {"$set": {"purged_at": now.isoformat(), "purge_summary": summary}}
        )
    return {"organization_id": organization_id, **summary, "completed": failed == 0}


async def run_purge(db, owner_user_id: str, now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    results = []
    async for org in db.organizations.find(_due_query(now), {"_id": 0}):
        results.append(await purge_organization(db, org, now))
    run = {
        "run_id": "ret_" + uuid.uuid4().hex,
        "kind": "organization_purge",
        "executed_at": now.isoformat(),
        "executed_by": owner_user_id,
        "organizations": results,
    }
    await db.retention_runs.insert_one(dict(run))
    await record_audit_event(
        db,
        category="account",
        event_type="organization_data_purged",
        actor_user_id=owner_user_id,
        entity_type="retention_run",
        entity_id=run["run_id"],
        new_value={
            "organizations": len(results),
            "completed": sum(1 for item in results if item["completed"]),
            "media_deleted": sum(item["media_deleted"] for item in results),
            "clients_anonymized": sum(item["clients_anonymized"] for item in results),
        },
    )
    return run


class PurgeIn(BaseModel):
    confirmation: str = Field(max_length=60)


def build_org_retention_router(db, get_current_user):
    router = APIRouter()

    async def _owner(authorization, session_token):
        user = await get_current_user(authorization, session_token)
        if user.role != "owner":
            raise HTTPException(status_code=403, detail="Owner access required")
        return user

    @router.get("/owner/retention/organizations", tags=["owner-retention"])
    async def plan(authorization: str | None = Header(None), session_token: str | None = Cookie(None)):
        await _owner(authorization, session_token)
        return await build_plan(db)

    @router.post("/owner/retention/purge-organizations", tags=["owner-retention"])
    async def purge(data: PurgeIn, authorization: str | None = Header(None), session_token: str | None = Cookie(None)):
        owner = await _owner(authorization, session_token)
        if data.confirmation.strip() != CONFIRMATION_PHRASE:
            raise HTTPException(status_code=400, detail=f"Escribe exactamente: {CONFIRMATION_PHRASE}")
        return await run_purge(db, owner.user_id)

    return router
