"""Ubicaciones opcionales del inventario (bodega / ubicacion / palet) con base simulada."""

import re
import sys
from pathlib import Path
from types import SimpleNamespace

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import inventory_locations as subject  # noqa: E402


def matches(doc, key, condition):
    value = doc.get(key)
    if isinstance(condition, dict):
        if "$regex" in condition:
            flags = re.IGNORECASE if "i" in condition.get("$options", "") else 0
            return value is not None and re.search(condition["$regex"], str(value), flags) is not None
        if "$in" in condition:
            return value in condition["$in"]
        if "$ne" in condition:
            return value != condition["$ne"]
        return True
    return value == condition


class Cursor:
    def __init__(self, rows):
        self.rows = rows

    async def to_list(self, limit):
        return [dict(r) for r in self.rows[:limit]]


class Coll:
    def __init__(self, docs=()):
        self.docs = [dict(d) for d in docs]

    def _select(self, query):
        return [d for d in self.docs if all(matches(d, k, v) for k, v in query.items())]

    def find(self, query, projection=None):
        return Cursor(self._select(query))

    async def find_one(self, query, projection=None):
        found = self._select(query)
        return dict(found[0]) if found else None

    async def delete_many(self, query):
        gone = self._select(query)
        self.docs = [d for d in self.docs if d not in gone]

    async def insert_many(self, rows):
        self.docs.extend(dict(r) for r in rows)


def build(role="manager", org="org_a"):
    db = SimpleNamespace(
        inventory=Coll(
            [
                {
                    "item_id": "i1",
                    "organization_id": "org_a",
                    "sku": "INV-1",
                    "name": "Shampoo",
                    "unit": "unidades",
                    "quantity": 10,
                },
                {
                    "item_id": "i2",
                    "organization_id": "org_a",
                    "sku": "INV-2",
                    "name": "Cera",
                    "unit": "unidades",
                    "quantity": 4,
                },
                {
                    "item_id": "i3",
                    "organization_id": "org_b",
                    "sku": "INV-3",
                    "name": "Ajena",
                    "unit": "unidades",
                    "quantity": 9,
                },
                {
                    "item_id": "i4",
                    "organization_id": "org_a",
                    "sku": "INV-4",
                    "name": "Archivada",
                    "unit": "u",
                    "quantity": 1,
                    "active": False,
                },
            ]
        ),
        inventory_stock_locations=Coll(),
    )

    async def current_user(authorization=None, session_token=None):
        return SimpleNamespace(user_id="u1", role=role, organization_id=org)

    def require_management(user):
        if user.role not in {"manager", "admin", "owner"}:
            raise HTTPException(status_code=403, detail="Management access required")

    async def resolve(user, requested):
        if requested and requested != user.organization_id:
            raise HTTPException(status_code=403, detail="Access denied to this organization")
        return user.organization_id

    app = FastAPI()
    app.include_router(
        subject.build_inventory_locations_router(db, current_user, require_management, resolve), prefix="/api"
    )
    return TestClient(app), db


def put(client, item, rows):
    return client.put(f"/api/inventory/{item}/locations", json={"locations": rows})


def test_clean_parts_and_keys_ignore_case_and_spaces():
    assert subject.clean_part("  Bodega   Central ") == "Bodega Central"
    assert subject.clean_part("   ") is None and subject.clean_part(None) is None
    assert subject.location_key("Bodega 1", "A-3", None) == subject.location_key("bodega 1", " a-3".strip(), "")
    assert subject.is_unplaced(None, None, None) and not subject.is_unplaced(None, "A1", None)


def test_an_item_without_locations_is_fully_unassigned():
    client, _ = build()
    body = client.get("/api/inventory/i1/locations").json()
    assert body["locations"] == [] and body["unassigned_quantity"] == 10 and body["over_assigned"] is False


