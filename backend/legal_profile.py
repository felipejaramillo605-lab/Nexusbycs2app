"""Datos legales del Responsable y aceptacion electronica del contrato.

* Publicos (politica de privacidad): nombre, municipio, correo y telefono de atencion de solicitudes.
* **Solo para usuarios registrados que aceptaron el contrato vigente**: documento de identidad y direccion completa.
  No estan en el repositorio ni en el codigo del frontend: viven en la base de datos y se editan desde el panel Owner.
* La aceptacion (Ley 527 de 1999: mensaje de datos) guarda usuario, organizacion, rol, version, huella del texto,
  fecha/hora, IP y navegador, una sola vez por usuario y version.
"""

from __future__ import annotations

import hashlib
import os
import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Cookie, Header, HTTPException, Request
from pydantic import BaseModel, Field

from audit_contracts import record_audit_event

SETTINGS_ID = "legal_profile"
PUBLIC_FIELDS = ("full_name", "municipality", "email", "phone")
PRIVATE_FIELDS = ("document_type", "document_number", "full_address")
EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def current_version() -> str:
    return os.getenv("LEGAL_DOCS_VERSION", "2.0-borrador").strip() or "2.0-borrador"


class LegalProfileIn(BaseModel):
    full_name: str = Field(min_length=3, max_length=120)
    municipality: str = Field(min_length=2, max_length=120)
    email: str = Field(min_length=5, max_length=254)
    phone: str = Field(min_length=7, max_length=30)
    document_type: str = Field(default="CC", pattern="^(CC|CE|NIT|PASAPORTE)$")
    document_number: str = Field(min_length=5, max_length=20)
    full_address: str = Field(min_length=5, max_length=250)


class AcceptIn(BaseModel):
    version: str = Field(min_length=1, max_length=40)
    document_hash: str | None = Field(default=None, max_length=128)


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "").split(",", 1)[0].strip()
    return forwarded or (request.client.host if request.client else "unknown")


def build_legal_router(db, get_current_user):
    router = APIRouter()

    async def _user(authorization, session_token):
        user = await get_current_user(authorization, session_token)
        if getattr(user, "access_status", "approved") != "approved":
            raise HTTPException(status_code=403, detail="Approved account required")
        return user

    async def _owner(authorization, session_token):
        user = await _user(authorization, session_token)
        if user.role != "owner":
            raise HTTPException(status_code=403, detail="Owner access required")
        return user

    async def _profile():
        return await db.platform_settings.find_one({"settings_id": SETTINGS_ID}, {"_id": 0}) or {}

    @router.get("/legal/responsible", tags=["legal"])
    async def responsible(authorization: str | None = Header(None), session_token: str | None = Cookie(None)):
        user = await _user(authorization, session_token)
        profile = await _profile()
        version = current_version()
        accepted = user.role == "owner" or bool(
            await db.legal_acceptances.find_one({"user_id": user.user_id, "version": version}, {"_id": 0, "user_id": 1})
        )
        body = {
            "version": version,
            "accepted": accepted,
            "configured": bool(profile),
            "public": {field: profile.get(field) for field in PUBLIC_FIELDS},
            "private": None,
        }
        if accepted and profile:
            body["private"] = {field: profile.get(field) for field in PRIVATE_FIELDS}
        return body

    @router.post("/legal/accept", tags=["legal"])
    async def accept(
        data: AcceptIn,
        request: Request,
        authorization: str | None = Header(None),
        session_token: str | None = Cookie(None),
    ):
        user = await _user(authorization, session_token)
        version = current_version()
        if data.version != version:
            raise HTTPException(status_code=409, detail="La versión del contrato cambió; recarga la página")
        existing = await db.legal_acceptances.find_one({"user_id": user.user_id, "version": version}, {"_id": 0})
        if existing:
            return {"accepted": True, "already": True, "accepted_at": existing["accepted_at"], "version": version}
        now = datetime.now(timezone.utc).isoformat()
        record = {
            "acceptance_id": "lacc_" + uuid.uuid4().hex,
            "user_id": user.user_id,
            "organization_id": getattr(user, "organization_id", None),
            "role": user.role,
            "version": version,
            "document_hash": (data.document_hash or "")[:128] or None,
            "accepted_at": now,
            "ip": _client_ip(request),
            "user_agent_hash": hashlib.sha256(request.headers.get("user-agent", "").encode()).hexdigest()[:32],
        }
        await db.legal_acceptances.insert_one(dict(record))
        await record_audit_event(
            db,
            category="account",
            event_type="legal_terms_accepted",
            actor_user_id=user.user_id,
            organization_id=record["organization_id"],
            entity_type="legal_acceptance",
            entity_id=record["acceptance_id"],
            new_value={"version": version},
        )
        return {"accepted": True, "already": False, "accepted_at": now, "version": version}

    @router.get("/owner/legal-profile", tags=["owner-legal"])
    async def get_profile(authorization: str | None = Header(None), session_token: str | None = Cookie(None)):
        await _owner(authorization, session_token)
        profile = await _profile()
        total = await db.legal_acceptances.count_documents({"version": current_version()})
        return {"version": current_version(), "profile": profile or None, "acceptances_current_version": total}

    @router.put("/owner/legal-profile", tags=["owner-legal"])
    async def put_profile(
        data: LegalProfileIn, authorization: str | None = Header(None), session_token: str | None = Cookie(None)
    ):
        owner = await _owner(authorization, session_token)
        if not EMAIL_PATTERN.match(data.email.strip()):
            raise HTTPException(status_code=422, detail="Escribe un correo válido")
        document = {
            "settings_id": SETTINGS_ID,
            "full_name": data.full_name.strip(),
            "municipality": data.municipality.strip(),
            "email": data.email.strip().lower(),
            "phone": data.phone.strip(),
            "document_type": data.document_type,
            "document_number": re.sub(r"[^0-9A-Za-z]", "", data.document_number),
            "full_address": data.full_address.strip(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "updated_by": owner.user_id,
        }
        await db.platform_settings.update_one({"settings_id": SETTINGS_ID}, {"$set": document}, upsert=True)
        await record_audit_event(
            db,
            category="account",
            event_type="legal_profile_updated",
            actor_user_id=owner.user_id,
            entity_type="legal_profile",
            entity_id=SETTINGS_ID,
            new_value={"fields": sorted(k for k in document if k not in {"settings_id", "updated_at", "updated_by"})},
        )
        return {"saved": True}

    return router


async def ensure_legal_indexes(db):
    await db.legal_acceptances.create_index(
        [("user_id", 1), ("version", 1)], unique=True, name="legal_acceptances_user_version_unique"
    )
