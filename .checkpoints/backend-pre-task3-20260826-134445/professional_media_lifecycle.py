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

    @router.post("/reconciliation/plan")
    async def reconciliation_plan(data: MediaPlanRequest, authorization: str | None = Header(None), session_token: str | None = Cookie(None)):
        user = await owner(authorization, session_token)
        return await create_protected_plan(db, user, data)

    @router.post("/reconciliation/apply")
    async def reconciliation_apply(data: MediaApplyRequest, authorization: str | None = Header(None), session_token: str | None = Cookie(None)):
        user = await owner(authorization, session_token)
        return await apply_protected_plan(db, user, data)

    return router


# NEXUS_8A7D3C2_PROTECTED_MEDIA_QUARANTINE_V1
import secrets
from datetime import timedelta
from pydantic import BaseModel, Field

class MediaPlanRequest(BaseModel):
    idempotency_key: str = Field(min_length=8, max_length=200)
    reason: str = Field(min_length=5, max_length=500)

class MediaApplyRequest(BaseModel):
    plan_id: str = Field(min_length=12, max_length=100)
    confirmation_token: str = Field(min_length=32, max_length=200)
    idempotency_key: str = Field(min_length=8, max_length=200)
    reason: str = Field(min_length=5, max_length=500)


def quarantine_root() -> Path:
    return Path(os.getenv("NEXUS_MEDIA_QUARANTINE_ROOT", "/app/data/professional-media-quarantine")).resolve()


def token_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def plan_ttl() -> int:
    return max(60, min(int(os.getenv("NEXUS_MEDIA_PLAN_TTL_SECONDS", "900")), 3600))


def parse_time(value):
    parsed = datetime.fromisoformat(str(value))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


async def reference_fingerprint(db) -> str:
    rows = []
    async for row in db.barbers.find({}, {"_id": 0, "barber_id": 1, "organization_id": 1, "avatar": 1}).sort("barber_id", 1):
        rows.append(("barber", row))
    async for row in db.users.find({}, {"_id": 0, "user_id": 1, "organization_id": 1, "picture": 1}).sort("user_id", 1):
        rows.append(("user", row))
    return canonical_hash({"references": rows})


async def ensure_professional_media_lifecycle_indexes(db):
    await db.professional_media_reconciliation_plans.create_index("plan_id", unique=True, name="media_plan_id_unique")
    await db.professional_media_reconciliation_plans.create_index("expires_at", expireAfterSeconds=0, name="media_plan_ttl")
    await db.professional_media_reconciliation_plans.create_index([("actor_user_id", 1), ("create_idempotency_key", 1)], unique=True, name="media_plan_create_idempotency")
    await db.professional_media_reconciliation_plans.create_index([("status", 1), ("expires_at", 1)], name="media_plan_status_expiry")


async def create_protected_plan(db, user, data: MediaPlanRequest):
    prior = await db.professional_media_reconciliation_plans.find_one({"actor_user_id": user.user_id, "create_idempotency_key": data.idempotency_key}, {"_id": 0, "token_hash": 0})
    if prior:
        return {**prior, "confirmation_token": None, "token_available": False, "idempotent_replay": True}
    report = await build_report(db)
    now = datetime.now(timezone.utc)
    raw_token = secrets.token_urlsafe(32)
    candidates = [{"relative_path": item["relative_path"], "bytes": item["bytes"], "sha256": item["sha256"]} for item in report["orphan_files"]]
    plan = {"plan_id": "media_plan_" + secrets.token_hex(12), "actor_user_id": user.user_id, "create_idempotency_key": data.idempotency_key, "reason": data.reason.strip(), "report_hash": report["report_hash"], "reference_fingerprint": await reference_fingerprint(db), "candidate_hash": canonical_hash({"candidates": candidates}), "orphan_candidates": candidates, "candidate_count": len(candidates), "token_hash": token_hash(raw_token), "status": "planned", "created_at": now.isoformat(), "expires_at": now + timedelta(seconds=plan_ttl()), "writes_performed": False}
    try:
        await db.professional_media_reconciliation_plans.insert_one(plan.copy())
    except Exception:
        prior = await db.professional_media_reconciliation_plans.find_one({"actor_user_id": user.user_id, "create_idempotency_key": data.idempotency_key}, {"_id": 0, "token_hash": 0})
        if prior:
            return {**prior, "confirmation_token": None, "token_available": False, "idempotent_replay": True}
        raise
    public = {k: v for k, v in plan.items() if k != "token_hash"}
    return {**public, "confirmation_token": raw_token, "token_available": True, "idempotent_replay": False}


