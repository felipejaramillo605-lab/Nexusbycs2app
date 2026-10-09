"""FASE 6 (auditoria 2026-08-11): linea de tiempo de process_appointment_reminders
con reloj controlado, sin red ni Mongo real -- ejercita las funciones reales de
appointment_reminder_delivery.py / appointment_email_delivery.py contra una base
en memoria, igual que ya hace test_class_confirmation_delivery.py para clases.

Cubre lo pedido por la auditoria: encolado + entrega unica (idempotencia al
ejecutar dos veces), recuperacion de un reclamo expirado, reintento de un fallo
del proveedor sin duplicar, y que un fallo de WhatsApp (canal Premium adicional)
nunca marque como fallido un correo ya aceptado.

Nota de diseno: `process_appointment_reminders(..., at=...)` solo usa `at` para
elegir la fecha objetivo (mañana). Las marcas de tiempo internas de la cola
(`claim_delivery_by_key`, `record_attempt`) siempre llaman a `now_utc()` real.
Por eso el reloj controlado de esta prueba se monta sobre `now_utc` (mockeado
solo en el test, sin tocar produccion) y se avanza explicitamente entre pasos.
"""

import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone
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

import appointment_email_delivery as delivery_subject  # noqa: E402
import appointment_reminder_delivery as subject  # noqa: E402

FIXED_AT = datetime(2026, 8, 11, 12, 0, tzinfo=timezone.utc)  # -> target_date 2026-08-12


class Clock:
    def __init__(self, start):
        self.now = start

    def advance_to(self, value):
        self.now = value

    def advance_by(self, seconds):
        self.now = self.now + timedelta(seconds=seconds)


class SimpleFind:
    def __init__(self, docs):
        self._docs = docs

    def sort(self, *_args, **_kwargs):
        return self

    async def to_list(self, n):
        return [dict(d) for d in self._docs[:n]]


class Appointments:
    def __init__(self, docs):
        self.docs = docs

    def find(self, query, projection=None):
        matched = [
            d
            for d in self.docs
            if d.get("date") == query["date"]
            and d.get("status") in query["status"]["$in"]
            and d.get("reminder_sent") is not True
            and isinstance(d.get("client_email"), str)
            and d.get("client_email") != ""
        ]
        return SimpleFind(matched)

    async def update_one(self, query, update):
        for doc in self.docs:
            if (
                doc["appointment_id"] == query["appointment_id"]
                and doc.get("organization_id") == query.get("organization_id")
                and doc.get("status") in query["status"]["$in"]
                and doc.get("reminder_sent") is not True
            ):
                doc.update(update["$set"])
                return SimpleNamespace(modified_count=1)
        return SimpleNamespace(modified_count=0)


class Organizations:
    def __init__(self, docs):
        self.docs = docs

    async def find_one(self, query, projection=None):
        for doc in self.docs:
            if all(doc.get(k) == v for k, v in query.items()):
                return dict(doc)
        return None


class OrganizationSubscriptions:
    async def find_one(self, query, projection=None):
        return None


class Lookup:
    def __init__(self, docs):
        self.docs = docs

    async def find_one(self, query, projection=None):
        for doc in self.docs:
            if all(doc.get(k) == v for k, v in query.items() if not k.startswith("$")):
                return dict(doc)
        return None


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

    async def find_one_and_update(self, query, update, sort=None, return_document=None, projection=None):
        at = query["next_attempt_at"]["$lte"]
        for doc in self.docs:
            key_ok = doc.get("delivery_key") == query.get("delivery_key") if "delivery_key" in query else True
            if (
                key_ok
                and doc["status"] in query["status"]["$in"]
                and doc["next_attempt_at"] <= at
                and doc["attempt_count"] < doc["max_attempts"]
            ):
                doc.update(update["$set"])
                doc["attempt_count"] += update["$inc"]["attempt_count"]
                return dict(doc)
        return None

    def find(self, query, projection=None):
        matched = [
            d
            for d in self.docs
            if d.get("status") == query.get("status")
            and d.get("processing_expires_at") is not None
            and d["processing_expires_at"] <= query["processing_expires_at"]["$lte"]
        ]
        return SimpleFind(matched)

    async def update_one(self, query, update):
        for doc in self.docs:
            if doc["delivery_id"] != query["delivery_id"]:
                continue
            if "status" in query and doc["status"] != query["status"]:
                continue
            if "processing_expires_at" in query and not (
                doc.get("processing_expires_at") is not None
                and doc["processing_expires_at"] <= query["processing_expires_at"]["$lte"]
            ):
                continue
            if "processing_worker_id" in query and doc.get("processing_worker_id") != query["processing_worker_id"]:
                continue
            doc.update(update["$set"])
            for field in update.get("$unset", {}):
                doc.pop(field, None)
            return SimpleNamespace(modified_count=1)
        return SimpleNamespace(modified_count=0)


