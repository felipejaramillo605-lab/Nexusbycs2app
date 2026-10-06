"""Ubicaciones opcionales del inventario: bodega, ubicacion (seccion) y palet por articulo.

Cada articulo puede repartir su stock en varias ubicaciones. El total del articulo sigue siendo `inventory.quantity`
(la fuente de verdad que usan Kardex, servicios y compras); las ubicaciones solo dicen DONDE esta. Lo que no esta
asignado a ninguna ubicacion se informa como "sin ubicacion". Todo es opcional: un negocio que no use ubicaciones
no cambia en nada.
"""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Cookie, Header, HTTPException
from pydantic import BaseModel, Field

MAX_LOCATIONS_PER_ITEM = 50
_SPACES = re.compile(r"\s+")


def clean_part(value: Optional[str]) -> Optional[str]:
    """Normaliza un campo de ubicacion: sin espacios sobrantes, maximo 80 caracteres, vacio = None."""
    text = _SPACES.sub(" ", str(value or "")).strip()[:80]
    return text or None


def location_key(warehouse: Optional[str], location: Optional[str], pallet: Optional[str]) -> str:
    """Clave estable para comparar ubicaciones sin importar mayusculas/espacios."""
    return "|".join((part or "").lower() for part in (warehouse, location, pallet))


def is_unplaced(warehouse: Optional[str], location: Optional[str], pallet: Optional[str]) -> bool:
    return not (warehouse or location or pallet)


class LocationIn(BaseModel):
    warehouse: Optional[str] = Field(default=None, max_length=120)
    location: Optional[str] = Field(default=None, max_length=120)
    pallet: Optional[str] = Field(default=None, max_length=120)
    quantity: float = Field(ge=0)


class LocationsIn(BaseModel):
    locations: List[LocationIn] = Field(max_length=MAX_LOCATIONS_PER_ITEM)
    organization_id: Optional[str] = None


