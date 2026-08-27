# NEXUS_INTERNAL_REVIEWS_V1
# Internal client-to-professional star ratings, separate from the external
# Google-review email flow in review_requests.py (that one drives public
# reputation on Google; this one is for internal quality control and staff
# performance visibility). The two are intentionally kept as separate
# systems with separate storage — merging them would conflate "did the
# client like their haircut" with "will the client publicly recommend us,"
# which are different signals with different audiences.
from __future__ import annotations
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

PENDING_WINDOW_DAYS = 30
PENDING_MAX_ITEMS = 5
LOW_RATING_THRESHOLD = 3.5


class InternalReviewSubmit(BaseModel):
    appointment_id: str
    professional_rating: int = Field(..., ge=1, le=5)
    comment: Optional[str] = Field(default=None, max_length=500)


def utcnow():
    return datetime.now(timezone.utc)


def _parse_dt(value):
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value)
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
        except ValueError:
            return None
    return None


async def ensure_internal_reviews_indexes(db):
    await db.internal_reviews.create_index("review_id", unique=True, name="internal_review_id_unique")
    await db.internal_reviews.create_index(
        [("organization_id", 1), ("appointment_id", 1)],
        unique=True,
        name="internal_review_appointment_unique",
    )
    await db.internal_reviews.create_index(
        [("organization_id", 1), ("barber_id", 1)],
        name="internal_review_barber_lookup",
    )


