"""Owner account management: add Owners by email, delete organizations (no network, no Mongo)."""

import asyncio
import re
import sys
from pathlib import Path
from types import SimpleNamespace

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import owner_account_management as subject  # noqa: E402


def _match_value(actual, cond):
    if isinstance(cond, dict):
        for op, val in cond.items():
            if op == "$regex":
                flags = re.I if "i" in cond.get("$options", "") else 0
                if not re.search(val, actual or "", flags):
                    return False
            elif op == "$options":
                continue
            elif op == "$gt":
                if not (actual is not None and actual > val):
                    return False
            elif op == "$gte":
                if not (actual is not None and actual >= val):
                    return False
            elif op == "$ne":
                if actual == val:
                    return False
            elif op == "$in":
                if actual not in val:
                    return False
            elif op == "$exists":
                if (actual is not None) != val and not (val is True and actual is not None):
                    return False
            else:
                raise NotImplementedError(op)
        return True
    return actual == cond


def _match(doc, query):
    return all(_match_value(doc.get(k), v) for k, v in query.items())


class Cursor:
    def __init__(self, rows):
        self.rows = rows

    async def to_list(self, _n):
        return [dict(r) for r in self.rows]


class Collection:
    def __init__(self, docs=()):
        self.docs = [dict(d) for d in docs]

    def find(self, query=None, projection=None):
        return Cursor([d for d in self.docs if _match(d, query or {})])

    async def find_one(self, query, projection=None, sort=None):
        rows = [d for d in self.docs if _match(d, query)]
        return dict(rows[0]) if rows else None

    async def find_one_and_update(self, query, update):
        for d in self.docs:
            if _match(d, query):
                before = dict(d)
                d.update(update["$set"])
                return before
        return None

    async def insert_one(self, doc):
        self.docs.append(dict(doc))

    async def update_one(self, query, update):
        for d in self.docs:
            if _match(d, query):
                d.update(update["$set"])
                return

    async def update_many(self, query, update):
        for d in self.docs:
            if _match(d, query):
                d.update(update["$set"])

    async def delete_many(self, query):
        self.docs = [d for d in self.docs if not _match(d, query)]

    async def count_documents(self, query):
        return len([d for d in self.docs if _match(d, query)])


def _build(role="owner"):
    db = SimpleNamespace(
        users=Collection(
            [
                {"user_id": "owner_1", "email": "yo@nexus.test", "role": "owner", "access_status": "approved"},
                {
                    "user_id": "mgr_1",
                    "email": "Ana@Example.com",
                    "name": "Ana",
                    "role": "manager",
                    "access_status": "pending",
                    "organization_id": "org_a",
                },
                {
                    "user_id": "mgr_2",
                    "email": "luis@example.com",
                    "role": "manager",
                    "access_status": "approved",
                    "organization_id": "org_a",
                },
                {"user_id": "gone_1", "email": "gone@example.com", "role": "manager", "access_status": "deleted"},
                {
                    "user_id": "owner_in_b",
                    "email": "bo@example.com",
                    "role": "owner",
                    "access_status": "approved",
                    "organization_id": "org_b",
                },
            ]
        ),
        owner_invitations=Collection(),
        user_sessions=Collection([{"user_id": "mgr_1"}, {"user_id": "mgr_2"}]),
        barbers=Collection([{"barber_id": "b1", "organization_id": "org_a", "active": True}]),
        organizations=Collection(
            [
                {"organization_id": "org_a", "name": "Barbería  Central"},
                {"organization_id": "org_b", "name": "Spa B"},
            ]
        ),
        appointments=Collection(
            [
                {"organization_id": "org_a", "status": "confirmed", "date": "2999-01-01"},
                {"organization_id": "org_a", "status": "confirmed", "date": "2000-01-01"},
            ]
        ),
        clients=Collection([{"organization_id": "org_a"}, {"organization_id": "org_a"}]),
        platform_audit_log=Collection(),
    )

    async def current_user(*_):
        return SimpleNamespace(role=role, access_status="approved", user_id="owner_1")

    app = FastAPI()

    @app.middleware("http")
    async def guard(request: Request, call_next):
        try:
            await subject.enforce_organization_active(request, db)
            return await call_next(request)
        except HTTPException as exc:
            return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

    app.include_router(subject.build_owner_account_router(db, current_user), prefix="/api")

    @app.get("/api/public/{org_id}/services")
    async def services(org_id: str):
        return {"org": org_id}

    return TestClient(app, raise_server_exceptions=False), db


REASON = "Alta autorizada por la gerencia"


def _add(client, email, reason=REASON):
    return client.post("/api/owner/owners", json={"email": email, "reason": reason})


def test_only_an_approved_owner_can_manage_owners_and_a_reason_is_required():
    manager, _ = _build(role="manager")
    assert _add(manager, "x@example.com").status_code == 403
    client, _ = _build()
    assert _add(client, "x@example.com", "corto").status_code == 422
    assert _add(client, "no-es-correo").status_code == 422


