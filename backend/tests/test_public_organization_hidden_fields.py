"""La respuesta publica de la organizacion no debe filtrar identificadores internos ni ajustes de gestion (AUD-01)."""

import asyncio
import os
import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test_database")
os.environ.setdefault("EMERGENT_LLM_KEY", "test-key")
os.environ.setdefault("CORS_ORIGINS", "http://localhost:3000")
import server  # noqa: E402

STORED = {
    "organization_id": "org-a",
    "name": "Estudio A",
    "address": "Calle 1",
    "phone": "+573001112233",
    "whatsapp_link": "https://wa.me/573001112233",
    "business_type": "pilates_studio",
    "portal_template": "classic",
    "owner_id": "user-owner",
    "created_by_owner_id": "user-owner",
    "primary_manager_user_id": "user-manager",
    "created_at": "2026-01-01",
    "notification_settings": {"appointment_reminder": True},
    "loyalty_settings": {"enabled": True},
    "review_request_settings": {"enabled": True},
    "birthday_campaign": {"enabled": True},
    "nexus_ai_contracted": True,
    "nexus_ai_enabled": True,
    "premium_templates_contracted": False,
}


class FakeOrganizations:
    """Aplica una proyeccion de exclusion como lo hace MongoDB."""

    async def find_one(self, query, projection=None):
        if query.get("organization_id") != STORED["organization_id"]:
            return None
        excluded = {key for key, value in (projection or {}).items() if value == 0}
        return {key: value for key, value in STORED.items() if key not in excluded}


def test_public_organization_hides_internal_ids_and_management_settings(monkeypatch):
    monkeypatch.setattr(server, "db", SimpleNamespace(organizations=FakeOrganizations()))
    organization = asyncio.run(server.get_organization_public("org-a"))
    for hidden in (
        "owner_id",
        "created_by_owner_id",
        "primary_manager_user_id",
        "notification_settings",
        "loyalty_settings",
        "review_request_settings",
        "birthday_campaign",
        "nexus_ai_contracted",
        "premium_templates_contracted",
    ):
        assert hidden not in organization, hidden


def test_public_organization_keeps_what_the_booking_flow_needs(monkeypatch):
    monkeypatch.setattr(server, "db", SimpleNamespace(organizations=FakeOrganizations()))
    organization = asyncio.run(server.get_organization_public("org-a"))
    for needed in ("organization_id", "name", "address", "phone", "whatsapp_link", "business_type", "portal_template"):
        assert needed in organization, needed
