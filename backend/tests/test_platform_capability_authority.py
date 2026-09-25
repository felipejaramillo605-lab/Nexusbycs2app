"""Pure and Mongo-standalone tests for platform capability authority."""
import asyncio
import os
import threading
import uuid
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

BACKEND = Path(__file__).resolve().parents[1]
import sys
sys.path.insert(0, str(BACKEND))
import platform_capabilities as platform_capabilities_module  # noqa: E402

from platform_capabilities import (  # noqa: E402
    AUTHORITY_ID,
    CAPABILITY,
    MAX_AUDIT_EVENTS,
    _audit_chain,
    _capacity_expr,
    _clean_reason,
    _request_id,
    _is_eligible_platform_owner,
    _reserve_premium_invoice_activation,
    _mark_premium_invoice_active,
    _release_premium_invoice_lock,
    _request_id_unused_filter,
    _atomic_authority_update,
    _record_denial,
    bootstrap_initial_grant,
    bootstrap_from_environment,
    BOOTSTRAP_ENV_VAR,
    acquire_platform_maintenance_lock,
    grant_capability,
    reconcile_pending_entitlements,
    require_platform_capability,
    revoke_capability,
    release_platform_maintenance_lock,
    set_organization_entitlement,
    protect_active_capability_holder,
)


def test_allowlist_limits_reason_and_request_id_are_bounded():
    assert CAPABILITY == "manage_portal_template_entitlements"
    assert _capacity_expr()["$expr"]["$and"][0]["$lt"][1] == MAX_AUDIT_EVENTS
    with pytest.raises(HTTPException) as exc:
        _clean_reason("  ")
    assert exc.value.status_code == 400
    with pytest.raises(HTTPException) as exc:
        _clean_reason("x" * 501)
    assert exc.value.status_code == 422
    from starlette.requests import Request
    request = Request({"type": "http", "headers": [(b"x-request-id", b"retry:001")]})
    assert _request_id(request) == "retry:001"
    request = Request({"type": "http", "headers": [(b"x-request-id", b"bad value") ]})
    assert _request_id(request).startswith("req_")


def test_audit_chain_detects_reordering_and_tampering():
    events = [{"event_id": "a", "request_id": "r1"}, {"event_id": "b", "request_id": "r2"}]
    chain, head = _audit_chain(events)
    assert chain[-1]["hash"] == head
    tampered, _ = _audit_chain([events[1], events[0]])
    assert tampered != chain


def test_active_platform_grant_holder_cannot_become_ineligible():
    authority = {"active_grants": [{"user_id": "owner-a"}]}
    with pytest.raises(HTTPException) as exc:
        protect_active_capability_holder(authority, "owner-a", False)
    assert exc.value.status_code == 409
    protect_active_capability_holder(authority, "owner-a", True)
    protect_active_capability_holder(authority, "owner-b", False)


@pytest.mark.parametrize(
    "user,eligible",
    [
        ({"role": "owner", "access_status": "approved"}, True),
        ({"role": "owner", "access_status": "approved", "active": False}, False),
        ({"role": "owner", "access_status": "approved", "deleted_at": "deleted"}, False),
        ({"role": "manager", "access_status": "approved"}, False),
        ({"role": "owner", "access_status": "pending"}, False),
    ],
)
def test_platform_owner_eligibility_matches_active_account_rules(user, eligible):
    assert _is_eligible_platform_owner(user) is eligible


MONGO_URL = os.environ.get("NEXUS_TEST_MONGO_URL")
requires_standalone = pytest.mark.skipif(not MONGO_URL, reason="set NEXUS_TEST_MONGO_URL to isolated Mongo standalone for integration tests")

# Motor clients and every operation must use the same running loop. Keep a
# dedicated loop alive for these synchronous pytest tests, and create the
# client from a coroutine running on that loop.
_MONGO_LOOP = asyncio.new_event_loop()


def _run_mongo_loop():
    # Motor/Tornado resolve their default IOLoop from the thread-local asyncio
    # loop. Register the same loop that run_coroutine_threadsafe targets before
    # starting it, so the client and every Motor Future stay on one loop.
    asyncio.set_event_loop(_MONGO_LOOP)
    _MONGO_LOOP.run_forever()


_MONGO_LOOP_THREAD = threading.Thread(
    target=_run_mongo_loop,
    name="platform-capability-mongo-loop",
    daemon=True,
)
_MONGO_LOOP_THREAD.start()


def _run_async(coro):
    return asyncio.run_coroutine_threadsafe(coro, _MONGO_LOOP).result()


async def _open_authority_db(mongo_url, db_name):
    from motor.motor_asyncio import AsyncIOMotorClient

    client = AsyncIOMotorClient(
        mongo_url,
        io_loop=_MONGO_LOOP,
        serverSelectionTimeoutMS=3000,
    )
    try:
        await client.admin.command("ping")
    except Exception:
        client.close()
        raise
    return client, client[db_name]


async def _drop_authority_db(client, db_name):
    await client.drop_database(db_name)
    client.close()