def test_existing_account_is_promoted_case_insensitively_and_audited():
    client, db = _build()
    body = _add(client, "  ana@example.COM ").json()
    assert body["result"] == "promoted"
    user = next(u for u in db.users.docs if u["user_id"] == "mgr_1")
    assert user["role"] == "owner" and user["access_status"] == "approved"
    assert all(s["user_id"] != "mgr_1" for s in db.user_sessions.docs)
    audit = db.platform_audit_log.docs[0]
    assert audit["event_type"] == "owner_added" and audit["reason"] == REASON
    assert audit["previous_value"] == {"role": "manager", "access_status": "pending"}
    assert _add(client, "ana@example.com").json()["result"] == "already_owner"


def test_deleted_accounts_cannot_be_promoted():
    client, _ = _build()
    assert _add(client, "gone@example.com").status_code == 409


def test_unknown_email_gets_a_single_pending_invitation_that_expires():
    client, db = _build()
    first = _add(client, "Nuevo@Example.com").json()
    assert first["result"] == "invited" and first["email"] == "nuevo@example.com"
    assert _add(client, "nuevo@example.com").json()["result"] == "already_invited"
    assert len(db.owner_invitations.docs) == 1
    assert db.platform_audit_log.docs[0]["event_type"] == "owner_invited"
    listed = client.get("/api/owner/owner-invitations").json()["items"]
    assert [i["email_normalized"] for i in listed] == ["nuevo@example.com"]
    invitation_id = listed[0]["invitation_id"]
    assert client.delete(f"/api/owner/owner-invitations/{invitation_id}").json() == {"revoked": True}
    assert client.get("/api/owner/owner-invitations").json()["items"] == []
    assert not asyncio.run(subject.consume_owner_invitation(db, "nuevo@example.com"))


def test_a_google_verified_signin_consumes_the_invitation_exactly_once():
    client, db = _build()
    _add(client, "nuevo@example.com")
    assert asyncio.run(subject.consume_owner_invitation(db, "NUEVO@example.com")) is True
    assert asyncio.run(subject.consume_owner_invitation(db, "nuevo@example.com")) is False
    assert db.owner_invitations.docs[0]["status"] == "accepted"


def test_an_expired_invitation_is_not_honored():
    client, db = _build()
    _add(client, "nuevo@example.com")
    db.owner_invitations.docs[0]["expires_at"] = "2000-01-01T00:00:00+00:00"
    assert asyncio.run(subject.consume_owner_invitation(db, "nuevo@example.com")) is False


def test_deletion_impact_reports_what_will_be_affected():
    client, _ = _build()
    body = client.get("/api/owner/organizations/org_a/deletion-impact").json()
    assert body["name"] == "Barbería  Central"
    assert (body["users"], body["upcoming_appointments"], body["clients"], body["enabled_owners"]) == (2, 1, 2, 0)


def test_deleting_an_organization_requires_the_exact_name_and_a_reason():
    client, db = _build()
    url = "/api/owner/organizations/org_a/delete"
    assert (
        client.post(url, json={"confirm_name": "otra", "reason": REASON}).json()["detail"]["code"]
        == "confirmation_mismatch"
    )
    assert client.post(url, json={"confirm_name": "Barbería Central", "reason": "corto"}).status_code == 422
    assert next(o for o in db.organizations.docs if o["organization_id"] == "org_a").get("deleted_at") is None


def test_an_organization_with_an_owner_account_cannot_be_deleted():
    client, _ = _build()
    response = client.post("/api/owner/organizations/org_b/delete", json={"confirm_name": "spa b", "reason": REASON})
    assert response.status_code == 409 and response.json()["detail"]["code"] == "owner_in_organization"


def test_deleting_an_organization_archives_it_and_removes_every_member_access():
    client, db = _build()
    response = client.post(
        "/api/owner/organizations/org_a/delete", json={"confirm_name": "  barbería   central ", "reason": REASON}
    )
    assert response.status_code == 200, response.text
    assert response.json()["users_removed"] == 2
    org = next(o for o in db.organizations.docs if o["organization_id"] == "org_a")
    assert org["deleted_at"] and org["status"] == "deleted" and org["deletion_reason"] == REASON
    for user in db.users.docs:
        if user["user_id"] in ("mgr_1", "mgr_2"):
            assert (
                user["access_status"] == "deleted"
                and user["email"].endswith("@nexus.invalid")
                and user["name"] == "Cuenta eliminada"
            )
    assert db.user_sessions.docs == []
    assert all(b["active"] is False for b in db.barbers.docs)
    assert len(db.clients.docs) == 2 and len(db.appointments.docs) == 2  # records are retained
    assert db.platform_audit_log.docs[-1]["event_type"] == "organization_deleted"
    assert (
        client.post("/api/owner/organizations/org_a/delete", json={"confirm_name": "x", "reason": REASON}).status_code
        == 404
    )


def test_public_pages_of_a_deleted_organization_return_404():
    client, db = _build()
    assert client.get("/api/public/org_a/services").status_code == 200
    client.post("/api/owner/organizations/org_a/delete", json={"confirm_name": "Barbería Central", "reason": REASON})
    assert client.get("/api/public/org_a/services").status_code == 404
    assert client.get("/api/public/org_b/services").status_code == 200
