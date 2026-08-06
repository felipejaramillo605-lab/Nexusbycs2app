# NEXUS_8A7D3C1_OWNER_MEDIA_RECONCILIATION_DRY_RUN_V1
from __future__ import annotations

import hashlib
import json
import os
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

from fastapi import APIRouter, Cookie, Header, HTTPException

PUBLIC_PREFIX = "/api/media/professionals/"
MANAGED_PATTERN = re.compile(r"^/api/media/professionals/([A-Za-z0-9_-]{1,128})/([a-f0-9]{32}\.webp)$")


def media_root() -> Path:
    return Path(os.getenv("NEXUS_MEDIA_ROOT", "/app/data/professional-media")).resolve()


def canonical_hash(payload: dict) -> str:
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str).encode()
    return hashlib.sha256(raw).hexdigest()


def classify_reference(root: Path, source: str, entity_id: str, organization_id: str | None, value: str | None) -> tuple[str, dict]:
    item = {"source": source, "entity_id": entity_id, "organization_id": organization_id, "value": value}
    if not value:
        return "empty", item
    if not value.startswith(PUBLIC_PREFIX):
        item["domain"] = urlparse(value).netloc or "relative-or-invalid"
        return "external", item
    match = MANAGED_PATTERN.fullmatch(value)
    if not match:
        return "invalid_managed", item
    path_org, filename = match.groups()
    path = (root / path_org / filename).resolve()
    try:
        path.relative_to(root)
    except ValueError:
        item["path"] = str(path)
        return "unsafe_path", item
    item.update({"path": str(path), "exists": path.is_file(), "path_organization_id": path_org, "organization_matches": path_org == organization_id})
    return "managed", item


async def build_report(db) -> dict:
    root = media_root()
    barbers = await db.barbers.find({}, {"_id": 0, "barber_id": 1, "organization_id": 1, "user_id": 1, "avatar": 1}).to_list(10000)
    users = await db.users.find({}, {"_id": 0, "user_id": 1, "organization_id": 1, "role": 1, "picture": 1}).to_list(10000)
    groups = {name: [] for name in ("managed", "external", "invalid_managed", "unsafe_path", "empty")}
    for source, rows, field, id_field in (("barbers", barbers, "avatar", "barber_id"), ("users", users, "picture", "user_id")):
        for row in rows:
            kind, item = classify_reference(root, source, row.get(id_field), row.get("organization_id"), row.get(field))
            groups[kind].append(item)
    files = {str(path.resolve()): {"path": str(path.resolve()), "relative_path": str(path.relative_to(root)), "bytes": path.stat().st_size, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()} for path in root.rglob("*") if path.is_file()} if root.is_dir() else {}
    managed = groups["managed"]
    referenced = {item["path"] for item in managed if item.get("exists")}
    orphans = [files[path] for path in sorted(set(files) - referenced)]
    broken = [item for item in managed if not item.get("exists")]
    tenant = [item for item in managed if not item.get("organization_matches")]
    counts = Counter(item["path"] for item in managed)
    shared = {path: count for path, count in counts.items() if count > 2}
    user_by_id = {row.get("user_id"): row for row in users}
    sync = []
    for barber in barbers:
        uid = barber.get("user_id")
        if not uid:
            continue
        user = user_by_id.get(uid)
        if not user:
            sync.append({"kind": "linked_user_missing", "barber_id": barber.get("barber_id"), "user_id": uid})
            continue
        if barber.get("avatar") != user.get("picture"):
            sync.append({"kind": "avatar_picture_mismatch", "barber_id": barber.get("barber_id"), "user_id": uid, "barber_avatar": barber.get("avatar"), "user_picture": user.get("picture")})
        if barber.get("organization_id") != user.get("organization_id"):
            sync.append({"kind": "organization_mismatch", "barber_id": barber.get("barber_id"), "user_id": uid, "barber_organization_id": barber.get("organization_id"), "user_organization_id": user.get("organization_id")})
    domains = Counter(item.get("domain", "relative-or-invalid") for item in groups["external"])
    stable = {
        "media_root": str(root),
        "summary": {
            "media_file_count": len(files), "media_total_bytes": sum(item["bytes"] for item in files.values()),
            "managed_reference_count": len(managed), "external_reference_count": len(groups["external"]),
            "invalid_managed_reference_count": len(groups["invalid_managed"]), "unsafe_path_reference_count": len(groups["unsafe_path"]),
            "broken_reference_count": len(broken), "tenant_mismatch_count": len(tenant), "orphan_file_count": len(orphans),
            "excessive_shared_reference_count": len(shared), "profile_sync_mismatch_count": len(sync),
        },
        "external_url_domains": dict(sorted(domains.items())),
        "managed_references": managed, "external_references": groups["external"], "invalid_managed_references": groups["invalid_managed"],
        "unsafe_path_references": groups["unsafe_path"], "broken_references": broken, "tenant_mismatches": tenant,
        "orphan_files": orphans, "excessive_shared_references": shared, "profile_sync_mismatches": sync,
    }
    return {**stable, "report_hash": canonical_hash(stable), "generated_at": datetime.now(timezone.utc).isoformat(), "mode": "read_only", "writes_performed": False}


def build_professional_media_lifecycle_router(db, get_current_user):
    router = APIRouter(prefix="/owner/professional-media", tags=["owner-professional-media"])
    async def owner(auth, cookie):
        user = await get_current_user(auth, cookie)
        if user.role != "owner" or user.access_status != "approved":
            raise HTTPException(status_code=403, detail="Owner access required")
        return user
    @router.get("/reconciliation")
    async def reconciliation(authorization: str | None = Header(None), session_token: str | None = Cookie(None)):
        await owner(authorization, session_token)
        return await build_report(db)
    @router.post("/reconciliation/dry-run")
    async def reconciliation_dry_run(authorization: str | None = Header(None), session_token: str | None = Cookie(None)):
        await owner(authorization, session_token)
        return await build_report(db)
    return router