@pytest.fixture
def authority_db():
    from pymongo import MongoClient
    sync_client = MongoClient(MONGO_URL, serverSelectionTimeoutMS=3000)
    db_name = "nexus_platform_cap_test_" + uuid.uuid4().hex
    sync_db = sync_client[db_name]
    try:
        client, db = _run_async(_open_authority_db(MONGO_URL, db_name))
    except Exception as exc:
        sync_client.close()
        pytest.fail(f"NEXUS_TEST_MONGO_URL is configured but Mongo ping failed: {exc}")
    yield db, sync_db
    _run_async(_drop_authority_db(client, db_name))
    sync_client.close()


def _actor(user_id):
    return SimpleNamespace(user_id=user_id, role="owner", access_status="approved")


def _owner_doc(user_id, role="owner", status="approved"):
    return {"user_id": user_id, "role": role, "access_status": status}


def _seed_paid_premium_invoice(sync_db, organization_id, suffix):
    premium_request_id = f"ppr-{suffix}"
    invoice_id = f"sinv-{suffix}"
    sync_db.premium_plan_requests.insert_one({
        "request_id": premium_request_id, "organization_id": organization_id,
        "status": "pending", "created_at": "test",
    })
    sync_db.subscription_invoices.insert_one({
        "invoice_id": invoice_id, "organization_id": organization_id,
        "provider": "manual", "invoice_purpose": "premium_plan_excess",
        "premium_request_id": premium_request_id, "status": "paid",
        "amount_minor": 10000, "paid_amount_minor": 10000,
    })
    return premium_request_id, invoice_id


def test_activation_invoice_must_be_paid_manual_premium_for_exact_org_and_request():
    from platform_capabilities import _validate_premium_invoice

    request_row = {"request_id": "ppr-1", "organization_id": "org-a", "status": "pending"}
    invoice_row = {
        "invoice_id": "inv-1", "organization_id": "org-a", "provider": "manual",
        "invoice_purpose": "premium_plan_excess", "premium_request_id": "ppr-1",
        "status": "paid", "amount_minor": 1000, "paid_amount_minor": 1000,
    }

    class Collection:
        def __init__(self, row):
            self.row = row
        async def find_one(self, query, *_args, **_kwargs):
            if all(self.row.get(key) == value for key, value in query.items()):
                return self.row.copy()
            return None

    class Database:
        premium_plan_requests = Collection(request_row)
        subscription_invoices = Collection(invoice_row)

    assert _run_async(_validate_premium_invoice(Database(), "org-a", "ppr-1", "inv-1"))["status"] == "paid"
    invalid = [
        ("org-b", "ppr-1", "inv-1", "cross-tenant invoice"),
        ("org-a", "ppr-other", "inv-1", "wrong request"),
    ]
    for org_id, request_id, invoice_id, _label in invalid:
        with pytest.raises(HTTPException) as exc:
            _run_async(_validate_premium_invoice(Database(), org_id, request_id, invoice_id))
        assert exc.value.status_code == 409

    for changes in (
        {"invoice_purpose": "subscription"},
        {"provider": "stripe"},
        {"status": "pending"},
        {"premium_request_id": "ppr-other"},
        {"paid_amount_minor": 999},
    ):
        Database.subscription_invoices.row = {**invoice_row, **changes}
        with pytest.raises(HTTPException) as exc:
            _run_async(_validate_premium_invoice(Database(), "org-a", "ppr-1", "inv-1"))
        assert exc.value.status_code == 409
        Database.subscription_invoices.row = invoice_row.copy()


@requires_standalone
def test_bootstrap_race_creates_exactly_one_initial_grant(authority_db):
    db, sync_db = authority_db
    sync_db.users.insert_one(_owner_doc("owner-a"))
    async def race():
        return await asyncio.gather(
            bootstrap_initial_grant(db, "owner-a"),
            bootstrap_initial_grant(db, "owner-a"),
            return_exceptions=True,
        )
    results = _run_async(race())
    assert all(not isinstance(value, Exception) for value in results), results
    authority = sync_db.platform_capability_authority.find_one({"_id": AUTHORITY_ID})
    assert [grant["user_id"] for grant in authority["active_grants"]] == ["owner-a"]
    assert len([event for event in authority["audit_events"] if event["type"] == "bootstrap_granted"]) == 1
    assert sum(bool(value["created"]) for value in results) == 1


@requires_standalone
@pytest.mark.parametrize("extra", [{"active": False}, {"deleted_at": "2026-09-22T00:00:00Z"}])
def test_bootstrap_rejects_inactive_or_deleted_owner(authority_db, extra):
    db, sync_db = authority_db
    user = _owner_doc("owner-ineligible")
    user.update(extra)
    sync_db.users.insert_one(user)
    with pytest.raises(ValueError, match="approved owner"):
        _run_async(bootstrap_initial_grant(db, "owner-ineligible"))
    assert sync_db.platform_capability_authority.find_one({"_id": AUTHORITY_ID}) is None


def test_bootstrap_from_environment_returns_none_without_the_env_var():
    assert _run_async(bootstrap_from_environment(SimpleNamespace(), env={})) is None


@requires_standalone
def test_bootstrap_from_environment_creates_then_is_idempotent(authority_db):
    db, sync_db = authority_db
    sync_db.users.insert_one(_owner_doc("owner-a"))
    env = {BOOTSTRAP_ENV_VAR: "owner-a"}
    first = _run_async(bootstrap_from_environment(db, env=env))
    assert first == {"status": "created", "user_id": "owner-a", "version": 1}
    second = _run_async(bootstrap_from_environment(db, env=env))
    assert second == {"status": "already_initialized", "user_id": "owner-a", "version": 1}
    authority = sync_db.platform_capability_authority.find_one({"_id": AUTHORITY_ID})
    assert [grant["user_id"] for grant in authority["active_grants"]] == ["owner-a"]


