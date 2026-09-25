"""Focused tests for Premium rejection, privacy, and activation races."""
import asyncio
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from platform_capabilities import (  # noqa: E402
    AUTHORITY_ID,
    PremiumRejectRequest,
    _premium_request_public,
    _release_premium_invoice_link,
    _reject_premium_plan_request,
    _reserve_premium_invoice_link,
    _reserve_premium_invoice_activation,
    build_platform_capability_router,
)


def _matches(row, query):
    for key, value in query.items():
        if key == "$and":
            if not all(_matches(row, clause) for clause in value):
                return False
        elif key == "$or":
            if not any(_matches(row, clause) for clause in value):
                return False
        elif isinstance(value, dict) and "$exists" in value:
            if (key in row) is not value["$exists"]:
                return False
        elif isinstance(value, dict) and "$in" in value:
            if _field(row, key) not in value["$in"]:
                return False
        elif _field(row, key) != value and not (
            isinstance(_field(row, key), list) and value in _field(row, key)
        ):
            return False
    return True


def _field(row, key):
    value = row
    for part in key.split("."):
        if isinstance(value, list):
            value = [item.get(part) for item in value if isinstance(item, dict) and part in item]
        elif isinstance(value, dict):
            value = value.get(part)
        else:
            return None
    return value


class FakeCursor:
    def __init__(self, rows):
        self.rows = [dict(row) for row in rows]

    def sort(self, field, direction):
        self.rows.sort(key=lambda row: row.get(field) or "", reverse=direction < 0)
        return self

    async def to_list(self, length):
        return self.rows[:length]


class FakeCollection:
    def __init__(self, *rows):
        self.rows = [dict(row) for row in rows]

    async def find_one(self, query, *_args, **_kwargs):
        return next((dict(row) for row in self.rows if _matches(row, query)), None)

    async def update_one(self, query, update, upsert=False):
        row = next((row for row in self.rows if _matches(row, query)), None)
        if row is None:
            if upsert:
                row = {key: value for key, value in query.items() if not key.startswith("$") and not isinstance(value, dict)}
                self.rows.append(row)
            else:
                return SimpleNamespace(matched_count=0, modified_count=0)
        before = dict(row)
        row.update(update.get("$set", {}))
        for key in update.get("$unset", {}):
            row.pop(key, None)
        if "$setOnInsert" in update and upsert and before == row:
            row.update(update["$setOnInsert"])
        return SimpleNamespace(matched_count=1, modified_count=int(row != before))

    async def count_documents(self, query):
        return sum(_matches(row, query) for row in self.rows)

    def find(self, query, *_args, **_kwargs):
        return FakeCursor(row for row in self.rows if _matches(row, query))

    async def insert_one(self, row):
        self.rows.append(dict(row))
        return SimpleNamespace(inserted_id=row.get("request_id"))


class FakeAuditEvents(FakeCollection):
    async def update_one(self, query, update, upsert=False):
        row = next((row for row in self.rows if _matches(row, query)), None)
        if row is None and upsert:
            self.rows.append(dict(update.get("$setOnInsert", {})))
            return SimpleNamespace(matched_count=0, modified_count=0)
        return await super().update_one(query, update, upsert)


class GatedInvoiceCollection(FakeCollection):
    def __init__(self, *rows):
        super().__init__(*rows)
        self.activation_attempted = asyncio.Event()
        self.allow_activation = asyncio.Event()

    async def update_one(self, query, update, upsert=False):
        if "premium_activation_state" in update.get("$set", {}):
            self.activation_attempted.set()
            await self.allow_activation.wait()
            return SimpleNamespace(matched_count=0, modified_count=0)
        return await super().update_one(query, update, upsert)


def _request_row(status="pending"):
    return {
        "request_id": "ppr-1",
        "organization_id": "org-1",
        "organization_name": "Nexus Demo",
        "requested_by": "manager-1",
        "status": status,
        "created_at": "2026-09-24T00:00:00Z",
    }


def _db(requests=None, invoices=None):
    return SimpleNamespace(
        premium_plan_requests=requests or FakeCollection(_request_row()),
        subscription_invoices=invoices or FakeCollection(),
        premium_plan_audit_events=FakeAuditEvents(),
        organizations=FakeCollection(),
        platform_capability_authority=FakeCollection({"_id": AUTHORITY_ID}),
        platform_capability_request_tombstones=FakeCollection(),
    )


