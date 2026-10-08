"""Authenticated, tenant-scoped manual WhatsApp delivery.

Only the server resolves recipients and operational appointment data. Promotional
content (including birthday/reactivation messages) always requires explicit consent.
"""

from datetime import datetime
from typing import Literal, Optional

from fastapi import APIRouter, Cookie, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field

import whatsapp_service
from country_profiles import FEATURE_MARKETING, assert_feature_enabled, profile_for
from messaging_consent import messaging_status, stop_footer
from marketing_window import blocked_message as marketing_blocked_message, marketing_allowed

NO_CONSENT_MESSAGE = (
    "El cliente no ha aceptado recibir mensajes de texto o WhatsApp. "
    "Pídele que lo autorice al reservar o desde su cuenta."
)


class ClientWhatsAppRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["reminder", "promotion", "operational_notice"]
    message: Optional[str] = Field(default=None, max_length=2000)
    organization_id: Optional[str] = None


def build_client_whatsapp_router(
    db, get_current_user, require_management_role, resolve_team_organization, organization_timezone
):
    router = APIRouter()

    @router.post("/clients/{client_id}/messages/whatsapp")
    async def send_client_whatsapp(
        client_id: str,
        data: ClientWhatsAppRequest,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        user = await get_current_user(authorization, session_token)
        require_management_role(user)
        organization_id = await resolve_team_organization(user, data.organization_id)
        client = await db.clients.find_one(
            {"client_id": client_id, "organization_id": organization_id},
            {
                "_id": 0,
                "name": 1,
                "phone": 1,
                "accepts_marketing": 1,
                "messaging_consent": 1,
                "messaging_opt_out_at": 1,
            },
        )
        if not client:
            raise HTTPException(404, "Cliente no encontrado en esta organización")
        organization = await db.organizations.find_one({"organization_id": organization_id}, {"_id": 0})
        language = profile_for(organization)["portal_language"]
        if data.kind == "promotion":
            # Estados Unidos: la publicidad por WhatsApp esta deshabilitada hasta validar TCPA / FTSA.
            assert_feature_enabled(organization, FEATURE_MARKETING, plain=True)
        allowed, reason = messaging_status(client, organization)
        if not allowed:
            raise HTTPException(
                403,
                ("El cliente pidió no recibir más mensajes (STOP)." if reason == "opted_out" else NO_CONSENT_MESSAGE),
            )
        if data.kind == "promotion" and client.get("accepts_marketing") is not True:
            raise HTTPException(403, "El cliente no autorizó mensajes de marketing")
        if data.kind == "promotion" and not marketing_allowed():
            # Ley 2300 de 2023: horario y dias habiles para publicidad (los recordatorios no son publicidad).
            raise HTTPException(409, marketing_blocked_message())
        if not client.get("phone"):
            raise HTTPException(400, "El cliente no tiene un teléfono registrado")

        if data.kind == "reminder":
            # Ignore arbitrary text for reminders: they must describe a real,
            # future, confirmed appointment within this client's organization.
            _, tz = organization_timezone(organization)
            now = datetime.now(tz)
            date, time = now.date().isoformat(), now.strftime("%H:%M")
            appointment = await db.appointments.find_one(
                {
                    "organization_id": organization_id,
                    "client_phone": client["phone"],
                    "status": "confirmed",
                    "$or": [{"date": {"$gt": date}}, {"date": date, "time": {"$gt": time}}],
                },
                {"_id": 0, "date": 1, "time": 1, "service_id": 1},
                sort=[("date", 1), ("time", 1)],
            )
            if not appointment:
                raise HTTPException(400, "El cliente no tiene una cita futura confirmada")
            service = await db.services.find_one(
                {"service_id": appointment.get("service_id"), "organization_id": organization_id},
                {"_id": 0, "name": 1},
            )
            if language == "en":
                message = (
                    f"Hi {client.get('name', 'there')}, this is a reminder of your appointment at "
                    f"{(organization or {}).get('name', 'Nexus')}: "
                    f"{appointment['date']} at {appointment['time']}. "
                    f"Service: {(service or {}).get('name', 'Booked service')}."
                )
            else:
                message = (
                    f"Hola {client.get('name', 'cliente')}, te recordamos tu cita en "
                    f"{(organization or {}).get('name', 'Nexus')}: "
                    f"{appointment['date']} a las {appointment['time']}. "
                    f"Servicio: {(service or {}).get('name', 'Servicio reservado')}."
                )
        else:
            message = (data.message or "").strip()
            if not message:
                raise HTTPException(400, "Escribe el contenido del mensaje")
        if profile_for(organization)["messaging_consent_required"] and "STOP" not in message.upper():
            # Los textos a clientes de EE. UU. siempre explican como darse de baja.
            message = f"{message} {stop_footer(language)}"

        result = await whatsapp_service.send_whatsapp_message(
            db,
            to_phone=client["phone"],
            message=message,
            organization_id=organization_id,
            context=f"client_{data.kind}",
            language=language,
        )
        if not result.get("accepted"):
            # Never expose provider response text, request payloads or credentials.
            raise HTTPException(502, "No fue posible enviar WhatsApp; revisa la configuración del canal")
        return {"accepted": True, "provider": result.get("provider"), "status": result.get("status")}

    return router
