"""La confirmacion de cupo de una clase grupal debe pasar por la cola de entregas (sin red, base simulada).

Regresion: `class_confirmation` no estaba en `EVENT_TYPES`, `delivery_key` lanzaba ValueError y
`_send_class_booking_confirmation` lo tragaba como "trace failed": el correo nunca se intentaba. La prueba existente
simulaba `execute_compatibility_delivery`, por eso no lo detecto.
"""

import ast
import asyncio
import os
import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
for key, value in {
    "MONGO_URL": "mongodb://localhost:27017",
    "DB_NAME": "t",
    "EMERGENT_LLM_KEY": "k",
    "CORS_ORIGINS": "http://localhost:3000",
}.items():
    os.environ.setdefault(key, value)

import appointment_email_delivery as subject  # noqa: E402
import appointment_email_dispatcher  # noqa: E402

BACKEND = Path(__file__).resolve().parents[1]


class Deliveries:
    def __init__(self):
        self.docs = []

    async def find_one(self, query, projection=None):
        for doc in self.docs:
            if all(doc.get(k) == v for k, v in query.items()):
                return dict(doc)
        return None

    async def insert_one(self, doc):
        self.docs.append(dict(doc))

    async def find_one_and_update(self, query, update, **kwargs):
        for doc in self.docs:
            if doc["delivery_key"] == query["delivery_key"] and doc["status"] in query["status"]["$in"]:
                doc.update(update["$set"])
                doc["attempt_count"] = doc.get("attempt_count", 0) + update["$inc"]["attempt_count"]
                return dict(doc)
        return None

    async def update_one(self, query, update):
        for doc in self.docs:
            if doc["delivery_id"] == query["delivery_id"] and doc["status"] == query["status"]:
                doc.update(update["$set"])
                return SimpleNamespace(modified_count=1)
        return SimpleNamespace(modified_count=0)


class Attempts:
    def __init__(self):
        self.docs = []

    async def insert_one(self, doc):
        self.docs.append(dict(doc))


def run_delivery(sender, event_type="class_confirmation"):
    db = SimpleNamespace(appointment_email_deliveries=Deliveries(), appointment_email_attempts=Attempts())
    result = asyncio.run(
        subject.execute_compatibility_delivery(
            db,
            organization_id="org_a",
            appointment_id="cbk_1",
            event_type=event_type,
            recipient="Cliente@Example.com",
            payload={"customer_name": "Ana"},
            sender=sender,
            worker_id="class_booking_confirmation",
        )
    )
    return db, result


def test_a_class_confirmation_is_queued_sent_and_recorded():
    sent = []
    db, result = run_delivery(lambda: sent.append(1) or True)
    assert sent == [1] and result["status"] == "provider_accepted" and result["accepted"] is True
    row = db.appointment_email_deliveries.docs[0]
    assert row["event_type"] == "class_confirmation" and row["recipient"] == "cliente@example.com"
    assert db.appointment_email_attempts.docs[0]["status"] == "provider_accepted"


def test_a_failed_send_is_recorded_for_retry_not_lost():
    db, result = run_delivery(lambda: False)
    assert result["status"] == "failed" and result["accepted"] is False
    assert db.appointment_email_deliveries.docs[0]["status"] == "failed"


def test_the_same_booking_is_not_sent_twice():
    db = SimpleNamespace(appointment_email_deliveries=Deliveries(), appointment_email_attempts=Attempts())
    sent = []
    for _ in range(2):
        asyncio.run(
            subject.execute_compatibility_delivery(
                db,
                organization_id="org_a",
                appointment_id="cbk_1",
                event_type="class_confirmation",
                recipient="a@b.co",
                payload={},
                sender=lambda: sent.append(1) or True,
            )
        )
    assert sent == [1]


    """Todo `event_type="..."` pasado a la cola debe existir en EVENT_TYPES (si no, el correo se pierde en silencio)."""
    """Cualquier `event_type="..."` pasado a la cola debe existir en EVENT_TYPES (si no, el correo se pierde en silencio)."""
    used = set()
    for path in list(BACKEND.glob("*.py")):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if isinstance(node, ast.Call):
                name = getattr(node.func, "id", getattr(node.func, "attr", ""))
                if name in {"execute_compatibility_delivery", "enqueue_delivery"}:
                    for keyword in node.keywords:
                        if keyword.arg == "event_type" and isinstance(keyword.value, ast.Constant):
                            used.add(keyword.value.value)
    assert "class_confirmation" in used
    assert used <= subject.EVENT_TYPES, used - subject.EVENT_TYPES


def test_every_dispatcher_contract_event_is_also_a_queue_event():
    contracts = (
        set(appointment_email_dispatcher.CONTRACTS) if hasattr(appointment_email_dispatcher, "CONTRACTS") else set()
    )
    names = [
        n
        for n in dir(appointment_email_dispatcher)
        if n.isupper() and isinstance(getattr(appointment_email_dispatcher, n), dict)
    ]
    for name in names:
        value = getattr(appointment_email_dispatcher, name)
        if "class_confirmation" in value:
            contracts = set(value)
    assert contracts and contracts <= subject.EVENT_TYPES, contracts - subject.EVENT_TYPES