class Attempts:
    def __init__(self):
        self.docs = []

    async def insert_one(self, doc):
        self.docs.append(dict(doc))


def make_db(org=None, appointment=None):
    org = org or {"organization_id": "org_E2E_fase6", "name": "E2E Fase 6"}
    appt = appointment or {
        "appointment_id": "apt_E2E_fase6_1",
        "organization_id": org["organization_id"],
        "client_email": "cliente.e2e.fase6@example.com",
        "client_name": "Cliente E2E",
        "status": "confirmed",
        "date": "2026-08-12",
        "time": "10:00",
    }
    return SimpleNamespace(
        appointments=Appointments([appt]),
        organizations=Organizations([org]),
        organization_subscriptions=OrganizationSubscriptions(),
        barbers=Lookup([]),
        services=Lookup([]),
        clients=Lookup([]),
        appointment_email_deliveries=Deliveries(),
        appointment_email_attempts=Attempts(),
    )


def run_cycle(db, sender, clock, monkeypatch):
    monkeypatch.setattr(delivery_subject, "now_utc", lambda: clock.now)
    monkeypatch.setattr(subject.email_service, "send_appointment_reminder", lambda **_kwargs: sender())
    return asyncio.run(subject.process_appointment_reminders(db, worker_id="fase6_diag", at=FIXED_AT))


def test_timeline_queue_accept_idempotent(monkeypatch):
    timeline = []
    clock = Clock(FIXED_AT)
    db = make_db()

    summary = run_cycle(db, lambda: True, clock, monkeypatch)
    timeline.append(("t0_first_cycle_accepted", summary))
    assert summary["accepted"] == 1 and summary["eligible"] == 1
    assert db.appointments.docs[0]["reminder_sent"] is True
    assert db.appointment_email_deliveries.docs[0]["status"] == "provider_accepted"
    assert len(db.appointment_email_deliveries.docs) == 1

    # Worker reiniciado, mismo ciclo otra vez: no debe reenviar ni duplicar fila.
    summary2 = run_cycle(db, lambda: True, clock, monkeypatch)
    timeline.append(("t1_rerun_is_idempotent", summary2))
    assert summary2["eligible"] == 0, "la cita ya tiene reminder_sent=True, no vuelve a seleccionarse"
    assert len(db.appointment_email_deliveries.docs) == 1, "no se crea una segunda entrega para la misma cita"

    for label, data in timeline:
        print(f"FASE6_TIMELINE {label}: {data}")


def test_stale_claim_is_recovered_and_then_delivered(monkeypatch):
    timeline = []
    clock = Clock(FIXED_AT)
    db = make_db(
        appointment={
            "appointment_id": "apt_E2E_fase6_2",
            "organization_id": "org_E2E_fase6",
            "client_email": "cliente.e2e.fase6b@example.com",
            "client_name": "Cliente E2E B",
            "status": "confirmed",
            "date": "2026-08-12",
            "time": "11:00",
        }
    )
    monkeypatch.setattr(delivery_subject, "now_utc", lambda: clock.now)

    # Worker A reclama la entrega y se cae antes de responder (queda "processing").
    queued = asyncio.run(
        delivery_subject.enqueue_delivery(
            db,
            organization_id="org_E2E_fase6",
            appointment_id="apt_E2E_fase6_2",
            event_type="reminder_24h",
            recipient="cliente.e2e.fase6b@example.com",
            payload={},
            scheduled_for=FIXED_AT,
        )
    )
    claimed = asyncio.run(
        delivery_subject.claim_delivery_by_key(db, queued["delivery"]["delivery_key"], "stale_worker")
    )
    assert claimed["status"] == "processing"
    timeline.append(("A_worker_claims_then_dies", {"status": claimed["status"]}))

    clock.advance_by(301)  # excede el lease de 300s sin que el worker A responda
    recovered = asyncio.run(delivery_subject.recover_expired_claims(db, at=clock.now))
    timeline.append(("B_stale_claim_recovered", {"recovered": recovered}))
    assert recovered == 1
    row = db.appointment_email_deliveries.docs[0]
    assert row["status"] == "failed" and row["next_attempt_at"] is not None

    # Worker B, en el siguiente ciclo, ya puede reclamarla y entregarla.
    clock.advance_to(row["next_attempt_at"])
    summary = run_cycle(db, lambda: True, clock, monkeypatch)
    timeline.append(("C_next_cycle_delivers_recovered_claim", summary))
    assert summary["accepted"] == 1
    assert len(db.appointment_email_deliveries.docs) == 1, "la recuperacion no duplico la fila"
    assert db.appointment_email_deliveries.docs[0]["status"] == "provider_accepted"

    for label, data in timeline:
        print(f"FASE6_TIMELINE {label}: {data}")


