"""Regressions for the class-booking cancellation race and guest-mutation authz gaps."""

import ast
import asyncio
import logging
import unittest
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from typing import Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, Field


def _load(names):
    # _organization_timezone: _perform_class_booking_cancel resolves the
    # org's real timezone (PR #25) before calling _is_late_cancellation.
    names = names | {"sanitize_phone", "_organization_timezone"}
    tree = ast.parse((Path(__file__).resolve().parents[1] / "server.py").read_text(encoding="utf-8"))
    nodes = [
        n for n in tree.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)) and n.name in names
    ]
    found = {n.name for n in nodes}
    missing = names - found
    assert not missing, f"functions moved or renamed in server.py: {missing}"
    for n in nodes:
        n.decorator_list = []
    scope = {
        "BaseModel": BaseModel,
        "Field": Field,
        "Optional": Optional,
        "HTTPException": __import__("fastapi").HTTPException,
        "datetime": datetime,
        "timedelta": timedelta,
        "timezone": timezone,
        "uuid": __import__("uuid"),
        "ZoneInfo": ZoneInfo,
        "ZoneInfoNotFoundError": ZoneInfoNotFoundError,
        "logger": logging.getLogger("test_class_cancellation_authz"),
    }
    exec(compile(ast.Module(body=nodes, type_ignores=[]), "server.py", "exec"), scope)
    return scope


class FakeCollection:
    """Minimal find_one/update_one/insert_one double keyed on a single id field."""

    def __init__(self, docs, id_field):
        self.docs = {d[id_field]: d for d in docs}
        self.id_field = id_field
        self.update_calls = []

    async def find_one(self, query, _projection=None, **_kwargs):
        for doc in self.docs.values():
            if all(doc.get(k) == v for k, v in query.items() if k not in ("$expr",)):
                return deepcopy(doc)
        return None

    @staticmethod
    def _field_matches(actual, expected):
        if isinstance(expected, dict):
            if "$gt" in expected and not (actual is not None and actual > expected["$gt"]):
                return False
            if "$ne" in expected and actual == expected["$ne"]:
                return False
            return True
        return actual == expected

    async def update_one(self, query, update):
        self.update_calls.append((deepcopy(query), deepcopy(update)))
        match = None
        for doc in self.docs.values():
            if all(self._field_matches(doc.get(k), v) for k, v in query.items() if k != "$expr"):
                match = doc
                break
        if not match:
            return SimpleNamespace(matched_count=0, modified_count=0)
        for key, value in update.get("$set", {}).items():
            match[key] = value
        for key, value in update.get("$inc", {}).items():
            match[key] = match.get(key, 0) + value
        return SimpleNamespace(matched_count=1, modified_count=1)

    async def insert_one(self, doc):
        self.docs[doc[self.id_field]] = deepcopy(doc)


class CancellationRaceTests(unittest.TestCase):
    def setUp(self):
        self.scope = _load(
            {
                "_is_late_cancellation",
                "_notify_waitlist_promoted",
                "_promote_from_waitlist",
                "_perform_class_booking_cancel",
            }
        )
        self.session = {
            "class_session_id": "class_1",
            "organization_id": "org_a",
            "service_id": "service_1",
            "date": "2099-01-01",
            "time": "10:00",
            "capacity": 3,
            "booked_count": 2,
        }
        self.booking = {
            "class_booking_id": "cbk_1",
            "class_session_id": "class_1",
            "organization_id": "org_a",
            "client_id": "client_1",
            "client_phone": "+573001112233",
            "status": "confirmed",
            "payment_method": "cash",
            "membership_id": None,
        }
        self.db = SimpleNamespace(
            class_sessions=FakeCollection([self.session], "class_session_id"),
            class_bookings=FakeCollection([self.booking], "class_booking_id"),
            class_waitlist=FakeCollection([], "waitlist_id"),
            services=FakeCollection([{"service_id": "service_1"}], "service_id"),
            organizations=FakeCollection([{"organization_id": "org_a"}], "organization_id"),
        )

    def test_second_concurrent_cancel_does_not_double_release_cupo(self):
        cancel = self.scope["_perform_class_booking_cancel"]
        first = asyncio.run(cancel(self.db, self.booking))
        self.assertEqual(first["message"], "Booking cancelled")
        # A second call re-reads the (now already-cancelled) booking, same as
        # a concurrent request would if it read the row before the first
        # request's $set landed.
        second = asyncio.run(cancel(self.db, self.booking))
        self.assertEqual(second["message"], "Booking already cancelled")
        # booked_count must have been decremented exactly once (3->2 was the
        # start; one real cancellation brings it to 1, not 0).
        self.assertEqual(self.db.class_sessions.docs["class_1"]["booked_count"], 1)

    def test_cancel_update_is_conditioned_on_confirmed_status(self):
        cancel = self.scope["_perform_class_booking_cancel"]
        asyncio.run(cancel(self.db, self.booking))
        first_update = self.db.class_bookings.update_calls[0]
        self.assertEqual(first_update[0].get("status"), "confirmed")


