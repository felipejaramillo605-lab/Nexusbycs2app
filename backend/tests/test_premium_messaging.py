import asyncio
import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from premium_messaging import (  # noqa: E402
    channel_capabilities,
    is_premium,
    normalized_notification_settings,
    organization_has_premium,
    subscription_has_premium,
    whatsapp_setting_enabled,
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
    assert settings["low_stock_alert_whatsapp_enabled"] is False
    assert settings["other_setting"] is True
    assert not whatsapp_enabled(settings, "confirmation", premium=False)


def test_low_stock_whatsapp_obeys_the_same_premium_entitlement():
    settings = {"low_stock_alert_whatsapp_enabled": True}
    assert not whatsapp_setting_enabled(settings, "low_stock_alert_whatsapp_enabled", premium=False)
    assert whatsapp_setting_enabled(settings, "low_stock_alert_whatsapp_enabled", premium=True)


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

    class Organizations:
        async def find_one(self, query, projection):
            return {"organization_id": "org-premium"}

    db = SimpleNamespace(organization_subscriptions=Subscriptions(), organizations=Organizations())
    assert asyncio.run(organization_has_premium(db, "org-premium"))


def test_the_activated_premium_package_unlocks_whatsapp_without_a_premium_subscription():
    package = {"premium_templates_contracted": True}
    standard_subscription = {"plan_code": "standard", "status": "active"}
    assert is_premium(package, standard_subscription)
    assert is_premium(package, None)
    assert not is_premium({"premium_templates_contracted": False}, standard_subscription)
    assert not is_premium(None, None)
    capabilities = channel_capabilities(standard_subscription, package)
    assert capabilities["whatsapp"] is True and capabilities["premium_required_message"] is None


def test_database_entitlement_accepts_the_package_even_when_the_subscription_is_standard():
    class Organizations:
        async def find_one(self, query, projection):
            return {"premium_templates_contracted": True}

    class Subscriptions:
        async def find_one(self, query, projection):
            raise AssertionError("the package already grants Premium; no subscription lookup needed")

    db = SimpleNamespace(organizations=Organizations(), organization_subscriptions=Subscriptions())
    assert asyncio.run(organization_has_premium(db, "org-cs2"))