def test_provider_failure_retries_without_duplicating(monkeypatch):
    timeline = []
    clock = Clock(FIXED_AT)
    db = make_db(
        appointment={
            "appointment_id": "apt_E2E_fase6_3",
            "organization_id": "org_E2E_fase6",
            "client_email": "cliente.e2e.fase6c@example.com",
            "client_name": "Cliente E2E C",
            "status": "confirmed",
            "date": "2026-08-12",
            "time": "12:00",
        }
    )

    summary_fail = run_cycle(db, lambda: False, clock, monkeypatch)
    timeline.append(("A_provider_rejects", summary_fail))
    assert summary_fail["failed"] == 1
    failed_row = db.appointment_email_deliveries.docs[0]
    assert failed_row["status"] == "failed" and failed_row["next_attempt_at"] > clock.now
    assert len(db.appointment_email_deliveries.docs) == 1
    assert db.appointments.docs[0].get("reminder_sent") is not True, "sigue elegible tras el fallo, no se perdio"

    clock.advance_to(failed_row["next_attempt_at"])
    summary_retry = run_cycle(db, lambda: True, clock, monkeypatch)
    timeline.append(("B_retry_succeeds_same_row", summary_retry))
    assert summary_retry["accepted"] == 1
    assert len(db.appointment_email_deliveries.docs) == 1, "el reintento actualiza la misma fila, no crea otra"
    assert db.appointment_email_deliveries.docs[0]["status"] == "provider_accepted"
    assert db.appointment_email_deliveries.docs[0]["attempt_count"] == 2

    for label, data in timeline:
        print(f"FASE6_TIMELINE {label}: {data}")


def test_whatsapp_failure_never_marks_the_accepted_email_as_failed(monkeypatch):
    org = {
        "organization_id": "org_E2E_fase6_wa",
        "name": "E2E Fase 6 WA",
        "premium_templates_contracted": True,
        "operating_country": "CO",
        "notification_settings": {"appointment_reminder_whatsapp_enabled": True},
    }
    appt = {
        "appointment_id": "apt_E2E_fase6_wa_1",
        "organization_id": org["organization_id"],
        "client_email": "cliente.e2e.fase6wa@example.com",
        "client_phone": "+573000000099",
        "client_name": "Cliente E2E WA",
        "status": "confirmed",
        "date": "2026-08-12",
        "time": "09:00",
    }
    db = make_db(org=org, appointment=appt)
    db.clients = Lookup(
        [{"organization_id": org["organization_id"], "phone": appt["client_phone"], "messaging_consent": True}]
    )

    async def failing_whatsapp(*_args, **_kwargs):
        raise RuntimeError("provider_unreachable")

    monkeypatch.setattr(subject.whatsapp_service, "send_whatsapp_message", failing_whatsapp)
    clock = Clock(FIXED_AT)

    summary = run_cycle(db, lambda: True, clock, monkeypatch)
    assert summary["accepted"] == 1, "el correo se contabiliza como aceptado aunque WhatsApp falle despues"
    assert summary["failed"] == 0, "un fallo de WhatsApp no debe inflar el contador de fallidos del ciclo"
    email_delivery = db.appointment_email_deliveries.docs[0]
    assert (
        email_delivery["status"] == "provider_accepted"
    ), "el fallo de WhatsApp no debe tocar el estado del correo ya aceptado"
    print(f"FASE6_TIMELINE D_whatsapp_failure_email_still_accepted: {email_delivery['status']} summary={summary}")
