"""Cross-domain data-integrity checks for the Owner console (plan PR 23).

Extends the pattern professional_media_lifecycle.py already established --
a bounded, read-only reconciliation report of orphan/broken-reference
findings plus a summary, never a write -- to the three domains the user
chose after PR 21/22 landed: reservas/citas (bookings), facturación/
suscripciones (billing), and inventario/procurement. Each domain check is
independent (its own function, its own collections) and returns a flat
list of findings; nothing here mutates data, matching the exact read-only
stance the professional-media reconciliation endpoint already established.

Only orphaned-foreign-key findings are checked -- "does the ID this
document references still exist" -- the same concrete, verifiable
integrity concept professional_media_lifecycle.py already uses (broken/
orphan references), not a broader and harder-to-define notion of
"correctness."
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Cookie, Header, HTTPException, Query

_FETCH_LIMIT = 5000


def canonical_hash(payload: dict) -> str:
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str).encode()
    return hashlib.sha256(raw).hexdigest()


async def _existing_ids(db, collection: str, id_field: str) -> set:
    docs = await getattr(db, collection).find({}, {"_id": 0, id_field: 1}).to_list(_FETCH_LIMIT)
    return {doc.get(id_field) for doc in docs if doc.get(id_field)}


def _finding(domain, kind, organization_id, entity_type, entity_id, detail):
    return {
        "domain": domain,
        "kind": kind,
        "organization_id": organization_id,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "detail": detail,
    }


async def check_bookings(db) -> list[dict]:
    findings = []
    session_ids = await _existing_ids(db, "class_sessions", "class_session_id")
    barber_ids = await _existing_ids(db, "barbers", "barber_id")
    service_ids = await _existing_ids(db, "services", "service_id")

    bookings = await db.class_bookings.find(
        {}, {"_id": 0, "class_booking_id": 1, "organization_id": 1, "class_session_id": 1}
    ).to_list(_FETCH_LIMIT)
    for row in bookings:
        session_id = row.get("class_session_id")
        if session_id not in session_ids:
            findings.append(_finding(
                "bookings", "orphaned_class_booking", row.get("organization_id"), "class_booking",
                row.get("class_booking_id"), f"class_session_id {session_id} no existe",
            ))

    sessions = await db.class_sessions.find(
        {}, {"_id": 0, "class_session_id": 1, "organization_id": 1, "barber_id": 1, "service_id": 1}
    ).to_list(_FETCH_LIMIT)
    for row in sessions:
        session_id = row.get("class_session_id")
        if row.get("barber_id") not in barber_ids:
            findings.append(_finding(
                "bookings", "class_session_missing_barber", row.get("organization_id"), "class_session",
                session_id, f"barber_id {row.get('barber_id')} no existe",
            ))
        if row.get("service_id") not in service_ids:
            findings.append(_finding(
                "bookings", "class_session_missing_service", row.get("organization_id"), "class_session",
                session_id, f"service_id {row.get('service_id')} no existe",
            ))

    appointments = await db.appointments.find(
        {}, {"_id": 0, "appointment_id": 1, "organization_id": 1, "barber_id": 1, "service_id": 1}
    ).to_list(_FETCH_LIMIT)
    for row in appointments:
        appointment_id = row.get("appointment_id")
        if row.get("barber_id") not in barber_ids:
            findings.append(_finding(
                "bookings", "appointment_missing_barber", row.get("organization_id"), "appointment",
                appointment_id, f"barber_id {row.get('barber_id')} no existe",
            ))
        if row.get("service_id") not in service_ids:
            findings.append(_finding(
                "bookings", "appointment_missing_service", row.get("organization_id"), "appointment",
                appointment_id, f"service_id {row.get('service_id')} no existe",
            ))
    return findings


async def check_billing(db) -> list[dict]:
    findings = []
    organization_ids = await _existing_ids(db, "organizations", "organization_id")

    invoices = await db.subscription_invoices.find(
        {}, {"_id": 0, "invoice_id": 1, "organization_id": 1}
    ).to_list(_FETCH_LIMIT)
    for row in invoices:
        if row.get("organization_id") not in organization_ids:
            findings.append(_finding(
                "billing", "invoice_missing_organization", row.get("organization_id"), "invoice",
                row.get("invoice_id"), f"organization_id {row.get('organization_id')} no existe",
            ))

    subscriptions = await db.organization_subscriptions.find(
        {}, {"_id": 0, "subscription_id": 1, "organization_id": 1}
    ).to_list(_FETCH_LIMIT)
    for row in subscriptions:
        if row.get("organization_id") not in organization_ids:
            findings.append(_finding(
                "billing", "subscription_missing_organization", row.get("organization_id"), "subscription",
                row.get("subscription_id"), f"organization_id {row.get('organization_id')} no existe",
            ))
    return findings


async def check_procurement(db) -> list[dict]:
    findings = []
    supplier_ids = await _existing_ids(db, "suppliers", "supplier_id")
    order_ids = await _existing_ids(db, "purchase_orders", "purchase_order_id")

    orders = await db.purchase_orders.find(
        {}, {"_id": 0, "purchase_order_id": 1, "organization_id": 1, "supplier_id": 1}
    ).to_list(_FETCH_LIMIT)
    for row in orders:
        if row.get("supplier_id") not in supplier_ids:
            findings.append(_finding(
                "procurement", "purchase_order_missing_supplier", row.get("organization_id"), "purchase_order",
                row.get("purchase_order_id"), f"supplier_id {row.get('supplier_id')} no existe",
            ))

    receipts = await db.purchase_receipts.find(
        {}, {"_id": 0, "receipt_id": 1, "organization_id": 1, "purchase_order_id": 1}
    ).to_list(_FETCH_LIMIT)
    for row in receipts:
        if row.get("purchase_order_id") not in order_ids:
            findings.append(_finding(
                "procurement", "purchase_receipt_missing_order", row.get("organization_id"), "purchase_receipt",
                row.get("receipt_id"), f"purchase_order_id {row.get('purchase_order_id')} no existe",
            ))
    return findings


DOMAIN_CHECKS = {
    "bookings": check_bookings,
    "billing": check_billing,
    "procurement": check_procurement,
}


async def build_report(db, domain: Optional[str] = None) -> dict:
    domains = [domain] if domain else list(DOMAIN_CHECKS)
    findings_by_domain = {name: await DOMAIN_CHECKS[name](db) for name in domains}
    all_findings = [row for rows in findings_by_domain.values() for row in rows]
    stable = {
        "summary": {name: len(rows) for name, rows in findings_by_domain.items()},
        "total_findings": len(all_findings),
        "findings": all_findings,
    }
    return {
        **stable,
        "report_hash": canonical_hash(stable),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "mode": "read_only",
    }


def build_integrity_router(db, get_current_user):
    router = APIRouter(prefix="/owner/integrity", tags=["owner-integrity"])

    async def _owner(user):
        if user.role != "owner" or user.access_status != "approved":
            raise HTTPException(status_code=403, detail="Owner access required")

    @router.get("/report")
    async def integrity_report(
        domain: Optional[str] = Query(default=None),
        authorization: Optional[str] = Header(None),
        session_token: Optional[str] = Cookie(None),
    ):
        user = await get_current_user(authorization, session_token)
        await _owner(user)
        if domain is not None and domain not in DOMAIN_CHECKS:
            raise HTTPException(status_code=400, detail="Unsupported integrity domain")
        return await build_report(db, domain)

    return router
