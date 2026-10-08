"""Entitlements and channel settings for appointment communications.

Email is the baseline transactional channel. WhatsApp is a Premium-only
add-on: the browser cannot grant it because every send path resolves the
organization subscription from the database again.
"""

from __future__ import annotations

from typing import Mapping


PREMIUM_ACTIVE_STATUSES = frozenset({"active", "trial", "grace_period"})
WHATSAPP_SETTING_KEYS = frozenset(
    {
        "appointment_confirmation_whatsapp_enabled",
        "appointment_reminder_whatsapp_enabled",
    }
)


def subscription_has_premium(subscription: Mapping | None) -> bool:
    """Whether a subscription currently entitles the organization to WhatsApp."""
    subscription = subscription or {}
    return (
        str(subscription.get("plan_code") or "").strip().lower() == "premium"
        and str(subscription.get("status") or "").strip().lower() in PREMIUM_ACTIVE_STATUSES
    )


async def organization_has_premium(db, organization_id: str) -> bool:
    subscription = await db.organization_subscriptions.find_one(
        {"organization_id": organization_id}, {"_id": 0, "plan_code": 1, "status": 1}
    )
    return subscription_has_premium(subscription)


def channel_capabilities(subscription: Mapping | None) -> dict:
    premium = subscription_has_premium(subscription)
    return {
        "email": True,
        "whatsapp": premium,
        "premium_required_message": (
            None
            if premium
            else "WhatsApp para confirmaciones y recordatorios está disponible con la membresía Premium. "
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


def whatsapp_enabled(settings: Mapping | None, event: str, *, premium: bool) -> bool:
    if not premium:
        return False
    key = f"appointment_{event}_whatsapp_enabled"
    return bool((settings or {}).get(key, False))
