"""Planes de membresia publicos para la pagina de inicio del portal."""

import sys
from pathlib import Path
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import portal_landing as subject  # noqa: E402


class Cursor:
    def __init__(self, rows):
        self.rows = rows

    async def to_list(self, limit):
        return [dict(r) for r in self.rows[:limit]]


class Coll:
    def __init__(self, docs=()):
        self.docs = [dict(d) for d in docs]

    def find(self, query, projection=None):
        return Cursor([d for d in self.docs if all(d.get(k) == v for k, v in query.items())])


def client(plans=(), services=()):
    db = SimpleNamespace(membership_plans=Coll(plans), services=Coll(services))
    app = FastAPI()
    app.include_router(subject.build_portal_landing_router(db), prefix="/api")
    return TestClient(app)


def svc(service_id, name, org="org_a"):
    return {"organization_id": org, "service_id": service_id, "service_type": "group", "name": name}


def plan(plan_id, name, price, benefits, active=True, org="org_a"):
    return {
        "organization_id": org,
        "plan_id": plan_id,
        "name": name,
        "price": price,
        "billing_cycle_days": 30,
        "included_services": benefits,
        "active": active,
        "internal_note": "no publicar",
    }


def test_lists_active_plans_with_total_classes_and_hides_internal_fields():
    c = client(
        plans=[
            plan(
                "p2",
                "Energía",
                440000,
                [{"service_id": "s1", "monthly_limit": 5}, {"service_id": "s2", "monthly_limit": 3}],
            ),
            plan("p1", "Vital", 240000, [{"service_id": "s1", "monthly_limit": 4}]),
            plan("p3", "Inactivo", 100, [{"service_id": "s1", "monthly_limit": 1}], active=False),
        ],
        services=[svc("s1", "Hot Barre"), svc("s2", "Pilates Sculpt")],
    )
    body = c.get("/api/public/org_a/membership-plans").json()
    assert [p["name"] for p in body] == ["Vital", "Energía"]  # ordenados por precio
    assert body[1]["classes_per_cycle"] == 8
    assert body[1]["billing_cycle_days"] == 30
    assert [s["name"] for s in body[1]["services"]] == ["Hot Barre", "Pilates Sculpt"]
    assert all("internal_note" not in p and "organization_id" not in p for p in body)


def test_unlimited_plan_and_other_organizations_are_isolated():
    c = client(
        plans=[
            plan("p1", "Ilimitado", 960000, [{"service_id": "s1", "monthly_limit": None}]),
            plan("p9", "Otra org", 1, [{"service_id": "s9", "monthly_limit": 1}], org="org_b"),
        ],
        services=[svc("s1", "Hot Barre"), svc("s9", "Yoga", org="org_b")],
    )
    body = c.get("/api/public/org_a/membership-plans").json()
    assert len(body) == 1
    assert body[0]["unlimited"] is True and body[0]["classes_per_cycle"] is None


def test_plan_whose_services_were_deleted_is_not_offered():
    c = client(plans=[plan("p1", "Huérfano", 10, [{"service_id": "gone", "monthly_limit": 2}])], services=[])
    assert c.get("/api/public/org_a/membership-plans").json() == []


def test_empty_when_no_plans():
    assert client().get("/api/public/org_a/membership-plans").json() == []
