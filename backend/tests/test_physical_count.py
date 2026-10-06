"""Conteo fisico con equipo: acceso temporal, comparacion entre contadores, reconteo y cierre (base simulada)."""

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import physical_count as subject  # noqa: E402


def matches(doc, key, condition):
    value = doc.get(key)
    if isinstance(condition, dict):
        if "$ne" in condition:
            return value != condition["$ne"]
        return True
    return value == condition


class Cursor:
    def __init__(self, rows):
        self.rows = rows

    def sort(self, key, direction):
        self.rows = sorted(self.rows, key=lambda r: r.get(key) or "", reverse=direction < 0)
        return self

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

    async def insert_one(self, doc):
        self.docs.append(dict(doc))

    async def insert_many(self, rows):
        self.docs.extend(dict(r) for r in rows)

    async def update_one(self, query, update):
        found = self._select(query)
        if found:
            found[0].update(update.get("$set", {}))
        return SimpleNamespace(modified_count=1 if found else 0)

    async def update_many(self, query, update):
        for doc in self._select(query):
            doc.update(update.get("$set", {}))

    async def find_one_and_update(self, query, update, upsert=False, return_document=None):
        found = self._select(query)
        if found:
            found[0]["value"] = found[0].get("value", 0) + update["$inc"]["value"]
            return dict(found[0])
        doc = {**query, "value": update["$inc"]["value"]}
        self.docs.append(doc)
        return dict(doc)


def future(hours=24):
    return (datetime.now(timezone.utc) + timedelta(hours=hours)).isoformat()


USERS = {
    "tok_boss": SimpleNamespace(user_id="u_boss", role="manager", organization_id="org_a", access_status="approved"),
    "tok_ana": SimpleNamespace(user_id="u_ana", role="staff", organization_id="org_a", access_status="approved"),
    "tok_luis": SimpleNamespace(user_id="u_luis", role="staff", organization_id="org_a", access_status="approved"),
    "tok_other": SimpleNamespace(user_id="u_x", role="staff", organization_id="org_b", access_status="approved"),
}


def build():
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
                    "unit_cost": 5,
                    "active": True,
                },
                {
                    "item_id": "i2",
                    "organization_id": "org_a",
                    "sku": "INV-2",
                    "name": "Gel",
                    "unit": "unidades",
                    "quantity": 4,
                    "unit_cost": 3,
                    "active": True,
                },
            ]
        ),
        inventory_stock_locations=Coll(
            [
                {
                    "organization_id": "org_a",
                    "item_id": "i1",
                    "location_key": "bodega 1|estante a|",
                    "warehouse": "Bodega 1",
                    "location": "Estante A",
                    "pallet": None,
                    "quantity": 6,
                },
            ]
        ),
        inventory_movements=Coll(),
        inventory_counts=Coll(),
        inventory_count_targets=Coll(),
        inventory_count_assignments=Coll(),
        inventory_count_entries=Coll(),
        inventory_sku_sequences=Coll(),
        subscription_notifications=Coll(),
        users=Coll(
            [
                {
                    "user_id": "u_ana",
                    "organization_id": "org_a",
                    "role": "staff",
                    "access_status": "approved",
                    "name": "Ana",
                },
                {
                    "user_id": "u_luis",
                    "organization_id": "org_a",
                    "role": "staff",
                    "access_status": "approved",
                    "name": "Luis",
                },
                {
                    "user_id": "u_x",
                    "organization_id": "org_b",
                    "role": "staff",
                    "access_status": "approved",
                    "name": "Otro",
                },
            ]
        ),
    )

    async def get_current_user(authorization=None, session_token=None):
        user = USERS.get(authorization)
        if not user:
            raise HTTPException(status_code=401, detail="Not authenticated")
        return user

    def require_management_role(user):
        if user.role not in ("manager", "admin"):
            raise HTTPException(status_code=403, detail="Management only")

    async def resolve_team_organization(user, requested):
        return user.organization_id

    app = FastAPI()
    app.include_router(
        subject.build_physical_count_router(db, get_current_user, require_management_role, resolve_team_organization),
        prefix="/api",
    )
    return db, TestClient(app)


def h(token):
    return {"Authorization": token}


def start(client, **extra):
    body = {"name": "Conteo octubre", "scope": {"type": "all"}, **extra}
    response = client.post("/api/inventory/counts", json=body, headers=h("tok_boss"))
    assert response.status_code == 200, response.text
    return response.json()


def targets_by_item(db):
    return {(t["item_id"], t["warehouse"]): t for t in db.inventory_count_targets.docs}


def assign(client, count_id, token_user="u_ana", **extra):
    response = client.post(
        f"/api/inventory/counts/{count_id}/assignments", json={"user_id": token_user, **extra}, headers=h("tok_boss")
    )
    assert response.status_code == 200, response.text
    return response.json()


