#!/usr/bin/env python3
"""Manually unlock a stale platform capability maintenance/archive barrier."""
import argparse
import asyncio
import os
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ReturnDocument

from archive_platform_capability_audit import verify_archive
from platform_capabilities import AUTHORITY_ID, _request_tombstone_event, persist_request_tombstones

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / ".env")


async def _check_archive_recovery(db, authority: dict, archive_path: Path, repair: bool) -> None:
    payload = verify_archive(archive_path)
    if payload.get("schema") != "nexus-platform-capability-audit-v1" or payload.get("capability_id") != AUTHORITY_ID:
        raise ValueError("archive schema or capability identity does not match")
    expected_version = authority.get("version")
    if payload.get("authority_version") != expected_version:
        raise ValueError("archive version does not match the locked authority version")
    archived_events = [item["event"] for item in payload["items"]]
    if authority.get("audit_events", []) != archived_events:
        raise ValueError("authority events changed after this archive was created")

    missing = []
    for item in payload["items"]:
        event = item["event"]
        request_id = event.get("request_id")
        if not request_id:
            continue
        expected_event = _request_tombstone_event(event)
        existing = await db.platform_capability_request_tombstones.find_one({"_id": request_id})
        if not existing:
            missing.append(item)
        elif existing.get("event") != expected_event or existing.get("event_hash") != item["hash"]:
            raise ValueError(f"tombstone does not match verified archive for request_id={request_id}")
    if missing:
        if not repair:
            raise ValueError("some archive tombstones are missing; rerun with --repair-tombstones after reviewing the verified archive")
        await persist_request_tombstones(db, missing)
        for item in missing:
            request_id = item["event"].get("request_id")
            existing = await db.platform_capability_request_tombstones.find_one({"_id": request_id})
            if (
                not existing
                or existing.get("event") != _request_tombstone_event(item["event"])
                or existing.get("event_hash") != item["hash"]
            ):
                raise ValueError(f"could not verify repaired tombstone for request_id={request_id}")


async def recover_lock(
    db,
    *,
    lock_id: str,
    expected_version: int,
    archive_path: Path | None,
    no_archive: bool,
    maintenance_lock: bool,
    repair_tombstones: bool,
    confirm: bool,
) -> None:
    if not confirm:
        raise ValueError("--confirm is required")
    authority = await db.platform_capability_authority.find_one({"_id": AUTHORITY_ID})
    if not authority:
        raise ValueError("platform capability authority does not exist")
    lock_field = "maintenance_lock" if maintenance_lock else "archive_lock"
    if authority.get(lock_field) != lock_id or authority.get("version") != expected_version:
        raise ValueError("lock ID or authority version changed; refusing to unlock")

    if maintenance_lock:
        if archive_path or no_archive or repair_tombstones:
            raise ValueError("archive recovery options cannot be used for a maintenance lock")
    elif archive_path:
        if no_archive:
            raise ValueError("choose either --archive or --no-archive")
        await _check_archive_recovery(db, authority, archive_path, repair_tombstones)
    elif no_archive:
        if repair_tombstones:
            raise ValueError("--repair-tombstones requires --archive")
        for event in authority.get("audit_events", []):
            request_id = event.get("request_id")
            if request_id and await db.platform_capability_request_tombstones.find_one({"_id": request_id}):
                raise ValueError("a current audit event already has a tombstone; refusing no-archive recovery")
    else:
        raise ValueError("archive recovery requires --archive or --no-archive")

    result = await db.platform_capability_authority.find_one_and_update(
        {"_id": AUTHORITY_ID, "version": expected_version, lock_field: lock_id},
        {"$unset": {lock_field: ""}, "$inc": {"version": 1}},
        return_document=ReturnDocument.AFTER,
    )
    if not result:
        raise RuntimeError("authority changed during recovery; lock remains in place")


async def main(args) -> None:
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    try:
        await recover_lock(
            client[os.environ["DB_NAME"]],
            lock_id=args.lock_id,
            expected_version=args.expected_version,
            archive_path=Path(args.archive) if args.archive else None,
            no_archive=args.no_archive,
            maintenance_lock=args.maintenance_lock,
            repair_tombstones=args.repair_tombstones,
            confirm=args.confirm,
        )
    finally:
        client.close()
    print("Verified platform capability lock released")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--lock-id", required=True)
    parser.add_argument("--expected-version", required=True, type=int)
    parser.add_argument("--archive", help="verified archive JSON for a stale archive_lock")
    parser.add_argument("--no-archive", action="store_true", help="confirm recovery before archive file creation")
    parser.add_argument("--maintenance-lock", action="store_true", help="recover a stale maintenance_lock after writer drain")
    parser.add_argument("--repair-tombstones", action="store_true", help="persist missing tombstones from the verified archive")
    parser.add_argument("--confirm", action="store_true", help="confirm the inspected recovery")
    args = parser.parse_args()
    if args.archive and args.no_archive:
        parser.error("choose only one of --archive or --no-archive")
    asyncio.run(main(args))
