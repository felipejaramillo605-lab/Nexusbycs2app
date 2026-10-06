"""Segmentos calculados de clientes (base simulada)."""

import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import client_segments as subject  # noqa: E402


class Cursor:
    def __init__(self, rows):
        self.rows = rows

    async def to_list(self, limit):
        return [dict(r) for r in self.rows[:limit]]


class Coll:
    def __init__(self, docs=()):
        self.docs = [dict(d) for d in docs]

    def find(self, query, projection=None):
        rows = [d for d in self.docs if all(d.get(k) == v for k, v in query.items())]
        return Cursor(rows)


TODAY = datetime.now(timezone.utc).date()


def ago(days):
    return (TODAY - timedelta(days=days)).isoformat()


def client(cid, org="org_a", visits=0, last=None, birthday=None, marketing=True, **extra):
    return {
        "client_id": cid,
        "organization_id": org,
        "name": cid.title(),
        "phone": "+57300" + cid[-1],
        "email": None,
        "total_visits": visits,
        "last_visit": last,
        "birthday": birthday,
        "accepts_marketing": marketing,
        "deletion_requested_at": None,
        **extra,
    }


def build():
    birthday = (TODAY + timedelta(days=10)).replace(year=1990).isoformat()
    db = SimpleNamespace(
        clients=Coll(
            [
                client("c1", visits=1, last=ago(5)),
                client("c2", visits=4, last=ago(35)),
                client("c3", visits=9, last=ago(70), marketing=False),
                client("c4", visits=2, last=ago(120), birthday=birthday),
                client("c5", visits=0),
                client("c6", org="org_b", visits=1, last=ago(1)),
            ]
        ),
        class_bookings=Coll([{"organization_id": "org_a", "client_id": "c2", "no_show": True}]),
        client_memberships=Coll([{"organization_id": "org_a", "client_id": "c3", "status": "active"}]),
    )

    async def get_current_user(authorization=None, session_token=None):
        if authorization == "staff":
            return SimpleNamespace(user_id="u2", role="staff", organization_id="org_a")
        return SimpleNamespace(user_id="u1", role="manager", organization_id="org_a")

    def require_management_role(user):
        if user.role not in ("manager", "owner", "admin"):
            raise HTTPException(status_code=403, detail="Management only")

    async def resolve_team_organization(user, requested):
        return user.organization_id

    app = FastAPI()
    app.include_router(
        subject.build_segment_router(db, get_current_user, require_management_role, resolve_team_organization),
        prefix="/api",
    )
    return TestClient(app)


def test_each_client_lands_in_the_right_segments():
    today = date.today()
    keys = lambda c, ns=(), mem=(): set(subject.segments_for_client(c, today, set(ns), set(mem)))  # noqa: E731
    assert keys(client("c1", visits=1, last=ago(5))) == {"first_visit"}
    assert keys(client("c2", visits=4, last=ago(35)), ns=["c2"]) == {"recurring", "inactive_30", "no_show"}
    assert keys(client("c3", visits=9, last=ago(70)), mem=["c3"]) == {
        "recurring",
        "high_value",
        "inactive_60",
        "member",
    }
    assert "inactive_90" in keys(client("c4", visits=2, last=ago(120)))
    assert keys(client("c5", visits=0)) == set()


def test_birthday_ignores_the_year_and_handles_leap_day():
    assert subject.days_until_birthday("1990-03-15", date(2026, 3, 10)) == 5
    assert subject.days_until_birthday("1990-03-05", date(2026, 3, 10)) == 360
    assert subject.days_until_birthday("2000-02-29", date(2026, 2, 20)) is not None
    assert subject.days_until_birthday("sin fecha", date(2026, 3, 10)) is None


def test_list_counts_marketable_clients_and_stays_inside_the_organization():
    api = build()
    data = {s["key"]: s for s in api.get("/api/marketing/segments").json()["segments"]}
    assert data["first_visit"]["count"] == 1  # c6 es de otra organizacion
    assert data["high_value"]["count"] == 1 and data["high_value"]["marketable_count"] == 0
    assert data["inactive_90"]["count"] == 1
    assert data["birthday_soon"]["count"] == 1
    assert data["no_show"]["count"] == 1 and data["member"]["count"] == 1


def test_segment_detail_lists_clients_and_unknown_or_staff_are_refused():
    api = build()
    body = api.get("/api/marketing/segments/recurring").json()
    assert [c["client_id"] for c in body["clients"]] == ["c2"] + ["c3"] or {
        c["client_id"] for c in body["clients"]
    } == {"c2", "c3"}
    assert body["marketable_count"] == 1
    assert body["clients"][0]["accepts_marketing"] is True  # los que aceptan marketing van primero
    assert api.get("/api/marketing/segments/nada").status_code == 404
    assert api.get("/api/marketing/segments", headers={"Authorization": "staff"}).status_code == 403
