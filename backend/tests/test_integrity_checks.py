"""Tests for the cross-domain integrity report (plan PR 23): bookings,
billing, and procurement orphaned-foreign-key findings, following the same
read-only reconciliation pattern professional_media_lifecycle.py already
established.
"""

import sys
from pathlib import Path
from types import SimpleNamespace

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from integrity_checks import build_integrity_router  # noqa: E402


class FakeCursor:
    def __init__(self, rows):
        self.rows = rows

    async def to_list(self, length):
        return [dict(r) for r in self.rows[:length]]


class FakeCollection:
    def __init__(self, *rows):
        self.rows = [dict(r) for r in rows]

    def find(self, query=None, projection=None):
        return FakeCursor(self.rows)


def _database(**collections):
    defaults = dict(
        class_sessions=FakeCollection(),
        class_bookings=FakeCollection(),
        barbers=FakeCollection(),
        services=FakeCollection(),
        appointments=FakeCollection(),
        organizations=FakeCollection(),
        subscription_invoices=FakeCollection(),
        organization_subscriptions=FakeCollection(),
        suppliers=FakeCollection(),
        purchase_orders=FakeCollection(),
        purchase_receipts=FakeCollection(),
    )
    defaults.update(collections)
    return SimpleNamespace(**defaults)


def _client(database, role="owner"):
    async def get_current_user(authorization, session_token):
        if authorization != "Bearer test-owner":
            raise HTTPException(status_code=401, detail="Not authenticated")
        return SimpleNamespace(role=role, access_status="approved", user_id="owner-1")

    app = FastAPI()
    app.include_router(build_integrity_router(database, get_current_user), prefix="/api")
    return TestClient(app)


def _get(client, **params):
    return client.get("/api/owner/integrity/report", params=params, headers={"Authorization": "Bearer test-owner"})


def test_clean_data_produces_no_findings():
    database = _database(
        barbers=FakeCollection({"barber_id": "b1"}),
        services=FakeCollection({"service_id": "s1"}),
        class_sessions=FakeCollection({"class_session_id": "cs1", "organization_id": "org-1", "barber_id": "b1", "service_id": "s1"}),
        class_bookings=FakeCollection({"class_booking_id": "cb1", "organization_id": "org-1", "class_session_id": "cs1"}),
    )
    client = _client(database)

    response = _get(client)

    assert response.status_code == 200
    body = response.json()
    assert body["total_findings"] == 0
    assert body["mode"] == "read_only"


def test_orphaned_class_booking_is_flagged():
    database = _database(
        class_bookings=FakeCollection({"class_booking_id": "cb1", "organization_id": "org-1", "class_session_id": "missing-session"}),
    )
    client = _client(database)

    response = _get(client, domain="bookings")

    body = response.json()
    assert body["total_findings"] == 1
    assert body["findings"][0]["kind"] == "orphaned_class_booking"
    assert body["findings"][0]["domain"] == "bookings"


def test_class_session_missing_barber_and_service_both_flagged():
    database = _database(
        class_sessions=FakeCollection({"class_session_id": "cs1", "organization_id": "org-1", "barber_id": "missing-barber", "service_id": "missing-service"}),
    )
    client = _client(database)

    response = _get(client, domain="bookings")

    kinds = {f["kind"] for f in response.json()["findings"]}
    assert kinds == {"class_session_missing_barber", "class_session_missing_service"}


def test_appointment_missing_barber_is_flagged():
    database = _database(
        appointments=FakeCollection({"appointment_id": "a1", "organization_id": "org-1", "barber_id": "missing", "service_id": "missing"}),
    )
    client = _client(database)

    response = _get(client, domain="bookings")

    kinds = {f["kind"] for f in response.json()["findings"]}
    assert "appointment_missing_barber" in kinds
    assert "appointment_missing_service" in kinds


def test_billing_domain_flags_invoice_and_subscription_without_organization():
    database = _database(
        subscription_invoices=FakeCollection({"invoice_id": "inv1", "organization_id": "missing-org"}),
        organization_subscriptions=FakeCollection({"subscription_id": "sub1", "organization_id": "missing-org"}),
    )
    client = _client(database)

    response = _get(client, domain="billing")

    body = response.json()
    assert body["total_findings"] == 2
    kinds = {f["kind"] for f in body["findings"]}
    assert kinds == {"invoice_missing_organization", "subscription_missing_organization"}


def test_procurement_domain_flags_order_and_receipt_orphans():
    database = _database(
        purchase_orders=FakeCollection({"purchase_order_id": "po1", "organization_id": "org-1", "supplier_id": "missing-supplier"}),
        purchase_receipts=FakeCollection({"receipt_id": "r1", "organization_id": "org-1", "purchase_order_id": "missing-po"}),
    )
    client = _client(database)

    response = _get(client, domain="procurement")

    body = response.json()
    assert body["total_findings"] == 2
    kinds = {f["kind"] for f in body["findings"]}
    assert kinds == {"purchase_order_missing_supplier", "purchase_receipt_missing_order"}


