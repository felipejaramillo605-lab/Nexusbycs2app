# NEXUS_PRODUCT_CATALOG_V10_V1
from __future__ import annotations

import os
import re
import secrets
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Cookie, File, Header, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from professional_media import (
    SAFE_FILE,
    SAFE_ORG,
    _read_limited,
    normalize_image,
)

MAX_PRODUCT_PHOTOS = 4
PUBLIC_PREFIX = "/api/media/catalog"
VALID_URL = re.compile(r"^https?://.{4,1000}$", re.IGNORECASE)


def catalog_media_root() -> Path:
    return Path(os.getenv("NEXUS_MEDIA_ROOT", "/app/data/professional-media")).resolve().parent / "catalog-media"


def _safe_catalog_path(organization_id: str, filename: str) -> Path:
    if not SAFE_ORG.fullmatch(organization_id or "") or not SAFE_FILE.fullmatch(filename or ""):
        raise HTTPException(status_code=404, detail="Image not found")
    root = catalog_media_root()
    candidate = (root / organization_id / filename).resolve()
    if root not in candidate.parents:
        raise HTTPException(status_code=404, detail="Image not found")
    return candidate


def _write_catalog_image(organization_id: str, payload: bytes) -> str:
    filename = secrets.token_hex(16) + ".webp"
    destination = _safe_catalog_path(organization_id, filename)
    destination.parent.mkdir(parents=True, exist_ok=True, mode=0o750)
    temporary = destination.with_suffix(".tmp")
    try:
        with temporary.open("xb") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, destination)
        os.chmod(destination, 0o640)
    finally:
        temporary.unlink(missing_ok=True)
    return f"{PUBLIC_PREFIX}/{organization_id}/{filename}"


def _delete_catalog_image(url: str | None):
    if not url or not url.startswith(PUBLIC_PREFIX + "/"):
        return
    parts = url[len(PUBLIC_PREFIX) + 1:].split("/")
    if len(parts) == 2 and SAFE_ORG.fullmatch(parts[0]) and SAFE_FILE.fullmatch(parts[1]):
        _safe_catalog_path(parts[0], parts[1]).unlink(missing_ok=True)


class ProductCreate(BaseModel):
    name: str = Field(..., max_length=160)
    description: Optional[str] = Field(default=None, max_length=1000)
    sale_price: float = 0
    unit_cost: float = 0
    quantity: float = 0
    min_stock: float = 0
    supplier_id: Optional[str] = None
    photo_urls: list[str] = Field(default_factory=list, max_length=4)
    published: bool = False


class ProductUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=160)
    description: Optional[str] = Field(default=None, max_length=1000)
    sale_price: Optional[float] = None
    unit_cost: Optional[float] = None
    min_stock: Optional[float] = None
    supplier_id: Optional[str] = None
    published: Optional[bool] = None


