"""Nexus AI Phase 3 backend tests: entitlement, RBAC, multi-tenant isolation."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://listos-manager-reg.preview.emergentagent.com").rstrip("/")


def _login(email, password):
    s = requests.Session()
    s.headers.update({"Origin": BASE_URL, "Sec-Fetch-Site": "same-origin"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def owner():
    return _login("admin@nexus.com", "admin123")


@pytest.fixture(scope="module")
def manager():
    return _login("manager@nexus.com", "manager123")


@pytest.fixture(scope="module")
def staff():
    return _login("staff@test.com", "Nexus2026")


ORG = "org_demo001"


class TestNexusAIEntitlement:
    def test_status_returns_contracted_enabled(self, manager):
        r = manager.get(f"{BASE_URL}/api/nexus-ai/status", params={"organization_id": ORG}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "contracted" in d and "enabled" in d
        # Should be true per problem statement
        assert d["contracted"] is True
        assert d["enabled"] is True

    def test_manager_cannot_set_entitlement(self, manager):
        r = manager.put(f"{BASE_URL}/api/owner/nexus-ai/{ORG}", json={"contracted": True, "enabled": True}, timeout=15)
        assert r.status_code == 403

    def test_owner_enable_without_contract_400(self, owner):
        # Create fresh org for test
        # First disable both
        r0 = owner.put(f"{BASE_URL}/api/owner/nexus-ai/{ORG}", json={"contracted": False, "enabled": False}, timeout=15)
        assert r0.status_code == 200
        # Try enable without contracted
        r = owner.put(f"{BASE_URL}/api/owner/nexus-ai/{ORG}", json={"contracted": False, "enabled": True}, timeout=15)
        assert r.status_code == 400
        # Verify enable forced false when contracted false
        r2 = owner.get(f"{BASE_URL}/api/nexus-ai/status", params={"organization_id": ORG}, timeout=15)
        assert r2.json()["enabled"] is False
        # Restore to enabled state
        r3 = owner.put(f"{BASE_URL}/api/owner/nexus-ai/{ORG}", json={"contracted": True, "enabled": True}, timeout=15)
        assert r3.status_code == 200
        assert r3.json().get("enabled") is True or owner.get(f"{BASE_URL}/api/nexus-ai/status", params={"organization_id": ORG}).json()["enabled"] is True

    def test_contracted_false_forces_enabled_false(self, owner):
        # ensure enabled=true
        owner.put(f"{BASE_URL}/api/owner/nexus-ai/{ORG}", json={"contracted": True, "enabled": True}, timeout=15)
        # Now unset contracted
        r = owner.put(f"{BASE_URL}/api/owner/nexus-ai/{ORG}", json={"contracted": False, "enabled": False}, timeout=15)
        assert r.status_code == 200
        s = owner.get(f"{BASE_URL}/api/nexus-ai/status", params={"organization_id": ORG}).json()
        assert s["contracted"] is False and s["enabled"] is False
        # Restore
        owner.put(f"{BASE_URL}/api/owner/nexus-ai/{ORG}", json={"contracted": True, "enabled": True}, timeout=15)


class TestNexusAIStaffRBAC:
    def test_staff_forbidden_status(self, staff):
        r = staff.get(f"{BASE_URL}/api/nexus-ai/status", params={"organization_id": ORG}, timeout=15)
        assert r.status_code == 403

    def test_staff_forbidden_conversations(self, staff):
        r = staff.get(f"{BASE_URL}/api/nexus-ai/conversations", timeout=15)
        assert r.status_code == 403
        r2 = staff.post(f"{BASE_URL}/api/nexus-ai/conversations", json={"title": "hack"}, timeout=15)
        assert r2.status_code == 403


class TestNexusAIConversations:
    def test_create_and_list_conversation(self, manager):
        r = manager.post(f"{BASE_URL}/api/nexus-ai/conversations", json={"title": "TEST_conv"}, timeout=15)
        assert r.status_code in (200, 201)
        conv = r.json()
        assert "conversation_id" in conv
        conv_id = conv["conversation_id"]
        # List
        rl = manager.get(f"{BASE_URL}/api/nexus-ai/conversations", timeout=15)
        assert rl.status_code == 200
        ids = [c["conversation_id"] for c in rl.json()]
        assert conv_id in ids
        # Messages endpoint
        rm = manager.get(f"{BASE_URL}/api/nexus-ai/conversations/{conv_id}/messages", timeout=15)
        assert rm.status_code == 200
        assert isinstance(rm.json(), list)
