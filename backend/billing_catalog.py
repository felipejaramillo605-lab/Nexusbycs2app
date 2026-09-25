"""Versioned, code-owned subscription prices and invoice template metadata."""
from copy import deepcopy


CATALOG_VERSION = "2026-09-24"
LEGACY_PLAN = "custom"
PLANS = {
    "standard": {
        "name": "Membresía Estándar",
        "monthly_amount_minor": 8_000_000,
        "currency": "COP",
        "includes": ["core"],
        "premium_package": False,
    },
    "premium": {
        "name": "Membresía Premium",
        "monthly_amount_minor": 15_000_000,
        "currency": "COP",
        "includes": ["core", "nexus_ai", "premium_portal_templates"],
        "premium_package": True,
    },
}
# Flat one-time surcharge a Manager pays to request the Premium package
# (D1-D7 commercial contract: 70,000 COP, no proration, no VAT). Not part of
# PLANS above because it isn't a recurring monthly price -- it's a single
# invoice issued once per Premium request, via the dedicated
# POST /owner/subscriptions/{organization_id}/invoices/premium-surcharge
# endpoint (owner_subscriptions.py), never the generic monthly-invoice form.
PREMIUM_SURCHARGE_AMOUNT_MINOR = 7_000_000


def get_plan(code):
    """Return a defensive copy of a catalog plan, or None for legacy/custom codes."""
    normalized = str(code or "").strip().lower()
    plan = PLANS.get(normalized)
    return {"plan_code": normalized, **deepcopy(plan)} if plan else None


def is_catalog_plan(code):
    return str(code or "").strip().lower() in PLANS


def catalog_response():
    """Build the public Owner response without exposing mutable module state."""
    plans = [get_plan(code) for code in ("standard", "premium")]
    return {
        "catalog_version": CATALOG_VERSION,
        "currency": "COP",
        "plans": plans,
        "premium_surcharge_minor": PREMIUM_SURCHARGE_AMOUNT_MINOR,
        # Colombia's current CS2 tax treatment was explicitly confirmed as no IVA.
        "tax": {"mode": "none", "iva_rate_bps": 0},
    }
