"""Nexus AI Phase 3 backend tests: entitlement, RBAC, multi-tenant isolation."""
import os
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://listos-manager-reg.preview.emergentagent.com").rstrip("/")

# owner/manager/staff reuse conftest.py's session-scoped owner_client/manager_client/staff_client
# fixtures (one real login per role per pytest-xdist worker for the whole run) instead of this
# module logging in again on its own -- that extra per-module login, multiplied across every test
# file that did the same thing, blew past the /auth/login rate limit (5/minute/IP) once everything
# ran together under -n 2 --dist loadscope in CI.


@pytest.fixture(scope="module")
def owner(owner_client):
    return owner_client


@pytest.fixture(scope="module")
def manager(manager_client):
    return manager_client


@pytest.fixture(scope="module")
def staff(staff_client):
    return staff_client[0]


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

    def test_owner_legacy_entitlement_endpoint_is_closed(self, owner):
        r = owner.put(f"{BASE_URL}/api/owner/nexus-ai/{ORG}", json={"contracted": True, "enabled": True}, timeout=15)
        assert r.status_code == 410

    def test_owner_legacy_disable_endpoint_is_closed(self, owner):
        r = owner.put(f"{BASE_URL}/api/owner/nexus-ai/{ORG}", json={"contracted": False, "enabled": False}, timeout=15)
        assert r.status_code == 410


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


class TestNexusAISendManagerReminder:
    """The send_manager_reminder tool is only reachable through the LLM tool-calling loop
    (no dedicated HTTP endpoint), so this exercises the handler directly against the test DB
    rather than through a real Gemini call -- same "import the backend module, assert DB state"
    approach as TestLowStockDaemonSmoke in test_self_service_and_low_stock.py."""

    def test_creates_notification_visible_in_bell(self, manager, db):
        import asyncio
        import sys

        sys.path.insert(0, "/app/backend")
        from motor.motor_asyncio import AsyncIOMotorClient
        import nexus_ai

        mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
        db_name = os.environ.get("DB_NAME", "test_database")
        motor_db = AsyncIOMotorClient(mongo_url)[db_name]

        result = asyncio.run(
            nexus_ai._send_manager_reminder(
                motor_db, ORG, user_id="TEST_manager_user", title="Revisar inventario",
                message="Recuerda revisar el stock de productos de tinte antes del viernes.",
            )
        )
        assert result.get("ok") is True
        notification_id = result["notification_id"]

        row = db.subscription_notifications.find_one({"notification_id": notification_id})
        assert row is not None
        assert row["organization_id"] == ORG
        assert row["event_type"] == "ai_reminder"
        assert row["title"] == "Revisar inventario"
        assert row["read_by"] == []

        r = manager.get(f"{BASE_URL}/api/billing/notifications", timeout=15)
        assert r.status_code == 200
        ids = [n["notification_id"] for n in r.json()]
        assert notification_id in ids

        db.subscription_notifications.delete_one({"notification_id": notification_id})

    def test_rejects_empty_title_or_message(self):
        import asyncio
        import sys

        sys.path.insert(0, "/app/backend")
        from motor.motor_asyncio import AsyncIOMotorClient
        import nexus_ai

        mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
        db_name = os.environ.get("DB_NAME", "test_database")
        motor_db = AsyncIOMotorClient(mongo_url)[db_name]

        result = asyncio.run(nexus_ai._send_manager_reminder(motor_db, ORG, user_id="x", title="", message=""))
        assert "error" in result
