"""Supervisor-managed daily birthday-reminder daemon."""
import asyncio
import os
import signal
import sys
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

sys.path.insert(0, str(Path(__file__).parent))
from birthday_alerts import process_birthday_alerts

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")
running = True


def signal_handler(signum, frame):
    global running
    print(f"birthday_reminder_daemon_shutdown signal={signum}")
    running = False


signal.signal(signal.SIGTERM, signal_handler)
signal.signal(signal.SIGINT, signal_handler)


async def run_cycle():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    try:
        return await process_birthday_alerts(client[os.environ["DB_NAME"]])
    finally:
        client.close()


async def run_daemon():
    global running
    # NEXUS_DAEMON_CADENCE_RELAX_V1: birthday_alerts.process_birthday_alerts ya
    # se auto-limita a una corrida por organización por día (birthday_alert_runs,
    # period=YYYY-MM-DD) -- un cumpleaños solo cambia una vez cada 24h, así que
    # revisar cada 5 min era puro overhead. 30 min sigue dejando margen de sobra
    # dentro de la ventana horaria configurable sin sondear de más.
    print(f"birthday_reminder_daemon_started at={datetime.now(timezone.utc).isoformat()} interval_seconds=1800")
    while running:
        try:
            await run_cycle()
        except Exception as exc:
            print(f"birthday_reminder_daemon_cycle_failed diagnostic_code={type(exc).__name__}")
        for _ in range(180):
            if not running:
                break
            await asyncio.sleep(10)
    print(f"birthday_reminder_daemon_stopped at={datetime.now(timezone.utc).isoformat()}")


if __name__ == "__main__":
    try:
        asyncio.run(run_daemon())
    except KeyboardInterrupt:
        pass
    except Exception as exc:
        print(f"birthday_reminder_daemon_fatal diagnostic_code={type(exc).__name__}")
        sys.exit(1)
