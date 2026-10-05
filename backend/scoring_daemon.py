"""Optional, recommendation-only customer-risk scoring worker.

It is intentionally separate from the web process.  No score can send a
message, create a booking, or mutate a customer record.
"""
import asyncio
import os
import signal
import sys
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

sys.path.insert(0, str(Path(__file__).parent))
from customer_risk_scoring import refresh_scores

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")
running = True


def signal_handler(signum, _frame):
    global running
    print(f"customer_risk_daemon_shutdown signal={signum}")
    running = False


signal.signal(signal.SIGTERM, signal_handler)
signal.signal(signal.SIGINT, signal_handler)


def enabled():
    return os.environ.get("CUSTOMER_RISK_DAEMON_ENABLED", "false").lower() == "true"


async def run_cycle():
    if not enabled():
        return {"mode": "disabled"}
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    try:
        return await refresh_scores(client[os.environ["DB_NAME"]])
    finally:
        client.close()


async def run_daemon():
    print(f"customer_risk_daemon_started at={datetime.now(timezone.utc).isoformat()} interval_seconds=21600")
    while running:
        try:
            result = await run_cycle()
            print(f"customer_risk_daemon_cycle mode={result.get('mode', 'recommendation_only')}")
        except Exception as exc:
            print(f"customer_risk_daemon_cycle_failed diagnostic_code={type(exc).__name__}")
        for _ in range(2160):
            if not running:
                break
            await asyncio.sleep(10)


if __name__ == "__main__":
    asyncio.run(run_daemon())
