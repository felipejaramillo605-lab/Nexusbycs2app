"""Portable, deterministic client-risk baseline.

It only records tenant-scoped recommendations. It never contacts clients or
changes appointments.
"""

from __future__ import annotations

from datetime import date, datetime, timezone

DEFAULT_BATCH_SIZE = 250


def _date(value):
    """Normalize date, datetime and ISO strings (including a trailing Z)."""
    if not value:
        return None
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, date):
        parsed = datetime.combine(value, datetime.min.time())
    else:
        try:
            parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except (TypeError, ValueError):
            return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def score_client(client, now=None, no_show_count=0):
    """Return transparent recurrence/no-show signals from tenant-held data."""
    now = _date(now) or datetime.now(timezone.utc)
    visits = int(client.get("total_visits") or 0)
    last, first = _date(client.get("last_visit")), _date(client.get("created_at"))
    no_shows = max(int(no_show_count or 0), 0)
    if not last or visits < 2:
        return None
    usual = max((last - (first or last)).days, 1) / max(visits - 1, 1)
    gap = max((now - last).days, 0)
    overdue = gap > usual * 1.4 + 7
    score = min(
        100, round((min(gap / max(usual, 1), 4) / 4) * 65 + min(no_shows, 3) * 12)
    )
    if not overdue and no_shows == 0:
        return None
    return {
        "client_id": client.get("client_id"),
        "organization_id": client.get("organization_id"),
        "score": score,
        "band": "high" if score >= 70 else "medium",
        "signals": {
            "days_since_last_visit": gap,
            "usual_interval_days": round(usual, 1),
            "no_show_count": no_shows,
        },
        "model_version": "baseline-v1",
        "generated_at": now.isoformat(),
    }


async def ensure_customer_risk_indexes(db):
    """Create the unique identity used by idempotent recommendation upserts."""
    await db.decision_scores.create_index(
        [("organization_id", 1), ("client_id", 1), ("kind", 1)],
        unique=True,
        partialFilterExpression={"kind": "retention_risk"},
        name="decision_scores_retention_risk_unique",
    )


async def _batches(collection, query, projection, batch_size, key="client_id"):
    """Use keyset pagination so a large tenant is never loaded in one call."""
    after = None
    while True:
        page_query = dict(query)
        if after is not None:
            page_query[key] = {"$gt": after}
        page = (
            await collection.find(page_query, projection)
            .sort(key, 1)
            .limit(batch_size)
            .to_list(batch_size)
        )
        if not page:
            return
        yield page
        after = page[-1].get(key)
        if after is None or len(page) < batch_size:
            return


async def _no_show_counts(db, organization_id):
    """Count no-show appointments per client and organization."""
    counts = {}
    query = {"organization_id": organization_id, "status": "no_show"}
    cursor = db.appointments.find(query, {"_id": 0, "client_id": 1}).sort(
        "client_id", 1
    )
    async for appointment in cursor:
        client_id = appointment.get("client_id")
        if client_id:
            counts[client_id] = counts.get(client_id, 0) + 1
    return counts


async def refresh_scores(db, now=None, batch_size=DEFAULT_BATCH_SIZE):
    """Refresh active-organization recommendations and remove stale results."""
    now = _date(now) or datetime.now(timezone.utc)
    scanned = saved = deleted = organizations = 0
    active_org_query = {
        "$or": [{"deleted_at": {"$exists": False}}, {"deleted_at": None}]
    }
    organization_cursor = db.organizations.find(
        active_org_query, {"_id": 0, "organization_id": 1}
    )

    async for organization in organization_cursor:
        organization_id = organization.get("organization_id")
        if not organization_id:
            continue
        organizations += 1
        no_shows = await _no_show_counts(db, organization_id)
        recommended_client_ids = []
        projection = {
            "_id": 0,
            "client_id": 1,
            "organization_id": 1,
            "total_visits": 1,
            "last_visit": 1,
            "created_at": 1,
        }
        async for clients in _batches(
            db.clients, {"organization_id": organization_id}, projection, batch_size
        ):
            for client in clients:
                scanned += 1
                score = score_client(
                    client, now, no_shows.get(client.get("client_id"), 0)
                )
                if not score or not score["client_id"]:
                    continue
                recommended_client_ids.append(score["client_id"])
                await db.decision_scores.update_one(
                    {
                        "organization_id": organization_id,
                        "client_id": score["client_id"],
                        "kind": "retention_risk",
                    },
                    {"$set": {**score, "kind": "retention_risk"}},
                    upsert=True,
                )
                saved += 1
        stale = await db.decision_scores.delete_many(
            {
                "organization_id": organization_id,
                "kind": "retention_risk",
                "client_id": {"$nin": recommended_client_ids},
            }
        )
        deleted += getattr(stale, "deleted_count", 0)
    return {
        "scanned": scanned,
        "saved": saved,
        "deleted": deleted,
        "organizations": organizations,
        "mode": "recommendation_only",
    }
