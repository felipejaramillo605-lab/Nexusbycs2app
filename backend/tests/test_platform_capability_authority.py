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

from platform_capabilities import (  # noqa: E402
    AUTHORITY_ID,
    CAPABILITY,
    MAX_AUDIT_EVENTS,
    _audit_chain,
    _capacity_expr,
    _clean_reason,
    _request_id,
    _is_eligible_platform_owner,
    _request_id_unused_filter,
    _atomic_authority_update,
    _record_denial,
    bootstrap_initial_grant,
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
    result = _run_async(set_organization_entitlement(db, _actor("owner-a"), "legacy-org", True, "enable premium", "legacy-ent-1"))
    org = sync_db.organizations.find_one({"organization_id": "legacy-org"})
    assert result["contracted"] is True
    assert org["premium_templates_contracted"] is True
    assert org["portal_template_entitlement_request_id"] == "legacy-ent-1"


@requires_standalone
def test_concurrent_entitlement_mutation_for_same_org_is_serialized(authority_db):
    db, sync_db = authority_db
    sync_db.users.insert_one(_owner_doc("owner-a"))
    _run_async(bootstrap_initial_grant(db, "owner-a"))
    sync_db.organizations.insert_one({"organization_id": "org-serial", "premium_templates_contracted": False})
    async def race():
        return await asyncio.gather(
            set_organization_entitlement(db, _actor("owner-a"), "org-serial", True, "enable", "ent-serial-a"),
            set_organization_entitlement(db, _actor("owner-a"), "org-serial", False, "disable", "ent-serial-b"),
            return_exceptions=True,
        )
    results = _run_async(race())
    assert sum(not isinstance(value, Exception) for value in results) == 1, results
    errors = [value for value in results if isinstance(value, HTTPException)]
    assert len(errors) == 1 and errors[0].status_code == 409
    authority = sync_db.platform_capability_authority.find_one({"_id": AUTHORITY_ID})
    requests = [e for e in authority["audit_events"] if e.get("organization_id") == "org-serial"]
    assert len(requests) == 1 and requests[0]["state"] == "applied"


@requires_standalone
def test_ledger_failure_leaves_organization_unchanged(authority_db):
    db, sync_db = authority_db
    sync_db.users.insert_one(_owner_doc("owner-a"))
    _run_async(bootstrap_initial_grant(db, "owner-a"))
    sync_db.organizations.insert_one({"organization_id": "org-a", "premium_templates_contracted": False})
    broken = _DatabaseProxy(db, _FailPendingAuthority(db.platform_capability_authority))
    with pytest.raises(RuntimeError):
        _run_async(set_organization_entitlement(broken, _actor("owner-a"), "org-a", True, "enable premium", "ent-1"))
    org = sync_db.organizations.find_one({"organization_id": "org-a"})
    assert org["premium_templates_contracted"] is False
    assert "portal_template_entitlement_request_id" not in org


@requires_standalone
def test_pending_applied_and_unapplied_are_reconciled(authority_db):
    db, sync_db = authority_db
    sync_db.users.insert_one(_owner_doc("owner-a"))
    _run_async(bootstrap_initial_grant(db, "owner-a"))
    sync_db.organizations.insert_many([
        {"organization_id": "org-applied", "premium_templates_contracted": False},
        {"organization_id": "org-not-applied", "premium_templates_contracted": False},
    ])
    broken = _DatabaseProxy(db, _FailAppliedAuthority(db.platform_capability_authority))
    with pytest.raises(HTTPException) as exc:
        _run_async(set_organization_entitlement(broken, _actor("owner-a"), "org-applied", True, "enable premium", "ent-applied"))
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


@requires_standalone
def test_archived_request_id_remains_idempotent_and_cannot_be_reused(authority_db, tmp_path):
    from archive_platform_capability_audit import archive_and_compact

    db, sync_db = authority_db
    sync_db.users.insert_one(_owner_doc("owner-a"))
    _run_async(bootstrap_initial_grant(db, "owner-a"))
    sync_db.organizations.insert_one({"organization_id": "org-archive", "premium_templates_contracted": False})
    original = _run_async(set_organization_entitlement(
        db, _actor("owner-a"), "org-archive", True, "enable premium", "archive-idempotency-id",
    ))
    archive = tmp_path / "audit.json"
    assert _run_async(archive_and_compact(db, archive)) > 0
    tombstone = sync_db.platform_capability_request_tombstones.find_one({"_id": "archive-idempotency-id"})
    assert tombstone and tombstone["event"]["state"] == "applied"
    retried = _run_async(set_organization_entitlement(
        db, _actor("owner-a"), "org-archive", True, "enable premium", "archive-idempotency-id",
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
    _run_async(set_organization_entitlement(
        db, _actor("owner-a"), "org-race", True, "enable", "archive-race-id",
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
