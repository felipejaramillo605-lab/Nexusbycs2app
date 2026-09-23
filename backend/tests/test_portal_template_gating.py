"""Pure allowlist and gating regressions for portal template selection."""

import ast
import sys
import unittest
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
from portal_templates import (  # noqa: E402
    ALLOWED_PORTAL_TEMPLATES,
    PREMIUM_TEMPLATE_KEYS,
    STANDARD_TEMPLATE_KEYS,
    effective_portal_template,
    is_premium_template,
    portal_template_selection_error,
)


class PortalTemplateGatingTests(unittest.TestCase):
    def test_standard_and_premium_allowlists_are_exact(self):
        self.assertEqual(STANDARD_TEMPLATE_KEYS, (
            "classic", "feminine", "professional", "cyberpunk", "underground", "neutral", "minimalist_purple"
        ))
        self.assertEqual(PREMIUM_TEMPLATE_KEYS, (
            "barberia-real", "bloom", "ignition", "claridad", "noir", "atelier", "recreo"
        ))
        self.assertEqual(ALLOWED_PORTAL_TEMPLATES, frozenset((*STANDARD_TEMPLATE_KEYS, *PREMIUM_TEMPLATE_KEYS)))

    def test_manager_selection_is_gated_by_contracted_entitlement(self):
        self.assertIsNone(portal_template_selection_error("classic", False))
        self.assertEqual(portal_template_selection_error("barberia-real", False), "premium_template_not_contracted")
        self.assertIsNone(portal_template_selection_error("barberia-real", True))
        self.assertEqual(portal_template_selection_error("made-up", True), "unknown_template")
        self.assertEqual(portal_template_selection_error(None, False), "unknown_template")
        self.assertTrue(is_premium_template("bloom"))
        self.assertFalse(is_premium_template("classic"))

    def test_public_resolution_falls_back_for_old_invalid_or_uncontracted_records(self):
        self.assertEqual(effective_portal_template({}), "classic")
        self.assertEqual(effective_portal_template({"portal_template": "noir"}), "classic")
        self.assertEqual(effective_portal_template({"portal_template": "nope", "premium_templates_contracted": True}), "classic")
        self.assertEqual(effective_portal_template({"portal_template": "noir", "premium_templates_contracted": True}), "noir")
        self.assertEqual(effective_portal_template({"portal_template": "barberia-real", "premium_templates_contracted": True}), "barberia-real")
        self.assertEqual(effective_portal_template({"portal_template": "neutral"}), "neutral")

    def test_update_contract_cannot_accept_entitlement_flag(self):
        tree = ast.parse((BACKEND / "server.py").read_text(encoding="utf-8"))
        model = next(node for node in tree.body if isinstance(node, ast.ClassDef) and node.name == "OrganizationUpdate")
        fields = {node.target.id for node in model.body if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name)}
        self.assertIn("portal_template", fields)
        self.assertNotIn("premium_templates_contracted", fields)

    def test_manager_route_rejects_invalid_and_uncontracted_premium_selection(self):
        tree = ast.parse((BACKEND / "server.py").read_text(encoding="utf-8"))
        route = next(node for node in tree.body if isinstance(node, ast.AsyncFunctionDef) and node.name == "update_organization_profile")
        calls = {node.func.id for node in ast.walk(route) if isinstance(node, ast.Call) and isinstance(node.func, ast.Name)}
        self.assertIn("portal_template_selection_error", calls)
        statuses = {node.value for node in ast.walk(route) if isinstance(node, ast.Constant) and isinstance(node.value, int)}
        self.assertIn(400, statuses)
        self.assertIn(403, statuses)


if __name__ == "__main__":
    unittest.main()