class GuestMutationAuthzTests(unittest.TestCase):
    def setUp(self):
        self.scope = _load(
            {
                "GuestPhoneVerify",
                "leave_class_waitlist",
                "cancel_class_booking",
                "_is_late_cancellation",
                "_notify_waitlist_promoted",
                "_promote_from_waitlist",
                "_perform_class_booking_cancel",
            }
        )
        self.booking = {
            "class_booking_id": "cbk_1",
            "class_session_id": "class_1",
            "organization_id": "org_a",
            "client_id": "client_1",
            "client_phone": "+573001112233",
            "status": "confirmed",
            "payment_method": "cash",
            "membership_id": None,
        }
        self.entry = {
            # Deliberately a different session than self.booking so cancelling
            # cbk_1 in test_cancel_accepts_matching_phone doesn't also try to
            # promote this entry (that path needs membership helpers this
            # test double doesn't stub -- covered separately in Fase 4 tests).
            "waitlist_id": "wl_1",
            "class_session_id": "class_2",
            "client_phone": "+573001112233",
            "status": "waiting",
        }
        db = SimpleNamespace(
            class_sessions=FakeCollection(
                [
                    {
                        "class_session_id": "class_1",
                        "organization_id": "org_a",
                        "service_id": "service_1",
                        "date": "2099-01-01",
                        "time": "10:00",
                        "capacity": 3,
                        "booked_count": 1,
                    },
                    {
                        "class_session_id": "class_2",
                        "organization_id": "org_a",
                        "service_id": "service_1",
                        "date": "2099-01-01",
                        "time": "10:00",
                        "capacity": 3,
                        "booked_count": 1,
                    },
                ],
                "class_session_id",
            ),
            class_bookings=FakeCollection([self.booking], "class_booking_id"),
            class_waitlist=FakeCollection([self.entry], "waitlist_id"),
            services=FakeCollection([{"service_id": "service_1"}], "service_id"),
            organizations=FakeCollection([{"organization_id": "org_a"}], "organization_id"),
        )
        self.scope["db"] = db
        self.db = db

    def test_cancel_rejects_mismatched_phone(self):
        cancel_class_booking = self.scope["cancel_class_booking"]
        with self.assertRaises(self.scope["HTTPException"]) as ctx:
            asyncio.run(cancel_class_booking("cbk_1", self.scope["GuestPhoneVerify"](client_phone="+573000000000")))
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertEqual(self.db.class_bookings.docs["cbk_1"]["status"], "confirmed")

    def test_cancel_accepts_matching_phone(self):
        cancel_class_booking = self.scope["cancel_class_booking"]
        result = asyncio.run(
            cancel_class_booking("cbk_1", self.scope["GuestPhoneVerify"](client_phone="+573001112233"))
        )
        self.assertEqual(result["message"], "Booking cancelled")

    def test_waitlist_leave_rejects_mismatched_phone(self):
        leave_class_waitlist = self.scope["leave_class_waitlist"]
        with self.assertRaises(self.scope["HTTPException"]) as ctx:
            asyncio.run(leave_class_waitlist("wl_1", self.scope["GuestPhoneVerify"](client_phone="+573000000000")))
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertEqual(self.db.class_waitlist.docs["wl_1"]["status"], "waiting")

    def test_waitlist_leave_accepts_matching_phone(self):
        leave_class_waitlist = self.scope["leave_class_waitlist"]
        result = asyncio.run(leave_class_waitlist("wl_1", self.scope["GuestPhoneVerify"](client_phone="+573001112233")))
        self.assertEqual(result["message"], "Left waitlist")


if __name__ == "__main__":
    unittest.main()