def build_inventory_locations_router(db, get_current_user, require_management_role, resolve_team_organization):
    router = APIRouter()

    async def organization(user, requested):
        require_management_role(user)
        return await resolve_team_organization(user, requested)

    async def active_item(org_id, item_id):
        item = await db.inventory.find_one(
            {"item_id": item_id, "organization_id": org_id, "active": {"$ne": False}}, {"_id": 0}
        )
        if not item:
            raise HTTPException(status_code=404, detail="Inventory item not found")
        return item

    def breakdown(item, buckets):
        total = round(float(item.get("quantity", 0) or 0), 4)
        assigned = round(sum(float(b["quantity"]) for b in buckets), 4)
        return {
            "total_quantity": total,
            "assigned_quantity": assigned,
            "unassigned_quantity": round(max(0.0, total - assigned), 4),
            "over_assigned": assigned > total + 1e-9,
        }

    @router.get("/inventory/locations/options", tags=["inventory-locations"])
    async def options(
        organization_id: Optional[str] = None,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        """Valores existentes de bodega, ubicacion y palet (para filtros y autocompletar)."""
        user = await get_current_user(authorization, session_token)
        org_id = await organization(user, organization_id)
        rows = await db.inventory_stock_locations.find({"organization_id": org_id}, {"_id": 0}).to_list(100000)
        return {
            "warehouses": sorted({r["warehouse"] for r in rows if r.get("warehouse")}),
            "locations": sorted({r["location"] for r in rows if r.get("location")}),
            "pallets": sorted({r["pallet"] for r in rows if r.get("pallet")}),
        }

    @router.get("/inventory/stock-by-location", tags=["inventory-locations"])
    async def stock_by_location(
        organization_id: Optional[str] = None,
        warehouse: Optional[str] = None,
        location: Optional[str] = None,
        pallet: Optional[str] = None,
        item_id: Optional[str] = None,
        q: Optional[str] = None,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        """Cantidades por ubicacion; con filtros sirve para un conteo fisico por bodega/seccion/palet."""
        user = await get_current_user(authorization, session_token)
        org_id = await organization(user, organization_id)
        query = {"organization_id": org_id}
        for field, value in (("warehouse", warehouse), ("location", location), ("pallet", pallet)):
            if clean_part(value):
                query[field] = {"$regex": f"^{re.escape(clean_part(value))}$", "$options": "i"}
        if item_id:
            query["item_id"] = item_id
        buckets = await db.inventory_stock_locations.find(query, {"_id": 0}).to_list(100000)
        items = {
            row["item_id"]: row
            for row in await db.inventory.find(
                {"organization_id": org_id, "item_id": {"$in": list({b["item_id"] for b in buckets})}}, {"_id": 0}
            ).to_list(100000)
        }
        needle = (q or "").strip().lower()
        rows = []
        for bucket in buckets:
            item = items.get(bucket["item_id"])
            if not item or item.get("active") is False:
                continue
            if needle and needle not in f"{item.get('sku', '')} {item.get('name', '')}".lower():
                continue
            rows.append(
                {
                    "item_id": bucket["item_id"],
                    "sku": item.get("sku"),
                    "name": item.get("name"),
                    "unit": item.get("unit"),
                    "warehouse": bucket.get("warehouse"),
                    "location": bucket.get("location"),
                    "pallet": bucket.get("pallet"),
                    "quantity": bucket["quantity"],
                    "total_quantity": item.get("quantity"),
                }
            )
        rows.sort(
            key=lambda r: ((r["warehouse"] or "").lower(), (r["location"] or "").lower(), (r["name"] or "").lower())
        )
        return {"items": rows, "total_units": round(sum(r["quantity"] for r in rows), 4), "count": len(rows)}

    @router.get("/inventory/{item_id}/locations", tags=["inventory-locations"])
    async def item_locations(
        item_id: str,
        organization_id: Optional[str] = None,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        user = await get_current_user(authorization, session_token)
        org_id = await organization(user, organization_id)
        item = await active_item(org_id, item_id)
        buckets = await db.inventory_stock_locations.find(
            {"organization_id": org_id, "item_id": item_id}, {"_id": 0}
        ).to_list(MAX_LOCATIONS_PER_ITEM + 1)
        return {"item_id": item_id, "locations": buckets, **breakdown(item, buckets)}

    @router.put("/inventory/{item_id}/locations", tags=["inventory-locations"])
    async def replace_locations(
        item_id: str,
        data: LocationsIn,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        """Reemplaza la distribucion por ubicaciones. No cambia el total ni genera movimientos de Kardex."""
        user = await get_current_user(authorization, session_token)
        org_id = await organization(user, data.organization_id)
        item = await active_item(org_id, item_id)
        now = datetime.now(timezone.utc).isoformat()
        seen, rows = set(), []
        for entry in data.locations:
            warehouse, place, pallet = clean_part(entry.warehouse), clean_part(entry.location), clean_part(entry.pallet)
            if is_unplaced(warehouse, place, pallet):
                raise HTTPException(status_code=400, detail="Indica bodega, ubicación o palet en cada fila")
            key = location_key(warehouse, place, pallet)
            if key in seen:
                raise HTTPException(status_code=400, detail="Hay ubicaciones repetidas")
            seen.add(key)
            rows.append(
                {
                    "location_stock_id": f"loc_{uuid.uuid4().hex[:14]}",
                    "organization_id": org_id,
                    "item_id": item_id,
                    "warehouse": warehouse,
                    "location": place,
                    "pallet": pallet,
                    "location_key": key,
                    "quantity": round(float(entry.quantity), 4),
                    "updated_at": now,
                    "updated_by": user.user_id,
                }
            )
        total = round(float(item.get("quantity", 0) or 0), 4)
        assigned = round(sum(r["quantity"] for r in rows), 4)
        if assigned > total + 1e-9:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Las ubicaciones suman {assigned} y el stock total es {total}. "
                    "Ajusta las cantidades o registra la entrada primero."
                ),
            )
        await db.inventory_stock_locations.delete_many({"organization_id": org_id, "item_id": item_id})
        if rows:
            await db.inventory_stock_locations.insert_many([dict(r) for r in rows])
        return {"item_id": item_id, "locations": rows, **breakdown(item, rows)}

    return router


async def ensure_inventory_locations_indexes(db):
    await db.inventory_stock_locations.create_index(
        [("organization_id", 1), ("item_id", 1), ("location_key", 1)],
        unique=True,
        name="inventory_stock_locations_item_place_unique",
    )
    await db.inventory_stock_locations.create_index(
        [("organization_id", 1), ("warehouse", 1), ("location", 1)], name="inventory_stock_locations_place"
    )