def test_the_manager_splits_an_item_across_optional_locations():
    client, db = build()
    response = put(
        client,
        "i1",
        [
            {"warehouse": "Bodega 1", "location": "Estante A", "pallet": "P-01", "quantity": 6},
            {"warehouse": "Bodega 2", "location": None, "pallet": None, "quantity": 3},
        ],
    )
    assert response.status_code == 200
    body = response.json()
    assert body["assigned_quantity"] == 9 and body["unassigned_quantity"] == 1 and len(body["locations"]) == 2
    assert db.inventory.docs[0]["quantity"] == 10  # el total no cambia ni se generan movimientos


def test_replacing_locations_replaces_the_previous_split():
    client, db = build()
    put(client, "i1", [{"warehouse": "B1", "quantity": 5}])
    put(client, "i1", [{"location": "Vitrina", "quantity": 2}])
    rows = db.inventory_stock_locations.docs
    assert len(rows) == 1 and rows[0]["location"] == "Vitrina"
    assert put(client, "i1", []).json()["unassigned_quantity"] == 10 and db.inventory_stock_locations.docs == []


def test_validation_rejects_over_assignment_empty_rows_and_duplicates():
    client, _ = build()
    assert put(client, "i2", [{"warehouse": "B1", "quantity": 5}]).status_code == 409  # total 4
    assert put(client, "i1", [{"quantity": 1}]).status_code == 400
    duplicated = [
        {"warehouse": "B1", "location": "A", "quantity": 1},
        {"warehouse": "b1", "location": " a", "quantity": 1},
    ]
    assert put(client, "i1", duplicated).status_code == 400
    assert put(client, "i1", [{"warehouse": "B1", "quantity": -1}]).status_code == 422


def test_stock_by_location_filters_by_warehouse_location_and_pallet():
    client, _ = build()
    put(
        client,
        "i1",
        [
            {"warehouse": "Bodega 1", "location": "Estante A", "pallet": "P-01", "quantity": 6},
            {"warehouse": "Bodega 2", "quantity": 3},
        ],
    )
    put(client, "i2", [{"warehouse": "Bodega 1", "location": "Estante B", "quantity": 4}])
    everything = client.get("/api/inventory/stock-by-location").json()
    assert everything["count"] == 3 and everything["total_units"] == 13
    first = client.get("/api/inventory/stock-by-location", params={"warehouse": "bodega 1"}).json()
    assert {r["name"] for r in first["items"]} == {"Shampoo", "Cera"} and first["total_units"] == 10
    shelf = client.get(
        "/api/inventory/stock-by-location", params={"warehouse": "Bodega 1", "location": "Estante A"}
    ).json()
    assert [r["name"] for r in shelf["items"]] == ["Shampoo"] and shelf["items"][0]["quantity"] == 6
    assert client.get("/api/inventory/stock-by-location", params={"pallet": "P-01"}).json()["count"] == 1
    assert client.get("/api/inventory/stock-by-location", params={"q": "cera"}).json()["count"] == 1


def test_options_list_the_existing_values_for_filters():
    client, _ = build()
    put(
        client,
        "i1",
        [
            {"warehouse": "Bodega 1", "location": "Estante A", "pallet": "P-01", "quantity": 1},
            {"warehouse": "Bodega 2", "quantity": 1},
        ],
    )
    options = client.get("/api/inventory/locations/options").json()
    assert options == {"warehouses": ["Bodega 1", "Bodega 2"], "locations": ["Estante A"], "pallets": ["P-01"]}


def test_other_organizations_and_archived_items_are_not_reachable():
    client, _ = build()
    assert client.get("/api/inventory/i3/locations").status_code == 404
    assert put(client, "i3", [{"warehouse": "B", "quantity": 1}]).status_code == 404
    assert client.get("/api/inventory/i4/locations").status_code == 404
    assert client.get("/api/inventory/locations/options", params={"organization_id": "org_b"}).status_code == 403


def test_staff_cannot_manage_locations():
    client, _ = build(role="staff")
    assert client.get("/api/inventory/i1/locations").status_code == 403
    assert put(client, "i1", [{"warehouse": "B", "quantity": 1}]).status_code == 403
    assert client.get("/api/inventory/stock-by-location").status_code == 403