@requires_standalone
def test_bootstrap_from_environment_skips_instead_of_raising_for_a_second_owner(authority_db):
    db, sync_db = authority_db
    sync_db.users.insert_many([_owner_doc("owner-a"), _owner_doc("owner-b")])
    _run_async(bootstrap_initial_grant(db, "owner-a"))
    result = _run_async(bootstrap_from_environment(db, env={BOOTSTRAP_ENV_VAR: "owner-b"}))
    assert result["status"] == "skipped"
    assert result["user_id"] == "owner-b"
    authority = sync_db.platform_capability_authority.find_one({"_id": AUTHORITY_ID})
    assert [grant["user_id"] for grant in authority["active_grants"]] == ["owner-a"]


@requires_standalone
def test_bootstrap_from_environment_skips_for_an_ineligible_owner(authority_db):
    db, sync_db = authority_db
    sync_db.users.insert_one({"user_id": "owner-c", "role": "manager", "access_status": "approved"})
    result = _run_async(bootstrap_from_environment(db, env={BOOTSTRAP_ENV_VAR: "owner-c"}))
    assert result == {"status": "skipped", "user_id": "owner-c", "reason": "bootstrap target must be an approved owner"}
    assert sync_db.platform_capability_authority.find_one({"_id": AUTHORITY_ID}) is None


@requires_standalone
def test_concurrent_grants_are_atomic_and_duplicate_is_conflict(authority_db):
    db, sync_db = authority_db
    sync_db.users.insert_many([_owner_doc("owner-a"), _owner_doc("owner-b")])
    _run_async(bootstrap_initial_grant(db, "owner-a"))
    actor = _actor("owner-a")
    target = _owner_doc("owner-b")
    async def race():
        return await asyncio.gather(
            grant_capability(db, actor, target, "grant for support", "grant-a"),
            grant_capability(db, actor, target, "grant for support", "grant-b"),
            return_exceptions=True,
        )
    results = _run_async(race())
    assert sum(not isinstance(value, Exception) for value in results) == 1
    errors = [value for value in results if isinstance(value, HTTPException)]
    assert len(errors) == 1 and errors[0].status_code == 409
    authority = sync_db.platform_capability_authority.find_one({"_id": AUTHORITY_ID})
    assert sum(g["user_id"] == "owner-b" for g in authority["active_grants"]) == 1
    assert sum(e["type"] == "granted" for e in authority["audit_events"]) == 1


@requires_standalone
def test_concurrent_retries_with_same_request_id_append_one_event(authority_db):
    db, sync_db = authority_db
    sync_db.users.insert_many([_owner_doc("owner-a"), _owner_doc("owner-b")])
    _run_async(bootstrap_initial_grant(db, "owner-a"))

    class BarrierAuthority:
        def __init__(self, inner):
            self.inner = inner
            self.arrived = 0
            self.both_arrived = asyncio.Event()
        def __getattr__(self, name): return getattr(self.inner, name)
        async def find_one_and_update(self, query, update, **kwargs):
            if "active_grants" in update.get("$push", {}):
                self.arrived += 1
                if self.arrived == 2:
                    self.both_arrived.set()
                await self.both_arrived.wait()
            return await self.inner.find_one_and_update(query, update, **kwargs)

    barrier = BarrierAuthority(db.platform_capability_authority)
    proxy = _DatabaseProxy(db, barrier)
    async def race():
        return await asyncio.gather(
            grant_capability(proxy, _actor("owner-a"), _owner_doc("owner-b"), "same request", "same-request-id"),
            grant_capability(proxy, _actor("owner-a"), _owner_doc("owner-b"), "same request", "same-request-id"),
            return_exceptions=True,
        )
    results = _run_async(race())
    assert all(not isinstance(value, Exception) for value in results), results
    authority = sync_db.platform_capability_authority.find_one({"_id": AUTHORITY_ID})
    assert sum(event.get("request_id") == "same-request-id" for event in authority["audit_events"]) == 1


@requires_standalone
def test_concurrent_denial_events_with_same_request_id_append_once(authority_db):
    db, sync_db = authority_db
    sync_db.users.insert_one(_owner_doc("owner-a"))
    _run_async(bootstrap_initial_grant(db, "owner-a"))
    denied_actor = SimpleNamespace(user_id="manager-x", role="manager", access_status="approved")
    async def race():
        return await asyncio.gather(
            require_platform_capability(db, denied_actor, CAPABILITY, "denial-same-id"),
            require_platform_capability(db, denied_actor, CAPABILITY, "denial-same-id"),
            return_exceptions=True,
        )
    results = _run_async(race())
    assert all(isinstance(value, HTTPException) and value.status_code == 403 for value in results)
    authority = sync_db.platform_capability_authority.find_one({"_id": AUTHORITY_ID})
    assert sum(event.get("request_id") == "denial-same-id" for event in authority["audit_events"]) == 1