def count(client, count_id, token, item, quantity, location=None, condition="good", **extra):
    body = {"item_id": item, "quantity": quantity, "condition": condition, **extra}
    if location:
        body.update(location)
    return client.post(f"/api/inventory/counts/{count_id}/entries", json=body, headers=h(token))


SHELF = {"warehouse": "Bodega 1", "location": "Estante A"}


# ---------------------------------------------------------------- pure logic


def test_signature_and_discrepancies_compare_state_quantity_code_and_price():
    a = subject.signature([{"condition": "good", "quantity": 5, "code": "ABC", "label_price": 10}])
    b = subject.signature([{"condition": "good", "quantity": 5, "code": "abc", "label_price": 10}])
    assert subject.find_discrepancies({"x": a, "y": b}) == []
    c = subject.signature(
        [
            {"condition": "good", "quantity": 4, "code": "ZZZ", "label_price": 12},
            {"condition": "damaged", "quantity": 1},
        ]
    )
    fields = {d["field"] for d in subject.find_discrepancies({"x": a, "y": c})}
    assert fields == {"quantity", "state", "code", "price"}


# ---------------------------------------------------------------- manager flow


def test_creating_a_count_snapshots_locations_and_unplaced_stock():
    db, client = build()
    header = start(client)
    assert header["count_number"].startswith("CNT-") and header["status"] == "counting"
    targets = targets_by_item(db)
    assert targets[("i1", "Bodega 1")]["system_quantity"] == 6
    assert targets[("i1", None)]["system_quantity"] == 4  # 10 total - 6 en estante
    assert targets[("i2", None)]["system_quantity"] == 4


def test_scope_by_location_only_includes_that_place():
    db, client = build()
    start(client, scope={"type": "location", "location": "estante a"})
    assert [(t["item_id"], t["warehouse"]) for t in db.inventory_count_targets.docs] == [("i1", "Bodega 1")]


def test_only_management_can_create_and_other_orgs_cannot_see():
    db, client = build()
    assert (
        client.post(
            "/api/inventory/counts", json={"name": "x1", "scope": {"type": "all"}}, headers=h("tok_ana")
        ).status_code
        == 403
    )
    header = start(client)
    assert client.get(f"/api/inventory/counts/{header['count_id']}", headers=h("tok_other")).status_code in (403, 404)


def test_assignment_only_for_same_org_staff_or_manager():
    db, client = build()
    header = start(client)
    response = client.post(
        f"/api/inventory/counts/{header['count_id']}/assignments", json={"user_id": "u_x"}, headers=h("tok_boss")
    )
    assert response.status_code == 400


# ---------------------------------------------------------------- counter access


def test_counter_needs_active_assignment_and_it_expires_or_is_revoked():
    db, client = build()
    header = start(client)
    cid = header["count_id"]
    assert client.get(f"/api/inventory/counts/{cid}/sheet", headers=h("tok_ana")).status_code == 403
    assert client.get("/api/inventory/counts/mine", headers=h("tok_ana")).json()["items"] == []
    asg = assign(client, cid)
    assert client.get("/api/inventory/counts/mine", headers=h("tok_ana")).json()["items"][0]["count_id"] == cid
    sheet = client.get(f"/api/inventory/counts/{cid}/sheet", headers=h("tok_ana")).json()
    assert len(sheet["items"]) == 3 and "system_quantity" not in sheet["items"][0]  # conteo ciego
    db.inventory_count_assignments.docs[0]["expires_at"] = future(-1)
    assert client.get(f"/api/inventory/counts/{cid}/sheet", headers=h("tok_ana")).status_code == 403
    assign(client, cid)  # renueva
    assert client.get(f"/api/inventory/counts/{cid}/sheet", headers=h("tok_ana")).status_code == 200
    client.delete(f"/api/inventory/counts/{cid}/assignments/{asg['assignment_id']}", headers=h("tok_boss"))
    assert client.get(f"/api/inventory/counts/{cid}/sheet", headers=h("tok_ana")).status_code == 403


def test_subset_assignment_limits_what_can_be_counted():
    db, client = build()
    header = start(client)
    cid = header["count_id"]
    gel = targets_by_item(db)[("i2", None)]["target_id"]
    assign(client, cid, target_ids=[gel])
    assert count(client, cid, "tok_ana", "i1", 6, SHELF).status_code == 403
    assert count(client, cid, "tok_ana", "i2", 4).status_code == 200


def test_discrete_units_must_be_whole_numbers():
    db, client = build()
    cid = start(client)["count_id"]
    assign(client, cid)
    assert count(client, cid, "tok_ana", "i2", 1.5).status_code == 400


