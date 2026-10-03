"""Read-only Owner report for managed media that disappeared from ephemeral storage."""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Cookie, Header, HTTPException

from media_mirror import ALLOWED_NAMESPACES
from organization_background_media import managed_parts as background_parts, media_root as background_root
from organization_media import managed_parts as organization_parts, media_root as organization_root
from platform_branding import SETTINGS_ID, managed_filename as platform_filename, media_root as platform_root
from product_catalog import _catalog_parts, _safe_catalog_path
from professional_media import managed_parts as professional_parts, media_root as professional_root

MAX_FINDINGS = 2000


def _candidate(url):
    """Return namespace/key/path only for a managed Nexus media URL."""
    filename = platform_filename(url)
    if filename:
        return "platform", filename, platform_root() / filename
    for namespace, parser, root in (
        ("organizations", organization_parts, organization_root),
        ("portal-backgrounds", background_parts, background_root),
        ("professionals", professional_parts, professional_root),
    ):
        parts = parser(url)
        if parts:
            return namespace, "/".join(parts), root() / parts[0] / parts[1]
    parts = _catalog_parts(url)
    if parts:
        return "catalog", "/".join(parts), _safe_catalog_path(parts[0], parts[1])
    return None


async def _mirror_exists(db, namespace, key):
    if namespace not in ALLOWED_NAMESPACES:
        return False
    doc = await db.media_blobs.find_one({"namespace": namespace, "key": key}, {"_id": 0, "data": 1})
    return bool(doc and doc.get("data"))


async def _check(db, findings, kind, organization_id, entity_id, url):
    candidate = _candidate(url)
    if not candidate:
        return
    namespace, key, path = candidate
    if path.is_file():
        return
    findings.append({
        "kind": kind,
        "organization_id": organization_id,
        "entity_id": entity_id,
        "url": url,
        "recoverable_from_mirror": await _mirror_exists(db, namespace, key),
    })


async def build_report(db):
    findings = []
    platform = await db.platform_settings.find_one({"settings_id": SETTINGS_ID}, {"_id": 0, "platform_logo_url": 1})
    if platform:
        await _check(db, findings, "platform_logo", None, "platform_settings", platform.get("platform_logo_url"))
    organizations = await db.organizations.find({}, {"_id": 0, "organization_id": 1, "logo_url": 1, "portal_background_url": 1}).to_list(MAX_FINDINGS + 1)
    for row in organizations:
        await _check(db, findings, "organization_logo", row.get("organization_id"), row.get("organization_id"), row.get("logo_url"))
        await _check(db, findings, "portal_background", row.get("organization_id"), row.get("organization_id"), row.get("portal_background_url"))
    services = await db.services.find({}, {"_id": 0, "organization_id": 1, "service_id": 1, "photos": 1, "cover_image_url": 1, "banner_image_url": 1}).to_list(MAX_FINDINGS + 1)
    for row in services:
        for url in [*(row.get("photos") or []), row.get("cover_image_url"), row.get("banner_image_url")]:
            await _check(db, findings, "service_image", row.get("organization_id"), row.get("service_id"), url)
    professionals = await db.barbers.find({}, {"_id": 0, "organization_id": 1, "barber_id": 1, "avatar": 1}).to_list(MAX_FINDINGS + 1)
    for row in professionals:
        await _check(db, findings, "professional_photo", row.get("organization_id"), row.get("barber_id"), row.get("avatar"))
    catalog = await db.catalog_products.find({}, {"_id": 0, "organization_id": 1, "product_id": 1, "photos": 1}).to_list(MAX_FINDINGS + 1)
    for row in catalog:
        for url in row.get("photos") or []:
            await _check(db, findings, "catalog_image", row.get("organization_id"), row.get("product_id"), url)
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "scanned": {"organizations": len(organizations), "services": len(services), "professionals": len(professionals), "catalog": len(catalog)},
        "broken": findings[:MAX_FINDINGS],
        "truncated": len(findings) > MAX_FINDINGS or any(len(rows) > MAX_FINDINGS for rows in (organizations, services, professionals, catalog)),
    }


def build_owner_media_integrity_router(db, get_current_user):
    router = APIRouter(prefix="/owner/media", tags=["owner-media-integrity"])

    @router.get("/integrity")
    async def integrity(authorization: str | None = Header(None), session_token: str | None = Cookie(None)):
        user = await get_current_user(authorization, session_token)
        if user.role != "owner" or user.access_status != "approved":
            raise HTTPException(status_code=403, detail="Owner access required")
        return await build_report(db)

    return router