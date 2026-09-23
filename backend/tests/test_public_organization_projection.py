"""Regression for the public organization endpoint over-exposure (Bajo, Tarea 2)."""

import ast
import unittest
from pathlib import Path


class PublicOrganizationProjectionTests(unittest.TestCase):
    def setUp(self):
        tree = ast.parse((Path(__file__).resolve().parents[1] / "server.py").read_text(encoding="utf-8"))
        self.tree = tree
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

    def test_public_route_resolves_template_before_removing_entitlement(self):
        handler = next(
            node for node in self.tree.body
            if isinstance(node, ast.AsyncFunctionDef) and node.name == "get_organization_public"
        )
        effective_call = next(
            node for node in ast.walk(handler)
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "effective_portal_template"
        )
        pop_call = next(
            node for node in ast.walk(handler)
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
            and node.func.attr == "pop" and node.args
            and isinstance(node.args[0], ast.Constant)
            and node.args[0].value == "premium_templates_contracted"
        )
        self.assertLess(effective_call.lineno, pop_call.lineno)
        self.assertNotIn("premium_templates_contracted", self.projection)

    def test_manager_settings_do_not_use_the_public_organization_route(self):
        frontend = Path(__file__).resolve().parents[2] / "frontend" / "src" / "pages"
        public_route = "/api/public/${organizationId}/organization"
        for page in ("Settings.js", "BusinessProfile.js"):
            source = (frontend / page).read_text(encoding="utf-8")
            self.assertNotIn(public_route, source, f"{page} must use the authenticated organization endpoint")
            self.assertIn("organizationAPI.get(organizationId)", source)

    def test_authenticated_organization_read_enforces_team_scope(self):
        handler = next(
            node
            for node in self.tree.body
            if isinstance(node, ast.AsyncFunctionDef) and node.name == "get_organization_profile"
        )
        called_names = {
            node.func.id
            for node in ast.walk(handler)
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name)
        }
        self.assertIn("get_current_user", called_names)
        self.assertIn("resolve_team_organization", called_names)


if __name__ == "__main__":
    unittest.main()
