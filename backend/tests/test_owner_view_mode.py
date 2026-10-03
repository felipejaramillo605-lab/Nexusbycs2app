"""Owner view mode: read-only, audited, expiring, org-scoped (no network, no Mongo)."""

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import owner_view_mode  # noqa: E402


class Collection:
    def __init__(self):
        self.docs = []

    @staticmethod
    def _match(doc, query):
        return all(doc.get(k) == v for k, v in query.items())

    async def find_one(self, query, projection=None, sort=None):
        rows = [d for d in self.docs if self._match(d, query)]
        if sort:
            rows.sort(key=lambda d: d.get(sort[0][0]), reverse=sort[0][1] == -1)
        return dict(rows[0]) if rows else None

    async def insert_one(self, doc):
        self.docs.append(dict(doc))

    async def update_one(self, query, update):
        for doc in self.docs:
            if self._match(doc, query):
                doc.update(update["$set"])
                return

    async def update_many(self, query, update):
        for doc in self.docs:
            if self._match(doc, query):
                doc.update(update["$set"])


def _build(role="owner", fail_audit=False):
    db = SimpleNamespace(
        organizations=Collection(),
        owner_view_sessions=Collection(),
        platform_audit_log=Collection(),
    )
    db.organizations.docs.append({"organization_id": "org_a", "name": "Org A"})
    blocked = []

    async def current_user(*_):
        return SimpleNamespace(role=role, access_status="approved", user_id="owner_1")

    async def security_event(**kwargs):
        blocked.append(kwargs)

    if fail_audit:

        async def broken(*args, **kwargs):
            raise RuntimeError("audit store down")

        owner_view_mode.record_audit_event, original = broken, owner_view_mode.record_audit_event
    else:
        original = None

    app = FastAPI()

    @app.middleware("http")
    async def guard(request: Request, call_next):
        try:
            await owner_view_mode.enforce_view_mode(request, db, security_event)
            return await call_next(request)
        except HTTPException as exc:
            return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

    app.include_router(owner_view_mode.build_owner_view_router(db, current_user), prefix="/api")

    @app.get("/api/clients")
    async def clients():
        return {"ok": True}

    @app.get("/api/organizations/{organization_id}")
    async def org(organization_id: str):
        return {"id": organization_id}

    @app.get("/api/reports/export")
    async def export():
        return {"csv": "x"}

    @app.put("/api/organizations/{organization_id}")
    async def update_org(organization_id: str):
        return {"updated": True}

    @app.get("/api/owner/anything")
    async def owner_anything():
        return {"owner": True}

    return TestClient(app, raise_server_exceptions=False), db, blocked, original


def _start(client, reason="Revisar un reporte de soporte"):
    return client.post("/api/owner/view-sessions", json={"organization_id": "org_a", "reason": reason})


def _restore(original):
    if original is not None:
        owner_view_mode.record_audit_event = original


def test_start_requires_reason_owner_role_and_existing_org():
    client, _, _, _ = _build()
    assert _start(client, "corto").status_code == 422
    assert (
        client.post("/api/owner/view-sessions", json={"organization_id": "nope", "reason": "x" * 12}).status_code == 404
    )
    manager_client, _, _, _ = _build(role="manager")
    assert _start(manager_client).status_code == 403


def test_start_is_audited_with_reason_and_expires_in_minutes():
    client, db, _, _ = _build()
    body = _start(client).json()
    assert body["organization_name"] == "Org A"
    audit = db.platform_audit_log.docs[0]
    assert audit["category"] == "support_view" and audit["event_type"] == "view_session_started"
    assert audit["reason"] == "Revisar un reporte de soporte" and audit["actor_user_id"] == "owner_1"
    expires = datetime.fromisoformat(body["expires_at"])
    assert timedelta(minutes=29) < expires - datetime.now(timezone.utc) <= timedelta(minutes=30)


def test_if_the_start_cannot_be_audited_view_mode_does_not_start():
    client, db, _, original = _build(fail_audit=True)
    try:
        response = _start(client)
    finally:
        _restore(original)
    assert response.status_code == 500
    assert db.owner_view_sessions.docs == []


def test_reads_pass_but_writes_are_blocked_and_reported():
    client, _, blocked, _ = _build()
    headers = {owner_view_mode.VIEW_HEADER: _start(client).json()["view_id"]}
    assert client.get("/api/clients", headers=headers).status_code == 200
    response = client.put("/api/organizations/org_a", headers=headers)
    assert response.status_code == 403 and response.json()["detail"]["code"] == "VIEW_MODE_READ_ONLY"
    assert blocked and blocked[0]["event_type"] == "view_mode_write_blocked"
    assert client.put("/api/organizations/org_a").status_code == 200  # no header: Owner's normal session is untouched


def test_other_organizations_exports_and_owner_routes_are_blocked_in_view_mode():
    client, _, _, _ = _build()
    headers = {owner_view_mode.VIEW_HEADER: _start(client).json()["view_id"]}
    assert client.get("/api/organizations/org_a", headers=headers).status_code == 200
    assert client.get("/api/organizations/org_b", headers=headers).json()["detail"]["code"] == "VIEW_MODE_WRONG_ORG"
    assert client.get("/api/clients?organization_id=org_b", headers=headers).status_code == 403
    assert client.get("/api/clients?org_id=org_a", headers=headers).status_code == 200
    assert client.get("/api/reports/export", headers=headers).json()["detail"]["code"] == "VIEW_MODE_BLOCKED"
    assert client.get("/api/owner/anything", headers=headers).json()["detail"]["code"] == "VIEW_MODE_BLOCKED"


def test_ended_expired_or_unknown_sessions_are_rejected_with_a_distinct_code():
    client, db, _, _ = _build()
    view_id = _start(client).json()["view_id"]
    headers = {owner_view_mode.VIEW_HEADER: view_id}
    assert client.delete(f"/api/owner/view-sessions/{view_id}", headers=headers).json() == {"ended": True}
    assert client.get("/api/clients", headers=headers).json()["detail"]["code"] == "VIEW_SESSION_EXPIRED"
    assert [d["event_type"] for d in db.platform_audit_log.docs] == ["view_session_started", "view_session_ended"]
    second = _start(client).json()["view_id"]
    db.owner_view_sessions.docs[-1]["expires_at"] = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
    assert client.get("/api/clients", headers={owner_view_mode.VIEW_HEADER: second}).status_code == 401
    assert client.get("/api/clients", headers={owner_view_mode.VIEW_HEADER: "ovs_unknown"}).status_code == 401


def test_a_new_session_replaces_the_previous_one_and_current_reports_it():
    client, db, _, _ = _build()
    first = _start(client).json()["view_id"]
    second = _start(client).json()["view_id"]
    assert db.owner_view_sessions.docs[0]["ended_at"] is not None
    current = client.get("/api/owner/view-sessions/current").json()
    assert current["active"] is True and current["view_id"] == second and first != second
