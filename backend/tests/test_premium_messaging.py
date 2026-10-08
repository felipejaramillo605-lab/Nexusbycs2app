import asyncio
import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from premium_messaging import (  # noqa: E402
    channel_capabilities,
    normalized_notification_settings,
    organization_has_premium,
    subscription_has_premium,
    whatsapp_enabled,
)


def test_only_an_active_premium_subscription_unlocks_whatsapp():
    assert subscription_has_premium({"plan_code": "premium", "status": "active"})
    assert subscription_has_premium({"plan_code": "premium", "status": "trial"})
    assert not subscription_has_premium({"plan_code": "standard", "status": "active"})
    assert not subscription_has_premium({"plan_code": "premium", "status": "suspended"})
    assert not subscription_has_premium(None)


def test_standard_settings_are_forced_to_email_only_without_losing_other_settings():
    settings = normalized_notification_settings(
        {"appointment_confirmation_whatsapp_enabled": True, "other_setting": True}, premium=False
    )
    assert settings["appointment_confirmation_whatsapp_enabled"] is False
    assert settings["appointment_reminder_whatsapp_enabled"] is False
    assert settings["other_setting"] is True
    assert not whatsapp_enabled(settings, "confirmation", premium=False)


def test_capabilities_explain_the_premium_requirement():
    standard = channel_capabilities({"plan_code": "standard", "status": "active"})
    premium = channel_capabilities({"plan_code": "premium", "status": "active"})
    assert standard["email"] is True and standard["whatsapp"] is False
    assert "Premium" in standard["premium_required_message"]
    assert premium == {"email": True, "whatsapp": True, "premium_required_message": None}


def test_database_entitlement_uses_the_organization_subscription():
    class Subscriptions:
        async def find_one(self, query, projection):
            assert query == {"organization_id": "org-premium"}
            return {"plan_code": "premium", "status": "active"}

    db = SimpleNamespace(organization_subscriptions=Subscriptions())
    assert asyncio.run(organization_has_premium(db, "org-premium"))
