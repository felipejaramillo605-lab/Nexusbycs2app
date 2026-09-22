"""Regression for the public organization endpoint over-exposure (Bajo, Tarea 2)."""

import ast
import unittest
from pathlib import Path


class PublicOrganizationProjectionTests(unittest.TestCase):
    def setUp(self):
        tree = ast.parse((Path(__file__).resolve().parents[1] / "server.py").read_text(encoding="utf-8"))
        assignment = next(
            n
            for n in tree.body
            if isinstance(n, ast.Assign)
            and any(getattr(t, "id", None) == "PUBLIC_ORGANIZATION_EXCLUDED_FIELDS" for t in n.targets)
        )
        scope = {}
        exec(compile(ast.Module(body=[assignment], type_ignores=[]), "server.py", "exec"), scope)
        self.projection = scope["PUBLIC_ORGANIZATION_EXCLUDED_FIELDS"]

    def test_internal_fields_are_excluded(self):
        for field in ("_id", "owner_id", "created_at", "nexus_ai_contracted", "nexus_ai_enabled"):
            self.assertEqual(self.projection.get(field), 0, f"{field} must be excluded (value 0)")

    def test_fields_settings_js_depends_on_through_this_endpoint_are_not_excluded(self):
        # Settings.js/BusinessProfile.js read these from THIS SAME public
        # endpoint to populate the manager's own settings form (see
        # PUBLIC_ORGANIZATION_EXCLUDED_FIELDS docstring) -- a true whitelist
        # would silently break the low-stock-alert, loyalty and
        # review-request sections of Settings.js.
        for field in (
            "notification_settings",
            "loyalty_settings",
            "review_request_settings",
            "review_link",
            "name",
            "address",
            "phone",
            "client_portal_theme",
            "logo_url",
            "portal_welcome_message",
            "portal_show_team",
            "portal_show_prices",
            "portal_show_hours",
            "portal_show_map",
            "catalog_enabled",
        ):
            self.assertNotIn(field, self.projection)


if __name__ == "__main__":
    unittest.main()
