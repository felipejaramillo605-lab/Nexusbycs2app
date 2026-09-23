"""Backend allowlist and entitlement rules for client portal templates."""

STANDARD_TEMPLATE_KEYS = (
    "classic",
    "feminine",
    "professional",
    "cyberpunk",
    "underground",
    "neutral",
    "minimalist_purple",
)

PREMIUM_TEMPLATE_KEYS = (
    "barberia-real",
    "bloom",
    "ignition",
    "claridad",
    "noir",
    "atelier",
    "recreo",
)

ALLOWED_PORTAL_TEMPLATES = frozenset((*STANDARD_TEMPLATE_KEYS, *PREMIUM_TEMPLATE_KEYS))
_PREMIUM_TEMPLATE_KEY_SET = frozenset(PREMIUM_TEMPLATE_KEYS)


def is_premium_template(key: str) -> bool:
    return isinstance(key, str) and key in _PREMIUM_TEMPLATE_KEY_SET


def portal_template_selection_error(key: str, premium_templates_contracted: bool) -> str | None:
    """Return a stable validation reason for a requested template, if invalid."""
    if not isinstance(key, str) or key not in ALLOWED_PORTAL_TEMPLATES:
        return "unknown_template"
    if is_premium_template(key) and not premium_templates_contracted:
        return "premium_template_not_contracted"
    return None


def effective_portal_template(organization: dict | None) -> str:
    """Resolve the public template, falling back safely for old/invalid records."""
    organization = organization or {}
    key = organization.get("portal_template", "classic")
    error = portal_template_selection_error(key, bool(organization.get("premium_templates_contracted")))
    return "classic" if error else key
