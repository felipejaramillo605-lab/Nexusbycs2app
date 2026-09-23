#!/usr/bin/env python3
"""One-time, offline bootstrap for the platform portal-template capability."""
import argparse
import asyncio
import os
from pathlib import Path
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from platform_capabilities import bootstrap_initial_grant

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / ".env")

async def main(user_id: str) -> None:
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    try:
        result = await bootstrap_initial_grant(client[os.environ["DB_NAME"]], user_id)
        status = "created" if result["created"] else "already initialized for the same owner"
        print(f"Portal-template capability bootstrap {status}; user_id={user_id}; version={result['version']}")
    finally:
        client.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--user-id", required=True)
    parser.add_argument("--confirm", action="store_true", help="Confirm this one-time offline bootstrap")
    args = parser.parse_args()
    if not args.confirm:
        parser.error("--confirm is required")
    asyncio.run(main(args.user_id))
