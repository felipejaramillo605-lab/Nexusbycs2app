"""Datos publicos para la pagina de inicio del portal (plantillas de clases grupales).

Los planes de membresia solo se listaban para el manager. La pagina de inicio muestra, sin sesion, el nombre, precio,
vigencia y clases de cada plan activo; no expone ids internos de clientes ni notas.
"""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter

MAX_PLANS = 40


def public_plan(plan: dict, service_names: dict) -> dict:
    """Resumen publico de un plan: clases por ciclo (None = ilimitadas), vigencia y clases incluidas."""
    benefits = plan.get("included_services") or []
    limits = [b.get("monthly_limit") for b in benefits]
    unlimited = any(limit is None for limit in limits)
    classes: Optional[int] = None if unlimited or not limits else sum(int(limit) for limit in limits)
    return {
        "plan_id": plan.get("plan_id"),
        "name": plan.get("name"),
        "price": plan.get("price", 0),
        "billing_cycle_days": plan.get("billing_cycle_days", 30),
        "classes_per_cycle": classes,
        "unlimited": unlimited,
        "services": [
            {"service_id": b.get("service_id"), "name": service_names.get(b.get("service_id"))}
            for b in benefits
            if service_names.get(b.get("service_id"))
        ],
    }


def build_portal_landing_router(db) -> APIRouter:
    router = APIRouter()

    @router.get("/public/{org_id}/membership-plans", tags=["public-booking"])
    async def list_public_membership_plans(org_id: str) -> List[dict]:
        plans = await db.membership_plans.find({"organization_id": org_id, "active": True}, {"_id": 0}).to_list(
            MAX_PLANS
        )
        if not plans:
            return []
        services = await db.services.find({"organization_id": org_id, "service_type": "group"}, {"_id": 0}).to_list(500)
        names = {s["service_id"]: s.get("name") for s in services}
        result = [public_plan(plan, names) for plan in plans]
        # Un plan sin clases visibles (servicios eliminados) no se ofrece al publico.
        result = [item for item in result if item["services"]]
        return sorted(result, key=lambda item: (item["price"], item["name"] or ""))

    return router
