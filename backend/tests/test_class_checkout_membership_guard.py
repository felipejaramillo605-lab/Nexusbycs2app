"""Regression for R2: checkout_class_booking must reject membership-covered bookings."""

import ast
import asyncio
import unittest
from copy import deepcopy
from pathlib import Path
from types import SimpleNamespace
from typing import Optional

from fastapi import Cookie, Header, HTTPException
from pydantic import BaseModel, Field


class FakeCollection:
    def __init__(self, docs, id_field):
        self.docs = {d[id_field]: d for d in docs}
        self.id_field = id_field

    async def find_one(self, query, _projection=None):
        for doc in self.docs.values():
            if all(doc.get(k) == v for k, v in query.items()):
                return deepcopy(doc)
        return None

    async def update_one(self, query, update):
        for doc in self.docs.values():
            if all(doc.get(k) == v for k, v in query.items()):
                doc.update(update.get("$set", {}))
                return SimpleNamespace(matched_count=1, modified_count=1)
        return SimpleNamespace(matched_count=0, modified_count=0)

    async def insert_one(self, doc):
        self.docs[doc[self.id_field]] = deepcopy(doc)


class CheckoutMembershipGuardTests(unittest.TestCase):
    def setUp(self):
        tree = ast.parse((Path(__file__).resolve().parents[1] / "server.py").read_text(encoding="utf-8"))
        names = {"checkout_class_booking", "AppointmentCheckoutRequest"}
        nodes = [
            n
            for n in tree.body
            if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)) and n.name in names
        ]
        found = {n.name for n in nodes}
        assert names == found, f"functions moved/renamed in server.py: {names - found}"
        for n in nodes:
            n.decorator_list = []

        self.booking = {
            "class_booking_id": "cbk_1",
            "organization_id": "org_a",
            "class_session_id": "class_1",
            "transaction_id": None,
            "payment_method": "membership",
        }
        db = SimpleNamespace(
            class_bookings=FakeCollection([self.booking], "class_booking_id"),
            class_sessions=FakeCollection(
                [{"class_session_id": "class_1", "service_id": "service_1", "barber_id": "barber_1"}],
                "class_session_id",
            ),
            services=FakeCollection(
                [{"service_id": "service_1", "organization_id": "org_a", "name": "Spinning", "price": 50000}],
                "service_id",
            ),
            barbers=FakeCollection(
                [{"barber_id": "barber_1", "organization_id": "org_a", "name": "Barber"}], "barber_id"
            ),
            staff_commission_overrides=FakeCollection([], "barber_id"),
            commission_settings=FakeCollection([], "organization_id"),
            transactions=FakeCollection([], "transaction_id"),
        )

        scope = {
            "BaseModel": BaseModel,
            "Field": Field,
            "Header": Header,
            "Cookie": Cookie,
            "Optional": Optional,
            "HTTPException": HTTPException,
            "db": db,
            "get_current_user": self._fake_get_current_user,
            "require_management_role": lambda user: None,
            "validate_organization_access": self._fake_validate_access,
            "CHECKOUT_PAYMENT_METHODS": {"cash", "card"},
            "validate_commission_split": lambda a, b: None,
            "DEFAULT_COMMISSION_SETTINGS": {"default_staff_percent": 50, "default_business_percent": 50},
            "uuid": __import__("uuid"),
            "datetime": __import__("datetime").datetime,
            "timezone": __import__("datetime").timezone,
        }
        exec(compile(ast.Module(body=nodes, type_ignores=[]), "server.py", "exec"), scope)
        self.scope = scope
        self.db = db

    @staticmethod
    async def _fake_get_current_user(*_args, **_kwargs):
        return SimpleNamespace(user_id="user_1", role="manager", organization_id="org_a")

    @staticmethod
    async def _fake_validate_access(*_args, **_kwargs):
        return True

    def test_rejects_membership_covered_booking(self):
        checkout = self.scope["checkout_class_booking"]
        data = self.scope["AppointmentCheckoutRequest"](payment_method="cash", discount_amount=0, tip_amount=0)
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(checkout("cbk_1", data))
        self.assertEqual(ctx.exception.status_code, 409)
        self.assertIn("membership", ctx.exception.detail.lower())
        # No transaction should have been created.
        self.assertEqual(self.db.transactions.docs, {})
        self.assertIsNone(self.db.class_bookings.docs["cbk_1"]["transaction_id"])

    def test_still_charges_a_normal_cash_booking(self):
        self.db.class_bookings.docs["cbk_1"]["payment_method"] = "drop_in_pending"
        checkout = self.scope["checkout_class_booking"]
        data = self.scope["AppointmentCheckoutRequest"](payment_method="cash", discount_amount=0, tip_amount=0)
        result = asyncio.run(checkout("cbk_1", data))
        self.assertIn("transaction_id", result)
        self.assertEqual(self.db.class_bookings.docs["cbk_1"]["status"], "completed")


if __name__ == "__main__":
    unittest.main()
