# NEXUS_REVIEW_REQUEST_WHATSAPP_MOCK_V1
# NEXUS_WHATSAPP_CLOUD_API_V1
"""
Envío de WhatsApp -- WhatsApp Business Platform (Meta Cloud API) cuando hay
credenciales configuradas; mock cuando no las hay.

WHATSAPP_ACCESS_TOKEN y WHATSAPP_PHONE_NUMBER_ID son las dos variables que
determinan el modo: si ambas están presentes, cada envío llama a la Graph
API real; si falta cualquiera de las dos, se sigue registrando en
`whatsapp_mock_outbox` (para verificar en Mongo qué se habría enviado) y por
stdout, exactamente como antes. No hay que tocar ningún llamador para pasar
de un modo a otro -- ambos siguen dependiendo solo de la firma de
`send_whatsapp_message` y de la forma de su valor de retorno
(`{"accepted": bool, "provider": str}`).

Restricción real de la Cloud API que no existía en el mock: un negocio no
puede mandar texto libre a un número que no le escribió en las últimas 24
horas -- todo mensaje que la empresa inicia (recordatorios, alertas de
stock) tiene que ser una "plantilla" pre-aprobada por Meta, no el cuerpo
libre que ya arma message_templates.py. Para no romper la promesa de "ningún
otro archivo necesita cambiar" que tenían los llamadores existentes
(low_stock_alerts.py, y el futuro canal de recordatorios), el `message` de
texto libre que ya mandan se envía como la única variable {{1}} de UNA
plantilla genérica y ya aprobada (su nombre viene de
WHATSAPP_GENERIC_TEMPLATE_NAME). Esa plantilla ("aviso_general" o el nombre
que el usuario registre) es lo único que hay que dar de alta y aprobar en
Meta para que esto funcione -- ver el checklist en la bitácora del
proyecto. Si Meta rechaza una plantilla tan genérica y exige una por cada
tipo de mensaje, este módulo seguiría funcionando para lo que sí se apruebe;
solo habría que separar `WHATSAPP_GENERIC_TEMPLATE_NAME` por contexto en un
cambio posterior, no hoy.
"""

from __future__ import annotations

import os
from datetime import datetime, timezone

import httpx

from appointment_email_delivery import recipient_fingerprint

GRAPH_API_VERSION = os.getenv("WHATSAPP_API_VERSION", "v21.0")
GRAPH_API_BASE_URL = os.getenv("WHATSAPP_GRAPH_API_BASE_URL", "https://graph.facebook.com")
DEFAULT_TEMPLATE_LANGUAGE = os.getenv("WHATSAPP_TEMPLATE_LANGUAGE", "es")


def _access_token() -> str:
    return os.getenv("WHATSAPP_ACCESS_TOKEN", "")


def _phone_number_id() -> str:
    return os.getenv("WHATSAPP_PHONE_NUMBER_ID", "")


def _generic_template_name() -> str:
    return os.getenv("WHATSAPP_GENERIC_TEMPLATE_NAME", "")


def is_configured() -> bool:
    """True once real credentials exist. A function, not a module-level
    constant, so tests (and a live env-var change) don't need a reimport to
    see the current state."""
    return bool(_access_token()) and bool(_phone_number_id())


async def _log_mock(db, *, to_phone: str, message: str, organization_id: str, context: str) -> dict:
    now = datetime.now(timezone.utc)
    fingerprint = recipient_fingerprint(to_phone)
    record = {
        "to_phone": to_phone,
        "message": message,
        "organization_id": organization_id,
        "context": context,
        "sent_at": now.isoformat(),
        "provider": "mock",
    }
    await db.whatsapp_mock_outbox.insert_one(record.copy())
    print(f"whatsapp_mock_sent recipient_fingerprint={fingerprint} context={context} organization_id={organization_id}")
    return {"accepted": True, "provider": "mock", "status": "sent_mock"}


async def send_whatsapp_template(
    *, to_phone: str, template_name: str, template_params: list[str], language: str = DEFAULT_TEMPLATE_LANGUAGE
) -> dict:
    """Sends one Meta-approved template message via the WhatsApp Cloud API.
    Raises RuntimeError if credentials aren't configured -- callers that want
    the mock fallback should go through send_whatsapp_message instead, which
    checks is_configured() first.
    """
    if not is_configured():
        raise RuntimeError("WhatsApp Cloud API credentials are not configured")
    url = f"{GRAPH_API_BASE_URL}/{GRAPH_API_VERSION}/{_phone_number_id()}/messages"
    payload = {
        "messaging_product": "whatsapp",
        "to": to_phone,
        "type": "template",
        "template": {
            "name": template_name,
            "language": {"code": language},
            "components": (
                [{"type": "body", "parameters": [{"type": "text", "text": p} for p in template_params]}]
                if template_params
                else []
            ),
        },
    }
    async with httpx.AsyncClient() as client:
        response = await client.post(
            url,
            headers={"Authorization": f"Bearer {_access_token()}"},
            json=payload,
            timeout=15.0,
        )
    if response.status_code >= 400:
        return {
            "accepted": False,
            "provider": "whatsapp_cloud_api",
            "status": f"http_{response.status_code}",
            "detail": response.text,
        }
    body = response.json()
    message_id = (body.get("messages") or [{}])[0].get("id")
    return {"accepted": True, "provider": "whatsapp_cloud_api", "status": "sent", "message_id": message_id}


async def send_whatsapp_message(
    db, *, to_phone: str, message: str, organization_id: str, context: str = "generic"
) -> dict:
    if not to_phone:
        return {
            "accepted": False,
            "provider": "mock" if not is_configured() else "whatsapp_cloud_api",
            "status": "missing_recipient",
        }

    if not is_configured():
        return await _log_mock(db, to_phone=to_phone, message=message, organization_id=organization_id, context=context)

    template_name = _generic_template_name()
    if not template_name:
        return {"accepted": False, "provider": "whatsapp_cloud_api", "status": "missing_template_configuration"}

    fingerprint = recipient_fingerprint(to_phone)
    try:
        result = await send_whatsapp_template(to_phone=to_phone, template_name=template_name, template_params=[message])
    except httpx.HTTPError as exc:
        print(
            f"whatsapp_send_failed recipient_fingerprint={fingerprint} context={context} organization_id={organization_id} diagnostic_code={type(exc).__name__}"
        )
        return {"accepted": False, "provider": "whatsapp_cloud_api", "status": "request_failed"}
    if result.get("accepted"):
        print(f"whatsapp_sent recipient_fingerprint={fingerprint} context={context} organization_id={organization_id}")
    else:
        print(
            f"whatsapp_rejected recipient_fingerprint={fingerprint} context={context} organization_id={organization_id} status={result.get('status')}"
        )
    return result
