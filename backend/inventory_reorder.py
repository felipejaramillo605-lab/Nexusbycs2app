# NEXUS_INVENTORY_REORDER_ALERTS_V1
# Feature 1.1 — Alertas de reorden automáticas + generación de borradores de OC.
# Reutiliza colecciones existentes: inventory, supplier_products, suppliers,
# purchase_orders. No introduce nuevo estado persistente propio.
from fastapi import APIRouter, HTTPException, Header, Cookie
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
from pymongo import ReturnDocument
import uuid


class GeneratePayload(BaseModel):
    item_ids: Optional[List[str]] = None  # si None → todos los items en alerta con proveedor sugerido
    organization_id: Optional[str] = None


def _severity(quantity: float, min_stock: float) -> str:
    if quantity <= 0:
        return "critical"
    if quantity <= min_stock:
        return "warning"
    return "ok"


def _suggested_quantity(quantity: float, min_stock: float) -> float:
    # Sugerencia simple: llegar al doble del mínimo (buffer razonable).
    target = max(min_stock * 2, min_stock + 1)
    return round(max(target - quantity, 1), 4)


async def _po_number(db, org: str) -> str:
    row = await db.procurement_counters.find_one_and_update(
        {"organization_id": org, "counter_type": "purchase_order"},
        {
            "$inc": {"sequence": 1},
            "$set": {"updated_at": datetime.now(timezone.utc).isoformat()},
            "$setOnInsert": {"created_at": datetime.now(timezone.utc).isoformat()},
        },
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    return f'OC-{int(row["sequence"]):06d}'


def build_inventory_reorder_router(db, get_current_user, require_management_role, resolve_team_organization):
    router = APIRouter()

    async def ctx(a, t, org=None):
        u = await get_current_user(a, t)
        require_management_role(u)
        return u, await resolve_team_organization(u, org)

    async def _load_suggestions(org: str):
        items = await db.inventory.find(
            {"organization_id": org, "active": {"$ne": False}},
            {"_id": 0},
        ).to_list(100000)
        low = [x for x in items if float(x.get("quantity", 0)) <= float(x.get("min_stock", 0))]
        if not low:
            return []

        item_ids = [x["item_id"] for x in low]
        links = await db.supplier_products.find(
            {"organization_id": org, "inventory_item_id": {"$in": item_ids}, "active": True},
            {"_id": 0},
        ).to_list(100000)
        supplier_ids = list({l["supplier_id"] for l in links})
        suppliers = await db.suppliers.find(
            {"organization_id": org, "supplier_id": {"$in": supplier_ids}, "active": True},
            {"_id": 0, "supplier_id": 1, "business_name": 1},
        ).to_list(1000) if supplier_ids else []
        supplier_map = {s["supplier_id"]: s for s in suppliers}
        # primer proveedor activo por item
        link_by_item = {}
        for l in links:
            if l["supplier_id"] in supplier_map and l["inventory_item_id"] not in link_by_item:
                link_by_item[l["inventory_item_id"]] = l

        out = []
        for x in low:
            link = link_by_item.get(x["item_id"])
            supplier = supplier_map.get(link["supplier_id"]) if link else None
            out.append({
                "item_id": x["item_id"],
                "sku": x.get("sku"),
                "name": x.get("name"),
                "unit": x.get("unit"),
                "quantity": float(x.get("quantity", 0)),
                "min_stock": float(x.get("min_stock", 0)),
                "unit_cost": float(x.get("unit_cost", 0)),
                "severity": _severity(float(x.get("quantity", 0)), float(x.get("min_stock", 0))),
                "suggested_quantity": _suggested_quantity(float(x.get("quantity", 0)), float(x.get("min_stock", 0))),
                "suggested_supplier_id": supplier["supplier_id"] if supplier else None,
                "suggested_supplier_name": supplier["business_name"] if supplier else None,
            })
        # críticos primero
        out.sort(key=lambda r: (0 if r["severity"] == "critical" else 1, r["name"] or ""))
        return out

    @router.get("/inventory/reorder-alerts")
    async def list_alerts(
        organization_id: Optional[str] = None,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        _, org = await ctx(authorization, session_token, organization_id)
        alerts = await _load_suggestions(org)
        return {
            "organization_id": org,
            "total": len(alerts),
            "critical_count": sum(1 for a in alerts if a["severity"] == "critical"),
            "warning_count": sum(1 for a in alerts if a["severity"] == "warning"),
            "with_supplier": sum(1 for a in alerts if a["suggested_supplier_id"]),
            "items": alerts,
        }

    @router.post("/inventory/reorder-alerts/generate-orders")
    async def generate_orders(
        data: GeneratePayload,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        u, org = await ctx(authorization, session_token, data.organization_id)
        alerts = await _load_suggestions(org)
        if not alerts:
            raise HTTPException(400, "No hay alertas de reorden activas")

        # filtrar por selección si viene
        if data.item_ids:
            selected_ids = set(data.item_ids)
            alerts = [a for a in alerts if a["item_id"] in selected_ids]
            if not alerts:
                raise HTTPException(400, "Ninguna alerta seleccionada es válida")

        skipped_no_supplier = [
            {"item_id": a["item_id"], "name": a["name"], "reason": "sin_proveedor_vinculado"}
            for a in alerts if not a["suggested_supplier_id"]
        ]
        actionable = [a for a in alerts if a["suggested_supplier_id"]]
        if not actionable:
            return {
                "created_orders": [],
                "created_count": 0,
                "skipped": skipped_no_supplier,
                "skipped_count": len(skipped_no_supplier),
                "message": "Ninguna referencia con alerta tiene proveedor vinculado. Asocia proveedores en el módulo de proveedores.",
            }

        # agrupar por proveedor
        groups = {}
        for a in actionable:
            groups.setdefault(a["suggested_supplier_id"], []).append(a)

        suppliers = await db.suppliers.find(
            {"organization_id": org, "supplier_id": {"$in": list(groups.keys())}, "active": True},
            {"_id": 0},
        ).to_list(1000)
        supplier_map = {s["supplier_id"]: s for s in suppliers}

        created = []
        now = datetime.now(timezone.utc).isoformat()
        for sup_id, items in groups.items():
            supplier = supplier_map.get(sup_id)
            if not supplier:
                skipped_no_supplier.extend([
                    {"item_id": a["item_id"], "name": a["name"], "reason": "proveedor_inactivo"}
                    for a in items
                ])
                continue

            lines = []
            for a in items:
                qty = a["suggested_quantity"]
                unit_cost = a["unit_cost"]
                gross = round(qty * unit_cost + 1e-9, 2)
                lines.append({
                    "line_id": f"pol_{uuid.uuid4().hex[:12]}",
                    "inventory_item_id": a["item_id"],
                    "item_name_snapshot": a["name"],
                    "sku_snapshot": a.get("sku"),
                    "quantity": qty,
                    "purchase_unit": a.get("unit"),
                    "conversion_factor": 1,
                    "unit_cost": unit_cost,
                    "discount_percent": 0,
                    "discount_amount": 0,
                    "tax_percent": 0,
                    "tax_amount": 0,
                    "subtotal": gross,
                    "total": gross,
                    "received_quantity": 0,
                })

            subtotal = round(sum(l["subtotal"] for l in lines) + 1e-9, 2)
            pid = f"po_{uuid.uuid4().hex[:16]}"
            doc = {
                "purchase_order_id": pid,
                "organization_id": org,
                "order_number": await _po_number(db, org),
                "supplier_id": supplier["supplier_id"],
                "supplier_name_snapshot": supplier["business_name"],
                "expected_delivery_date": None,
                "external_reference": None,
                "notes": "Generada automáticamente desde alertas de reorden",
                "lines": lines,
                "subtotal": subtotal,
                "discount_total": 0,
                "tax_total": 0,
                "total": subtotal,
                "currency": "COP",
                "status": "draft",
                "auto_generated": True,
                "auto_generation_source": "reorder_alerts",
                "created_by": u.user_id,
                "created_at": now,
                "updated_by": u.user_id,
                "updated_at": now,
            }
            await db.purchase_orders.insert_one(doc.copy())
            await db.audit_events.insert_one({
                "audit_id": f"audit_{uuid.uuid4().hex[:12]}",
                "organization_id": org,
                "event_type": "purchase_order_auto_generated",
                "entity_type": "purchase_order",
                "entity_id": pid,
                "actor_user_id": u.user_id,
                "previous_value": None,
                "new_value": {"source": "reorder_alerts", "item_count": len(lines)},
                "reason": None,
                "created_at": now,
            })
            created.append({
                "purchase_order_id": pid,
                "order_number": doc["order_number"],
                "supplier_id": supplier["supplier_id"],
                "supplier_name": supplier["business_name"],
                "item_count": len(lines),
                "total": subtotal,
            })

        return {
            "created_orders": created,
            "created_count": len(created),
            "skipped": skipped_no_supplier,
            "skipped_count": len(skipped_no_supplier),
            "message": f"Se crearon {len(created)} órdenes de compra en borrador",
        }

    return router
