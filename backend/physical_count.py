"""Conteo fisico de inventario con equipo: acceso temporal, comparacion entre contadores, reconteo y resolucion.

Flujo (ver docs/plan/inventario-conteo-fisico.md):
  1. El manager crea una sesion (todo el inventario, una bodega/ubicacion/palet o articulos concretos). Se fotografia la
     existencia del sistema por (articulo, ubicacion): son los "objetivos" a contar.
  2. El manager habilita a personas de su organizacion (otro manager o staff) con un acceso TEMPORAL a todo o a parte
     de los objetivos. Quien cuenta registra uno por uno: articulo, estado, cantidad, ubicacion, precio de etiqueta
     y codigo.
  3. Lo que cuentan dos personas NO se suma: se compara. Si difiere (cantidad, estado, codigo o precio) se alerta al
     manager, que puede pedir reconteo de ese articulo. Si coinciden pero difieren del sistema, es perdida o
     excedente y el manager
     la define con un comentario.
  4. Al cerrar, se aplican ajustes al stock y al Kardex (idempotentes) y se actualizan las existencias por ubicacion.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import List, Literal, Optional

from fastapi import APIRouter, Cookie, Header, HTTPException
from pydantic import BaseModel, Field

from inventory_locations import clean_part, is_unplaced, location_key
from unit_catalog import validate_quantity_for_unit

CONDITIONS = ("good", "damaged", "expired", "other")
NON_SELLABLE = ("damaged", "expired")  # salen del stock como merma
RESOLUTIONS = ("loss", "surplus", "dismiss")
ASSIGNABLE_ROLES = {"manager", "admin", "staff"}
DEFAULT_ACCESS_HOURS = 24
MAX_ACCESS_HOURS = 24 * 14
MAX_TARGETS = 5000
EPS = 1e-9


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(moment: Optional[datetime] = None) -> str:
    return (moment or _now()).isoformat()


def _parse(value) -> Optional[datetime]:
    try:
        moment = datetime.fromisoformat(str(value))
    except (TypeError, ValueError):
        return None
    return moment if moment.tzinfo else moment.replace(tzinfo=timezone.utc)


def _q(value) -> float:
    return round(float(value or 0), 4)


# ---------------------------------------------------------------- logica pura (comparacion y resumen)


def signature(entries: list) -> dict:
    """Resumen de lo que UNA persona conto para un objetivo: cantidad por estado, codigos y precios de etiqueta."""
    quantities = {condition: 0.0 for condition in CONDITIONS}
    codes, prices = set(), set()
    for entry in entries:
        quantities[entry["condition"]] = _q(quantities[entry["condition"]] + entry["quantity"])
        if entry.get("code"):
            codes.add(str(entry["code"]).strip().lower())
        if entry.get("label_price") is not None:
            prices.add(_q(entry["label_price"]))
    return {"quantities": quantities, "codes": sorted(codes), "prices": sorted(prices)}


def counted_totals(sig: dict) -> dict:
    quantities = sig["quantities"]
    bad = _q(sum(quantities[c] for c in NON_SELLABLE))
    total = _q(sum(quantities.values()))
    return {"total": total, "good": _q(quantities["good"] + quantities["other"]), "non_sellable": bad}


def find_discrepancies(by_user: dict) -> list:
    """Diferencias entre contadores (por estado/cantidad; codigo y precio solo si ambos lo registraron)."""
    users = list(by_user)
    found = []
    for i, first in enumerate(users):
        for second in users[i + 1 :]:  # noqa: E203
            a, b = by_user[first], by_user[second]
            for condition in CONDITIONS:
                if abs(a["quantities"][condition] - b["quantities"][condition]) > EPS:
                    found.append(
                        {
                            "field": "quantity" if condition == "good" else "state",
                            "condition": condition,
                            "users": [first, second],
                            "values": [a["quantities"][condition], b["quantities"][condition]],
                        }
                    )
            if a["codes"] and b["codes"] and a["codes"] != b["codes"]:
                found.append({"field": "code", "users": [first, second], "values": [a["codes"], b["codes"]]})
            if a["prices"] and b["prices"] and a["prices"] != b["prices"]:
                found.append({"field": "price", "users": [first, second], "values": [a["prices"], b["prices"]]})
    return found


def summarize_target(target: dict, entries: list) -> dict:
    """Estado de un objetivo con los conteos ENVIADOS de la ronda vigente.

    pending: nadie ha enviado | mismatch: los contadores no coinciden | variance: coinciden pero difieren del sistema |
    ok: coincide con el sistema | resolved: el manager ya definio la diferencia | dismissed: se descarto la diferencia.
    """
    current = [e for e in entries if e["round"] == target["round"] and e.get("submitted") and not e.get("deleted")]
    by_user: dict = {}
    for entry in current:
        by_user.setdefault(entry["user_id"], []).append(entry)
    signatures = {user: signature(rows) for user, rows in by_user.items()}
    base = {
        "counters": len(signatures),
        "signatures": signatures,
        "discrepancies": [],
        "counted": None,
        "difference": None,
    }
    if not signatures:
        return {**base, "status": "pending"}
    discrepancies = find_discrepancies(signatures)
    if discrepancies:
        return {**base, "status": "mismatch", "discrepancies": discrepancies}
    sig = next(iter(signatures.values()))
    totals = counted_totals(sig)
    difference = _q(totals["total"] - float(target["system_quantity"]))
    status = "ok" if abs(difference) <= EPS else "variance"
    if status == "variance" and target.get("resolution") in ("loss", "surplus"):
        status = "resolved"
    if status == "variance" and target.get("resolution") == "dismiss":
        status = "dismissed"
    return {**base, "status": status, "counted": totals, "difference": difference}


# ---------------------------------------------------------------- modelos de entrada


class ScopeIn(BaseModel):
    type: Literal["all", "warehouse", "location", "pallet", "items"] = "all"
    warehouse: Optional[str] = Field(default=None, max_length=120)
    location: Optional[str] = Field(default=None, max_length=120)
    pallet: Optional[str] = Field(default=None, max_length=120)
    item_ids: Optional[List[str]] = None


class CountCreate(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    scope: ScopeIn = ScopeIn()
    blind_count: bool = True
    notes: Optional[str] = Field(default=None, max_length=500)
    organization_id: Optional[str] = None


class AssignmentIn(BaseModel):
    user_id: str
    hours: int = Field(default=DEFAULT_ACCESS_HOURS, ge=1, le=MAX_ACCESS_HOURS)
    target_ids: Optional[List[str]] = None  # None = todos los objetivos de la sesion


class EntryIn(BaseModel):
    item_id: str
    condition: Literal["good", "damaged", "expired", "other"] = "good"
    quantity: float = Field(ge=0)
    warehouse: Optional[str] = Field(default=None, max_length=120)
    location: Optional[str] = Field(default=None, max_length=120)
    pallet: Optional[str] = Field(default=None, max_length=120)
    label_price: Optional[float] = Field(default=None, ge=0)
    code: Optional[str] = Field(default=None, max_length=80)
    note: Optional[str] = Field(default=None, max_length=300)


class RecountIn(BaseModel):
    user_ids: Optional[List[str]] = None  # None = quienes ya contaron ese objetivo
    note: Optional[str] = Field(default=None, max_length=300)


class ResolveIn(BaseModel):
    resolution: Literal["loss", "surplus", "dismiss"]
    comment: Optional[str] = Field(default=None, max_length=500)


class CloseIn(BaseModel):
    skip_uncounted: bool = False


# ---------------------------------------------------------------- router


def build_physical_count_router(db, get_current_user, require_management_role, resolve_team_organization):
    router = APIRouter()

    # ------------------------------------------------ acceso
    async def manager_org(user, requested):
        require_management_role(user)
        return await resolve_team_organization(user, requested)

    async def load_count(user, count_id):
        count = await db.inventory_counts.find_one({"count_id": count_id}, {"_id": 0})
        if not count:
            raise HTTPException(status_code=404, detail="Count not found")
        org_id = await manager_org(user, count["organization_id"])
        if org_id != count["organization_id"]:
            raise HTTPException(status_code=403, detail="Access denied")
        return count

    async def counter_context(user, count_id):
        """Contador con acceso vigente: asignacion no revocada ni vencida y sesion abierta."""
        count = await db.inventory_counts.find_one({"count_id": count_id}, {"_id": 0})
        if not count or count["organization_id"] != getattr(user, "organization_id", None):
            raise HTTPException(status_code=404, detail="Count not found")
        if getattr(user, "access_status", "approved") != "approved" or user.role not in ASSIGNABLE_ROLES:
            raise HTTPException(status_code=403, detail="Access denied")
        assignment = await db.inventory_count_assignments.find_one(
            {"count_id": count_id, "user_id": user.user_id, "revoked": False}, {"_id": 0}
        )
        expires = _parse(assignment["expires_at"]) if assignment else None
        if not assignment or not expires or expires <= _now() or count["status"] != "counting":
            raise HTTPException(
                status_code=403,
                detail={"code": "COUNT_ACCESS_EXPIRED", "message": "Tu acceso a este conteo venció o fue retirado."},
            )
        return count, assignment

    async def notify(org_id, event_type, severity, title, message, count_id, dedupe):
        if await db.subscription_notifications.find_one({"dedupe_key": dedupe}, {"_id": 0, "notification_id": 1}):
            return
        await db.subscription_notifications.insert_one(
            {
                "notification_id": "snot_" + uuid.uuid4().hex[:16],
                "organization_id": org_id,
                "event_type": event_type,
                "severity": severity,
                "title": title,
                "message": message,
                "related_entity_type": "inventory_count",
                "related_entity_id": count_id,
                "dedupe_key": dedupe,
                "created_by": None,
                "created_at": _iso(),
                "read_by": [],
            }
        )

    # ------------------------------------------------ objetivos
    async def buckets_of(org_id, item_id):
        return await db.inventory_stock_locations.find(
            {"organization_id": org_id, "item_id": item_id}, {"_id": 0}
        ).to_list(500)

    def target_doc(count_id, org_id, item, place, system_quantity, extra=False):
        warehouse, location, pallet = place
        return {
            "target_id": "tgt_" + uuid.uuid4().hex[:14],
            "count_id": count_id,
            "organization_id": org_id,
            "item_id": item["item_id"],
            "sku": item.get("sku"),
            "name": item.get("name"),
            "unit": item.get("unit"),
            "unit_cost": _q(item.get("unit_cost", 0)),
            "warehouse": warehouse,
            "location": location,
            "pallet": pallet,
            "location_key": location_key(warehouse, location, pallet),
            "system_quantity": _q(system_quantity),
            "round": 1,
            "resolution": None,
            "comment": None,
            "extra": extra,
            "applied": False,
        }

    async def build_targets(count_id, org_id, scope):
        items = await db.inventory.find({"organization_id": org_id, "active": {"$ne": False}}, {"_id": 0}).to_list(
            100000
        )
        if scope.type == "items":
            wanted = set(scope.item_ids or [])
            if not wanted:
                raise HTTPException(status_code=400, detail="Indica los artículos a contar")
            items = [i for i in items if i["item_id"] in wanted]
        parts = {
            "warehouse": clean_part(scope.warehouse),
            "location": clean_part(scope.location),
            "pallet": clean_part(scope.pallet),
        }
        if scope.type in ("warehouse", "location", "pallet") and not parts[scope.type]:
            raise HTTPException(status_code=400, detail="Indica la bodega, ubicación o palet a contar")
        targets = []
        for item in items:
            buckets = await buckets_of(org_id, item["item_id"])
            for bucket in buckets:
                if scope.type in ("warehouse", "location", "pallet"):
                    wanted_value = (parts[scope.type] or "").lower()
                    if (bucket.get(scope.type) or "").lower() != wanted_value:
                        continue
                targets.append(
                    target_doc(
                        count_id,
                        org_id,
                        item,
                        (bucket.get("warehouse"), bucket.get("location"), bucket.get("pallet")),
                        bucket["quantity"],
                    )
                )
            if scope.type in ("all", "items"):
                assigned = _q(sum(b["quantity"] for b in buckets))
                remainder = _q(max(0.0, float(item.get("quantity", 0) or 0) - assigned))
                if remainder > EPS or not buckets:
                    targets.append(target_doc(count_id, org_id, item, (None, None, None), remainder))
        if not targets:
            raise HTTPException(status_code=400, detail="No hay artículos para contar con ese alcance")
        if len(targets) > MAX_TARGETS:
            raise HTTPException(status_code=400, detail="El alcance es demasiado grande; divide el conteo")
        return targets

    async def system_quantity_for(org_id, item, place):
        buckets = await buckets_of(org_id, item["item_id"])
        key = location_key(*place)
        if is_unplaced(*place):
            return max(0.0, float(item.get("quantity", 0) or 0) - sum(b["quantity"] for b in buckets))
        return next((b["quantity"] for b in buckets if b.get("location_key") == key), 0.0)

    # ------------------------------------------------ vistas
    async def target_rows(count_id, targets=None):
        targets = (
            targets
            if targets is not None
            else await db.inventory_count_targets.find({"count_id": count_id}, {"_id": 0}).to_list(MAX_TARGETS + 500)
        )
        entries = await db.inventory_count_entries.find({"count_id": count_id}, {"_id": 0}).to_list(200000)
        grouped: dict = {}
        for entry in entries:
            grouped.setdefault(entry["target_id"], []).append(entry)
        return [
            (t, grouped.get(t["target_id"], []), summarize_target(t, grouped.get(t["target_id"], []))) for t in targets
        ]

    # ================================================= MANAGER
    @router.post("/inventory/counts", tags=["inventory-counts"])
    async def create_count(
        data: CountCreate, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)
    ):
        user = await get_current_user(authorization, session_token)
        org_id = await manager_org(user, data.organization_id)
        sequence = await db.inventory_sku_sequences.find_one_and_update(
            {"organization_id": org_id, "sequence": "count_number"},
            {"$inc": {"value": 1}, "$setOnInsert": {"created_at": _iso()}},
            upsert=True,
            return_document=True,
        )
        count_id = "count_" + uuid.uuid4().hex[:16]
        targets = await build_targets(count_id, org_id, data.scope)
        header = {
            "count_id": count_id,
            "count_number": f"CNT-{_now().year}-{int(sequence.get('value', 1)):06d}",
            "organization_id": org_id,
            "name": data.name.strip(),
            "scope": data.scope.model_dump(),
            "blind_count": data.blind_count,
            "notes": (data.notes or "").strip() or None,
            "status": "counting",
            "created_by": user.user_id,
            "created_at": _iso(),
            "target_count": len(targets),
        }
        await db.inventory_counts.insert_one(dict(header))
        await db.inventory_count_targets.insert_many([dict(t) for t in targets])
        return header

    @router.get("/inventory/counts", tags=["inventory-counts"])
    async def list_counts(
        organization_id: Optional[str] = None,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        user = await get_current_user(authorization, session_token)
        org_id = await manager_org(user, organization_id)
        rows = (
            await db.inventory_counts.find({"organization_id": org_id}, {"_id": 0}).sort("created_at", -1).to_list(200)
        )
        return {"items": rows}

    @router.get("/inventory/counts/mine", tags=["inventory-counts"])
    async def my_counts(authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
        """Conteos en los que el usuario tiene acceso temporal vigente (para mostrarle el modulo solo cuando aplica)."""
        user = await get_current_user(authorization, session_token)
        if user.role not in ASSIGNABLE_ROLES or getattr(user, "access_status", "approved") != "approved":
            return {"items": []}
        assignments = await db.inventory_count_assignments.find(
            {"user_id": user.user_id, "revoked": False}, {"_id": 0}
        ).to_list(200)
        result = []
        for assignment in assignments:
            expires = _parse(assignment["expires_at"])
            if not expires or expires <= _now():
                continue
            count = await db.inventory_counts.find_one(
                {"count_id": assignment["count_id"], "status": "counting"}, {"_id": 0}
            )
            if count and count["organization_id"] == getattr(user, "organization_id", None):
                result.append(
                    {
                        "count_id": count["count_id"],
                        "count_number": count["count_number"],
                        "name": count["name"],
                        "expires_at": assignment["expires_at"],
                        "submitted_at": assignment.get("submitted_at"),
                    }
                )
        return {"items": result}

    @router.get("/inventory/counts/{count_id}", tags=["inventory-counts"])
    async def count_detail(
        count_id: str, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)
    ):
        user = await get_current_user(authorization, session_token)
        count = await load_count(user, count_id)
        assignments = await db.inventory_count_assignments.find({"count_id": count_id}, {"_id": 0}).to_list(500)
        rows = await target_rows(count_id)
        progress = {"pending": 0, "mismatch": 0, "variance": 0, "ok": 0, "resolved": 0, "dismissed": 0}
        for _, _, summary in rows:
            progress[summary["status"]] += 1
        return {**count, "assignments": assignments, "progress": progress, "target_total": len(rows)}

    @router.post("/inventory/counts/{count_id}/assignments", tags=["inventory-counts"])
    async def assign(
        count_id: str,
        data: AssignmentIn,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        """Habilita a una persona de la misma organizacion por un tiempo limitado (si ya tenia acceso, lo renueva)."""
        user = await get_current_user(authorization, session_token)
        count = await load_count(user, count_id)
        if count["status"] != "counting":
            raise HTTPException(status_code=409, detail="El conteo ya no está abierto")
        person = await db.users.find_one(
            {"user_id": data.user_id, "organization_id": count["organization_id"]}, {"_id": 0}
        )
        if (
            not person
            or person.get("access_status") != "approved"
            or person.get("active") is False
            or person.get("role") not in ASSIGNABLE_ROLES
        ):
            raise HTTPException(
                status_code=400, detail="Solo puedes habilitar a un manager o staff aprobado de tu organización"
            )
        if data.target_ids is not None:
            valid = {
                t["target_id"]
                for t in await db.inventory_count_targets.find(
                    {"count_id": count_id}, {"_id": 0, "target_id": 1}
                ).to_list(MAX_TARGETS + 500)
            }
            if not data.target_ids or not set(data.target_ids) <= valid:
                raise HTTPException(status_code=400, detail="Objetivos de conteo no válidos")
        now = _now()
        fields = {
            "target_ids": data.target_ids,
            "starts_at": _iso(now),
            "expires_at": _iso(now + timedelta(hours=data.hours)),
            "revoked": False,
            "submitted_at": None,
            "user_name": person.get("name") or person.get("email"),
            "role": person.get("role"),
            "assigned_by": user.user_id,
        }
        existing = await db.inventory_count_assignments.find_one(
            {"count_id": count_id, "user_id": data.user_id}, {"_id": 0}
        )
        if existing:
            await db.inventory_count_assignments.update_one(
                {"assignment_id": existing["assignment_id"]}, {"$set": fields}
            )
            return {**existing, **fields}
        assignment = {
            "assignment_id": "asg_" + uuid.uuid4().hex[:14],
            "count_id": count_id,
            "user_id": data.user_id,
            "organization_id": count["organization_id"],
            **fields,
        }
        await db.inventory_count_assignments.insert_one(dict(assignment))
        return assignment

    @router.delete("/inventory/counts/{count_id}/assignments/{assignment_id}", tags=["inventory-counts"])
    async def revoke(
        count_id: str,
        assignment_id: str,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        user = await get_current_user(authorization, session_token)
        await load_count(user, count_id)
        found = await db.inventory_count_assignments.find_one(
            {"assignment_id": assignment_id, "count_id": count_id}, {"_id": 0}
        )
        if not found:
            raise HTTPException(status_code=404, detail="Assignment not found")
        await db.inventory_count_assignments.update_one({"assignment_id": assignment_id}, {"$set": {"revoked": True}})
        return {"revoked": True}

    @router.get("/inventory/counts/{count_id}/review", tags=["inventory-counts"])
    async def review(
        count_id: str, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)
    ):
        user = await get_current_user(authorization, session_token)
        await load_count(user, count_id)
        names = {
            a["user_id"]: a.get("user_name")
            for a in await db.inventory_count_assignments.find({"count_id": count_id}, {"_id": 0}).to_list(500)
        }
        items = []
        for target, entries, summary in await target_rows(count_id):
            per_user = {}
            for entry in entries:
                if entry.get("deleted") or entry["round"] != target["round"]:
                    continue
                per_user.setdefault(entry["user_id"], []).append(
                    {
                        k: entry.get(k)
                        for k in ("entry_id", "condition", "quantity", "label_price", "code", "note", "submitted")
                    }
                )
            items.append(
                {
                    **{
                        k: target.get(k)
                        for k in (
                            "target_id",
                            "item_id",
                            "sku",
                            "name",
                            "unit",
                            "warehouse",
                            "location",
                            "pallet",
                            "system_quantity",
                            "round",
                            "resolution",
                            "comment",
                            "extra",
                            "applied",
                        )
                    },
                    "status": summary["status"],
                    "difference": summary["difference"],
                    "counted": summary["counted"],
                    "discrepancies": summary["discrepancies"],
                    "counters": [{"user_id": u, "name": names.get(u), "entries": rows} for u, rows in per_user.items()],
                }
            )
        return {"count_id": count_id, "items": items}

    @router.post("/inventory/counts/{count_id}/targets/{target_id}/recount", tags=["inventory-counts"])
    async def request_recount(
        count_id: str,
        target_id: str,
        data: RecountIn,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        user = await get_current_user(authorization, session_token)
        count = await load_count(user, count_id)
        if count["status"] != "counting":
            raise HTTPException(status_code=409, detail="El conteo ya no está abierto")
        target = await db.inventory_count_targets.find_one({"count_id": count_id, "target_id": target_id}, {"_id": 0})
        if not target:
            raise HTTPException(status_code=404, detail="Target not found")
        entries = await db.inventory_count_entries.find(
            {"count_id": count_id, "target_id": target_id}, {"_id": 0}
        ).to_list(5000)
        reopen = set(
            data.user_ids or [e["user_id"] for e in entries if e["round"] == target["round"] and not e.get("deleted")]
        )
        if not reopen:
            raise HTTPException(status_code=400, detail="Indica a quién pedirle el reconteo")
        new_round = target["round"] + 1
        await db.inventory_count_targets.update_one(
            {"target_id": target_id},
            {
                "$set": {
                    "round": new_round,
                    "resolution": None,
                    "comment": None,
                    "recount_note": (data.note or "").strip() or None,
                }
            },
        )
        for person in reopen:
            assignment = await db.inventory_count_assignments.find_one(
                {"count_id": count_id, "user_id": person}, {"_id": 0}
            )
            if not assignment:
                raise HTTPException(status_code=400, detail="Esa persona no tiene acceso al conteo")
            # reabre el acceso: ve el objetivo en la ronda nueva (si tenia un subconjunto, se le agrega)
            subset = assignment.get("target_ids")
            update = {"submitted_at": None, "revoked": False}
            if subset is not None and target_id not in subset:
                update["target_ids"] = [*subset, target_id]
            await db.inventory_count_assignments.update_one(
                {"assignment_id": assignment["assignment_id"]}, {"$set": update}
            )
        return {"target_id": target_id, "round": new_round, "reopened_for": sorted(reopen)}

    @router.post("/inventory/counts/{count_id}/targets/{target_id}/resolve", tags=["inventory-counts"])
    async def resolve(
        count_id: str,
        target_id: str,
        data: ResolveIn,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        user = await get_current_user(authorization, session_token)
        count = await load_count(user, count_id)
        if count["status"] != "counting":
            raise HTTPException(status_code=409, detail="El conteo ya no está abierto")
        target = await db.inventory_count_targets.find_one({"count_id": count_id, "target_id": target_id}, {"_id": 0})
        if not target:
            raise HTTPException(status_code=404, detail="Target not found")
        pending = {**target, "resolution": None}
        entries = await db.inventory_count_entries.find(
            {"count_id": count_id, "target_id": target_id}, {"_id": 0}
        ).to_list(5000)
        summary = summarize_target(pending, entries)
        if summary["status"] not in ("variance", "resolved", "dismissed"):
            raise HTTPException(
                status_code=409, detail="Solo se puede resolver una diferencia entre el conteo y el sistema"
            )
        if data.resolution == "loss" and summary["difference"] > 0:
            raise HTTPException(status_code=400, detail="Se contó más de lo que dice el sistema: es un excedente")
        if data.resolution == "surplus" and summary["difference"] < 0:
            raise HTTPException(status_code=400, detail="Se contó menos de lo que dice el sistema: es una pérdida")
        await db.inventory_count_targets.update_one(
            {"target_id": target_id},
            {
                "$set": {
                    "resolution": data.resolution,
                    "comment": (data.comment or "").strip() or None,
                    "resolved_by": user.user_id,
                }
            },
        )
        return {"target_id": target_id, "resolution": data.resolution, "difference": summary["difference"]}

    async def blockers(count_id, skip_uncounted):
        problems = {"mismatch": [], "variance": [], "uncounted": []}
        for target, _, summary in await target_rows(count_id):
            if summary["status"] == "mismatch":
                problems["mismatch"].append(target["target_id"])
            elif summary["status"] == "variance":
                problems["variance"].append(target["target_id"])
            elif summary["status"] == "pending" and not skip_uncounted:
                problems["uncounted"].append(target["target_id"])
        return problems

    async def post_movement(org_id, item, movement_type, quantity, unit_cost, key, user_id, count_id, reason, notes):
        existing = await db.inventory_movements.find_one(
            {"organization_id": org_id, "idempotency_key": key}, {"_id": 0}
        )
        if existing:
            return existing
        fresh = await db.inventory.find_one({"item_id": item["item_id"], "organization_id": org_id}, {"_id": 0})
        previous = _q(fresh.get("quantity", 0))
        incoming = movement_type.endswith("_in")
        new_stock = _q(previous + quantity if incoming else previous - quantity)
        if new_stock < 0:
            raise HTTPException(status_code=409, detail=f"Stock negativo para {item.get('sku') or item.get('name')}")
        now = _iso()
        changed = await db.inventory.update_one(
            {"item_id": item["item_id"], "organization_id": org_id, "quantity": fresh.get("quantity", 0)},
            {"$set": {"quantity": new_stock, "updated_at": now}},
        )
        if changed.modified_count != 1:
            raise HTTPException(
                status_code=409, detail="El inventario cambió mientras se aplicaba el conteo; reintenta"
            )
        movement = {
            "movement_id": "mov_" + uuid.uuid4().hex[:16],
            "organization_id": org_id,
            "inventory_item_id": item["item_id"],
            "item_name_snapshot": item.get("name"),
            "movement_type": movement_type,
            "direction": "in" if incoming else "out",
            "quantity": quantity,
            "unit_cost": unit_cost,
            "total_cost": round(quantity * unit_cost, 2),
            "previous_stock": previous,
            "new_stock": new_stock,
            "reference_type": "inventory_count",
            "reference_id": count_id,
            "adjustment_reason": reason,
            "idempotency_key": key,
            "created_by": user_id,
            "created_at": now,
            "notes": notes,
        }
        await db.inventory_movements.insert_one(dict(movement))
        return movement

    async def apply_target(org_id, count_id, target, summary, user_id):
        item = await db.inventory.find_one({"item_id": target["item_id"], "organization_id": org_id}, {"_id": 0})
        if not item:
            raise HTTPException(status_code=409, detail=f"El artículo {target.get('name')} ya no existe")
        counted = summary["counted"]
        adjustment = summary["difference"] if target.get("resolution") in ("loss", "surplus") else 0.0
        waste = counted["non_sellable"]
        unit_cost = _q(item.get("unit_cost", 0))
        base = f"count:{count_id}:{target['target_id']}:{target['round']}"
        if abs(adjustment) > EPS:
            await post_movement(
                org_id,
                item,
                "audit_adjustment_in" if adjustment > 0 else "audit_adjustment_out",
                abs(adjustment),
                unit_cost,
                base + ":adjust",
                user_id,
                count_id,
                target["resolution"],
                target.get("comment"),
            )
        if waste > EPS:
            await post_movement(
                org_id,
                item,
                "waste_out",
                waste,
                unit_cost,
                base + ":waste",
                user_id,
                count_id,
                "damaged_or_expired",
                "Dañado o vencido encontrado en el conteo",
            )
        if not is_unplaced(target.get("warehouse"), target.get("location"), target.get("pallet")):
            new_bucket = max(0.0, _q(float(target["system_quantity"]) + adjustment - waste))
            filters = {"organization_id": org_id, "item_id": target["item_id"], "location_key": target["location_key"]}
            exists = await db.inventory_stock_locations.find_one(filters, {"_id": 0})
            if exists:
                await db.inventory_stock_locations.update_one(
                    filters, {"$set": {"quantity": new_bucket, "updated_at": _iso()}}
                )
            elif new_bucket > 0:
                await db.inventory_stock_locations.insert_one(
                    {
                        **filters,
                        "location_stock_id": "loc_" + uuid.uuid4().hex[:14],
                        "warehouse": target.get("warehouse"),
                        "location": target.get("location"),
                        "pallet": target.get("pallet"),
                        "quantity": new_bucket,
                        "updated_at": _iso(),
                        "updated_by": user_id,
                    }
                )
        await db.inventory_count_targets.update_one({"target_id": target["target_id"]}, {"$set": {"applied": True}})

    @router.post("/inventory/counts/{count_id}/close", tags=["inventory-counts"])
    async def close(
        count_id: str,
        data: CloseIn,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        """Acepta el conteo: aplica ajustes y mermas al stock y al Kardex y deja la sesion cerrada."""
        user = await get_current_user(authorization, session_token)
        count = await load_count(user, count_id)
        if count["status"] != "counting":
            raise HTTPException(status_code=409, detail="El conteo ya no está abierto")
        problems = await blockers(count_id, data.skip_uncounted)
        if any(problems.values()):
            raise HTTPException(
                status_code=409, detail={"code": "COUNT_NOT_READY", "message": "Hay objetivos sin resolver", **problems}
            )
        applied = 0
        for target, _, summary in await target_rows(count_id):
            if summary["status"] == "pending" or target.get("applied"):
                continue
            await apply_target(count["organization_id"], count_id, target, summary, user.user_id)
            applied += 1
        await db.inventory_counts.update_one(
            {"count_id": count_id}, {"$set": {"status": "closed", "closed_at": _iso(), "closed_by": user.user_id}}
        )
        await db.inventory_count_assignments.update_many({"count_id": count_id}, {"$set": {"revoked": True}})
        return {"count_id": count_id, "status": "closed", "applied_targets": applied}

    @router.post("/inventory/counts/{count_id}/cancel", tags=["inventory-counts"])
    async def cancel(
        count_id: str, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)
    ):
        user = await get_current_user(authorization, session_token)
        count = await load_count(user, count_id)
        if count["status"] != "counting":
            raise HTTPException(status_code=409, detail="El conteo ya no está abierto")
        await db.inventory_counts.update_one(
            {"count_id": count_id}, {"$set": {"status": "cancelled", "cancelled_at": _iso()}}
        )
        await db.inventory_count_assignments.update_many({"count_id": count_id}, {"$set": {"revoked": True}})
        return {"count_id": count_id, "status": "cancelled"}

    # ================================================= CONTADOR (acceso temporal)
    @router.get("/inventory/counts/{count_id}/sheet", tags=["inventory-counts"])
    async def sheet(
        count_id: str, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)
    ):
        user = await get_current_user(authorization, session_token)
        count, assignment = await counter_context(user, count_id)
        targets = await db.inventory_count_targets.find({"count_id": count_id}, {"_id": 0}).to_list(MAX_TARGETS + 500)
        if assignment.get("target_ids") is not None:
            allowed = set(assignment["target_ids"])
            targets = [t for t in targets if t["target_id"] in allowed]
        mine = await db.inventory_count_entries.find(
            {"count_id": count_id, "user_id": user.user_id, "deleted": {"$ne": True}}, {"_id": 0}
        ).to_list(20000)
        rows = []
        for target in targets:
            own = [e for e in mine if e["target_id"] == target["target_id"] and e["round"] == target["round"]]
            row = {
                k: target.get(k)
                for k in (
                    "target_id",
                    "item_id",
                    "sku",
                    "name",
                    "unit",
                    "warehouse",
                    "location",
                    "pallet",
                    "round",
                    "extra",
                )
            }
            row["recount_requested"] = target["round"] > 1
            row["recount_note"] = target.get("recount_note") if target["round"] > 1 else None
            row["entries"] = own
            if not count["blind_count"]:
                row["system_quantity"] = target["system_quantity"]
            rows.append(row)
        return {
            "count_id": count_id,
            "count_number": count["count_number"],
            "name": count["name"],
            "blind_count": count["blind_count"],
            "expires_at": assignment["expires_at"],
            "submitted_at": assignment.get("submitted_at"),
            "items": rows,
        }

    async def own_entry(user, count_id, entry_id):
        entry = await db.inventory_count_entries.find_one(
            {"entry_id": entry_id, "count_id": count_id, "user_id": user.user_id, "deleted": {"$ne": True}}, {"_id": 0}
        )
        if not entry:
            raise HTTPException(status_code=404, detail="Entry not found")
        if entry.get("submitted"):
            raise HTTPException(
                status_code=409, detail="Ya enviaste este conteo; espera a que el manager pida un reconteo"
            )
        return entry

    async def target_for_entry(count, assignment, org_id, data):
        item = await db.inventory.find_one(
            {"item_id": data.item_id, "organization_id": org_id, "active": {"$ne": False}}, {"_id": 0}
        )
        if not item:
            raise HTTPException(status_code=404, detail="Inventory item not found")
        try:
            validate_quantity_for_unit(data.quantity, item.get("unit"), "La cantidad")
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error))
        place = (clean_part(data.warehouse), clean_part(data.location), clean_part(data.pallet))
        key = location_key(*place)
        target = await db.inventory_count_targets.find_one(
            {"count_id": count["count_id"], "item_id": data.item_id, "location_key": key}, {"_id": 0}
        )
        if target:
            subset = assignment.get("target_ids")
            if subset is not None and target["target_id"] not in subset:
                raise HTTPException(status_code=403, detail="Ese artículo no está en tu asignación")
            return target
        if assignment.get("target_ids") is not None:
            raise HTTPException(status_code=403, detail="Ese artículo no está en tu asignación")
        extra = target_doc(
            count["count_id"], org_id, item, place, await system_quantity_for(org_id, item, place), extra=True
        )
        await db.inventory_count_targets.insert_one(dict(extra))
        return extra

    def entry_doc(count_id, org_id, user, target, data):
        return {
            "entry_id": "ent_" + uuid.uuid4().hex[:14],
            "count_id": count_id,
            "organization_id": org_id,
            "target_id": target["target_id"],
            "item_id": data.item_id,
            "user_id": user.user_id,
            "round": target["round"],
            "condition": data.condition,
            "quantity": _q(data.quantity),
            "label_price": None if data.label_price is None else _q(data.label_price),
            "code": (data.code or "").strip() or None,
            "note": (data.note or "").strip() or None,
            "submitted": False,
            "deleted": False,
            "created_at": _iso(),
            "updated_at": _iso(),
        }

    @router.post("/inventory/counts/{count_id}/entries", tags=["inventory-counts"])
    async def add_entry(
        count_id: str,
        data: EntryIn,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        user = await get_current_user(authorization, session_token)
        count, assignment = await counter_context(user, count_id)
        if assignment.get("submitted_at"):
            raise HTTPException(
                status_code=409, detail="Ya enviaste tu conteo; espera a que el manager pida un reconteo"
            )
        target = await target_for_entry(count, assignment, count["organization_id"], data)
        entry = entry_doc(count_id, count["organization_id"], user, target, data)
        await db.inventory_count_entries.insert_one(dict(entry))
        return entry

    @router.put("/inventory/counts/{count_id}/entries/{entry_id}", tags=["inventory-counts"])
    async def edit_entry(
        count_id: str,
        entry_id: str,
        data: EntryIn,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        user = await get_current_user(authorization, session_token)
        count, assignment = await counter_context(user, count_id)
        entry = await own_entry(user, count_id, entry_id)
        target = await target_for_entry(count, assignment, count["organization_id"], data)
        fields = entry_doc(count_id, count["organization_id"], user, target, data)
        changes = {
            k: fields[k]
            for k in ("target_id", "item_id", "round", "condition", "quantity", "label_price", "code", "note")
        }
        changes["updated_at"] = _iso()
        await db.inventory_count_entries.update_one({"entry_id": entry_id}, {"$set": changes})
        return {**entry, **changes}

    @router.delete("/inventory/counts/{count_id}/entries/{entry_id}", tags=["inventory-counts"])
    async def delete_entry(
        count_id: str,
        entry_id: str,
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        user = await get_current_user(authorization, session_token)
        await counter_context(user, count_id)
        await own_entry(user, count_id, entry_id)
        await db.inventory_count_entries.update_one(
            {"entry_id": entry_id}, {"$set": {"deleted": True, "updated_at": _iso()}}
        )
        return {"deleted": True}

    @router.post("/inventory/counts/{count_id}/submit", tags=["inventory-counts"])
    async def submit(
        count_id: str, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)
    ):
        """Envia el conteo: queda bloqueado para quien cuenta y el manager recibe las alertas que correspondan."""
        user = await get_current_user(authorization, session_token)
        count, assignment = await counter_context(user, count_id)
        mine = await db.inventory_count_entries.find(
            {"count_id": count_id, "user_id": user.user_id, "submitted": False, "deleted": {"$ne": True}}, {"_id": 0}
        ).to_list(20000)
        if not mine:
            raise HTTPException(status_code=400, detail="No has registrado ningún conteo")
        await db.inventory_count_entries.update_many(
            {"count_id": count_id, "user_id": user.user_id, "submitted": False, "deleted": {"$ne": True}},
            {"$set": {"submitted": True}},
        )
        await db.inventory_count_assignments.update_many(
            {"assignment_id": assignment["assignment_id"]}, {"$set": {"submitted_at": _iso()}}
        )
        org_id = count["organization_id"]
        who = assignment.get("user_name") or "Un integrante del equipo"
        await notify(
            org_id,
            "inventory_count_submitted",
            "info",
            "Conteo enviado",
            f"{who} envió su conteo de «{count['name']}».",
            count_id,
            f"count:{count_id}:{user.user_id}:{_iso()[:16]}:submitted",
        )
        touched = {e["target_id"] for e in mine}
        targets = await db.inventory_count_targets.find({"count_id": count_id}, {"_id": 0}).to_list(MAX_TARGETS + 500)
        for target, entries, summary in await target_rows(count_id, [t for t in targets if t["target_id"] in touched]):
            label = target.get("sku") or target.get("name")
            base = f"count:{count_id}:{target['target_id']}:{target['round']}"
            if summary["status"] == "mismatch":
                fields = sorted({d["field"] for d in summary["discrepancies"]})
                await notify(
                    org_id,
                    "inventory_count_mismatch",
                    "warning",
                    "Conteos distintos para el mismo artículo",
                    f"{label}: los contadores no coinciden en {', '.join(fields)}. Revisa y pide un reconteo.",
                    count_id,
                    base + ":mismatch",
                )
            elif summary["status"] == "variance":
                kind = "pérdida" if summary["difference"] < 0 else "excedente"
                await notify(
                    org_id,
                    "inventory_count_loss" if summary["difference"] < 0 else "inventory_count_surplus",
                    "warning" if summary["difference"] < 0 else "info",
                    f"Posible {kind} de inventario",
                    f"{label}: se contó {summary['counted']['total']:g} y el sistema dice "
                    f"{target['system_quantity']:g} "
                    f"({summary['difference']:+g}). Defínela como {kind} o pide un reconteo.",
                    count_id,
                    base + ":variance",
                )
        return {"submitted": True, "entries": len(mine)}

    return router


async def ensure_physical_count_indexes(db):
    await db.inventory_counts.create_index(
        [("organization_id", 1), ("created_at", -1)], name="inventory_counts_org_created"
    )
    await db.inventory_counts.create_index("count_id", unique=True, name="inventory_counts_id_unique")
    await db.inventory_count_targets.create_index(
        [("count_id", 1), ("item_id", 1), ("location_key", 1)], unique=True, name="inventory_count_targets_unique"
    )
    await db.inventory_count_assignments.create_index(
        [("count_id", 1), ("user_id", 1)], unique=True, name="inventory_count_assignments_unique"
    )
    await db.inventory_count_entries.create_index(
        [("count_id", 1), ("target_id", 1), ("user_id", 1)], name="inventory_count_entries_target_user"
    )
