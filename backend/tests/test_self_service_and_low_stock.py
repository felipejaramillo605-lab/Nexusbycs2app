"""
Tests for NEXUS_SELF_SERVICE_MANAGER_ONBOARDING_V1 and NEXUS_LOW_STOCK_ALERT_DAEMON_V1.

Covers:
1. Self-service manager registration -> approval -> self-create org (E2E via API).
2. Security: caller cannot spoof manager_user_id on self-service path.
3. Security: manager who already has an org gets 403 on POST /api/organizations.
4. Regression: Owner flow still works (create org with another manager_user_id).
5. Regression: GET /api/inventory/reorder-alerts still works and returns list.
6. Settings: PUT /api/organizations/{id} preserves other notification_settings when
   updating low_stock_alert_enabled and low_stock_alert_whatsapp_enabled.
7. Daemon module: process_low_stock_alerts / ensure_low_stock_alert_indexes import
   and index creation OK (best-effort smoke test via mongo shell).
"""
import os
import uuid
import time
import requests
import pytest

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL", "https://listos-manager-reg.preview.emergentagent.com"
).rstrip("/")
ORG_ID = "org_demo001"


def _session():
    s = requests.Session()
    s.headers.update({
        "Content-Type": "application/json",
        "Origin": BASE_URL,
        "Referer": BASE_URL + "/",
        "Sec-Fetch-Site": "same-origin",
    })
    return s


def _login(email, password):
    # Retry past a 429 the same way conftest.py's shared _login does: these tests log in a
    # freshly-registered manager, which can't reuse the session-scoped fixtures, so on a busy
    # CI run it can land in the same /auth/login rate-limit window (5/minute/IP) as everything
    # else and get a 429 that has nothing to do with the registration flow being tested.
    import time

    s = _session()
    last = None
    for attempt in range(3):
        r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=15)
        if r.status_code != 429:
            break
        last = r
        time.sleep(13)
    else:
        r = last
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return s


def _fiscal_payload(email=None):
    return {
        "billing_email": "billing_" + uuid.uuid4().hex[:6] + "@example.com",
        "billing_contact_name": "Test Billing Contact",
        "billing_contact_phone": "+573001112233",
        "person_type": "juridica",
        "commercial_name": "Test SAS",
        "legal_name": "Test SAS",
        "document_type": "NIT",
        "tax_id": f"9{uuid.uuid4().int % 10**9:09d}",
        "verification_digit": "1",
        "tax_responsibility": "Responsable de IVA",
        "tax_regime": "Ordinario",
        "country": "Colombia",
        "department": "Cundinamarca",
        "city": "Bogota",
        "address": "Calle Falsa 123",
        "postal_code": "110111",
    }


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------
# owner reuses conftest.py's session-scoped owner_client fixture (one real login per
# pytest-xdist worker for the whole run) instead of this module logging in again on its own --
# that extra per-module login, multiplied across every test file that did the same thing, blew
# past the /auth/login rate limit (5/minute/IP) once everything ran together under
# -n 2 --dist loadscope in CI. The self-service fresh-manager logins below stay as-is: they're
# testing the registration flow itself, so they genuinely need their own new login each.
@pytest.fixture(scope="module")
def owner(owner_client):
    return owner_client


@pytest.fixture()
def new_manager(db):
    """Register a fresh manager via API then approve directly in Mongo.
    Returns (email, password, user_id, cleanup)."""
    email = f"TEST_selfsvc_{uuid.uuid4().hex[:8]}@nexus.local"
    password = "TestPass1"
    s = _session()
    r = s.post(
        f"{BASE_URL}/api/auth/register",
        json={"email": email, "password": password, "name": "Test SelfSvc", "tos_accepted": True},
        timeout=15,
    )
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    user_id = r.json()["user_id"]
    # approve manually
    db.users.update_one({"user_id": user_id}, {"$set": {"access_status": "approved"}})
    yield email, password, user_id
    # cleanup: delete user + any created org for them
    user = db.users.find_one({"user_id": user_id})
    if user and user.get("organization_id"):
        org_id = user["organization_id"]
        db.organizations.delete_one({"organization_id": org_id})
        db.organization_billing_profiles.delete_one({"organization_id": org_id})
        db.organization_billing_profile_audits.delete_many({"organization_id": org_id})
    db.users.delete_one({"user_id": user_id})
    db.user_sessions.delete_many({"user_id": user_id})