@requires_standalone
def test_concurrent_revokes_never_remove_last_grant(authority_db):
    db, sync_db = authority_db
    sync_db.users.insert_many([_owner_doc("owner-a"), _owner_doc("owner-b")])
    _run_async(bootstrap_initial_grant(db, "owner-a"))
    _run_async(grant_capability(db, _actor("owner-a"), _owner_doc("owner-b"), "second grant", "grant-b"))
    async def race():
        return await asyncio.gather(
            revoke_capability(db, _actor("owner-a"), "owner-b", "rotate grants", "revoke-b"),
            revoke_capability(db, _actor("owner-b"), "owner-a", "rotate grants", "revoke-a"),
            return_exceptions=True,
        )
    results = _run_async(race())
    assert sum(not isinstance(value, Exception) for value in results) == 1
    authority = sync_db.platform_capability_authority.find_one({"_id": AUTHORITY_ID})
    assert len(authority["active_grants"]) == 1


@requires_standalone
def test_revoked_actor_cannot_start_another_mutation_and_denial_is_audited(authority_db):
    db, sync_db = authority_db
    sync_db.users.insert_many([_owner_doc("owner-a"), _owner_doc("owner-b"), _owner_doc("owner-c")])
    _run_async(bootstrap_initial_grant(db, "owner-a"))
    _run_async(grant_capability(db, _actor("owner-a"), _owner_doc("owner-b"), "second grant", "grant-b"))
    _run_async(revoke_capability(db, _actor("owner-b"), "owner-a", "rotate grants", "revoke-a"))
    with pytest.raises(HTTPException) as exc:
        _run_async(grant_capability(db, _actor("owner-a"), _owner_doc("owner-c"), "must fail", "grant-c"))
    assert exc.value.status_code == 403
    authority = sync_db.platform_capability_authority.find_one({"_id": AUTHORITY_ID})
    assert not any(item["user_id"] == "owner-c" for item in authority["active_grants"])
    assert any(event["type"] == "denied" and event["request_id"] == "grant-c" for event in authority["audit_events"])


class _PauseGrantAuthority:
    def __init__(self, inner):
        self.inner = inner
        self.ready = asyncio.Event()
        self.resume = asyncio.Event()
    def __getattr__(self, name): return getattr(self.inner, name)
    async def find_one_and_update(self, query, update, **kwargs):
        if "active_grants" in update.get("$push", {}):
            self.ready.set()
            await self.resume.wait()
        return await self.inner.find_one_and_update(query, update, **kwargs)


class _FailPendingAuthority:
    def __init__(self, inner): self.inner = inner
    def __getattr__(self, name): return getattr(self.inner, name)
    async def find_one_and_update(self, query, update, **kwargs):
        events = update.get("$push", {}).get("audit_events", {})
        if events.get("type") == "entitlement_change_requested":
            raise RuntimeError("injected ledger write failure")
        return await self.inner.find_one_and_update(query, update, **kwargs)


class _FailAppliedAuthority:
    def __init__(self, inner): self.inner = inner
    def __getattr__(self, name): return getattr(self.inner, name)
    async def update_one(self, query, update, **kwargs):
        if update.get("$set", {}).get("audit_events.$[event].state") == "applied":
            raise RuntimeError("injected ledger finalization failure")
        return await self.inner.update_one(query, update, **kwargs)


class _DatabaseProxy:
    def __init__(self, inner, authority): self.inner, self.platform_capability_authority = inner, authority
    def __getattr__(self, name): return getattr(self.inner, name)


@requires_standalone
def test_actor_revoked_after_precheck_cannot_complete_grant(authority_db):
    db, sync_db = authority_db
    sync_db.users.insert_many([_owner_doc("owner-a"), _owner_doc("owner-b"), _owner_doc("owner-c")])
    _run_async(bootstrap_initial_grant(db, "owner-a"))
    _run_async(grant_capability(db, _actor("owner-a"), _owner_doc("owner-b"), "second grant", "grant-b"))
    barrier = _PauseGrantAuthority(db.platform_capability_authority)
    proxy = _DatabaseProxy(db, barrier)
    async def race():
        pending = asyncio.create_task(grant_capability(proxy, _actor("owner-a"), _owner_doc("owner-c"), "racing grant", "grant-c"))
        await barrier.ready.wait()
        await revoke_capability(db, _actor("owner-b"), "owner-a", "revoke actor", "revoke-a")
        barrier.resume.set()
        return await asyncio.gather(pending, return_exceptions=True)
    results = _run_async(race())
    assert isinstance(results[0], HTTPException) and results[0].status_code == 403
    authority = sync_db.platform_capability_authority.find_one({"_id": AUTHORITY_ID})
    assert [grant["user_id"] for grant in authority["active_grants"]] == ["owner-b"]
    assert not any(grant["user_id"] == "owner-c" for grant in authority["active_grants"])