def test_counter_can_edit_and_delete_until_submitting_then_it_locks():
    db, client = build()
    cid = start(client)["count_id"]
    assign(client, cid)
    entry = count(client, cid, "tok_ana", "i2", 3).json()
    put = client.put(
        f"/api/inventory/counts/{cid}/entries/{entry['entry_id']}",
        json={"item_id": "i2", "quantity": 4, "condition": "good"},
        headers=h("tok_ana"),
    )
    assert put.status_code == 200 and put.json()["quantity"] == 4
    extra = count(client, cid, "tok_ana", "i2", 1, code="x").json()
    assert (
        client.delete(f"/api/inventory/counts/{cid}/entries/{extra['entry_id']}", headers=h("tok_ana")).status_code
        == 200
    )
    assert client.post(f"/api/inventory/counts/{cid}/submit", headers=h("tok_ana")).status_code == 200
    assert count(client, cid, "tok_ana", "i2", 1).status_code == 409
    assert (
        client.delete(f"/api/inventory/counts/{cid}/entries/{entry['entry_id']}", headers=h("tok_ana")).status_code
        == 409
    )


# ---------------------------------------------------------------- comparison, alerts, recount


def full_count(client, cid, token, shelf=6, loose=4, gel=4):
    count(client, cid, token, "i1", shelf, SHELF)
    count(client, cid, token, "i1", loose)
    count(client, cid, token, "i2", gel)
    assert client.post(f"/api/inventory/counts/{cid}/submit", headers=h(token)).status_code == 200


def test_two_counters_are_compared_not_summed_and_a_mismatch_alerts_the_manager():
    db, client = build()
    cid = start(client)["count_id"]
    assign(client, cid, "u_ana")
    assign(client, cid, "u_luis")
    full_count(client, cid, "tok_ana")
    full_count(client, cid, "tok_luis", gel=3)
    review = client.get(f"/api/inventory/counts/{cid}/review", headers=h("tok_boss")).json()["items"]
    gel = next(i for i in review if i["item_id"] == "i2")
    assert gel["status"] == "mismatch"
    shampoo = [i for i in review if i["item_id"] == "i1"]
    assert all(i["status"] == "ok" and i["difference"] == 0 for i in shampoo)  # 6 y 6, no 12
    types = {n["event_type"] for n in db.subscription_notifications.docs}
    assert "inventory_count_mismatch" in types
    blocked = client.post(f"/api/inventory/counts/{cid}/close", json={}, headers=h("tok_boss"))
    assert blocked.status_code == 409 and blocked.json()["detail"]["mismatch"]


def test_label_price_difference_is_a_mismatch():
    db, client = build()
    cid = start(client)["count_id"]
    assign(client, cid, "u_ana")
    assign(client, cid, "u_luis")
    count(client, cid, "tok_ana", "i2", 4, label_price=10)
    count(client, cid, "tok_luis", "i2", 4, label_price=12)
    for token in ("tok_ana", "tok_luis"):
        client.post(f"/api/inventory/counts/{cid}/submit", headers=h(token))
    gel = next(
        i
        for i in client.get(f"/api/inventory/counts/{cid}/review", headers=h("tok_boss")).json()["items"]
        if i["item_id"] == "i2"
    )
    assert gel["status"] == "mismatch" and gel["discrepancies"][0]["field"] == "price"


def test_recount_bumps_the_round_reopens_the_counters_and_clears_the_mismatch():
    db, client = build()
    cid = start(client)["count_id"]
    assign(client, cid, "u_ana")
    assign(client, cid, "u_luis")
    full_count(client, cid, "tok_ana")
    full_count(client, cid, "tok_luis", gel=3)
    gel_target = targets_by_item(db)[("i2", None)]["target_id"]
    recount = client.post(
        f"/api/inventory/counts/{cid}/targets/{gel_target}/recount",
        json={"note": "Revisen el estante"},
        headers=h("tok_boss"),
    )
    assert recount.status_code == 200 and recount.json()["round"] == 2
    sheet = client.get(f"/api/inventory/counts/{cid}/sheet", headers=h("tok_ana")).json()
    row = next(i for i in sheet["items"] if i["target_id"] == gel_target)
    assert row["recount_requested"] and row["recount_note"] == "Revisen el estante" and row["entries"] == []
    for token in ("tok_ana", "tok_luis"):
        assert count(client, cid, token, "i2", 4).status_code == 200
        assert client.post(f"/api/inventory/counts/{cid}/submit", headers=h(token)).status_code == 200
    gel = next(
        i
        for i in client.get(f"/api/inventory/counts/{cid}/review", headers=h("tok_boss")).json()["items"]
        if i["item_id"] == "i2"
    )
    assert gel["status"] == "ok" and gel["round"] == 2


