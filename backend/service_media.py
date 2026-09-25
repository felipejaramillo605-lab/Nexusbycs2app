# NEXUS_SERVICE_PHOTOS_V1
# Reuses the catalog's own image storage/normalization pipeline (product_catalog.py
# + professional_media.py) instead of building a third upload pipeline, per product
# requirement: services just needed a *cap of 2* on top of what already exists.
from __future__ import annotations

from datetime import datetime, timezone
import logging
from typing import Optional

from fastapi import APIRouter, Cookie, File, Header, HTTPException, UploadFile

from product_catalog import _write_catalog_image, _delete_catalog_image
from professional_media import _read_limited
from image_pipeline import normalize_image_async

MAX_SERVICE_PHOTOS = 2
PRESENTATION_SLOTS = {"cover": "cover_image_url", "banner": "banner_image_url"}


def build_service_media_router(db, get_current_user, require_management_role, resolve_team_organization):
    router = APIRouter()

    async def management_service(user, requested_org, service_id):
        require_management_role(user)
        org_id = await resolve_team_organization(user, requested_org)
        service = await db.services.find_one({"organization_id": org_id, "service_id": service_id}, {"_id": 0})
        if not service:
            raise HTTPException(status_code=404, detail="Service not found")
        return org_id, service

    async def replace_media(org_id, service, changes):
        # Compare all media references to reject concurrent edits rather than
        # deleting a file another request just retained in a different slot.
        query = {"organization_id": org_id, "service_id": service["service_id"]}
        query.update({key: service.get(key) for key in ("photos", *PRESENTATION_SLOTS.values())})
        result = await db.services.update_one(query, {"$set": {
            **changes, "updated_at": datetime.now(timezone.utc).isoformat(),
        }})
        if not result.matched_count:
            raise HTTPException(status_code=409, detail="Las imágenes cambiaron. Actualiza e intenta de nuevo.")

    def cleanup(org_id, url, service):
        references = [*(service.get("photos") or []), *(service.get(key) for key in PRESENTATION_SLOTS.values())]
        if url and url.startswith(f"/api/media/catalog/{org_id}/") and url not in references:
            try:
                _delete_catalog_image(url)
            except OSError:
                logging.getLogger(__name__).warning("Unable to remove unused service image")

    @router.post("/services/{service_id}/photos", tags=["services"])
    async def upload_service_photo(
        service_id: str,
        file: UploadFile = File(...),
        organization_id: Optional[str] = None,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        user = await get_current_user(authorization, session_token)
        org_id, service = await management_service(user, organization_id, service_id)
        photos = list(service.get("photos") or [])
        if len(photos) >= MAX_SERVICE_PHOTOS:
            raise HTTPException(status_code=400, detail=f"Máximo {MAX_SERVICE_PHOTOS} imágenes por servicio. Elimina una primero.")
        payload, metadata = await normalize_image_async(await _read_limited(file), "photo")
        new_url = _write_catalog_image(org_id, payload)
        photos.append(new_url)
        try:
            await replace_media(org_id, service, {"photos": photos})
        except HTTPException:
            cleanup(org_id, new_url, service)
            raise
        return {"photos": photos, "uploaded": new_url, **metadata}

    @router.delete("/services/{service_id}/photos/{photo_index}", tags=["services"])
    async def delete_service_photo(
        service_id: str,
        photo_index: int,
        organization_id: Optional[str] = None,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        user = await get_current_user(authorization, session_token)
        org_id, service = await management_service(user, organization_id, service_id)
        photos = list(service.get("photos") or [])
        if photo_index < 0 or photo_index >= len(photos):
            raise HTTPException(status_code=400, detail="Invalid photo index")
        removed_url = photos.pop(photo_index)
        await replace_media(org_id, service, {"photos": photos})
        cleanup(org_id, removed_url, {**service, "photos": photos})
        return {"photos": photos, "deleted": removed_url}

    @router.post("/services/{service_id}/presentation/{slot}", tags=["services"])
    async def upload_service_presentation_image(
        service_id: str,
        slot: str,
        file: UploadFile = File(...),
        organization_id: Optional[str] = None,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        field = PRESENTATION_SLOTS.get(slot)
        if not field:
            raise HTTPException(status_code=400, detail="Presentation slot must be cover or banner")
        user = await get_current_user(authorization, session_token)
        org_id, service = await management_service(user, organization_id, service_id)
        payload, metadata = await normalize_image_async(await _read_limited(file), "photo")
        new_url = _write_catalog_image(org_id, payload)
        previous_url = service.get(field)
        try:
            await replace_media(org_id, service, {field: new_url})
        except HTTPException:
            cleanup(org_id, new_url, service)
            raise
        # A transport failure has an uncertain commit outcome: retain files in
        # that case instead of potentially deleting an image now in use.
        cleanup(org_id, previous_url, {**service, field: new_url})
        return {field: new_url, "slot": slot, **metadata}

    return router