def test_domain_filter_excludes_other_domains():
    database = _database(
        class_bookings=FakeCollection({"class_booking_id": "cb1", "organization_id": "org-1", "class_session_id": "missing"}),
        subscription_invoices=FakeCollection({"invoice_id": "inv1", "organization_id": "missing-org"}),
    )
    client = _client(database)

    response = _get(client, domain="billing")

    body = response.json()
    assert body["total_findings"] == 1
    assert body["findings"][0]["domain"] == "billing"


def test_no_domain_filter_merges_all_three():
    database = _database(
        class_bookings=FakeCollection({"class_booking_id": "cb1", "organization_id": "org-1", "class_session_id": "missing"}),
        subscription_invoices=FakeCollection({"invoice_id": "inv1", "organization_id": "missing-org"}),
        purchase_orders=FakeCollection({"purchase_order_id": "po1", "organization_id": "org-1", "supplier_id": "missing-supplier"}),
    )
    client = _client(database)

    response = _get(client)

    body = response.json()
    assert body["total_findings"] == 3
    assert body["summary"] == {"bookings": 1, "billing": 1, "procurement": 1}


def test_report_hash_is_deterministic_for_the_same_findings():
    database = _database(
        class_bookings=FakeCollection({"class_booking_id": "cb1", "organization_id": "org-1", "class_session_id": "missing"}),
    )
    client = _client(database)

    first = _get(client, domain="bookings").json()
    second = _get(client, domain="bookings").json()

    assert first["report_hash"] == second["report_hash"]


def test_rejects_an_unsupported_domain():
    client = _client(_database())

    response = _get(client, domain="not-a-real-domain")

    assert response.status_code == 400


def test_is_owner_only():
    client = _client(_database(), role="manager")

    response = _get(client)

    assert response.status_code == 403


def test_report_declares_its_fetch_limit_coverage():
    client = _client(_database())

    response = _get(client)

    coverage = response.json()["coverage"]
    assert coverage["fetch_limit"] == 5000
    assert "5000" in coverage["note"]


def test_class_booking_referencing_a_session_from_another_organization_is_flagged():
    database = _database(
        class_sessions=FakeCollection({"class_session_id": "cs1", "organization_id": "org-2", "barber_id": "b1", "service_id": "s1"}),
        class_bookings=FakeCollection({"class_booking_id": "cb1", "organization_id": "org-1", "class_session_id": "cs1"}),
    )
    client = _client(database)

    response = _get(client, domain="bookings")

    body = response.json()
    kinds = {f["kind"] for f in body["findings"]}
    assert "class_booking_wrong_organization" in kinds
    assert "orphaned_class_booking" not in kinds
    match = next(f for f in body["findings"] if f["kind"] == "class_booking_wrong_organization")
    assert match["organization_id"] == "org-1"
    assert "org-2" in match["detail"]


def test_class_session_referencing_a_barber_and_service_from_another_organization_is_flagged():
    database = _database(
        barbers=FakeCollection({"barber_id": "b1", "organization_id": "org-2"}),
        services=FakeCollection({"service_id": "s1", "organization_id": "org-3"}),
        class_sessions=FakeCollection({"class_session_id": "cs1", "organization_id": "org-1", "barber_id": "b1", "service_id": "s1"}),
    )
    client = _client(database)

    response = _get(client, domain="bookings")

    kinds = {f["kind"] for f in response.json()["findings"]}
    assert kinds == {"class_session_barber_wrong_organization", "class_session_service_wrong_organization"}


def test_appointment_referencing_a_barber_from_another_organization_is_flagged():
    database = _database(
        barbers=FakeCollection({"barber_id": "b1", "organization_id": "org-2"}),
        services=FakeCollection({"service_id": "s1", "organization_id": "org-1"}),
        appointments=FakeCollection({"appointment_id": "a1", "organization_id": "org-1", "barber_id": "b1", "service_id": "s1"}),
    )
    client = _client(database)

    response = _get(client, domain="bookings")

    kinds = {f["kind"] for f in response.json()["findings"]}
    assert kinds == {"appointment_barber_wrong_organization"}


def test_purchase_order_and_receipt_referencing_another_organization_are_flagged():
    database = _database(
        suppliers=FakeCollection({"supplier_id": "sup1", "organization_id": "org-2"}),
        purchase_orders=FakeCollection({"purchase_order_id": "po1", "organization_id": "org-1", "supplier_id": "sup1"}),
        purchase_receipts=FakeCollection({"receipt_id": "r1", "organization_id": "org-3", "purchase_order_id": "po1"}),
    )
    client = _client(database)

    response = _get(client, domain="procurement")

    kinds = {f["kind"] for f in response.json()["findings"]}
    assert kinds == {"purchase_order_supplier_wrong_organization", "purchase_receipt_order_wrong_organization"}


def test_reference_without_a_recorded_organization_is_not_flagged_as_a_mismatch():
    # Same fixture shape existing tests already use (barbers/services with no
    # organization_id) -- must stay a clean report, not a false positive.
    database = _database(
        barbers=FakeCollection({"barber_id": "b1"}),
        services=FakeCollection({"service_id": "s1"}),
        class_sessions=FakeCollection({"class_session_id": "cs1", "organization_id": "org-1", "barber_id": "b1", "service_id": "s1"}),
    )
    client = _client(database)

    response = _get(client, domain="bookings")

    assert response.json()["total_findings"] == 0
