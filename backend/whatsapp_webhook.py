"""Webhook de WhatsApp Cloud API (Meta): verificacion, mensajes entrantes y baja automatica (STOP).

* ``GET /webhooks/whatsapp`` responde el desafio de Meta solo si ``hub.verify_token`` coincide con
  ``WHATSAPP_VERIFY_TOKEN`` (sin esa variable se rechaza todo).
* ``POST /webhooks/whatsapp`` solo acepta peticiones cuya firma ``X-Hub-Signature-256`` verifica contra
  ``WHATSAPP_APP_SECRET`` (HMAC-SHA256 del cuerpo, comparacion en tiempo constante); sin el secreto responde 503.
* Un mensaje cuyo texto es exactamente una palabra de baja (STOP, BAJA...) marca a los clientes con ese telefono como
  ``messaging_opt_out_at`` en todas las organizaciones y responde una confirmacion (dentro de la ventana de 24 h).
* No se guarda el contenido de los mensajes ni se imprimen telefonos: solo contadores.

Apoyo tecnico, no asesoria legal: las palabras de baja y el texto de confirmacion deben validarlos con un abogado.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import re
import unicodedata
from datetime import datetime, timezone
from typing import Iterable, List, Optional

from fastapi import APIRouter, Header, HTTPException, Query, Request
from fastapi.responses import PlainTextResponse

logger = logging.getLogger(__name__)

MAX_BODY_BYTES = 256 * 1024
STOP_WORDS_EN = {"stop", "stopall", "unsubscribe", "quit"}
STOP_WORDS_ES = {"baja", "parar", "detener", "alto", "darme de baja", "dar de baja"}
CONFIRMATION_EN = "You will no longer receive messages from us. Reply START to receive them again."
CONFIRMATION_ES = "Listo, no recibirás más mensajes nuestros. Responde ALTA si quieres volver a recibirlos."


def verify_signature(secret: str, signature_header: Optional[str], body: bytes) -> bool:
    """``sha256=<hex>`` = HMAC-SHA256(app secret, cuerpo crudo)."""
    if not (secret and signature_header and signature_header.startswith("sha256=")):
        return False
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature_header.split("=", 1)[1].strip().lower())


def normalize_text(text: str) -> str:
    stripped = unicodedata.normalize("NFKD", str(text or "")).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z ]+", "", stripped.lower()).strip()


def stop_language(text: str) -> Optional[str]:
    """'en' / 'es' si el mensaje completo es una palabra de baja; None si no lo es (p. ej. 'para cancelar mi cita')."""
    normalized = normalize_text(text)
    if normalized in STOP_WORDS_EN:
        return "en"
    if normalized in STOP_WORDS_ES:
        return "es"
    return None


def phone_variants(wa_id: str) -> List[str]:
    digits = re.sub(r"\D", "", str(wa_id or ""))
    return [f"+{digits}", digits] if digits else []


def incoming_messages(payload: dict) -> Iterable[dict]:
    for entry in payload.get("entry", []) or []:
        for change in entry.get("changes", []) or []:
            if change.get("field") != "messages":
                continue
            for message in (change.get("value") or {}).get("messages", []) or []:
                yield message


def message_text(message: dict) -> str:
    if message.get("type") == "text":
        return (message.get("text") or {}).get("body", "")
    if message.get("type") == "button":
        return (message.get("button") or {}).get("text", "")
    return ""


def build_whatsapp_webhook_router(db, send_text):
    """``send_text(to_phone, text)`` envia la confirmacion; se inyecta para poder probarlo sin red."""
    router = APIRouter()

    @router.get("/webhooks/whatsapp", tags=["webhooks"], response_class=PlainTextResponse)
    async def verify(
        hub_mode: Optional[str] = Query(None, alias="hub.mode"),
        hub_token: Optional[str] = Query(None, alias="hub.verify_token"),
        hub_challenge: Optional[str] = Query(None, alias="hub.challenge"),
    ):
        expected = os.getenv("WHATSAPP_VERIFY_TOKEN", "")
        if not expected:
            raise HTTPException(503, "WhatsApp webhook is not configured")
        if hub_mode == "subscribe" and hub_token and hmac.compare_digest(hub_token, expected) and hub_challenge:
            return PlainTextResponse(hub_challenge)
        raise HTTPException(403, "Verification failed")

    @router.post("/webhooks/whatsapp", tags=["webhooks"])
    async def receive(request: Request, x_hub_signature_256: Optional[str] = Header(None)):
        secret = os.getenv("WHATSAPP_APP_SECRET", "")
        if not secret:
            raise HTTPException(503, "WhatsApp webhook is not configured")
        body = await request.body()
        if len(body) > MAX_BODY_BYTES:
            raise HTTPException(413, "Payload too large")
        if not verify_signature(secret, x_hub_signature_256, body):
            raise HTTPException(401, "Invalid signature")
        try:
            payload = json.loads(body)
        except ValueError:
            raise HTTPException(400, "Invalid JSON")

        opted_out = 0
        for message in incoming_messages(payload):
            language = stop_language(message_text(message))
            if not language:
                continue
            variants = phone_variants(message.get("from"))
            if not variants:
                continue
            now = datetime.now(timezone.utc).isoformat()
            result = await db.clients.update_many(
                {"phone": {"$in": variants}, "messaging_opt_out_at": None},
                {"$set": {"messaging_opt_out_at": now, "messaging_opt_out_source": "whatsapp_stop"}},
            )
            opted_out += getattr(result, "modified_count", 0)
            try:
                await send_text(variants[0], CONFIRMATION_EN if language == "en" else CONFIRMATION_ES)
            except Exception as exc:  # la baja ya quedo registrada; no hay que reintentar el webhook por esto
                logger.warning("whatsapp_stop_confirmation_failed diagnostic_code=%s", type(exc).__name__)
        if opted_out:
            logger.info("whatsapp_stop_processed clients=%s", opted_out)
        return {"received": True, "opted_out": opted_out}

    return router