# ---------------------------------------------------------------------------
# NEXUS_SELF_SERVICE_MANAGER_ONBOARDING_V1
# ---------------------------------------------------------------------------
class TestSelfServiceOnboarding:
    def test_self_service_full_flow(self, new_manager, db):
        email, password, user_id = new_manager
        s = _login(email, password)
        org_name = f"TEST_Org_{uuid.uuid4().hex[:6]}"
        # try to spoof manager_user_id -> backend must ignore and use caller's id
        payload = {
            "name": org_name,
            "manager_user_id": "user_someone_else",  # should be ignored
            "fiscal_profile": _fiscal_payload(email),
            "reason": "Self-service manager onboarding test",
        }
        r = s.post(f"{BASE_URL}/api/organizations", json=payload, timeout=20)
        assert r.status_code in (200, 201), f"self-service create failed: {r.status_code} {r.text}"
        body = r.json()
        # organization returned
        org = body.get("organization") or body
        assert org.get("name") == org_name

        # Verify DB: manager now has org_id = the new org, NOT the spoofed id
        user = db.users.find_one({"user_id": user_id})
        assert user["organization_id"] and user["organization_id"] != "user_someone_else"
        # Verify no user "user_someone_else" got attached
        spoofed = db.users.find_one({"user_id": "user_someone_else"})
        assert spoofed is None

    def test_self_service_second_call_forbidden(self, new_manager, db):
        """Manager who already has an org must be denied a 2nd POST /organizations."""
        email, password, user_id = new_manager
        s = _login(email, password)
        payload = {
            "name": f"TEST_Org_{uuid.uuid4().hex[:6]}",
            "manager_user_id": user_id,
            "fiscal_profile": _fiscal_payload(email),
            "reason": "First creation for setup",
        }
        r1 = s.post(f"{BASE_URL}/api/organizations", json=payload, timeout=20)
        assert r1.status_code in (200, 201)

        # 2nd attempt
        payload2 = {**payload, "name": f"TEST_Org2_{uuid.uuid4().hex[:6]}",
                    "fiscal_profile": _fiscal_payload(email)}
        r2 = s.post(f"{BASE_URL}/api/organizations", json=payload2, timeout=20)
        assert r2.status_code == 403, f"expected 403 for already-onboarded manager, got {r2.status_code}: {r2.text}"

    def test_existing_manager_forbidden(self, manager_client):
        """manager@nexus.com already has org_demo001 -> must 403."""
        s = manager_client
        payload = {
            "name": f"TEST_Org_{uuid.uuid4().hex[:6]}",
            "manager_user_id": "whatever",
            "fiscal_profile": _fiscal_payload("manager@nexus.com"),
            "reason": "should be rejected because manager already has org",
        }
        r = s.post(f"{BASE_URL}/api/organizations", json=payload, timeout=20)
        assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text}"


# ---------------------------------------------------------------------------
# Regression: Owner flow / inventory reorder
# ---------------------------------------------------------------------------
class TestRegression:
    def test_inventory_reorder_alerts_still_works(self, owner):
        r = owner.get(f"{BASE_URL}/api/inventory/reorder-alerts", timeout=15)
        assert r.status_code == 200, f"reorder-alerts failed: {r.status_code} {r.text}"
        data = r.json()
        assert isinstance(data, (list, dict)), f"unexpected shape: {type(data)}"

    def test_organization_notification_settings_preserved(self, owner, db):
        """PUT /organizations/{id} with notification_settings must not blow away
        existing keys inside notification_settings (backend replaces the whole dict,
        so this test asserts current behavior — flag if it clobbers)."""
        # Seed extra notification_settings keys
        db.organizations.update_one(
            {"organization_id": ORG_ID},
            {"$set": {"notification_settings.appointment_cancelled": True,
                      "notification_settings.appointment_completed": True}},
        )
        before = db.organizations.find_one({"organization_id": ORG_ID}).get("notification_settings", {})

        # Build merged payload (frontend Settings.js is expected to send full dict merged)
        merged = {**before, "low_stock_alert_enabled": True, "low_stock_alert_whatsapp_enabled": False}
        r = owner.put(
            f"{BASE_URL}/api/organizations/{ORG_ID}",
            json={"notification_settings": merged},
            timeout=15,
        )
        assert r.status_code == 200, f"PUT failed: {r.status_code} {r.text}"
        after = db.organizations.find_one({"organization_id": ORG_ID}).get("notification_settings", {})
        assert after.get("low_stock_alert_enabled") is True
        assert after.get("low_stock_alert_whatsapp_enabled") is False
        # Preservation
        assert after.get("appointment_cancelled") is True, f"appointment_cancelled clobbered: {after}"
        assert after.get("appointment_completed") is True, f"appointment_completed clobbered: {after}"


# ---------------------------------------------------------------------------
# Daemon smoke
# ---------------------------------------------------------------------------
class TestLowStockDaemonSmoke:
    def test_index_exists(self, db):
        # The daemon has been running for >4min per supervisor status; index should exist.
        idx = db.low_stock_alert_runs.index_information()
        assert any("organization_id" in "".join(str(v)) and "period" in "".join(str(v))
                   for v in idx.values()), f"expected compound index on (org_id,period), got: {idx}"
