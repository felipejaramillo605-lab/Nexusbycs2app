#!/usr/bin/env python3
"""Verified offline archival/compaction for the platform capability audit ledger."""
import argparse
import asyncio
import json
import os
import uuid
from pathlib import Path
from dotenv import load_dotenv
from platform_capabilities import AUTHORITY_ID, _audit_chain, _now, persist_request_tombstones
from pymongo import ReturnDocument

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / ".env")


def verify_archive(path: Path) -> dict:
    payload = json.loads(path.read_text(encoding="utf-8"))
    expected, head = _audit_chain([item["event"] for item in payload["items"]], payload.get("previous_hash", ""))
    if expected != payload["items"] or head != payload.get("head_hash") or len(expected) != payload.get("event_count"):
        raise ValueError("archive hash chain verification failed")
    return payload


async def archive_and_compact(db, path: Path) -> int:
    if path.exists():
        raise FileExistsError(f"archive destination already exists: {path}")
    observed = await db.platform_capability_authority.find_one({"_id": AUTHORITY_ID})
    if not observed:
        raise ValueError("platform capability authority does not exist")
    lock_id = "archive_" + uuid.uuid4().hex
    authority = await db.platform_capability_authority.find_one_and_update(
        {
            "_id": AUTHORITY_ID,
            "version": observed.get("version", 0),
            "archive_lock": {"$exists": False},
            "maintenance_lock": {"$exists": False},
        },
        {"$set": {"archive_lock": lock_id}, "$inc": {"version": 1}},
        return_document=ReturnDocument.AFTER,
    )
    if not authority:
        raise RuntimeError("authority changed while archive lock was being acquired; retry archival")
    try:
        events = authority.get("audit_events", [])
        if not events:
            return 0
        if any(event.get("state") == "pending" for event in events):
            raise ValueError("pending events must be reconciled before archival")
        previous_hash = authority.get("audit_head_hash", "")
        items, head_hash = _audit_chain(events, previous_hash)
        payload = {
            "schema": "nexus-platform-capability-audit-v1",
            "capability_id": AUTHORITY_ID,
            "authority_version": authority.get("version", 0),
            "previous_hash": previous_hash,
            "event_count": len(items),
            "head_hash": head_hash,
            "items": items,
        }
        path.parent.mkdir(parents=True, exist_ok=True)
        created = False
        try:
            stream = path.open("x", encoding="utf-8")
            created = True
            with stream:
                json.dump(payload, stream, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
                stream.flush()
                os.fsync(stream.fileno())
        except Exception:
            if created and path.exists():
                path.unlink()
            raise
        verify_archive(path)
        await persist_request_tombstones(db, items)
        result = await db.platform_capability_authority.find_one_and_update(
            {"_id": AUTHORITY_ID, "version": authority.get("version", 0), "archive_lock": lock_id},
            {"$set": {
                "audit_events": [],
                "audit_head_hash": head_hash,
                "audit_archived_count": int(authority.get("audit_archived_count", 0)) + len(items),
                "audit_archive_last": str(path),
                "updated_at": _now(),
            }, "$unset": {"archive_lock": ""}, "$inc": {"version": 1}},
            return_document=ReturnDocument.AFTER,
        )
        if not result:
            raise RuntimeError("authority changed while archiving; verified file retained but ledger was not compacted")
        return len(items)
    finally:
        # On failure the tombstones, if already written, remain authoritative;
        # releasing the lock lets later calls resolve IDs through that collection.
        await db.platform_capability_authority.update_one(
            {"_id": AUTHORITY_ID, "archive_lock": lock_id},
            {"$unset": {"archive_lock": ""}},
        )


async def main(args) -> None:
    if args.verify:
        archive = verify_archive(Path(args.verify))
        print(f"Verified {archive['event_count']} events; head_hash={archive['head_hash']}")
        return
    if not args.confirm:
        raise SystemExit("--confirm is required to compact the audit ledger")
    from motor.motor_asyncio import AsyncIOMotorClient
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    try:
        count = await archive_and_compact(client[os.environ["DB_NAME"]], Path(args.archive))
        print(f"Archived and verified {count} events; file={args.archive}")
    finally:
        client.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", help="path for signed-by-hash-chain JSON export")
    parser.add_argument("--verify", help="verify an existing archive without Mongo access")
    parser.add_argument("--confirm", action="store_true", help="confirm archive and compact operation")
    args = parser.parse_args()
    if bool(args.archive) == bool(args.verify):
        parser.error("provide exactly one of --archive or --verify")
    asyncio.run(main(args))