@requires_standalone
def test_entitlement_can_be_set_for_legacy_org_without_explicit_false(authority_db):
    db, sync_db = authority_db
    sync_db.users.insert_one(_owner_doc("owner-a"))
    _run_async(bootstrap_initial_grant(db, "owner-a"))
    sync_db.organizations.insert_one({"organization_id": "legacy-org"})
    premium_request_id, invoice_id = _seed_paid_premium_invoice(sync_db, "legacy-org", "legacy")
    result = _run_async(set_organization_entitlement(
        db, _actor("owner-a"), "legacy-org", True, "enable premium", "legacy-ent-1",
        premium_request_id, invoice_id,
    ))
    org = sync_db.organizations.find_one({"organization_id": "legacy-org"})
    assert result["contracted"] is True
    assert org["premium_templates_contracted"] is True
    assert org["nexus_ai_contracted"] is True
    assert org["nexus_ai_enabled"] is True
    assert org["portal_template_entitlement_request_id"] == "legacy-ent-1"


@requires_standalone
def test_premium_invoice_activation_and_refund_share_atomic_lock(authority_db):
    db, sync_db = authority_db
    org_id = "org-refund-race"
    request_id, invoice_id = _seed_paid_premium_invoice(sync_db, org_id, "refund-race")
    sync_db.organizations.insert_one({"organization_id": org_id})

    async def race_activation_and_refund():
        async def activate():
            try:
                await _reserve_premium_invoice_activation(db, org_id, request_id, invoice_id, "activate-race")
                return True
            except HTTPException:
                return False

        async def refund():
            result = await db.subscription_invoices.update_one(
                {
                    "invoice_id": invoice_id,
                    "organization_id": org_id,
                    "status": "paid",
                    "$or": [
                        {"premium_activation_state": {"$exists": False}},
                        {"premium_activation_state": "released"},
                    ],
                },
                {"$set": {"status": "refunded"}},
            )
            return result.modified_count == 1

        return await asyncio.gather(activate(), refund())

    activated, refunded = _run_async(race_activation_and_refund())
    assert activated != refunded
    invoice = sync_db.subscription_invoices.find_one({"invoice_id": invoice_id})
    if activated:
        assert invoice["status"] == "paid" and invoice["premium_activation_state"] == "reserved"
        assert invoice["paid_amount_minor"] == invoice["amount_minor"]
        _run_async(_mark_premium_invoice_active(db, org_id, request_id, invoice_id, "activate-race"))
        blocked = sync_db.subscription_invoices.update_one(
            {
                "invoice_id": invoice_id,
                "organization_id": org_id,
                "status": "paid",
                "$or": [
                    {"premium_activation_state": {"$exists": False}},
                    {"premium_activation_state": "released"},
                ],
            },
            {"$set": {"status": "refunded"}},
        )
        assert blocked.modified_count == 0
        sync_db.organizations.update_one(
            {"organization_id": org_id},
            {"$set": {"premium_templates_contracted": False, "nexus_ai_contracted": False, "nexus_ai_enabled": False}},
        )
        locked_invoice = sync_db.subscription_invoices.find_one({"invoice_id": invoice_id}, {"_id": 0})
        _run_async(_release_premium_invoice_lock(db, org_id, locked_invoice, "disable-premium"))
        released = sync_db.subscription_invoices.find_one({"invoice_id": invoice_id})
        assert released["status"] == "paid" and released["premium_activation_state"] == "released"
        refunded_after_disable = sync_db.subscription_invoices.update_one(
            {"invoice_id": invoice_id, "status": "paid", "premium_activation_state": "released"},
            {"$set": {"status": "refunded"}},
        )
        assert refunded_after_disable.modified_count == 1
        with pytest.raises(HTTPException) as exc:
            _run_async(_reserve_premium_invoice_activation(db, org_id, request_id, invoice_id, "activate-again"))
        assert exc.value.status_code == 409
    else:
        assert invoice["status"] == "refunded"


@requires_standalone
def test_disable_reactivate_disable_releases_all_premium_invoice_locks(authority_db):
    db, sync_db = authority_db
    org_id = "org-premium-cycle"
    sync_db.users.insert_one(_owner_doc("owner-a"))
    _run_async(bootstrap_initial_grant(db, "owner-a"))
    sync_db.organizations.insert_one({
        "organization_id": org_id,
        "premium_templates_contracted": True,
        "nexus_ai_contracted": True,
        "nexus_ai_enabled": True,
        "portal_template_entitlement_request_id": "activate-a",
    })
    request_a, invoice_a = _seed_paid_premium_invoice(sync_db, org_id, "cycle-a")
    sync_db.premium_plan_requests.update_one({"request_id": request_a}, {"$set": {"status": "active"}})
    sync_db.subscription_invoices.update_one(
        {"invoice_id": invoice_a},
        {"$set": {
            "premium_activation_state": "active",
            "premium_activation_operation_id": "activate-a",
            "premium_activation_request_id": request_a,
        }},
    )

    # First disable releases A; the organization is then reactivated against C.
    _run_async(set_organization_entitlement(
        db, _actor("owner-a"), org_id, False, "disable", "disable-first",
    ))
    invoice_a_row = sync_db.subscription_invoices.find_one({"invoice_id": invoice_a})
    assert invoice_a_row["premium_activation_state"] == "released"
    request_c = "ppr-cycle-c"
    invoice_c = "sinv-cycle-c"
    sync_db.premium_plan_requests.insert_one({
        "request_id": request_c, "organization_id": org_id, "status": "pending", "created_at": "test",
    })
    sync_db.subscription_invoices.insert_one({
        "invoice_id": invoice_c, "organization_id": org_id, "provider": "manual",
        "invoice_purpose": "premium_plan_excess", "premium_request_id": request_c,
        "status": "paid", "amount_minor": 10000, "paid_amount_minor": 10000,
    })
    _run_async(set_organization_entitlement(
        db, _actor("owner-a"), org_id, True, "reactivate", "activate-c", request_c, invoice_c,
    ))

    # Model a stale A lock from an interrupted earlier cycle alongside C. The
    # second disable must release both even if its primary event names A.
    sync_db.subscription_invoices.update_one(
        {"invoice_id": invoice_a},
        {"$set": {
            "premium_activation_state": "active",
            "premium_activation_operation_id": "stale-activate-a",
            "premium_activation_request_id": request_a,
        }},
    )
    sync_db.premium_plan_requests.update_one({"request_id": request_a}, {"$set": {"status": "active"}})
    _run_async(set_organization_entitlement(
        db, _actor("owner-a"), org_id, False, "disable again", "disable-second",
    ))

    for invoice_id in (invoice_a, invoice_c):
        current = sync_db.subscription_invoices.find_one({"invoice_id": invoice_id})
        assert current["status"] == "paid" and current["premium_activation_state"] == "released"
        refunded = sync_db.subscription_invoices.update_one(
            {
                "invoice_id": invoice_id,
                "organization_id": org_id,
                "status": "paid",
                "$or": [
                    {"premium_activation_state": {"$exists": False}},
                    {"premium_activation_state": "released"},
                ],
            },
            {"$set": {"status": "refunded"}},
        )
        assert refunded.modified_count == 1


