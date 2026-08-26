# NEXUS_REVIEW_REQUEST_WHATSAPP_MOCK_V1
"""
Envío de WhatsApp — modo mock.

No existe todavía una API key de WhatsApp Business, así que este módulo no
llama a ningún proveedor real. En su lugar, registra cada envío simulado en
la colección `whatsapp_mock_outbox` (para poder verificar en Mongo/futuro
dashboard qué se habría enviado) y por stdout.

Cuando exista la API key real: el único cambio necesario es reemplazar el
cuerpo de `send_whatsapp_message` por la llamada real (Twilio / WhatsApp
Business Cloud API). Ningún otro archivo del backend necesita cambiar,
porque todos los llamadores solo dependen de la firma de esta función y de
la forma de su valor de retorno (`{"accepted": bool, "provider": str}`).
"""
from __future__ import annotations

from datetime import datetime, timezone

from appointment_email_delivery import recipient_fingerprint

# Flip a False (o a una variable de entorno) cuando haya API key real configurada.
MOCK_MODE = True


async def send_whatsapp_message(db, *, to_phone: str, message: str, organization_id: str, context: str = "generic") -> dict:
    if not to_phone:
        return {"accepted": False, "provider": "mock", "status": "missing_recipient"}

    if MOCK_MODE:
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

    # Integración real (Twilio / WhatsApp Business Cloud API) va aquí cuando
    # exista la API key. Mantener la misma firma y el mismo shape de retorno.
    raise NotImplementedError("WhatsApp real todavía no está configurado (falta API key).")
