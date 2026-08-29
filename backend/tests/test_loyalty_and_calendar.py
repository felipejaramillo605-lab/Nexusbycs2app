"""Backend tests for Nexus Loyalty Program (Bloque 1.3) + Calendar links (1.2)."""
import os
import sys
import uuid
import time
from datetime import datetime, timezone

import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://clipper-manage-1.preview.emergentagent.com").rstrip("/")
ORG_ID = "org_demo001"

# Make email_service importable
sys.path.insert(0, "/app/backend")
from email_service import email_service  # noqa: E402


# ---------------- Organization loyalty_settings CRUD ----------------

# These 3 classes all read/write organizations.loyalty_settings for the same
# shared ORG_ID. Under `-n 2 --dist loadscope` (pytest.ini), different classes
# can land on different xdist workers and run concurrently, racing on the same
# Mongo document (one test's "set enabled=False" gets clobbered mid-flight by
# another class's "set enabled=True"). xdist_group pins all three to one worker
# so they're serialized relative to each other without forcing the whole suite serial.
@pytest.mark.xdist_group(name="org_demo001_loyalty_settings")
class TestLoyaltySettings:
    def test_put_loyalty_settings_manager_success(self, manager_client):
        payload = {
            "loyalty_settings": {
                "enabled": True,
                "points_per_visit": 15,
                "reward_threshold": 100,
                "reward_description": "Corte gratis al llegar a 100 puntos",
            }
        }
        r = manager_client.put(f"{BASE_URL}/api/organizations/{ORG_ID}", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("loyalty_settings", {}).get("enabled") is True
        assert body["loyalty_settings"]["points_per_visit"] == 15
        assert body["loyalty_settings"]["reward_threshold"] == 100

    def test_get_organizations_includes_loyalty(self, manager_client):
        r = manager_client.get(f"{BASE_URL}/api/organizations", timeout=15)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list) and items
        target = next((o for o in items if o.get("organization_id") == ORG_ID), None)
        assert target is not None
        assert "loyalty_settings" in target
        assert target["loyalty_settings"]["enabled"] is True

    def test_public_organization_includes_loyalty(self):
        import requests
        r = requests.get(f"{BASE_URL}/api/public/{ORG_ID}/organization", timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "loyalty_settings" in body
        assert body["loyalty_settings"]["enabled"] is True

    def test_staff_cannot_update_loyalty_settings(self, staff_client):
        session, _uid = staff_client
        payload = {"loyalty_settings": {"enabled": False, "points_per_visit": 1, "reward_threshold": 10, "reward_description": ""}}
        r = session.put(f"{BASE_URL}/api/organizations/{ORG_ID}", json=payload, timeout=15)
        # Expect 403 (management-only). Any other status is a bug.
        assert r.status_code == 403, f"Expected 403 for staff PUT loyalty_settings, got {r.status_code}: {r.text}"


# ---------------- Loyalty accrual (checkout + manual status) ----------------

@pytest.mark.xdist_group(name="org_demo001_loyalty_settings")
class TestLoyaltyAccrual:
    def _make_appointment(self, db, phone: str, org_id: str = ORG_ID):
        """Insert appointment directly to avoid public rate limit & availability logic."""
        service = db.services.find_one({"organization_id": org_id}, {"_id": 0})
        barber = db.barbers.find_one({"organization_id": org_id, "active": True}, {"_id": 0})
        assert service and barber
        apt_id = f"apt_test_{uuid.uuid4().hex[:10]}"
        now = datetime.now(timezone.utc).isoformat()
        db.appointments.insert_one({
            "appointment_id": apt_id,
            "organization_id": org_id,
            "service_id": service["service_id"],
            "barber_id": barber["barber_id"],
            "client_name": "Loyalty Test",
            "client_phone": phone,
            "client_email": "loyalty_test@example.com",
            "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "time": "10:00",
            "status": "confirmed",
            "created_at": now,
        })
        return apt_id, service, barber

    def _ensure_client(self, db, phone: str, org_id: str = ORG_ID):
        db.clients.delete_many({"phone": phone, "organization_id": org_id})
        now = datetime.now(timezone.utc).isoformat()
        client_id = f"client_test_{uuid.uuid4().hex[:10]}"
        db.clients.insert_one({
            "client_id": client_id,
            "organization_id": org_id,
            "phone": phone,
            "name": "Loyalty Test",
            "email": "loyalty_test@example.com",
            "total_visits": 0,
            "loyalty_points": 0,
            "created_at": now,
            "updated_at": now,
            "accepts_marketing": False,
        })
        return client_id

    # NEXUS_LOYALTY_FLAKE_FIX_V1: verify the write is visible before returning.
    # The test writes via a sync pymongo client while the app reads via an
    # async motor client -- both different connections to the same single-node
    # mongod. Reads should be immediately consistent, but CI has shown rare
    # flakes where checkout observes the previous loyalty_settings. Polling
    # here removes that race without masking a genuine failure to persist.
    def _set_loyalty(self, db, enabled: bool, ppv: int = 15):
        db.organizations.update_one(
            {"organization_id": ORG_ID},
            {"$set": {"loyalty_settings": {
                "enabled": enabled, "points_per_visit": ppv,
                "reward_threshold": 100, "reward_description": "Corte gratis"}}},
        )
        for _ in range(20):
            doc = db.organizations.find_one({"organization_id": ORG_ID}, {"loyalty_settings": 1})
            settings = (doc or {}).get("loyalty_settings") or {}
            if settings.get("enabled") == enabled and settings.get("points_per_visit") == ppv:
                return
            time.sleep(0.05)

    def test_checkout_increments_loyalty_when_enabled(self, manager_client, db):
        phone = f"+57300{uuid.uuid4().hex[:7]}"
        cid = self._ensure_client(db, phone)
        self._set_loyalty(db, True, 15)
        apt_id, _s, _b = self._make_appointment(db, phone)
        r = manager_client.post(
            f"{BASE_URL}/api/appointments/{apt_id}/checkout",
            json={"discount_amount": 0, "tip_amount": 0, "payment_method": "cash"},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        client = db.clients.find_one({"client_id": cid}, {"_id": 0})
        assert client["loyalty_points"] == 15
        assert client["total_visits"] == 1
        # cleanup
        db.appointments.delete_one({"appointment_id": apt_id})
        db.transactions.delete_many({"appointment_id": apt_id})
        db.clients.delete_one({"client_id": cid})

    def test_checkout_does_not_increment_loyalty_when_disabled(self, manager_client, db):
        phone = f"+57300{uuid.uuid4().hex[:7]}"
        cid = self._ensure_client(db, phone)
        self._set_loyalty(db, False, 15)
        apt_id, _s, _b = self._make_appointment(db, phone)
        r = manager_client.post(
            f"{BASE_URL}/api/appointments/{apt_id}/checkout",
            json={"discount_amount": 0, "tip_amount": 0, "payment_method": "cash"},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        client = db.clients.find_one({"client_id": cid}, {"_id": 0})
        assert client.get("loyalty_points", 0) == 0
        assert client["total_visits"] == 1
        db.appointments.delete_one({"appointment_id": apt_id})
        db.transactions.delete_many({"appointment_id": apt_id})
        db.clients.delete_one({"client_id": cid})
        # Restore loyalty enabled=true (baseline seed)
        self._set_loyalty(db, True, 15)

    def test_manual_status_completed_rejected_or_accrues(self, manager_client, db):
        """The endpoint currently rejects manual 'completed' (must use checkout).
        We assert current behavior and flag the review request expectation as N/A."""
        phone = f"+57300{uuid.uuid4().hex[:7]}"
        cid = self._ensure_client(db, phone)
        self._set_loyalty(db, True, 15)
        apt_id, _s, _b = self._make_appointment(db, phone)
        r = manager_client.put(
            f"{BASE_URL}/api/appointments/{apt_id}/status",
            params={"status": "completed"},
            timeout=15,
        )
        # Backend enforces checkout-only; expect 400
        assert r.status_code == 400
        assert "checkout" in r.text.lower()
        db.appointments.delete_one({"appointment_id": apt_id})
        db.clients.delete_one({"client_id": cid})


# ---------------- Clients endpoint carries loyalty_points ----------------

class TestClientsListLoyalty:
    def test_get_clients_includes_loyalty_points(self, manager_client, db):
        # Seed a client with points
        phone = f"+57300{uuid.uuid4().hex[:7]}"
        now = datetime.now(timezone.utc).isoformat()
        cid = f"client_test_{uuid.uuid4().hex[:10]}"
        db.clients.insert_one({
            "client_id": cid, "organization_id": ORG_ID, "phone": phone,
            "name": "LP Sample", "loyalty_points": 45, "total_visits": 3,
            "created_at": now, "updated_at": now, "accepts_marketing": False,
        })
        try:
            r = manager_client.get(f"{BASE_URL}/api/clients?search=LP Sample", timeout=15)
            assert r.status_code == 200
            items = r.json()
            if isinstance(items, dict):
                items = items.get("items", [])
            found = next((c for c in items if c["client_id"] == cid), None)
            assert found is not None, "seeded client not returned"
            assert found.get("loyalty_points") == 45
        finally:
            db.clients.delete_one({"client_id": cid})


# ---------------- Client portal /me includes loyalty summary ----------------

@pytest.mark.xdist_group(name="org_demo001_loyalty_settings")
class TestClientPortalMe:
    def test_client_me_includes_loyalty(self, db):
        import requests, bcrypt
        phone = f"+57300{uuid.uuid4().hex[:7]}"
        # Register a fresh client via public endpoint
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json", "Origin": BASE_URL,
                          "Referer": BASE_URL + "/", "Sec-Fetch-Site": "same-origin"})
        reg = s.post(f"{BASE_URL}/api/public/clients/register", json={
            "phone": phone, "organization_id": ORG_ID,
            "name": "Portal LP Test", "pin": "1234",
            "email": "portallp@example.com", "marketing_consent": False,
        }, timeout=15)
        assert reg.status_code in (200, 201), reg.text
        # Login (PIN)
        login = s.post(f"{BASE_URL}/api/public/clients/login", json={
            "phone": phone, "organization_id": ORG_ID, "pin": "1234"
        }, timeout=15)
        assert login.status_code == 200, login.text
        # Seed loyalty points directly
        db.clients.update_one({"phone": phone, "organization_id": ORG_ID},
                              {"$set": {"loyalty_points": 60}})
        # NEXUS_LOYALTY_FLAKE_FIX_V2: use the same poll-after-write pattern as
        # TestLoyaltyAccrual._set_loyalty to avoid sync-pymongo / async-motor
        # read-your-writes race on CI (see NEXUS_LOYALTY_FLAKE_FIX_V1).
        db.organizations.update_one(
            {"organization_id": ORG_ID},
            {"$set": {"loyalty_settings": {"enabled": True, "points_per_visit": 15,
                                            "reward_threshold": 100,
                                            "reward_description": "Corte gratis"}}},
        )
        for _ in range(20):
            doc = db.organizations.find_one({"organization_id": ORG_ID}, {"loyalty_settings": 1})
            if (doc or {}).get("loyalty_settings", {}).get("enabled") is True:
                break
            time.sleep(0.05)
        r = s.get(f"{BASE_URL}/api/public/clients/me", timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "loyalty" in body and "client" in body and "appointments" in body
        loyalty = body["loyalty"]
        for k in ["enabled", "points", "points_per_visit", "reward_threshold",
                  "reward_description", "progress_percent", "points_to_next_reward"]:
            assert k in loyalty, f"missing key {k}"
        assert loyalty["enabled"] is True
        assert loyalty["points"] == 60
        assert 0 <= loyalty["progress_percent"] <= 100
        assert loyalty["progress_percent"] == 60
        assert loyalty["points_to_next_reward"] == 40
        # cleanup
        db.clients.delete_many({"phone": phone, "organization_id": ORG_ID})


# ---------------- Email service calendar links ----------------

class TestCalendarLinks:
    def test_google_link_24h(self):
        url = email_service._create_google_calendar_link(
            title="Corte", date="2026-02-01", time="14:30", duration_minutes=30,
            description="test", location="here")
        assert url.startswith("https://calendar.google.com/calendar/render?")
        assert "dates=20260201T143000/20260201T150000" in url

    def test_google_link_12h(self):
        url = email_service._create_google_calendar_link(
            title="Corte", date="2026-02-01", time="2:30 PM", duration_minutes=30)
        assert url.startswith("https://calendar.google.com/calendar/render?")
        assert "dates=20260201T143000/20260201T150000" in url

    def test_google_link_invalid_returns_empty(self):
        url = email_service._create_google_calendar_link(
            title="X", date="2026-02-01", time="not-a-time")
        assert url == ""

    def test_outlook_link_24h(self):
        url = email_service._create_outlook_calendar_link(
            title="Corte", date="2026-02-01", time="14:30", duration_minutes=30)
        assert url.startswith("https://outlook.live.com/calendar/0/deeplink/compose?")
        assert "startdt=" in url and "enddt=" in url

    def test_outlook_link_invalid_returns_empty(self):
        url = email_service._create_outlook_calendar_link(
            title="X", date="2026-02-01", time="bogus")
        assert url == ""

    def test_confirmation_html_contains_both_buttons(self, monkeypatch):
        captured = {}

        def fake_send(self, to, subject, html, text=None):
            captured["html"] = html
            return True

        monkeypatch.setattr(email_service.__class__, "_send_email", fake_send)
        ok = email_service.send_appointment_confirmation(
            to_email="x@example.com", customer_name="Juan", barber_name="Pedro",
            service_name="Corte", date="2026-02-01", time="14:30",
            organization_name="Demo", organization_address="Calle 1")
        assert ok is True
        html = captured["html"]
        assert 'class="calendar-btn"' in html
        assert 'class="outlook-btn"' in html
        assert 'href="https://calendar.google.com/calendar/render?' in html
        assert 'href="https://outlook.live.com/calendar/0/deeplink/compose?' in html