@requires_standalone
def test_entitlement_loser_after_concurrent_marker_change_returns_conflict(monkeypatch, authority_db):
    db, sync_db = authority_db
    sync_db.users.insert_one(_owner_doc("owner-a"))
    _run_async(bootstrap_initial_grant(db, "owner-a"))
    sync_db.organizations.insert_one({
        "organization_id": "org-serial",
        "premium_templates_contracted": False,
        "portal_template_entitlement_request_id": "ent-before",
    })
    premium_request_id, invoice_id = _seed_paid_premium_invoice(sync_db, "org-serial", "serial")

    async def loser_after_winner(*_args, **_kwargs):
        sync_db.organizations.update_one(
            {"organization_id": "org-serial"},
            {"$set": {"portal_template_entitlement_request_id": "ent-winner"}},
        )
        return None

    monkeypatch.setattr(platform_capabilities_module, "_atomic_authority_update", loser_after_winner)
    with pytest.raises(HTTPException) as exc:
        _run_async(set_organization_entitlement(
            db, _actor("owner-a"), "org-serial", True, "enable",
            "ent-serial-a", premium_request_id, invoice_id,
        ))
    assert exc.value.status_code == 409
    invoice = sync_db.subscription_invoices.find_one({"invoice_id": invoice_id})
    premium_request = sync_db.premium_plan_requests.find_one({"request_id": premium_request_id})
    assert invoice["status"] == "paid" and invoice["premium_activation_state"] == "released"
    assert invoice["premium_activation_compensation_reason"] == "authority_event_not_persisted"
    assert premium_request.get("premium_activation_state") != "reserved"

@requires_standalone
def test_ledger_failure_leaves_organization_unchanged(authority_db):
    db, sync_db = authority_db
    sync_db.users.insert_one(_owner_doc("owner-a"))
    _run_async(bootstrap_initial_grant(db, "owner-a"))
    sync_db.organizations.insert_one({"organization_id": "org-a", "premium_templates_contracted": False})
    premium_request_id, invoice_id = _seed_paid_premium_invoice(sync_db, "org-a", "ledger")
    broken = _DatabaseProxy(db, _FailPendingAuthority(db.platform_capability_authority))
    with pytest.raises(RuntimeError):
        _run_async(set_organization_entitlement(broken, _actor("owner-a"), "org-a", True, "enable premium", "ent-1", premium_request_id, invoice_id))
    org = sync_db.organizations.find_one({"organization_id": "org-a"})
    assert org["premium_templates_contracted"] is False
    assert "portal_template_entitlement_request_id" not in org
    invoice = sync_db.subscription_invoices.find_one({"invoice_id": invoice_id})
    assert invoice["status"] == "paid" and invoice["premium_activation_state"] == "released"
    assert invoice["premium_activation_compensation_reason"] == "authority_event_not_persisted"


@requires_standalone
def test_capacity_failure_compensates_reserved_invoice(monkeypatch, authority_db):
    db, sync_db = authority_db
    sync_db.users.insert_one(_owner_doc("owner-a"))
    _run_async(bootstrap_initial_grant(db, "owner-a"))
    sync_db.organizations.insert_one({"organization_id": "org-capacity", "premium_templates_contracted": False})
    premium_request_id, invoice_id = _seed_paid_premium_invoice(sync_db, "org-capacity", "capacity")

    async def no_capacity(*_args, **_kwargs):
        return None

    monkeypatch.setattr(platform_capabilities_module, "_atomic_authority_update", no_capacity)
    with pytest.raises(HTTPException) as exc:
        _run_async(set_organization_entitlement(
            db, _actor("owner-a"), "org-capacity", True, "enable", "ent-capacity", premium_request_id, invoice_id,
        ))
    assert exc.value.status_code == 503
    invoice = sync_db.subscription_invoices.find_one({"invoice_id": invoice_id})
    assert invoice["status"] == "paid" and invoice["premium_activation_state"] == "released"
    assert not any(
        event.get("organization_id") == "org-capacity"
        and event.get("type") == "entitlement_change_requested"
        for event in sync_db.platform_capability_authority.find_one({"_id": AUTHORITY_ID}).get("audit_events", [])
    )


