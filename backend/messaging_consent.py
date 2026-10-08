"""Consentimiento de mensajes de texto / WhatsApp (recordatorios y confirmaciones de citas).

En Estados Unidos (TCPA y la ley de telemarketing de Florida) un negocio no debe enviar textos a un cliente sin su
consentimiento registrado y debe respetar la baja (STOP). Los recordatorios y confirmaciones no son marketing, pero
igual requieren consentimiento para el canal de texto. Se guarda cuando, desde donde (IP) y con que texto exacto lo
acepto.
Colombia no cambia: el perfil de pais decide si se exige (``messaging_consent_required``).

Apoyo tecnico, no asesoria legal: el texto de consentimiento y la conservacion de pruebas debe validarlos un abogado.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional, Tuple

from fastapi import APIRouter, Cookie, Depends, Header, HTTPException
from pydantic import BaseModel, ConfigDict

from country_profiles import profile_for

CONSENT_VERSION = "us-2026-10"
MAX_TEXT = 600
STOP_FOOTER_EN = "Reply STOP to opt out."
STOP_FOOTER_ES = "Responde STOP para dejar de recibir mensajes."


def consent_fields(consent: bool, text: Optional[str], ip: Optional[str], now: Optional[str] = None) -> dict:
    """Campos a guardar en el cliente cuando acepta recibir textos (vacio si no acepto)."""
    if not consent:
        return {}
    return {
        "messaging_consent": True,
        "messaging_consent_at": now or datetime.now(timezone.utc).isoformat(),
        "messaging_consent_text": (text or "").strip()[:MAX_TEXT] or None,
        "messaging_consent_ip": ip,
        "messaging_consent_version": CONSENT_VERSION,
        "messaging_opt_out_at": None,  # un consentimiento nuevo y expreso reemplaza una baja anterior
    }


def messaging_status(client: Optional[dict], organization: Optional[dict]) -> Tuple[bool, Optional[str]]:
    """(puede recibir textos, motivo). Colombia no exige consentimiento de canal; Estados Unidos si."""
    client = client or {}
    # Una baja (STOP) se respeta en cualquier pais.
    if client.get("messaging_opt_out_at"):
        return False, "opted_out"
    if not profile_for(organization)["messaging_consent_required"]:
        return True, None
    if client.get("messaging_consent") is not True:
        return False, "no_consent"
    return True, None


def stop_footer(language: str) -> str:
    return STOP_FOOTER_EN if language == "en" else STOP_FOOTER_ES


class OptOutRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    opted_out: bool = True
    organization_id: Optional[str] = None


class ClientPreferenceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enabled: bool
    text: Optional[str] = None


def build_messaging_consent_router(
    db, get_current_user, require_management_role, resolve_team_organization, get_current_client
):
    router = APIRouter()

    @router.post("/clients/{client_id}/messaging-opt-out", tags=["clients"])
    async def set_client_opt_out(
        client_id: str,
        data: OptOutRequest,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        """El manager registra que el cliente respondio STOP (o lo revierte si lo pide de nuevo)."""
        user = await get_current_user(authorization, session_token)
        require_management_role(user)
        organization_id = await resolve_team_organization(user, data.organization_id)
        client = await db.clients.find_one({"client_id": client_id, "organization_id": organization_id}, {"_id": 0})
        if not client:
            raise HTTPException(404, "Cliente no encontrado en esta organización")
        now = datetime.now(timezone.utc).isoformat()
        update = {"messaging_opt_out_at": now if data.opted_out else None, "messaging_opt_out_source": "manager"}
        await db.clients.update_one({"client_id": client_id, "organization_id": organization_id}, {"$set": update})
        return {"client_id": client_id, "opted_out": data.opted_out}

    @router.get("/public/clients/messaging-consent", tags=["public-client-portal"])
    async def get_my_preference(current_client=Depends(get_current_client)):
        client = await db.clients.find_one({"client_id": current_client.client_id}, {"_id": 0})
        organization = await db.organizations.find_one(
            {"organization_id": current_client.organization_id}, {"_id": 0, "operating_country": 1}
        )
        allowed, reason = messaging_status(client, organization)
        return {
            "required": profile_for(organization)["messaging_consent_required"],
            "enabled": allowed,
            "reason": reason,
        }

    @router.put("/public/clients/messaging-consent", tags=["public-client-portal"])
    async def set_my_preference(data: ClientPreferenceRequest, current_client=Depends(get_current_client)):
        """El cliente activa o desactiva los textos desde su cuenta (queda registrado con fecha y texto)."""
        now = datetime.now(timezone.utc).isoformat()
        if data.enabled:
            update = consent_fields(True, data.text, None, now)
            update["messaging_consent_source"] = "client_portal"
        else:
            update = {"messaging_opt_out_at": now, "messaging_opt_out_source": "client_portal"}
        await db.clients.update_one({"client_id": current_client.client_id}, {"$set": update})
        return {"enabled": data.enabled}

    return router
