"""Read-only Owner view of which external connectors are configured (booleans only, never secrets)."""

from __future__ import annotations

import asyncio
import os
import time
from datetime import datetime, timezone

from fastapi import APIRouter, Cookie, Header, HTTPException

import email_providers
import object_storage


def _flag(name: str) -> bool:
    return os.getenv(name, "").strip().lower() in {"1", "true", "yes", "on"}


def build_connector_status() -> dict:
    return {
        "storage": {"durable_provider": "cloudflare_r2" if object_storage.enabled() else None, "mongo_mirror": True},
        "email": {
            "provider": "resend" if email_providers.resend_enabled() else "smtp",
            "resend_enabled": email_providers.resend_enabled(),
            "resend_api_key_set": bool(os.getenv("RESEND_API_KEY", "").strip()),
            "sender_set": bool(os.getenv("RESEND_FROM_EMAIL", "").strip()),
            "webhook_secret_set": bool(os.getenv("RESEND_WEBHOOK_SECRET", "").strip()),
            "smtp_fallback_ready": all(os.getenv(k) for k in ("SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD")),
        },
        "decisions": {
            "engine_enabled": _flag("DECISION_ENGINE_ENABLED"),
            "jev_key_set": bool(os.getenv("JEV_API_KEY", "").strip()),
        },
    }


async def _allow(db, key: str, limit: int, window_seconds: int) -> bool:
    """Atomic per-window counter shared by every worker (Mongo); in-memory limiter when no database is wired."""
    if db is None:
        from request_security import rate_limiter

        await rate_limiter.check(key, limit, window_seconds)
        return True
    now = int(time.time())
    bucket = now // window_seconds
    document = await db.connector_rate_limits.find_one_and_update(
        {"_id": f"{key}:{bucket}"},
        {
            "$inc": {"count": 1},
            "$setOnInsert": {"expires_at": datetime.fromtimestamp((bucket + 2) * window_seconds, timezone.utc)},
        },
        upsert=True,
        return_document=True,
    )
    return int((document or {}).get("count", 1)) <= limit


async def ensure_connector_rate_limit_indexes(db):
    await db.connector_rate_limits.create_index("expires_at", expireAfterSeconds=0, name="connector_rate_limits_ttl")


def build_connector_status_router(get_current_user, db=None):
    router = APIRouter()

    @router.get("/owner/connectors/status", tags=["owner-integrations"])
    async def connector_status(authorization: str | None = Header(None), session_token: str | None = Cookie(None)):
        user = await get_current_user(authorization, session_token)
        if user.role != "owner" or user.access_status != "approved":
            raise HTTPException(status_code=403, detail="Owner access required")
        return build_connector_status()

    @router.post("/owner/connectors/test-email", tags=["owner-integrations"])
    async def send_test_email(authorization: str | None = Header(None), session_token: str | None = Cookie(None)):
        """Send one test message to the signed-in Owner only, reporting which provider delivered it."""
        user = await get_current_user(authorization, session_token)
        if user.role != "owner" or user.access_status != "approved":
            raise HTTPException(status_code=403, detail="Owner access required")
        if not await _allow(db, f"connector_test_email:{user.user_id}", 5, 3600):
            raise HTTPException(status_code=429, detail="Demasiadas pruebas seguidas")
        recipient = user.email
        if not email_providers.valid_address(recipient):
            raise HTTPException(status_code=422, detail="El correo de tu cuenta Owner no es válido")
        subject = "Prueba de correo de Nexus by CS2"
        text = "Este es un correo de prueba enviado desde Owner > Conectores. Si lo ves, el envío funciona."
        html = f"<p>{text}</p>"
        provider, resend_error, delivered = None, None, False
        if email_providers.resend_enabled():
            delivered, resend_error = await asyncio.to_thread(
                email_providers.send_via_resend, recipient, subject, html, text
            )
            provider = "resend" if delivered else None
        if not delivered:
            from email_service import email_service

            delivered = bool(await asyncio.to_thread(email_service._send_email, recipient, subject, html, text))
            provider = "smtp_fallback" if resend_error else "smtp"
        local, _, domain = recipient.partition("@")
        return {
            "sent": delivered,
            "provider": provider if delivered else None,
            "resend_error": resend_error,
            "recipient": f"{local[:1]}***@{domain}",
        }

    return router