@requires_standalone
def test_revoked_capability_after_reservation_compensates_invoice(monkeypatch, authority_db):
    db, sync_db = authority_db
    sync_db.users.insert_one(_owner_doc("owner-a"))
    _run_async(bootstrap_initial_grant(db, "owner-a"))
    sync_db.organizations.insert_one({"organization_id": "org-revoked", "premium_templates_contracted": False})
    premium_request_id, invoice_id = _seed_paid_premium_invoice(sync_db, "org-revoked", "revoked")

    async def revoke_after_precheck(*_args, **_kwargs):
        sync_db.platform_capability_authority.update_one(
            {"_id": AUTHORITY_ID}, {"$set": {"active_grants": []}, "$inc": {"version": 1}},
        )
        return None

    monkeypatch.setattr(platform_capabilities_module, "_atomic_authority_update", revoke_after_precheck)
    with pytest.raises(HTTPException) as exc:
        _run_async(set_organization_entitlement(
            db, _actor("owner-a"), "org-revoked", True, "enable", "ent-revoked", premium_request_id, invoice_id,
        ))
    assert exc.value.status_code == 403
    invoice = sync_db.subscription_invoices.find_one({"invoice_id": invoice_id})
    assert invoice["status"] == "paid" and invoice["premium_activation_state"] == "released"


@requires_standalone
def test_pending_applied_and_unapplied_are_reconciled(authority_db):
    db, sync_db = authority_db
    sync_db.users.insert_one(_owner_doc("owner-a"))
    _run_async(bootstrap_initial_grant(db, "owner-a"))
    sync_db.organizations.insert_many([
        {"organization_id": "org-applied", "premium_templates_contracted": False},
        {"organization_id": "org-not-applied", "premium_templates_contracted": False},
    ])
    premium_request_id, invoice_id = _seed_paid_premium_invoice(sync_db, "org-applied", "applied")
    broken = _DatabaseProxy(db, _FailAppliedAuthority(db.platform_capability_authority))
    with pytest.raises(HTTPException) as exc:
        _run_async(set_organization_entitlement(broken, _actor("owner-a"), "org-applied", True, "enable premium", "ent-applied", premium_request_id, invoice_id))
    assert exc.value.status_code == 503
    sync_db.platform_capability_authority.update_one(
        {"_id": AUTHORITY_ID},
        {"$push": {"audit_events": {
            "event_id": "pending-test", "type": "entitlement_change_requested", "actor_user_id": "owner-a",
            "organization_id": "org-not-applied", "request_id": "ent-unapplied", "state": "pending", "created_at": "test",
        }}},
    )
    with pytest.raises(RuntimeError, match="requires an active platform maintenance lock"):
        _run_async(reconcile_pending_entitlements(db))
    lock_id = _run_async(acquire_platform_maintenance_lock(db))
    try:
        result = _run_async(reconcile_pending_entitlements(db, lock_id))
    finally:
        assert _run_async(release_platform_maintenance_lock(db, lock_id))
    assert result["applied"] == 1 and result["failed"] == 1
    authority = sync_db.platform_capability_authority.find_one({"_id": AUTHORITY_ID})
    states = {event["request_id"]: event["state"] for event in authority["audit_events"] if event.get("request_id") in {"ent-applied", "ent-unapplied"}}
    assert states == {"ent-applied": "applied", "ent-unapplied": "failed"}
    assert sync_db.organizations.find_one({"organization_id": "org-applied"})["premium_templates_contracted"] is True
    invoice = sync_db.subscription_invoices.find_one({"invoice_id": invoice_id})
    premium_request = sync_db.premium_plan_requests.find_one({"request_id": premium_request_id})
    assert invoice["premium_activation_state"] == "active"
    assert premium_request["status"] == "active"


@requires_standalone
def test_archived_request_id_remains_idempotent_and_cannot_be_reused(authority_db, tmp_path):
    from archive_platform_capability_audit import archive_and_compact

    db, sync_db = authority_db
    sync_db.users.insert_one(_owner_doc("owner-a"))
    _run_async(bootstrap_initial_grant(db, "owner-a"))
    sync_db.organizations.insert_one({"organization_id": "org-archive", "premium_templates_contracted": False})
    premium_request_id, invoice_id = _seed_paid_premium_invoice(sync_db, "org-archive", "archive")
    original = _run_async(set_organization_entitlement(
        db, _actor("owner-a"), "org-archive", True, "enable premium", "archive-idempotency-id", premium_request_id, invoice_id,
    ))
    archive = tmp_path / "audit.json"
    assert _run_async(archive_and_compact(db, archive)) > 0
    tombstone = sync_db.platform_capability_request_tombstones.find_one({"_id": "archive-idempotency-id"})
    assert tombstone and tombstone["event"]["state"] == "applied"
    assert tombstone["event"]["premium_request_id"] == premium_request_id
    assert tombstone["event"]["invoice_id"] == invoice_id
    retried = _run_async(set_organization_entitlement(
        db, _actor("owner-a"), "org-archive", True, "enable premium", "archive-idempotency-id", premium_request_id, invoice_id,
    ))
    assert retried == original
    with pytest.raises(HTTPException) as exc:
        _run_async(set_organization_entitlement(
            db, _actor("owner-a"), "org-archive", False, "disable premium", "archive-idempotency-id",
        ))
    assert exc.value.status_code == 409


