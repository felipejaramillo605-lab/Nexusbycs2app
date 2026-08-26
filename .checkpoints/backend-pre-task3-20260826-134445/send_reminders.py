"""One-shot appointment reminder runner using the persistent delivery system."""
import asyncio
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

sys.path.insert(0, str(Path(__file__).parent))
from appointment_reminder_delivery import process_appointment_reminders

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")


async def main():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    try:
        await process_appointment_reminders(
            client[os.environ["DB_NAME"]],
            worker_id="manual_reminder_runner",
        )
    finally:
        client.close()


if __name__ == "__main__":
    asyncio.run(main())