def _run(coro):
    return asyncio.run(coro)


def _request(request_id="http-request-1"):
    from starlette.requests import Request

    return Request({
        "type": "http",
        "method": "GET",
        "path": "/",
        "headers": [(b"x-request-id", request_id.encode("ascii"))],
    })


def _granted_owner_db(request_rows=()):
    db = _db(requests=FakeCollection(*request_rows))
    db.platform_capability_authority = FakeCollection({
        "_id": AUTHORITY_ID,
        "active_grants": [{"user_id": "owner-1"}],
        "audit_events": [],
    })
    return db


def test_rejection_is_idempotent_and_private_reason_is_not_serialized():
    db = _db()
    result = _run(_reject_premium_plan_request(db, "owner-1", "ppr-1", "reject-1", "internal reason", "Public update"))
    replay = _run(_reject_premium_plan_request(db, "owner-1", "ppr-1", "reject-1", "internal reason", "Public update"))

    assert result == {"rejected": True, "idempotent_replay": False, "linked_unpaid_invoice_id": None}
    assert replay == {"rejected": True, "idempotent_replay": True, "linked_unpaid_invoice_id": None}
    row = db.premium_plan_requests.rows[0]
    assert "rejection_reason" not in row
    assert _premium_request_public(row)["public_note"] == "Public update"
    assert "rejection_reason" not in _premium_request_public(row)
    assert db.premium_plan_audit_events.rows[0]["event_type"] == "premium_rejected"
    assert db.premium_plan_audit_events.rows[0]["reason"] == "internal reason"


@pytest.mark.parametrize("invoice_changes", [
    {"status": "paid"},
    {"status": "issued", "premium_activation_state": "reserved"},
    {"status": "issued", "premium_activation_state": "active"},
])
def test_paid_or_locked_invoice_blocks_rejection(invoice_changes):
    invoice = {
        "invoice_id": "inv-1",
        "organization_id": "org-1",
        "premium_request_id": "ppr-1",
        "status": "issued",
        **invoice_changes,
    }
    db = _db(invoices=FakeCollection(invoice))
    with pytest.raises(HTTPException) as exc:
        _run(_reject_premium_plan_request(db, "owner-1", "ppr-1", "reject-1", "internal reason", None))
    assert exc.value.status_code == 409
    assert db.premium_plan_requests.rows[0]["status"] == "pending"


def test_unpaid_invoice_is_preserved_and_returned_for_follow_up():
    db = _db(invoices=FakeCollection({
        "invoice_id": "inv-unpaid", "organization_id": "org-1",
        "premium_request_id": "ppr-1", "status": "issued",
    }))
    result = _run(_reject_premium_plan_request(db, "owner-1", "ppr-1", "reject-1", "internal reason", None))
    assert result["linked_unpaid_invoice_id"] == "inv-unpaid"
    assert db.subscription_invoices.rows[0]["status"] == "issued"
    assert db.subscription_invoices.rows[0]["premium_request_id"] == "ppr-1"


def test_rejection_replay_remains_idempotent_if_invoice_state_changes_later():
    db = _db(invoices=FakeCollection({
        "invoice_id": "inv-unpaid", "organization_id": "org-1",
        "premium_request_id": "ppr-1", "status": "issued",
    }))
    first = _run(_reject_premium_plan_request(db, "owner-1", "ppr-1", "reject-1", "internal", None))
    db.subscription_invoices.rows[0]["status"] = "paid"
    replay = _run(_reject_premium_plan_request(db, "owner-1", "ppr-1", "reject-1", "internal", None))
    assert first["linked_unpaid_invoice_id"] == "inv-unpaid"
    assert replay == {"rejected": True, "idempotent_replay": True, "linked_unpaid_invoice_id": None}


def test_activation_and_rejection_race_uses_request_lock():
    async def race():
        requests = FakeCollection(_request_row())
        invoices = GatedInvoiceCollection({
            "invoice_id": "inv-1", "organization_id": "org-1",
            "premium_request_id": "ppr-1", "provider": "manual",
            "invoice_purpose": "premium_plan_excess", "status": "issued",
        })
        db = _db(requests=requests, invoices=invoices)
        activation = asyncio.create_task(
            _reserve_premium_invoice_activation(db, "org-1", "ppr-1", "inv-1", "activation-1")
        )
        await invoices.activation_attempted.wait()
        with pytest.raises(HTTPException) as reject_error:
            await _reject_premium_plan_request(db, "owner-1", "ppr-1", "reject-1", "internal", None)
        invoices.allow_activation.set()
        with pytest.raises(HTTPException) as activation_error:
            await activation
        return reject_error.value.status_code, activation_error.value.status_code, requests.rows[0]

    reject_status, activation_status, request_row = _run(race())
    assert reject_status == 409
    assert activation_status == 409
    assert request_row["status"] == "pending"
    assert "premium_activation_operation_id" not in request_row