@requires_standalone
def test_archive_racing_with_mutation_cannot_reuse_compacted_request_id(authority_db, tmp_path):
    from archive_platform_capability_audit import archive_and_compact

    db, sync_db = authority_db
    sync_db.users.insert_one(_owner_doc("owner-a"))
    _run_async(bootstrap_initial_grant(db, "owner-a"))
    sync_db.organizations.insert_one({"organization_id": "org-race", "premium_templates_contracted": False})
    premium_request_id, invoice_id = _seed_paid_premium_invoice(sync_db, "org-race", "race")
    _run_async(set_organization_entitlement(
        db, _actor("owner-a"), "org-race", True, "enable", "archive-race-id", premium_request_id, invoice_id,
    ))

    class PauseAfterTombstoneRead:
        def __init__(self, inner):
            self.inner = inner
            self.checked = asyncio.Event()
            self.resume = asyncio.Event()
        def __getattr__(self, name): return getattr(self.inner, name)
        async def find_one(self, query, *args, **kwargs):
            result = await self.inner.find_one(query, *args, **kwargs)
            if query.get("_id") == "archive-race-id" and result is None:
                self.checked.set()
                await self.resume.wait()
            return result

    class DatabaseProxy:
        def __init__(self, inner, tombstones):
            self.inner = inner
            self.platform_capability_request_tombstones = tombstones
        def __getattr__(self, name): return getattr(self.inner, name)

    tombstones = PauseAfterTombstoneRead(db.platform_capability_request_tombstones)
    proxy = DatabaseProxy(db, tombstones)
    reused_event = {
        "event_id": "race-reused", "type": "granted", "request_id": "archive-race-id",
        "state": "applied", "created_at": "test",
    }

    async def race():
        mutation = asyncio.create_task(_atomic_authority_update(
            proxy,
            _request_id_unused_filter("archive-race-id"),
            {"$push": {"audit_events": reused_event}, "$inc": {"version": 1}},
        ))
        await tombstones.checked.wait()
        assert await archive_and_compact(db, tmp_path / "race-archive.json") == 2
        tombstones.resume.set()
        return await mutation

    result = _run_async(race())
    assert result is None
    authority = sync_db.platform_capability_authority.find_one({"_id": AUTHORITY_ID})
    assert not any(event.get("event_id") == "race-reused" for event in authority["audit_events"])
    assert sync_db.platform_capability_request_tombstones.find_one({"_id": "archive-race-id"})


def test_authority_router_contains_only_owner_capability_routes():
    from platform_capabilities import build_platform_capability_router
    router = build_platform_capability_router(object(), lambda *_: None)
    paths = {route.path for route in router.routes}
    assert paths == {
        "/owner/platform-capabilities/portal-template-entitlements/grants",
        "/owner/platform-capabilities/portal-template-entitlements/grants/{user_id}",
        "/owner/platform-capabilities/portal-templates/{organization_id}/entitlement",
        "/owner/platform-capabilities/me",
        "/owner/platform-capabilities/premium-plan-requests",
        "/owner/platform-capabilities/premium-plan-requests/{premium_request_id}/reject",
        "/owner/platform-capabilities/premium-plan-requests/{premium_request_id}/invoice-link",
        "/owner/platform-capabilities/premium-plan-requests",
        "/owner/platform-capabilities/premium-plan/status",
    }
    assert all(not path.startswith("/public/") for path in paths)


def test_offline_archive_file_is_hash_verified(tmp_path):
    import json
    from archive_platform_capability_audit import verify_archive

    events = [{"event_id": "a", "type": "granted"}, {"event_id": "b", "type": "revoked"}]
    chain, head = _audit_chain(events, "previous")
    archive = tmp_path / "audit.json"
    payload = {"schema": "nexus-platform-capability-audit-v1", "capability_id": AUTHORITY_ID, "previous_hash": "previous", "event_count": len(chain), "head_hash": head, "items": chain}
    archive.write_text(json.dumps(payload), encoding="utf-8")
    assert verify_archive(archive)["head_hash"] == head
    payload["items"][0]["event"]["type"] = "tampered"
    archive.write_text(json.dumps(payload), encoding="utf-8")
    with pytest.raises(ValueError, match="hash chain"):
        verify_archive(archive)


def test_archive_rejects_existing_destination_without_overwriting(tmp_path):
    from archive_platform_capability_audit import archive_and_compact

    class Collection:
        async def find_one(self, *_args, **_kwargs):
            raise AssertionError("existing destination must be rejected before database access")

    class Database:
        platform_capability_authority = Collection()

    destination = tmp_path / "audit.json"
    destination.write_text("keep existing archive", encoding="utf-8")
    with pytest.raises(FileExistsError, match="destination already exists"):
        _run_async(archive_and_compact(Database(), destination))
    assert destination.read_text(encoding="utf-8") == "keep existing archive"
