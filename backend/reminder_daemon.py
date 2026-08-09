"""Supervisor-managed appointment reminder daemon."""
import asyncio
import os
import signal
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

sys.path.insert(0, str(Path(__file__).parent))
from appointment_reminder_delivery import process_appointment_reminders

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")
running = True


def signal_handler(signum, frame):
    global running
    print(f"reminder_daemon_shutdown signal={signum}")
    running = False


signal.signal(signal.SIGTERM, signal_handler)
signal.signal(signal.SIGINT, signal_handler)


async def send_appointment_reminders():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    try:
        return await process_appointment_reminders(
            client[os.environ["DB_NAME"]],
            worker_id="reminder_daemon",
        )
    finally:
        client.close()


async def run_daemon():
    global running
    print(f"reminder_daemon_started at={datetime.now(timezone.utc).isoformat()} interval_seconds=3600")
    while running:
        try:
            await send_appointment_reminders()
            for _ in range(360):
                if not running:
                    break
                await asyncio.sleep(10)
        except Exception as exc:
            print(f"reminder_daemon_cycle_failed diagnostic_code={type(exc).__name__}")
            if running:
                await asyncio.sleep(300)
    print(f"reminder_daemon_stopped at={datetime.now(timezone.utc).isoformat()}")


if __name__ == "__main__":
    try:
        asyncio.run(run_daemon())
    except KeyboardInterrupt:
        pass
    except Exception as exc:
        print(f"reminder_daemon_fatal diagnostic_code={type(exc).__name__}")
        sys.exit(1)
