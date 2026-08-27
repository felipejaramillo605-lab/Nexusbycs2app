# NEXUS_PROFESSIONAL_METRICS_V1
from __future__ import annotations
from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

# Factor de costo empleador Colombia (salud, pensión, ARL, caja, prestaciones)
# Desglose aproximado: salud 8.5%, pensión 12%, ARL ~2%, caja 4%, prima 8.33%,
# cesantías 8.33%, int. cesantías 1%, vacaciones 4.17% ≈ 48-52% sobre salario.
COLOMBIAN_EMPLOYER_FACTOR = 1.52


class ContractUpdate(BaseModel):
    contract_type: str = Field(..., pattern="^(commission|fixed_salary)$")
    monthly_salary: float = Field(default=0, ge=0)


def utcnow():
    return datetime.now(timezone.utc)


def _hours_per_week(barber: dict) -> float:
    days = barber.get("available_days") or [1, 2, 3, 4, 5]
    start = barber.get("start_time") or "09:00"
    end = barber.get("end_time") or "18:00"
    try:
        sh, sm = map(int, start.split(":"))
        eh, em = map(int, end.split(":"))
        daily_hours = (eh * 60 + em - sh * 60 - sm) / 60
    except (ValueError, AttributeError):
        daily_hours = 8
    return round(max(0, daily_hours) * len(days), 1)


def _parse_iso(value) -> Optional[datetime]:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, str):
        try:
            dt = datetime.fromisoformat(value)
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except ValueError:
            return None
    return None