class InvoicePayLandsDuringRejectCollection(FakeCollection):
    """Simulates manual payment confirmation landing in the gap between the reject
    pre-check read and the CAS write that applies the rejection. Payment confirmation
    (subscription_invoices.update_one) never touches premium_plan_requests, so it isn't
    serialized by the request-level CAS the way activation/link reservations are."""

    def __init__(self, *rows, invoices):
        super().__init__(*rows)
        self._invoices = invoices
        self._armed = True

    async def update_one(self, query, update, upsert=False):
        if self._armed and update.get("$set", {}).get("status") == "rejected":
            self._armed = False
            for row in self._invoices.rows:
                if row.get("premium_request_id") == "ppr-1":
                    row["status"] = "paid"
        return await super().update_one(query, update, upsert)


def test_payment_confirmed_during_reject_write_is_self_healed():
    async def race():
        invoices = FakeCollection({
            "invoice_id": "inv-1", "organization_id": "org-1",
            "premium_request_id": "ppr-1", "status": "issued",
        })
        requests = InvoicePayLandsDuringRejectCollection(_request_row(), invoices=invoices)
        db = _db(requests=requests, invoices=invoices)
        with pytest.raises(HTTPException) as exc:
            await _reject_premium_plan_request(db, "owner-1", "ppr-1", "reject-1", "internal", None)
        return exc.value.status_code, requests.rows[0], invoices.rows[0], db.premium_plan_audit_events.rows

    status, request_row, invoice_row, audit_rows = _run(race())
    assert status == 409
    assert request_row["status"] == "pending"
    assert request_row["rejection_request_id"] is None
    assert invoice_row["status"] == "paid"
    assert audit_rows == []


def test_invoice_link_and_rejection_race_is_serialized_by_request_cas():
    async def race():
        db = _db()
        await _reserve_premium_invoice_link(db, "org-1", "ppr-1", "link-1")
        with pytest.raises(HTTPException) as exc:
            await _reject_premium_plan_request(db, "owner-1", "ppr-1", "reject-1", "internal", None)
        await _release_premium_invoice_link(db, "org-1", "ppr-1", "link-1")
        return exc.value.status_code, db.premium_plan_requests.rows[0]

    status, row = _run(race())
    assert status == 409
    assert row["status"] == "pending"
    assert row["premium_invoice_link_state"] == "released"


@pytest.mark.parametrize("user,granted,expected", [
    (SimpleNamespace(role="owner", access_status="approved", user_id="owner-1"), False, {
        "premium_authority": False, "pending_premium_requests": None,
    }),
    (SimpleNamespace(role="owner", access_status="approved", user_id="owner-1"), True, {
        "premium_authority": True, "pending_premium_requests": 1,
    }),
    (SimpleNamespace(role="manager", access_status="approved", user_id="manager-1"), False, 403),
])
def test_me_reports_owner_capability_without_recording_denial(user, granted, expected):
    async def run():
        db = _db(requests=FakeCollection(_request_row()))
        if granted:
            db.platform_capability_authority = FakeCollection({
                "_id": AUTHORITY_ID,
                "active_grants": [{"user_id": user.user_id}],
                "audit_events": [],
            })

        async def current_user(*_args):
            return user

        router = build_platform_capability_router(db, current_user)
        endpoint = next(route.endpoint for route in router.routes if route.path.endswith("/me"))
        try:
            result = await endpoint()
            return db, result
        except HTTPException as exc:
            return db, exc.status_code

    db, result = _run(run())
    assert result == expected
    assert db.premium_plan_audit_events.rows == []
    assert db.platform_capability_authority.rows[0].get("audit_events", []) == []


