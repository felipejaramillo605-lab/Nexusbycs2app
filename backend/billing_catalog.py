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
        # Colombia's current CS2 tax treatment was explicitly confirmed as no IVA.
        "tax": {"mode": "none", "iva_rate_bps": 0},
    }