def build_internal_reviews_router(db, get_current_client, get_current_user, require_management_role, resolve_team_organization):
    router = APIRouter()

    @router.get("/public/clients/reviews/pending")
    async def get_pending_reviews(current_client=Depends(get_current_client)):
        appointments = await db.appointments.find(
            {
                "client_phone": current_client.phone,
                "organization_id": current_client.organization_id,
                "status": "completed",
            },
            {"_id": 0},
        ).sort("date", -1).to_list(50)
        if not appointments:
            return {"pending": []}

        appointment_ids = [a["appointment_id"] for a in appointments if a.get("appointment_id")]
        reviewed = await db.internal_reviews.find(
            {"organization_id": current_client.organization_id, "appointment_id": {"$in": appointment_ids}},
            {"_id": 0, "appointment_id": 1},
        ).to_list(1000)
        reviewed_ids = {r["appointment_id"] for r in reviewed}

        cutoff = utcnow() - timedelta(days=PENDING_WINDOW_DAYS)

        def is_eligible(a):
            if a["appointment_id"] in reviewed_ids:
                return False
            completed_at = _parse_dt(a.get("completed_at"))
            if completed_at is not None:
                return completed_at >= cutoff
            return True

        candidates = [a for a in appointments if is_eligible(a)][:PENDING_MAX_ITEMS]
        if not candidates:
            return {"pending": []}

        barber_ids = list({a.get("barber_id") for a in candidates if a.get("barber_id")})
        service_ids = list({a.get("service_id") for a in candidates if a.get("service_id")})
        barbers = await db.barbers.find({"barber_id": {"$in": barber_ids}}, {"_id": 0}).to_list(1000) if barber_ids else []
        services = await db.services.find({"service_id": {"$in": service_ids}}, {"_id": 0}).to_list(1000) if service_ids else []
        barber_lookup = {b["barber_id"]: b for b in barbers}
        service_lookup = {s["service_id"]: s for s in services}

        pending = []
        for a in candidates:
            barber = barber_lookup.get(a.get("barber_id"))
            service = service_lookup.get(a.get("service_id"))
            pending.append({
                "appointment_id": a["appointment_id"],
                "date": a.get("date"),
                "barber_name": (barber.get("display_name") or barber.get("name")) if barber else "Profesional",
                "barber_avatar": barber.get("avatar", "") if barber else "",
                "service_name": service.get("name") if service else "Servicio",
            })
        return {"pending": pending}

    @router.post("/public/clients/reviews")
    async def submit_internal_review(data: InternalReviewSubmit, current_client=Depends(get_current_client)):
        appointment = await db.appointments.find_one(
            {
                "appointment_id": data.appointment_id,
                "organization_id": current_client.organization_id,
                "client_phone": current_client.phone,
            },
            {"_id": 0},
        )
        if not appointment:
            raise HTTPException(status_code=404, detail="Cita no encontrada")
        if appointment.get("status") != "completed":
            raise HTTPException(status_code=400, detail="Solo puedes calificar citas completadas")

        existing = await db.internal_reviews.find_one(
            {"organization_id": current_client.organization_id, "appointment_id": data.appointment_id},
            {"_id": 0},
        )
        if existing:
            raise HTTPException(status_code=409, detail="Ya calificaste esta cita")

        now = utcnow()
        review = {
            "review_id": f"irev_{uuid.uuid4().hex[:12]}",
            "organization_id": current_client.organization_id,
            "appointment_id": data.appointment_id,
            "client_id": current_client.client_id,
            "barber_id": appointment.get("barber_id"),
            "professional_rating": data.professional_rating,
            "comment": (data.comment or "").strip()[:500] or None,
            "created_at": now,
        }
        try:
            await db.internal_reviews.insert_one(review.copy())
        except Exception:
            existing = await db.internal_reviews.find_one(
                {"organization_id": current_client.organization_id, "appointment_id": data.appointment_id},
                {"_id": 0},
            )
            if existing:
                raise HTTPException(status_code=409, detail="Ya calificaste esta cita")
            raise

        # Optional loyalty bonus for leaving a review. Read directly from the
        # existing freeform loyalty_settings dict (no schema change needed) —
        # organizations without a "review_bonus_points" key simply award 0.
        bonus_awarded = 0
        organization = await db.organizations.find_one({"organization_id": current_client.organization_id}, {"_id": 0})
        loyalty_settings = (organization or {}).get("loyalty_settings") or {}
        if loyalty_settings.get("enabled"):
            bonus_awarded = int(loyalty_settings.get("review_bonus_points") or 0)
            if bonus_awarded > 0:
                await db.clients.update_one(
                    {"client_id": current_client.client_id},
                    {"$inc": {"loyalty_points": bonus_awarded}},
                )

        barber_doc = await db.barbers.find_one({"barber_id": review["barber_id"]}, {"_id": 0})
        barber_name = (barber_doc.get("display_name") or barber_doc.get("name") or "Profesional") if barber_doc else "Profesional"
        await check_low_rating_alert(db, current_client.organization_id, review["barber_id"], barber_name)

        return {"status": "success", "review_id": review["review_id"], "loyalty_bonus_awarded": bonus_awarded}

    @router.get("/barbers/me/reviews")
    async def get_my_reviews(current_user=Depends(get_current_user)):
        barber = await db.barbers.find_one({"user_id": current_user.user_id}, {"_id": 0})
        if not barber:
            raise HTTPException(status_code=404, detail="Perfil profesional no encontrado")
        reviews = await db.internal_reviews.find(
            {"organization_id": barber["organization_id"], "barber_id": barber["barber_id"]},
            {"_id": 0},
        ).sort("created_at", -1).to_list(500)
        count = len(reviews)
        average = round(sum(r["professional_rating"] for r in reviews) / count, 2) if count else 0
        recent = [
            {"rating": r["professional_rating"], "comment": r.get("comment"), "created_at": r.get("created_at")}
            for r in reviews[:10]
        ]
        return {"average_rating": average, "total_reviews": count, "recent": recent}

    @router.get("/organizations/{organization_id}/reviews/team-summary")
    async def get_team_review_summary(organization_id: str, current_user=Depends(get_current_user)):
        require_management_role(current_user)
        org_id = await resolve_team_organization(current_user, organization_id)
        reviews = await db.internal_reviews.find({"organization_id": org_id}, {"_id": 0}).to_list(5000)

        by_barber = {}
        for r in reviews:
            bid = r.get("barber_id")
            if not bid:
                continue
            by_barber.setdefault(bid, []).append(r["professional_rating"])

        barber_ids = list(by_barber.keys())
        barbers = await db.barbers.find({"barber_id": {"$in": barber_ids}}, {"_id": 0}).to_list(1000) if barber_ids else []
        barber_lookup = {b["barber_id"]: b for b in barbers}

        summary = []
        for bid, ratings in by_barber.items():
            barber = barber_lookup.get(bid)
            summary.append({
                "barber_id": bid,
                "barber_name": (barber.get("display_name") or barber.get("name")) if barber else "Profesional",
                "average_rating": round(sum(ratings) / len(ratings), 2),
                "total_reviews": len(ratings),
            })
        summary.sort(key=lambda x: x["average_rating"], reverse=True)
        return {"team": summary}

    return router


async def check_low_rating_alert(db, organization_id: str, barber_id: str, barber_name: str):
    pipeline = [
        {"$match": {"organization_id": organization_id, "barber_id": barber_id}},
        {"$group": {"_id": None, "avg": {"$avg": "$professional_rating"}, "count": {"$sum": 1}}},
    ]
    result = await db.internal_reviews.aggregate(pipeline).to_list(1)
    if not result or result[0]["count"] < 3:
        return
    avg = round(result[0]["avg"], 2)
    if avg >= LOW_RATING_THRESHOLD:
        return
    import uuid as _uuid
    notif_id = str(_uuid.uuid4())
    dedupe = f"low_rating_{organization_id}_{barber_id}"
    from datetime import timedelta as _td
    existing = await db.subscription_notifications.find_one({"dedupe_key": dedupe, "created_at": {"$gte": utcnow() - _td(days=7)}})
    if existing:
        return
    await db.subscription_notifications.insert_one({
        "notification_id": notif_id,
        "organization_id": organization_id,
        "event_type": "low_rating_alert",
        "severity": "warning",
        "title": f"Alerta de calificación: {barber_name}",
        "message": f"{barber_name} tiene un promedio de {avg}/5 en calificaciones internas ({result[0]['count']} reseñas). Revisa su desempeño.",
        "dedupe_key": dedupe,
        "read_by": [],
        "created_at": utcnow(),
    })