def test_owner_request_list_filters_limits_counts_and_validates_status():
    rows = [
        _request_row("pending"),
        {**_request_row("active"), "request_id": "ppr-active"},
        {**_request_row("rejected"), "request_id": "ppr-rejected", "rejection_reason": "internal", "public_note": "See you later"},
        {**_request_row("disabled"), "request_id": "ppr-disabled"},
    ]

    async def run():
        db = _granted_owner_db(rows)

        async def current_user(*_args):
            return SimpleNamespace(role="owner", access_status="approved", user_id="owner-1")

        router = build_platform_capability_router(db, current_user)
        endpoint = next(route.endpoint for route in router.routes if route.path.endswith("/premium-plan-requests") and "GET" in route.methods)
        default_rows = await endpoint(_request("list-default"), status=None, limit=200)
        rejected = await endpoint(_request("list-rejected"), status="rejected", limit=200)
        limited = await endpoint(_request("list-all-limit"), status="all", limit=1)
        all_rows = await endpoint(_request("list-all"), status="all", limit=200)
        try:
            await endpoint(_request("list-invalid"), status="unknown", limit=200)
        except HTTPException as exc:
            invalid_status = exc.status_code
        else:
            invalid_status = None
        return default_rows, rejected, limited, all_rows, invalid_status

    default_rows, rejected, limited, all_rows, invalid_status = _run(run())
    assert {row["status"] for row in default_rows["requests"]} == {"pending", "active"}
    assert len(rejected["requests"]) == 1
    assert "rejection_reason" not in rejected["requests"][0]
    assert rejected["counts"] == {"pending": 1, "active": 1, "rejected": 1, "disabled": 1}
    assert len(limited["requests"]) == 1
    assert len(all_rows["requests"]) == 4
    assert invalid_status == 422


def test_manager_sees_only_rejection_status_and_public_note():
    row = {
        **_request_row("rejected"),
        "rejection_reason": "private accounting detail",
        "public_note": "Please contact us if you have questions.",
    }

    async def run():
        db = _db(requests=FakeCollection(row))

        async def current_user(*_args):
            return SimpleNamespace(role="manager", access_status="approved", user_id="manager-1")

        async def resolve_org(_user, _organization_id):
            return "org-1"

        db.organizations = FakeCollection({"organization_id": "org-1"})
        router = build_platform_capability_router(db, current_user, resolve_org)
        endpoint = next(route.endpoint for route in router.routes if route.path.endswith("/premium-plan/status"))
        return await endpoint()

    result = _run(run())
    assert result == {"status": "rejected", "public_note": "Please contact us if you have questions."}
    assert "rejection_reason" not in result


def test_reject_route_checks_capability_and_returns_404_for_missing_request():
    async def response(user, granted, request_id="reject-http"):
        db = _db()
        if granted:
            db.platform_capability_authority = FakeCollection({
                "_id": AUTHORITY_ID,
                "active_grants": [{"user_id": user.user_id}],
                "audit_events": [],
            })

        async def current_user(*_args):
            return user

        router = build_platform_capability_router(db, current_user)
        endpoint = next(route.endpoint for route in router.routes if route.path.endswith("/{premium_request_id}/reject"))
        try:
            return await endpoint(
                premium_request_id="missing-request",
                data=PremiumRejectRequest(reason="internal reason"),
                request=_request(request_id),
            )
        except HTTPException as exc:
            return exc.status_code

    async def run():
        denied = await response(SimpleNamespace(role="owner", access_status="approved", user_id="owner-1"), False)
        missing = await response(SimpleNamespace(role="owner", access_status="approved", user_id="owner-1"), True, "reject-http-2")
        return denied, missing

    assert _run(run()) == (403, 404)


def test_manager_can_resubmit_after_rejection():
    async def run():
        rejected = _request_row("rejected")
        db = _db(requests=FakeCollection(rejected))
        db.organizations = FakeCollection({
            "organization_id": "org-1", "nexus_ai_contracted": False,
            "nexus_ai_enabled": False, "premium_templates_contracted": False,
        })

        async def current_user(*_args):
            return SimpleNamespace(role="manager", access_status="approved", user_id="manager-1")

        async def resolve_org(_user, _organization_id):
            return "org-1"

        router = build_platform_capability_router(db, current_user, resolve_org)
        endpoint = next(route.endpoint for route in router.routes if route.path.endswith("/premium-plan-requests") and "POST" in route.methods)
        response = await endpoint(_request("manager-request-again"))
        return response, db.premium_plan_requests.rows

    response, rows = _run(run())
    assert response["status"] == "pending"
    assert [row["status"] for row in rows] == ["rejected", "pending"]