def build_professional_metrics_router(db, get_current_user, require_management_role, resolve_team_organization):
    router = APIRouter()

    @router.get("/organizations/{organization_id}/barbers/{barber_id}/metrics")
    async def get_professional_metrics(
        organization_id: str,
        barber_id: str,
        period_days: int = Query(default=30, ge=7, le=365),
        current_user=Depends(get_current_user),
    ):
        require_management_role(current_user)
        org_id = await resolve_team_organization(current_user, organization_id)

        barber = await db.barbers.find_one(
            {"barber_id": barber_id, "organization_id": org_id}, {"_id": 0}
        )
        if not barber:
            raise HTTPException(status_code=404, detail="Profesional no encontrado")

        now = utcnow()
        cutoff = now - timedelta(days=period_days)
        cutoff_iso = cutoff.isoformat()

        hours_week = _hours_per_week(barber)
        contract_type = barber.get("contract_type", "commission")
        monthly_salary = float(barber.get("monthly_salary") or 0)

        profile = {
            "barber_id": barber_id,
            "name": barber.get("display_name") or barber.get("name") or "Profesional",
            "avatar": barber.get("avatar") or "",
            "active": barber.get("active", True),
            "created_at": barber.get("created_at"),
            "available_days": barber.get("available_days", [1, 2, 3, 4, 5]),
            "start_time": barber.get("start_time", "09:00"),
            "end_time": barber.get("end_time", "18:00"),
            "hours_per_week": hours_week,
            "contract_type": contract_type,
            "monthly_salary": monthly_salary,
        }

        # ── Internal reviews ──
        reviews = await db.internal_reviews.find(
            {"organization_id": org_id, "barber_id": barber_id},
            {"_id": 0, "professional_rating": 1, "created_at": 1, "comment": 1},
        ).sort("created_at", -1).to_list(500)

        total_reviews = len(reviews)
        avg_rating = round(sum(r["professional_rating"] for r in reviews) / total_reviews, 2) if total_reviews else 0
        period_reviews = [r for r in reviews if _parse_iso(r.get("created_at")) and _parse_iso(r["created_at"]) >= cutoff]
        period_avg = round(sum(r["professional_rating"] for r in period_reviews) / len(period_reviews), 2) if period_reviews else 0

        rating = {
            "average": avg_rating,
            "total": total_reviews,
            "period_average": period_avg,
            "period_count": len(period_reviews),
            "recent": [
                {"rating": r["professional_rating"], "comment": r.get("comment"), "date": r.get("created_at")}
                for r in reviews[:5]
            ],
        }

        # ── Appointments ──
        all_appts = await db.appointments.find(
            {"organization_id": org_id, "barber_id": barber_id},
            {"_id": 0, "status": 1, "date": 1, "created_at": 1},
        ).to_list(50000)

        total_appts = len(all_appts)
        completed = sum(1 for a in all_appts if a.get("status") == "completed")
        cancelled = sum(1 for a in all_appts if a.get("status") == "cancelled")
        no_show = sum(1 for a in all_appts if a.get("status") == "no_show")

        period_appts = []
        for a in all_appts:
            dt = _parse_iso(a.get("created_at")) or _parse_iso(a.get("date"))
            if dt and dt >= cutoff:
                period_appts.append(a)

        period_completed = sum(1 for a in period_appts if a.get("status") == "completed")
        weeks_in_period = max(1, period_days / 7)
        months_in_period = max(1, period_days / 30)

        appointments = {
            "total": total_appts,
            "completed": completed,
            "cancelled": cancelled,
            "no_show": no_show,
            "completion_rate": round(completed / total_appts * 100, 1) if total_appts else 0,
            "period_completed": period_completed,
            "per_week_avg": round(period_completed / weeks_in_period, 1),
            "per_month_avg": round(period_completed / months_in_period, 1),
        }

        # ── Financial ──
        txn_query = {
            "organization_id": org_id,
            "barber_id": barber_id,
            "status": "confirmed",
        }
        # created_at may be stored as string or datetime
        txns_all = await db.transactions.find(
            txn_query,
            {"_id": 0, "net_service_amount": 1, "tip_amount": 1,
             "staff_commission_amount": 1, "staff_total_amount": 1,
             "staff_percent_snapshot": 1, "created_at": 1},
        ).to_list(100000)

        txns = [t for t in txns_all if _parse_iso(t.get("created_at")) and _parse_iso(t["created_at"]) >= cutoff]

        total_revenue = round(sum(float(t.get("net_service_amount") or 0) for t in txns), 2)
        total_commission = round(sum(float(t.get("staff_commission_amount") or 0) for t in txns), 2)
        total_tips = round(sum(float(t.get("tip_amount") or 0) for t in txns), 2)
        total_staff = round(sum(float(t.get("staff_total_amount") or 0) for t in txns), 2)
        service_count = len(txns)
        avg_ticket = round(total_revenue / service_count, 2) if service_count else 0

        # Weekly breakdown
        weekly = {}
        for t in txns:
            dt = _parse_iso(t.get("created_at"))
            if dt:
                week_start = dt - timedelta(days=dt.weekday())
                wk = week_start.strftime("%Y-%m-%d")
                row = weekly.setdefault(wk, {"week": wk, "revenue": 0, "services": 0, "staff_cost": 0})
                row["revenue"] += float(t.get("net_service_amount") or 0)
                row["services"] += 1
                row["staff_cost"] += float(t.get("staff_total_amount") or 0)
        for row in weekly.values():
            row["revenue"] = round(row["revenue"], 2)
            row["staff_cost"] = round(row["staff_cost"], 2)

        # Commission config
        override = await db.staff_commission_overrides.find_one(
            {"organization_id": org_id, "barber_id": barber_id, "active": True}, {"_id": 0}
        )
        defaults = await db.commission_settings.find_one({"organization_id": org_id}, {"_id": 0})
        staff_pct = (override or {}).get("staff_percent") or (defaults or {}).get("default_staff_percent", 60.0)
        biz_pct = 100.0 - staff_pct

        # Profitability
        if contract_type == "fixed_salary" and monthly_salary > 0:
            employer_monthly = round(monthly_salary * COLOMBIAN_EMPLOYER_FACTOR, 2)
            employer_period = round(employer_monthly * months_in_period, 2)
            net_margin = round(total_revenue - employer_period, 2)
            roi = round(total_revenue / employer_period, 2) if employer_period > 0 else 0
        else:
            employer_period = total_staff
            net_margin = round(total_revenue * biz_pct / 100, 2)
            roi = round(total_revenue / total_staff, 2) if total_staff > 0 else 0

        financial = {
            "period_days": period_days,
            "service_count": service_count,
            "total_revenue": total_revenue,
            "total_commission": total_commission,
            "total_tips": total_tips,
            "total_staff_cost": total_staff,
            "avg_ticket": avg_ticket,
            "revenue_per_week": round(total_revenue / weeks_in_period, 2),
            "revenue_per_month": round(total_revenue / months_in_period, 2),
            "staff_percent": staff_pct,
            "business_percent": biz_pct,
            "commission_source": "override" if override else "default",
            "contract_type": contract_type,
            "monthly_salary": monthly_salary,
            "employer_factor": COLOMBIAN_EMPLOYER_FACTOR if contract_type == "fixed_salary" else None,
            "employer_cost_period": employer_period if contract_type == "fixed_salary" else None,
            "net_margin": net_margin,
            "roi": roi,
            "weekly_breakdown": [weekly[k] for k in sorted(weekly)],
        }

        return {"profile": profile, "rating": rating, "appointments": appointments, "financial": financial}

    @router.put("/organizations/{organization_id}/barbers/{barber_id}/contract")
    async def update_barber_contract(
        organization_id: str,
        barber_id: str,
        data: ContractUpdate,
        current_user=Depends(get_current_user),
    ):
        require_management_role(current_user)
        org_id = await resolve_team_organization(current_user, organization_id)

        barber = await db.barbers.find_one(
            {"barber_id": barber_id, "organization_id": org_id}, {"_id": 0, "barber_id": 1}
        )
        if not barber:
            raise HTTPException(status_code=404, detail="Profesional no encontrado")

        update_fields = {
            "contract_type": data.contract_type,
            "monthly_salary": round(data.monthly_salary, 2) if data.contract_type == "fixed_salary" else 0,
            "contract_updated_at": utcnow().isoformat(),
        }
        await db.barbers.update_one(
            {"barber_id": barber_id, "organization_id": org_id},
            {"$set": update_fields},
        )
        return {"ok": True, **update_fields}

    return router