def build_product_catalog_router(db, get_current_user, require_management_role, resolve_team_organization):
    router = APIRouter()

    async def mgmt_org(auth, token, requested=None):
        user = await get_current_user(auth, token)
        require_management_role(user)
        org_id = await resolve_team_organization(user, requested)
        return user, org_id

    def validate_photo_urls(urls: list[str]):
        validated = []
        for url in (urls or [])[:MAX_PRODUCT_PHOTOS]:
            url = (url or "").strip()
            if url and VALID_URL.fullmatch(url):
                validated.append(url)
        return validated

    @router.post("/catalog/products", tags=["catalog"])
    async def create_product(
        data: ProductCreate,
        organization_id: Optional[str] = None,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        user, org_id = await mgmt_org(authorization, session_token, organization_id)
        if not data.name or not data.name.strip():
            raise HTTPException(400, "Product name is required")
        if data.sale_price < 0 or data.unit_cost < 0 or data.quantity < 0 or data.min_stock < 0:
            raise HTTPException(400, "Prices, stock and minimum stock cannot be negative")

        if data.supplier_id:
            supplier = await db.suppliers.find_one({"organization_id": org_id, "supplier_id": data.supplier_id, "active": True}, {"_id": 0, "supplier_id": 1})
            if not supplier:
                raise HTTPException(404, "Supplier not found or inactive")

        now = datetime.now(timezone.utc).isoformat()
        product_id = f"prod_{uuid.uuid4().hex[:12]}"
        doc = {
            "product_id": product_id,
            "organization_id": org_id,
            "name": data.name.strip()[:160],
            "description": (data.description or "").strip()[:1000] or None,
            "sale_price": round(float(data.sale_price), 2),
            "unit_cost": round(float(data.unit_cost), 2),
            "quantity": round(float(data.quantity), 4),
            "min_stock": round(float(data.min_stock), 4),
            "supplier_id": data.supplier_id,
            "photos": validate_photo_urls(data.photo_urls),
            "published": bool(data.published),
            "active": True,
            "created_by": user.user_id,
            "created_at": now,
            "updated_at": now,
        }
        await db.catalog_products.insert_one(doc.copy())
        return doc

    @router.get("/catalog/products", tags=["catalog"])
    async def list_products(
        organization_id: Optional[str] = None,
        include_archived: bool = False,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        user, org_id = await mgmt_org(authorization, session_token, organization_id)
        q = {"organization_id": org_id}
        if not include_archived:
            q["active"] = {"$ne": False}
        rows = await db.catalog_products.find(q, {"_id": 0}).sort([("name", 1)]).to_list(100000)
        for r in rows:
            r["is_low_stock"] = float(r.get("quantity", 0)) <= float(r.get("min_stock", 0))
        return rows

    @router.get("/catalog/products/{product_id}", tags=["catalog"])
    async def get_product(
        product_id: str,
        organization_id: Optional[str] = None,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        user, org_id = await mgmt_org(authorization, session_token, organization_id)
        doc = await db.catalog_products.find_one({"organization_id": org_id, "product_id": product_id}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Product not found")
        if doc.get("supplier_id"):
            supplier = await db.suppliers.find_one({"organization_id": org_id, "supplier_id": doc["supplier_id"]}, {"_id": 0, "business_name": 1, "supplier_id": 1})
            doc["supplier"] = supplier
        return doc

    @router.put("/catalog/products/{product_id}", tags=["catalog"])
    async def update_product(
        product_id: str,
        data: ProductUpdate,
        organization_id: Optional[str] = None,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        user, org_id = await mgmt_org(authorization, session_token, organization_id)
        existing = await db.catalog_products.find_one({"organization_id": org_id, "product_id": product_id}, {"_id": 0})
        if not existing:
            raise HTTPException(404, "Product not found")

        updates = {}
        if data.name is not None:
            if not data.name.strip():
                raise HTTPException(400, "Product name is required")
            updates["name"] = data.name.strip()[:160]
        if data.description is not None:
            updates["description"] = data.description.strip()[:1000] or None
        if data.sale_price is not None:
            if data.sale_price < 0:
                raise HTTPException(400, "Sale price cannot be negative")
            updates["sale_price"] = round(float(data.sale_price), 2)
        if data.unit_cost is not None:
            if data.unit_cost < 0:
                raise HTTPException(400, "Unit cost cannot be negative")
            updates["unit_cost"] = round(float(data.unit_cost), 2)
        if data.min_stock is not None:
            if data.min_stock < 0:
                raise HTTPException(400, "Minimum stock cannot be negative")
            updates["min_stock"] = round(float(data.min_stock), 4)
        if data.supplier_id is not None:
            if data.supplier_id:
                supplier = await db.suppliers.find_one({"organization_id": org_id, "supplier_id": data.supplier_id, "active": True}, {"_id": 0, "supplier_id": 1})
                if not supplier:
                    raise HTTPException(404, "Supplier not found or inactive")
            updates["supplier_id"] = data.supplier_id or None
        if data.published is not None:
            updates["published"] = bool(data.published)

        if not updates:
            raise HTTPException(400, "No fields to update")

        updates["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.catalog_products.update_one({"organization_id": org_id, "product_id": product_id}, {"$set": updates})
        return {**existing, **updates}

    @router.delete("/catalog/products/{product_id}", tags=["catalog"])
    async def archive_product(
        product_id: str,
        organization_id: Optional[str] = None,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        user, org_id = await mgmt_org(authorization, session_token, organization_id)
        now = datetime.now(timezone.utc).isoformat()
        result = await db.catalog_products.update_one(
            {"organization_id": org_id, "product_id": product_id, "active": {"$ne": False}},
            {"$set": {"active": False, "published": False, "archived_at": now, "updated_at": now}},
        )
        if result.modified_count != 1:
            raise HTTPException(404, "Product not found or already archived")
        return {"product_id": product_id, "active": False}

    @router.post("/catalog/products/{product_id}/reactivate", tags=["catalog"])
    async def reactivate_product(
        product_id: str,
        organization_id: Optional[str] = None,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        user, org_id = await mgmt_org(authorization, session_token, organization_id)
        now = datetime.now(timezone.utc).isoformat()
        result = await db.catalog_products.update_one(
            {"organization_id": org_id, "product_id": product_id, "active": False},
            {"$set": {"active": True, "updated_at": now}, "$unset": {"archived_at": ""}},
        )
        if result.modified_count != 1:
            raise HTTPException(409, "Product not found or already active")
        return {"product_id": product_id, "active": True}

    @router.post("/catalog/products/{product_id}/photos", tags=["catalog"])
    async def upload_product_photo(
        product_id: str,
        file: UploadFile = File(...),
        organization_id: Optional[str] = None,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        user, org_id = await mgmt_org(authorization, session_token, organization_id)
        doc = await db.catalog_products.find_one({"organization_id": org_id, "product_id": product_id, "active": {"$ne": False}}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Product not found")
        photos = doc.get("photos") or []
        if len(photos) >= MAX_PRODUCT_PHOTOS:
            raise HTTPException(400, f"Maximum {MAX_PRODUCT_PHOTOS} photos allowed. Delete one first.")
        payload, metadata = normalize_image(await _read_limited(file))
        new_url = _write_catalog_image(org_id, payload)
        photos.append(new_url)
        now = datetime.now(timezone.utc).isoformat()
        await db.catalog_products.update_one(
            {"organization_id": org_id, "product_id": product_id},
            {"$set": {"photos": photos, "updated_at": now}},
        )
        return {"photos": photos, "uploaded": new_url, **metadata}

    @router.delete("/catalog/products/{product_id}/photos/{photo_index}", tags=["catalog"])
    async def delete_product_photo(
        product_id: str,
        photo_index: int,
        organization_id: Optional[str] = None,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        user, org_id = await mgmt_org(authorization, session_token, organization_id)
        doc = await db.catalog_products.find_one({"organization_id": org_id, "product_id": product_id, "active": {"$ne": False}}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Product not found")
        photos = doc.get("photos") or []
        if photo_index < 0 or photo_index >= len(photos):
            raise HTTPException(400, "Invalid photo index")
        removed_url = photos.pop(photo_index)
        _delete_catalog_image(removed_url)
        now = datetime.now(timezone.utc).isoformat()
        await db.catalog_products.update_one(
            {"organization_id": org_id, "product_id": product_id},
            {"$set": {"photos": photos, "updated_at": now}},
        )
        return {"photos": photos, "deleted": removed_url}

    @router.post("/catalog/products/{product_id}/photos/url", tags=["catalog"])
    async def add_product_photo_url(
        product_id: str,
        url: str = Query(..., max_length=1000),
        organization_id: Optional[str] = None,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        user, org_id = await mgmt_org(authorization, session_token, organization_id)
        doc = await db.catalog_products.find_one({"organization_id": org_id, "product_id": product_id, "active": {"$ne": False}}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Product not found")
        photos = doc.get("photos") or []
        if len(photos) >= MAX_PRODUCT_PHOTOS:
            raise HTTPException(400, f"Maximum {MAX_PRODUCT_PHOTOS} photos allowed. Delete one first.")
        if not VALID_URL.fullmatch(url.strip()):
            raise HTTPException(400, "Invalid URL format")
        photos.append(url.strip())
        now = datetime.now(timezone.utc).isoformat()
        await db.catalog_products.update_one(
            {"organization_id": org_id, "product_id": product_id},
            {"$set": {"photos": photos, "updated_at": now}},
        )
        return {"photos": photos, "added": url.strip()}

    @router.put("/catalog/products/{product_id}/stock", tags=["catalog"])
    async def adjust_stock(
        product_id: str,
        quantity: float = Query(...),
        reason: str = Query("manual_adjustment", max_length=200),
        organization_id: Optional[str] = None,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        user, org_id = await mgmt_org(authorization, session_token, organization_id)
        doc = await db.catalog_products.find_one({"organization_id": org_id, "product_id": product_id, "active": {"$ne": False}}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Product not found")
        previous = round(float(doc.get("quantity", 0)), 4)
        new_qty = round(float(quantity), 4)
        if new_qty < 0:
            raise HTTPException(400, "Stock cannot be negative")
        now = datetime.now(timezone.utc).isoformat()
        await db.catalog_products.update_one(
            {"organization_id": org_id, "product_id": product_id},
            {"$set": {"quantity": new_qty, "updated_at": now}},
        )
        movement = {
            "movement_id": f"mov_{uuid.uuid4().hex[:16]}",
            "organization_id": org_id,
            "product_id": product_id,
            "movement_type": "manual_adjustment",
            "direction": "in" if new_qty > previous else "out",
            "previous_stock": previous,
            "new_stock": new_qty,
            "quantity_delta": round(new_qty - previous, 4),
            "reason": reason[:200],
            "created_by": user.user_id,
            "created_at": now,
        }
        await db.catalog_product_movements.insert_one(movement.copy())
        return {"product_id": product_id, "previous_stock": previous, "new_stock": new_qty}

    # --- Public endpoints (for client portal) ---

    @router.get("/public/{organization_id}/catalog", tags=["public-client-portal"])
    async def public_catalog(organization_id: str):
        org = await db.organizations.find_one({"organization_id": organization_id}, {"_id": 0, "catalog_enabled": 1})
        if not org or not org.get("catalog_enabled"):
            raise HTTPException(404, "Catalog is not available")
        rows = await db.catalog_products.find(
            {"organization_id": organization_id, "active": True, "published": True},
            {"_id": 0, "unit_cost": 0, "supplier_id": 0, "created_by": 0, "min_stock": 0},
        ).sort([("name", 1)]).to_list(10000)
        for r in rows:
            r["in_stock"] = float(r.get("quantity", 0)) > 0
        return rows

    @router.get("/public/{organization_id}/catalog/{product_id}", tags=["public-client-portal"])
    async def public_product_detail(organization_id: str, product_id: str):
        org = await db.organizations.find_one({"organization_id": organization_id}, {"_id": 0, "catalog_enabled": 1})
        if not org or not org.get("catalog_enabled"):
            raise HTTPException(404, "Catalog is not available")
        doc = await db.catalog_products.find_one(
            {"organization_id": organization_id, "product_id": product_id, "active": True, "published": True},
            {"_id": 0, "unit_cost": 0, "supplier_id": 0, "created_by": 0, "min_stock": 0},
        )
        if not doc:
            raise HTTPException(404, "Product not found")
        doc["in_stock"] = float(doc.get("quantity", 0)) > 0
        return doc

    # --- Catalog media serving ---

    @router.get("/media/catalog/{organization_id}/{filename}", tags=["catalog"], include_in_schema=False)
    async def get_catalog_media(organization_id: str, filename: str):
        path = _safe_catalog_path(organization_id, filename)
        if not path.is_file():
            raise HTTPException(status_code=404, detail="Image not found")
        return FileResponse(path, media_type="image/webp", headers={
            "Cache-Control": "public, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff",
        })

    return router


class CartItemInput(BaseModel):
    product_id: str
    quantity: int = Field(..., gt=0, le=999)


class CatalogCheckoutRequest(BaseModel):
    client_name: str = Field(..., max_length=100)
    client_phone: str = Field(..., max_length=32)
    client_email: Optional[str] = Field(default=None, max_length=254)
    items: list[CartItemInput]
    notes: Optional[str] = Field(default=None, max_length=500)


async def reserve_cart_items(db, organization_id: str, cart_items: list) -> tuple[list, float]:
    """Validate a cart against the live catalog and atomically decrement stock.

    Raises HTTPException(409) with a clear per-item message on any shortage or
    unpublished/inactive product, and rolls back any quantities it already
    decremented before raising — same fail-closed shape as
    checkout_inventory.reserve_checkout_inventory for service recipes.

    Returns (snapshot_lines, total) where snapshot_lines are stored on the
    appointment/order document so history is accurate even if the product is
    later edited, archived, or deleted.
    """
    if not cart_items:
        return [], 0.0

    reserved = []
    snapshot = []
    total = 0.0
    try:
        for entry in cart_items:
            product_id = entry.product_id if hasattr(entry, "product_id") else entry["product_id"]
            quantity = entry.quantity if hasattr(entry, "quantity") else entry["quantity"]
            product = await db.catalog_products.find_one(
                {"organization_id": organization_id, "product_id": product_id, "active": True, "published": True},
                {"_id": 0},
            )
            if not product:
                raise HTTPException(409, detail={"code": "product_unavailable", "message": "Uno de los productos ya no está disponible en el catálogo", "product_id": product_id})
            result = await db.catalog_products.update_one(
                {"organization_id": organization_id, "product_id": product_id, "active": True, "quantity": {"$gte": quantity}},
                {"$inc": {"quantity": -quantity}, "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}},
            )
            if result.modified_count != 1:
                raise HTTPException(409, detail={"code": "insufficient_stock", "message": f'No hay suficiente stock de "{product["name"]}"', "product_id": product_id})
            reserved.append({"product_id": product_id, "quantity": quantity})
            line = {
                "product_id": product_id,
                "name": product["name"],
                "unit_price": product["sale_price"],
                "quantity": quantity,
                "subtotal": round(product["sale_price"] * quantity, 2),
            }
            snapshot.append(line)
            total += line["subtotal"]
        return snapshot, round(total, 2)
    except Exception:
        for r in reversed(reserved):
            await db.catalog_products.update_one(
                {"organization_id": organization_id, "product_id": r["product_id"]},
                {"$inc": {"quantity": r["quantity"]}},
            )
        raise


async def release_cart_stock(db, organization_id: str, cart_items: list):
    """Return reserved quantities to stock — called when an appointment or
    order that included cart items is cancelled. Safe to call even if
    cart_items is empty/None."""
    if not cart_items:
        return
    now = datetime.now(timezone.utc).isoformat()
    for line in cart_items:
        product_id = line.get("product_id")
        quantity = line.get("quantity", 0)
        if not product_id or quantity <= 0:
            continue
        await db.catalog_products.update_one(
            {"organization_id": organization_id, "product_id": product_id},
            {"$inc": {"quantity": quantity}, "$set": {"updated_at": now}},
        )


def build_catalog_checkout_router(db, get_current_user):
    router = APIRouter()

    @router.post("/public/{organization_id}/catalog/checkout", tags=["public-client-portal"])
    async def checkout_products(organization_id: str, data: CatalogCheckoutRequest):
        org = await db.organizations.find_one({"organization_id": organization_id}, {"_id": 0, "catalog_enabled": 1})
        if not org or not org.get("catalog_enabled"):
            raise HTTPException(404, "Catalog is not available")
        if not data.items:
            raise HTTPException(400, "El carrito está vacío")

        snapshot, total = await reserve_cart_items(db, organization_id, data.items)

        now = datetime.now(timezone.utc).isoformat()
        order_id = f"order_{uuid.uuid4().hex[:12]}"
        order = {
            "order_id": order_id,
            "organization_id": organization_id,
            "client_name": data.client_name.strip()[:100],
            "client_phone": data.client_phone.strip()[:32],
            "client_email": (data.client_email or "").strip()[:254] or None,
            "items": snapshot,
            "total": total,
            "notes": (data.notes or "").strip()[:500] or None,
            "status": "pending_pickup",
            "appointment_id": None,
            "created_at": now,
        }
        await db.catalog_orders.insert_one(order.copy())
        return order

    return router


async def ensure_catalog_indexes(db):
    await db.catalog_products.create_index(
        [("organization_id", 1), ("product_id", 1)],
        unique=True, name="nexus_catalog_product_identity",
    )
    await db.catalog_products.create_index(
        [("organization_id", 1), ("active", 1), ("published", 1), ("name", 1)],
        name="nexus_catalog_product_listing",
    )
    await db.catalog_product_movements.create_index(
        [("organization_id", 1), ("product_id", 1), ("created_at", -1)],
        name="nexus_catalog_product_movements_lookup",
    )
    await db.catalog_orders.create_index(
        [("organization_id", 1), ("created_at", -1)],
        name="nexus_catalog_orders_org_listing",
    )
    await db.catalog_orders.create_index(
        [("organization_id", 1), ("order_id", 1)],
        unique=True, name="nexus_catalog_orders_identity",
    )