# ---------------------------------------------------------------- loss / surplus and closing


def test_loss_must_be_resolved_then_close_applies_stock_kardex_and_buckets_once():
    db, client = build()
    cid = start(client)["count_id"]
    assign(client, cid, "u_ana")
    full_count(client, cid, "tok_ana", shelf=5, gel=4)  # estante: 6 -> 5 = perdida de 1
    types = {n["event_type"] for n in db.subscription_notifications.docs}
    assert "inventory_count_loss" in types
    assert client.post(f"/api/inventory/counts/{cid}/close", json={}, headers=h("tok_boss")).status_code == 409
    target = targets_by_item(db)[("i1", "Bodega 1")]["target_id"]
    wrong = client.post(
        f"/api/inventory/counts/{cid}/targets/{target}/resolve", json={"resolution": "surplus"}, headers=h("tok_boss")
    )
    assert wrong.status_code == 400
    ok = client.post(
        f"/api/inventory/counts/{cid}/targets/{target}/resolve",
        json={"resolution": "loss", "comment": "Se rompió un frasco"},
        headers=h("tok_boss"),
    )
    assert ok.status_code == 200
    closed = client.post(f"/api/inventory/counts/{cid}/close", json={}, headers=h("tok_boss"))
    assert closed.status_code == 200 and closed.json()["status"] == "closed"
    assert next(i for i in db.inventory.docs if i["item_id"] == "i1")["quantity"] == 9
    movement = db.inventory_movements.docs[0]
    assert movement["movement_type"] == "audit_adjustment_out" and movement["adjustment_reason"] == "loss"
    assert (
        movement["notes"] == "Se rompió un frasco" and movement["previous_stock"] == 10 and movement["new_stock"] == 9
    )
    assert db.inventory_stock_locations.docs[0]["quantity"] == 5
    assert (
        client.post(f"/api/inventory/counts/{cid}/close", json={}, headers=h("tok_boss")).status_code == 409
    )  # ya cerrado
    assert len(db.inventory_movements.docs) == 1


def test_surplus_and_damaged_items_leave_a_traceable_trail():
    db, client = build()
    cid = start(client)["count_id"]
    assign(client, cid)
    count(client, cid, "tok_ana", "i1", 6, SHELF)
    count(client, cid, "tok_ana", "i1", 4)
    count(client, cid, "tok_ana", "i2", 5)  # +1 excedente
    count(client, cid, "tok_ana", "i2", 1, condition="damaged")  # total 6 (+2), 1 dañado
    client.post(f"/api/inventory/counts/{cid}/submit", headers=h("tok_ana"))
    gel = targets_by_item(db)[("i2", None)]["target_id"]
    assert (
        client.post(
            f"/api/inventory/counts/{cid}/targets/{gel}/resolve", json={"resolution": "surplus"}, headers=h("tok_boss")
        ).status_code
        == 200
    )
    assert client.post(f"/api/inventory/counts/{cid}/close", json={}, headers=h("tok_boss")).status_code == 200
    kinds = sorted(m["movement_type"] for m in db.inventory_movements.docs)
    assert kinds == ["audit_adjustment_in", "waste_out"]
    assert next(i for i in db.inventory.docs if i["item_id"] == "i2")["quantity"] == 5  # 4 + 2 - 1 dañado


def test_uncounted_targets_block_closing_unless_skipped():
    db, client = build()
    cid = start(client)["count_id"]
    assign(client, cid)
    count(client, cid, "tok_ana", "i2", 4)
    client.post(f"/api/inventory/counts/{cid}/submit", headers=h("tok_ana"))
    blocked = client.post(f"/api/inventory/counts/{cid}/close", json={}, headers=h("tok_boss"))
    assert blocked.status_code == 409 and blocked.json()["detail"]["uncounted"]
    assert (
        client.post(
            f"/api/inventory/counts/{cid}/close", json={"skip_uncounted": True}, headers=h("tok_boss")
        ).status_code
        == 200
    )


def test_cancel_revokes_access_and_unlisted_place_creates_an_extra_target():
    db, client = build()
    cid = start(client)["count_id"]
    assign(client, cid)
    assert count(client, cid, "tok_ana", "i2", 2, {"warehouse": "Bodega 9"}).status_code == 200
    extra = [t for t in db.inventory_count_targets.docs if t["extra"]]
    assert len(extra) == 1 and extra[0]["system_quantity"] == 0
    assert client.post(f"/api/inventory/counts/{cid}/cancel", headers=h("tok_boss")).status_code == 200
    assert client.get(f"/api/inventory/counts/{cid}/sheet", headers=h("tok_ana")).status_code == 403
