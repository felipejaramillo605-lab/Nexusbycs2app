#!/usr/bin/env python3
"""Offline reconciliation for pending portal-template entitlement audit events."""
import asyncio
import os
from pathlib import Path
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from platform_capabilities import (
    acquire_platform_maintenance_lock,
    reconcile_pending_entitlements,
    release_platform_maintenance_lock,
)

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / ".env")

async def main() -> None:
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    try:
        db = client[os.environ["DB_NAME"]]
        lock_id = await acquire_platform_maintenance_lock(db)
        try:
            result = await reconcile_pending_entitlements(db, lock_id)
        finally:
            if not await release_platform_maintenance_lock(db, lock_id):
                raise RuntimeError("Could not release platform maintenance lock; follow the maintenance runbook")
        print(f"Entitlement reconciliation: applied={result['applied']} failed={result['failed']} still_pending={result['pending']}")
    finally:
        client.close()

if __name__ == "__main__":
    asyncio.run(main())
