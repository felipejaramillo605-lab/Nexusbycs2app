import ast
import asyncio
import os
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
for key, value in {
    "MONGO_URL": "mongodb://localhost:27017",
    "DB_NAME": "t",
    "EMERGENT_LLM_KEY": "k",
    "CORS_ORIGINS": "http://localhost:3000",
}.items():
    os.environ.setdefault(key, value)

import server  # noqa: E402


def function_source(name):
    source = (BACKEND / "server.py").read_text(encoding="utf-8")
    node = next(n for n in ast.walk(ast.parse(source)) if isinstance(n, ast.AsyncFunctionDef) and n.name == name)
    return ast.get_source_segment(source, node) or ""


def test_staff_walkin_route_is_scoped_to_the_authenticated_professional():
    body = function_source("create_staff_walkin_appointment")
    assert "resolve_current_staff_barber(current_user)" in body
    assert 'organization_id, barber_id = barber["organization_id"], barber["barber_id"]' in body
    assert 'source="staff_walkin"' in body and "_create_presential_appointment" in body


def test_the_shared_helper_keeps_walkin_clients_as_guests_without_marketing():
    body = function_source("_create_presential_appointment")
    assert "marketing_consent=False" in body
    assert '"is_registered": False' in body and '"accepts_marketing": False' in body
    assert "create_public_appointment" in body


def test_blank_email_from_the_form_is_optional_not_invalid():
    base = {
        "service_id": "s",
        "client_name": "Ana",
        "client_phone": "3001234567",
        "date": "2030-01-01",
        "time": "10:00",
    }
    assert server.StaffWalkinAppointmentCreate(**base, client_email="").client_email is None
    assert server.StaffWalkinAppointmentCreate(**base, client_email="  ").client_email is None
    assert server.StaffWalkinAppointmentCreate(**base).client_email is None
    assert server.StaffWalkinAppointmentCreate(**base, client_email="a@b.co").client_email == "a@b.co"
    assert server.ManagerWalkinAppointmentCreate(**base, barber_id="b1", client_email="").client_email is None


def test_appointments_without_email_are_stored_as_text_so_listing_does_not_break():
    source = (BACKEND / "server.py").read_text(encoding="utf-8")
    assert '"client_email": data.client_email or ""' in source


# ---------------- Cita presencial del manager (comportamiento con fakes) ----------------


class Coll:
    def __init__(self, docs=None):
        self.docs = list(docs or [])
        self.updates = []
        self.inserts = []

    @staticmethod
    def matches(doc, key, value):
        if isinstance(value, dict) and "$ne" in value:
            return doc.get(key) != value["$ne"]
        return doc.get(key) == value

    async def find_one(self, query, projection=None):
        for doc in self.docs:
            if all(self.matches(doc, k, v) for k, v in query.items()):
                return dict(doc)
        return None

    async def update_one(self, query, update, upsert=False):
        self.updates.append((query, update["$set"]))

    async def insert_one(self, doc):
        self.inserts.append(dict(doc))


def build(monkeypatch, role="manager", org="org_a", clients=()):
    db = SimpleNamespace(
        organizations=Coll([{"organization_id": "org_a"}, {"organization_id": "org_b"}]),
        barbers=Coll(
            [
                {"barber_id": "b1", "organization_id": "org_a", "active": True},
                {"barber_id": "b_off", "organization_id": "org_a", "active": False},
                {"barber_id": "b_other", "organization_id": "org_b", "active": True},
            ]
        ),
        clients=Coll(clients),
        platform_audit_log=Coll(),
    )
    created = []

    async def fake_public_create(organization_id, public_data, request):
        created.append((organization_id, public_data))
        return {"appointment_id": "apt_1", "organization_id": organization_id}

    async def current_user(*_):
        return SimpleNamespace(user_id="u_mgr", role=role, organization_id=org, access_status="approved")

    async def noop(*args, **kwargs):
        return None

    monkeypatch.setattr(server, "db", db)
    monkeypatch.setattr(server, "get_current_user", current_user)
    monkeypatch.setattr(server, "record_security_event", noop)
    monkeypatch.setattr(server, "create_public_appointment", fake_public_create)
    handler = getattr(server.create_manager_walkin_appointment, "__wrapped__", server.create_manager_walkin_appointment)
    return db, created, handler


def body(**overrides):
    base = {
        "service_id": "s1",
        "barber_id": "b1",
        "client_name": "Ana",
        "client_phone": "300 123 4567",
        "date": "2030-01-01",
        "time": "10:00",
    }
    return server.ManagerWalkinAppointmentCreate(**{**base, **overrides})


def run(handler, data):
    return asyncio.run(handler(SimpleNamespace(client=None), data, None, "tok"))


def test_manager_creates_a_walkin_in_any_active_professional_of_their_own_organization(monkeypatch):
    db, created, handler = build(monkeypatch)
    result = run(handler, body(client_email=""))
    assert result["appointment_id"] == "apt_1"
    organization_id, public_data = created[0]
    assert organization_id == "org_a" and public_data.barber_id == "b1"
    assert public_data.marketing_consent is False and public_data.client_email is None
    query, update = db.clients.updates[0]
    assert update["source"] == "manager_walkin" and update["created_by"] == "u_mgr"
    assert update["accepts_marketing"] is False and update["is_registered"] is False and update["pin_hash"] is None
    audit = db.platform_audit_log.inserts[0]
    assert audit["event_type"] == "manager_walkin_appointment_created" and audit["organization_id"] == "org_a"


def test_an_existing_client_is_reused_and_not_overwritten(monkeypatch):
    phone = server.sanitize_phone("300 123 4567")
    db, created, handler = build(
        monkeypatch,
        clients=[{"organization_id": "org_a", "phone": phone, "client_id": "c1", "accepts_marketing": True}],
    )
    run(handler, body())
    assert created and db.clients.updates == []
    assert db.platform_audit_log.inserts[0]["new_value"]["client_id"] == "c1"


def test_a_professional_of_another_organization_or_inactive_is_rejected(monkeypatch):
    for barber_id in ("b_other", "b_off", "missing"):
        db, created, handler = build(monkeypatch)
        with pytest.raises(HTTPException) as caught:
            run(handler, body(barber_id=barber_id))
        assert caught.value.status_code == 404 and not created


def test_a_manager_cannot_target_another_organization(monkeypatch):
    db, created, handler = build(monkeypatch)
    with pytest.raises(HTTPException) as caught:
        run(handler, body(organization_id="org_b", barber_id="b_other"))
    assert caught.value.status_code == 403 and not created


def test_staff_and_unassigned_users_cannot_use_the_manager_route(monkeypatch):
    for role, org in (("staff", "org_a"), ("manager", None)):
        db, created, handler = build(monkeypatch, role=role, org=org)
        with pytest.raises(HTTPException) as caught:
            run(handler, body())
        assert caught.value.status_code == 403 and not created


def test_the_audit_category_used_by_presential_appointments_is_a_valid_one():
    import re

    import audit_contracts

    body = function_source("_create_presential_appointment")
    categories = set(re.findall(r'category="([a-z_]+)"', body))
    assert categories and categories <= audit_contracts.CATEGORIES


def test_a_failing_audit_does_not_turn_a_created_appointment_into_an_error(monkeypatch):
    db, created, handler = build(monkeypatch)

    async def broken_audit(*args, **kwargs):
        raise RuntimeError("audit down")

    monkeypatch.setattr(server, "record_audit_event", broken_audit)
    assert run(handler, body())["appointment_id"] == "apt_1" and len(created) == 1
