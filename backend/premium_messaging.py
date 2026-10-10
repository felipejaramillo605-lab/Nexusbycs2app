"""Entitlements and channel settings for appointment communications.

Email is the baseline transactional channel. WhatsApp is a Premium-only
add-on: the browser cannot grant it because every send path resolves the
organization subscription from the database again.
"""

from __future__ import annotations

from typing import Mapping

PREMIUM_ACTIVE_STATUSES = frozenset({"active", "trial", "grace_period"})
# Keep every organization-initiated WhatsApp channel in this list.  The UI is
# only a convenience layer: settings written through the API must remain safe
# if a client is stale or bypasses the browser entirely.
WHATSAPP_SETTING_KEYS = frozenset(
    {
        "appointment_confirmation_whatsapp_enabled",
        "appointment_reminder_whatsapp_enabled",
        "low_stock_alert_whatsapp_enabled",
    }
)


def subscription_has_premium(subscription: Mapping | None) -> bool:
    """Whether a subscription currently entitles the organization to WhatsApp."""
    subscription = subscription or {}
    return (
        str(subscription.get("plan_code") or "").strip().lower() == "premium"
        and str(subscription.get("status") or "").strip().lower() in PREMIUM_ACTIVE_STATUSES
    )


def organization_has_premium_package(organization: Mapping | None) -> bool:
    """The Premium package (paid invoice flow) is recorded as flags on the organization itself."""
    return bool((organization or {}).get("premium_templates_contracted"))


def is_premium(organization: Mapping | None, subscription: Mapping | None) -> bool:
    """Premium means the activated Premium package OR an active Premium subscription plan."""
    return organization_has_premium_package(organization) or subscription_has_premium(subscription)


async def organization_has_premium(db, organization_id: str) -> bool:
    organization = await db.organizations.find_one(
        {"organization_id": organization_id}, {"_id": 0, "premium_templates_contracted": 1}
    )
    if organization_has_premium_package(organization):
        return True
    subscription = await db.organization_subscriptions.find_one(
        {"organization_id": organization_id}, {"_id": 0, "plan_code": 1, "status": 1}
    )
    return subscription_has_premium(subscription)


def channel_capabilities(subscription: Mapping | None, organization: Mapping | None = None) -> dict:
    premium = is_premium(organization, subscription)
    return {
        "email": True,
        "whatsapp": premium,
        "premium_required_message": (
            None
            if premium
            else "WhatsApp está disponible con la membresía Premium. "
            "Tu cuenta Estándar seguirá enviando estas comunicaciones por correo electrónico."
        ),
    }


def normalized_notification_settings(settings: Mapping | None, *, premium: bool) -> dict:
    """Preserve unrelated settings while enforcing the plan's allowed channels."""
    normalized = dict(settings or {})
    # Standard is intentionally email-only; premium managers can choose both channels.
    if not premium:
        for key in WHATSAPP_SETTING_KEYS:
            normalized[key] = False
    return normalized


def whatsapp_setting_enabled(settings: Mapping | None, key: str, *, premium: bool) -> bool:
    """Resolve an organization-initiated WhatsApp setting after entitlement."""
    return bool(premium and key in WHATSAPP_SETTING_KEYS and (settings or {}).get(key, False))


def whatsapp_enabled(settings: Mapping | None, event: str, *, premium: bool) -> bool:
    key = f"appointment_{event}_whatsapp_enabled"
    return whatsapp_setting_enabled(settings, key, premium=premium)
