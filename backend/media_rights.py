"""Autorizacion para subir imagenes (derechos de autor, de imagen y de privacidad).

Quien sube una imagen declara una vez (por usuario y version del texto) que tiene derecho a usarla y, si aparecen
personas (profesionales o clientes), que cuenta con su autorizacion para publicarla en la plataforma y en el portal del
negocio. Autoriza su uso solo para prestar el servicio.
El servidor lo exige antes de aceptar cualquier subida; la interfaz lo pide con una casilla la primera vez.
"""

from __future__ import annotations

import hashlib
from datetime import datetime, timezone

from fastapi import APIRouter, Cookie, Header, HTTPException, Request
from pydantic import BaseModel

from audit_contracts import record_audit_event

MEDIA_RIGHTS_VERSION = "1.0"
MEDIA_RIGHTS_TEXT = (
    "Declaro que tengo derecho a usar las imágenes que subo y que, si en ellas aparecen personas "
    "(profesionales o clientes), cuento con su autorización para publicar su imagen en Nexus y en el portal del "
    "negocio. Autorizo a Nexus a alojarlas y mostrarlas únicamente para prestar el servicio, y entiendo que podrán "
    "retirarse si un tercero reclama derechos sobre ellas."
)


async def require_media_rights(db, user) -> None:
    """Lanza 409 `media_rights_required` si el usuario no ha hecho la declaracion vigente."""
    users = getattr(db, "users", None)
    if users is None:  # dobles de prueba sin coleccion de usuarios
        return
    doc = await users.find_one({"user_id": user.user_id}, {"_id": 0, "media_rights_version": 1})
    if (doc or {}).get("media_rights_version") != MEDIA_RIGHTS_VERSION:
        raise HTTPException(
            status_code=409,
            detail={"code": "media_rights_required", "version": MEDIA_RIGHTS_VERSION, "message": MEDIA_RIGHTS_TEXT},
        )


class MediaRightsIn(BaseModel):
    accepted: bool = False
    version: str = MEDIA_RIGHTS_VERSION


def build_media_rights_router(db, get_current_user):
    router = APIRouter()

    @router.get("/account/media-rights", tags=["account"])
    async def status(authorization: str | None = Header(None), session_token: str | None = Cookie(None)):
        user = await get_current_user(authorization, session_token)
        doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0, "media_rights_version": 1})
        return {
            "accepted": (doc or {}).get("media_rights_version") == MEDIA_RIGHTS_VERSION,
            "version": MEDIA_RIGHTS_VERSION,
            "text": MEDIA_RIGHTS_TEXT,
        }

    @router.post("/account/media-rights", tags=["account"])
    async def accept(
        data: MediaRightsIn,
        request: Request,
        authorization: str | None = Header(None),
        session_token: str | None = Cookie(None),
    ):
        user = await get_current_user(authorization, session_token)
        if not data.accepted or data.version != MEDIA_RIGHTS_VERSION:
            raise HTTPException(status_code=400, detail="Debes aceptar la declaración vigente para subir imágenes")
        now = datetime.now(timezone.utc).isoformat()
        await db.users.update_one(
            {"user_id": user.user_id},
            {
                "$set": {
                    "media_rights_version": MEDIA_RIGHTS_VERSION,
                    "media_rights_accepted_at": now,
                    "media_rights_text_sha256": hashlib.sha256(MEDIA_RIGHTS_TEXT.encode()).hexdigest(),
                    "media_rights_ip": request.client.host if request.client else None,
                }
            },
        )
        await record_audit_event(
            db,
            category="account",
            event_type="media_rights_accepted",
            actor_user_id=user.user_id,
            organization_id=getattr(user, "organization_id", None),
            entity_type="user",
            entity_id=user.user_id,
            new_value={"version": MEDIA_RIGHTS_VERSION},
        )
        return {"accepted": True, "version": MEDIA_RIGHTS_VERSION}

    return router
