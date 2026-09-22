"""Regression test for the passwordless-login secret leak (unauthenticated endpoint)."""

import ast
import unittest
from pathlib import Path


class PublicClientViewTests(unittest.TestCase):
    def setUp(self):
        tree = ast.parse((Path(__file__).resolve().parents[1] / "server.py").read_text(encoding="utf-8"))
        function = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "_public_client_view")
        scope = {}
        exec(compile(ast.Module(body=[function], type_ignores=[]), "server.py", "exec"), scope)
        self.view = scope["_public_client_view"]

    def test_secrets_and_internal_state_are_never_included(self):
        client = {
            "client_id": "client_abc123",
            "organization_id": "org_demo001",
            "name": "Cliente QA",
            "phone": "+573001112233",
            "email": "cliente@example.com",
            "total_visits": 4,
            "last_visit": "2026-09-01",
            "pin_hash": "$2b$12$secretbcrypthash",
            "pin_reset_token": "super-secret-reset-token",
            "pin_reset_expires": "2026-09-25T00:00:00+00:00",
            "failed_pin_attempts": 2,
            "accepts_marketing": True,
            "marketing_consent_ip": "203.0.113.7",
            "marketing_consent_text": "Acepto recibir promociones",
            "deletion_requested_at": None,
        }
        result = self.view(client)
        for secret_field in (
            "pin_hash",
            "pin_reset_token",
            "pin_reset_expires",
            "failed_pin_attempts",
            "organization_id",
            "email",
            "marketing_consent_ip",
            "marketing_consent_text",
            "accepts_marketing",
            "deletion_requested_at",
        ):
            self.assertNotIn(secret_field, result)
        self.assertEqual(
            result,
            {
                "client_id": "client_abc123",
                "name": "Cliente QA",
                "phone": "+573001112233",
                "total_visits": 4,
                "last_visit": "2026-09-01",
            },
        )

    def test_missing_fields_default_to_none_instead_of_raising(self):
        result = self.view({"name": "Cliente Nuevo"})
        self.assertEqual(result["name"], "Cliente Nuevo")
        self.assertIsNone(result["client_id"])
        self.assertIsNone(result["total_visits"])


if __name__ == "__main__":
    unittest.main()