async def apply_protected_plan(db, user, data: MediaApplyRequest):
    plan = await db.professional_media_reconciliation_plans.find_one({"plan_id": data.plan_id, "actor_user_id": user.user_id}, {"_id": 0})
    if not plan:
        raise HTTPException(404, "Media reconciliation plan not found")
    if plan.get("apply_idempotency_key") == data.idempotency_key and plan.get("result"):
        return {**plan["result"], "already_applied": True}
    if plan.get("status") in {"applied", "no_changes"}:
        raise HTTPException(409, "Plan was already completed with a different idempotency key")
    if parse_time(plan["expires_at"]) <= datetime.now(timezone.utc):
        raise HTTPException(409, "Media reconciliation plan expired")
    if not secrets.compare_digest(plan.get("token_hash", ""), token_hash(data.confirmation_token)):
        raise HTTPException(403, "Invalid confirmation token")
    report = await build_report(db)
    if report["report_hash"] != plan["report_hash"] or await reference_fingerprint(db) != plan["reference_fingerprint"]:
        raise HTTPException(409, "Media reconciliation precondition failed")
    candidates = plan.get("orphan_candidates") or []
    if canonical_hash({"candidates": candidates}) != plan.get("candidate_hash"):
        raise HTTPException(409, "Media reconciliation candidate integrity failed")
    if not candidates:
        result = {"plan_id": plan["plan_id"], "status": "no_changes", "quarantined_count": 0, "writes_performed": False, "already_applied": False}
        await db.professional_media_reconciliation_plans.update_one({"plan_id": plan["plan_id"], "status": "planned"}, {"$set": {"status": "no_changes", "apply_idempotency_key": data.idempotency_key, "apply_reason": data.reason.strip(), "applied_at": datetime.now(timezone.utc).isoformat(), "result": result}})
        return result
    root, quarantine = media_root(), quarantine_root()
    quarantine.mkdir(parents=True, exist_ok=True, mode=0o750)
    if root.stat().st_dev != quarantine.stat().st_dev:
        raise HTTPException(409, "Media quarantine must use the same filesystem")
    moved = []
    try:
        for candidate in candidates:
            relative = Path(candidate["relative_path"])
            source = (root / relative).resolve()
            if root not in source.parents or not source.is_file() or source.stat().st_size != candidate["bytes"] or hashlib.sha256(source.read_bytes()).hexdigest() != candidate["sha256"]:
                raise RuntimeError("candidate_precondition_failed")
            public_url = PUBLIC_PREFIX + relative.as_posix()
            if await db.barbers.count_documents({"avatar": public_url}) or await db.users.count_documents({"picture": public_url}):
                raise RuntimeError("candidate_became_referenced")
            destination = (quarantine / plan["plan_id"] / relative).resolve()
            if quarantine not in destination.parents or destination.exists():
                raise RuntimeError("quarantine_destination_invalid")
            destination.parent.mkdir(parents=True, exist_ok=True, mode=0o750)
            os.replace(source, destination); os.chmod(destination, 0o640); moved.append((source, destination, candidate))
        result = {"plan_id": plan["plan_id"], "status": "applied", "quarantined_count": len(moved), "writes_performed": bool(moved), "already_applied": False}
        await db.audit_events.insert_one({"audit_id": "audit_" + secrets.token_hex(6), "organization_id": None, "event_type": "professional_media_quarantined", "entity_type": "media_reconciliation_plan", "entity_id": plan["plan_id"], "actor_user_id": user.user_id, "reason": data.reason.strip(), "new_value": {"report_hash": plan["report_hash"], "quarantined_count": len(moved), "candidates": [{"relative_path": c["relative_path"], "sha256": c["sha256"]} for _, _, c in moved]}, "created_at": datetime.now(timezone.utc).isoformat()})
        await db.professional_media_reconciliation_plans.update_one({"plan_id": plan["plan_id"], "status": "planned"}, {"$set": {"status": "applied", "apply_idempotency_key": data.idempotency_key, "apply_reason": data.reason.strip(), "applied_at": datetime.now(timezone.utc).isoformat(), "result": result}})
        return result
    except Exception:
        for source, destination, candidate in reversed(moved):
            source.parent.mkdir(parents=True, exist_ok=True, mode=0o750)
            if destination.exists(): os.replace(destination, source)
        await db.professional_media_reconciliation_plans.update_one({"plan_id": plan["plan_id"], "status": "planned"}, {"$set": {"last_failure_code": "precondition_or_quarantine_failure", "last_failed_at": datetime.now(timezone.utc).isoformat()}})
        raise HTTPException(409, "Media reconciliation apply failed without retained changes")
