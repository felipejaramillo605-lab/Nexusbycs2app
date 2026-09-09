"""Supervisor-managed monthly low-stock alert daemon."""
import asyncio
import os
import signal
import sys
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

sys.path.insert(0, str(Path(__file__).parent))
from low_stock_alerts import process_low_stock_alerts

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")
running = True


def signal_handler(signum, frame):
    global running
    print(f"low_stock_daemon_shutdown signal={signum}")
    running = False


signal.signal(signal.SIGTERM, signal_handler)
signal.signal(signal.SIGINT, signal_handler)


async def run_cycle():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    try:
        return await process_low_stock_alerts(client[os.environ["DB_NAME"]])
    finally:
        client.close()


async def run_daemon():
    global running
    print(f"low_stock_daemon_started at={datetime.now(timezone.utc).isoformat()} interval_seconds=300")
    while running:
        try:
            await run_cycle()
        except Exception as exc:
            print(f"low_stock_daemon_cycle_failed diagnostic_code={type(exc).__name__}")
        for _ in range(30):
            if not running:
                break
            await asyncio.sleep(10)
    print(f"low_stock_daemon_stopped at={datetime.now(timezone.utc).isoformat()}")


if __name__ == "__main__":
    try:
        asyncio.run(run_daemon())
    except KeyboardInterrupt:
        pass
    except Exception as exc:
        print(f"low_stock_daemon_fatal diagnostic_code={type(exc).__name__}")
        sys.exit(1)
