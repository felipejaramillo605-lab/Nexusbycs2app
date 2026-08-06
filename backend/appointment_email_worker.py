# NEXUS_8A7G1B2B2_APPOINTMENT_EMAIL_WORKER_V1
from __future__ import annotations

import asyncio
import logging
import os
import signal
import socket
from typing import Any, Awaitable, Callable

from appointment_email_delivery import claim_delivery, record_attempt, recover_expired_claims
from appointment_email_dispatcher import dispatch_claimed_delivery

logger = logging.getLogger(__name__)


def worker_interval_seconds() -> int:
    return max(2, min(int(os.getenv("APPOINTMENT_EMAIL_WORKER_INTERVAL_SECONDS", "15")), 3600))


def worker_batch_size() -> int:
    return max(1, min(int(os.getenv("APPOINTMENT_EMAIL_WORKER_BATCH_SIZE", "10")), 100))


def build_worker_id() -> str:
    hostname = socket.gethostname().strip() or "unknown-host"
    return f"appointment-email-worker:{hostname}:{os.getpid()}"


async def process_claimed_delivery(
    db,
    delivery: dict[str, Any],
    *,
    dispatcher: Callable[[dict[str, Any]], Awaitable[dict[str, Any]]] = dispatch_claimed_delivery,
    recorder=record_attempt,
) -> dict[str, Any]:
    try:
        result = await dispatcher(delivery)
    except Exception as exc:
        result = {
            "accepted": False,
            "provider": "worker",
            "provider_response_code": "dispatch_exception",
            "error_code": type(exc).__name__,
        }
    accepted = bool(result.get("accepted"))
    status = "provider_accepted" if accepted else "failed"
    await recorder(
        db,
        delivery,
        status=status,
        provider=str(result.get("provider") or "smtp")[:40],
        provider_response_code=str(result.get("provider_response_code") or ("accepted" if accepted else "failed"))[:80],
        error_code=result.get("error_code"),
    )
    return {
        "accepted": accepted,
        "status": status,
        "delivery_id": delivery.get("delivery_id"),
    }


async def run_worker_cycle(
    db,
    *,
    worker_id: str | None = None,
    batch_size: int | None = None,
    claim=claim_delivery,
    recover=recover_expired_claims,
    dispatcher=dispatch_claimed_delivery,
    recorder=record_attempt,
) -> dict[str, int]:
    identity = worker_id or build_worker_id()
    limit = worker_batch_size() if batch_size is None else max(1, min(int(batch_size), 100))
    summary = {"recovered": 0, "claimed": 0, "accepted": 0, "failed": 0}
    summary["recovered"] = int(await recover(db))
    for _ in range(limit):
        delivery = await claim(db, identity)
        if not delivery:
            break
        summary["claimed"] += 1
        result = await process_claimed_delivery(
            db,
            delivery,
            dispatcher=dispatcher,
            recorder=recorder,
        )
        if result["accepted"]:
            summary["accepted"] += 1
        else:
            summary["failed"] += 1
    logger.info(
        "appointment_email_worker_cycle recovered=%s claimed=%s accepted=%s failed=%s",
        summary["recovered"],
        summary["claimed"],
        summary["accepted"],
        summary["failed"],
    )
    return summary


async def worker_loop(db, stop_event: asyncio.Event, *, worker_id: str | None = None) -> None:
    identity = worker_id or build_worker_id()
    logger.info("appointment_email_worker_started")
    while not stop_event.is_set():
        try:
            await run_worker_cycle(db, worker_id=identity)
        except Exception as exc:
            logger.warning("appointment_email_worker_cycle_failed diagnostic_code=%s", type(exc).__name__)
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=worker_interval_seconds())
        except asyncio.TimeoutError:
            pass
    logger.info("appointment_email_worker_stopped")


async def main() -> None:
    from dotenv import load_dotenv
    from motor.motor_asyncio import AsyncIOMotorClient
    from pathlib import Path

    root_dir = Path(__file__).parent
    load_dotenv(root_dir / ".env")
    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ["DB_NAME"]
    client = AsyncIOMotorClient(mongo_url)
    stop_event = asyncio.Event()
    loop = asyncio.get_running_loop()
    for signum in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(signum, stop_event.set)
    try:
        await worker_loop(client[db_name], stop_event)
    finally:
        client.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
