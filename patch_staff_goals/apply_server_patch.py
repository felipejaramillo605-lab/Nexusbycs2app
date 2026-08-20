"""
NEXUS_STAFF_GOALS_V1 — parche quirúrgico para backend/server.py

Por qué esto no es un simple "cp": tu server.py actual ya tiene, sin subir a
GitHub todavía, los cambios de la feature de solicitud de reseñas. Un
reemplazo de archivo completo (cp patches/server.py backend/server.py)
borraría ese trabajo -- exactamente el mismo tipo de incidente que ya
tuvimos una vez. Este script en cambio hace 7 ediciones puntuales por
coincidencia exacta de texto sobre TU archivo actual, así que es seguro sin
importar si ya hiciste commit de reseñas o no.

Uso:
    cd /app
    python3 apply_server_patch.py

Si algún bloque no coincide exactamente (por ejemplo porque ya aplicaste
este parche antes, o porque hay cambios manuales encima), el script aborta
esa edición puntual con un mensaje claro y no toca el archivo -- no hay
aplicaciones parciales silenciosas.
"""
import sys

PATH = "backend/server.py"

with open(PATH, encoding="utf-8") as f:
    content = f.read()

edits = []

# 1. Campo en el modelo Barber (respuesta)
edits.append((
    '''    service_ids: List[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: Optional[datetime] = None

class Appointment(BaseModel):''',
    '''    service_ids: List[str] = Field(default_factory=list)
    # NEXUS_STAFF_GOALS_V1 — la define el manager, no el propio staff.
    goal_amount: Optional[float] = None
    goal_period: Optional[str] = None  # "weekly" | "monthly"
    created_at: datetime
    updated_at: Optional[datetime] = None

class Appointment(BaseModel):'''
))

# 2. Campo en BarberCreate
edits.append((
    '''    start_time: Optional[str] = "09:00"
    end_time: Optional[str] = "18:00"
    service_ids: Optional[List[str]] = None

class StaffBarberProfileUpdate(BaseModel):''',
    '''    start_time: Optional[str] = "09:00"
    end_time: Optional[str] = "18:00"
    service_ids: Optional[List[str]] = None
    # NEXUS_STAFF_GOALS_V1
    goal_amount: Optional[float] = None
    goal_period: Optional[str] = None  # "weekly" | "monthly"

class StaffBarberProfileUpdate(BaseModel):'''
))

# 3. Helper de validación compartido, antes de create_barber
edits.append((
    '''@api_router.post("/barbers")
async def create_barber(data: BarberCreate, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):''',
    '''def _validate_goal_fields(data: "BarberCreate") -> None:
    # NEXUS_STAFF_GOALS_V1 — compartido entre create_barber y update_barber.
    if data.goal_amount is not None and data.goal_amount < 0:
        raise HTTPException(status_code=400, detail="Goal amount cannot be negative")
    if data.goal_amount and not data.goal_period:
        raise HTTPException(status_code=400, detail="goal_period is required when goal_amount is set")
    if data.goal_period and data.goal_period not in ("weekly", "monthly"):
        raise HTTPException(status_code=400, detail="goal_period must be 'weekly' or 'monthly'")


@api_router.post("/barbers")
async def create_barber(data: BarberCreate, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):'''
))

# 4. create_barber: validar + persistir
edits.append((
    '''    if data.bio and len(data.bio.strip()) > 500:
        raise HTTPException(status_code=400, detail="Bio must contain 500 characters or fewer")

    service_ids = list(dict.fromkeys(data.service_ids or []))
    if service_ids:
        logger.info(f"[create_barber] actor_user_id={current_user.user_id} service_count={len(service_ids)} action=validating_services")''',
    '''    if data.bio and len(data.bio.strip()) > 500:
        raise HTTPException(status_code=400, detail="Bio must contain 500 characters or fewer")
    _validate_goal_fields(data)

    service_ids = list(dict.fromkeys(data.service_ids or []))
    if service_ids:
        logger.info(f"[create_barber] actor_user_id={current_user.user_id} service_count={len(service_ids)} action=validating_services")'''
))
edits.append((
    '''        "service_ids": service_ids,
        "created_at": now,
        "updated_at": now
    }
    
    await db.barbers.insert_one(barber_doc)''',
    '''        "service_ids": service_ids,
        "goal_amount": data.goal_amount,
        "goal_period": data.goal_period if data.goal_amount else None,
        "created_at": now,
        "updated_at": now
    }
    
    await db.barbers.insert_one(barber_doc)'''
))

# 5. update_barber: validar + persistir
edits.append((
    '''    if data.bio and len(data.bio.strip()) > 500:
        raise HTTPException(status_code=400, detail="Bio must contain 500 characters or fewer")

    service_ids = list(dict.fromkeys(data.service_ids or []))
    if service_ids:
        service_count = await db.services.count_documents({
            "organization_id": barber["organization_id"],''',
    '''    if data.bio and len(data.bio.strip()) > 500:
        raise HTTPException(status_code=400, detail="Bio must contain 500 characters or fewer")
    _validate_goal_fields(data)

    service_ids = list(dict.fromkeys(data.service_ids or []))
    if service_ids:
        service_count = await db.services.count_documents({
            "organization_id": barber["organization_id"],'''
))
edits.append((
    '''        "service_ids": service_ids,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    result = await db.barbers.update_one({"barber_id": barber_id}, {"$set": update_data})''',
    '''        "service_ids": service_ids,
        "goal_amount": data.goal_amount,
        "goal_period": data.goal_period if data.goal_amount else None,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    result = await db.barbers.update_one({"barber_id": barber_id}, {"$set": update_data})'''
))

# 6. Firma del endpoint de resumen: agregar 'period'
edits.append((
    '''async def get_my_income_summary(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    authorization: Optional[str] = Header(None),
    session_token: Optional[str] = Cookie(None)
):''',
    '''async def get_my_income_summary(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    period: Optional[str] = None,
    authorization: Optional[str] = Header(None),
    session_token: Optional[str] = Cookie(None)
):'''
))

# 7. Resumen individual con meta por periodo + nuevo endpoint de ranking de equipo
edits.append((
    '''    return {
        "barber_id": barber["barber_id"],
        "professional_name": barber.get("display_name") or barber.get("name") or current_user.name,
        "service_count": service_count,
        "total_net_service_amount": total_net,
        "total_commission_amount": total_commission,
        "total_tip_amount": total_tips,
        "total_staff_amount": total_staff,
        "average_staff_amount": round(total_staff / service_count, 2) if service_count else 0.0,
        "daily_totals": [daily[key] for key in sorted(daily)]
    }


# ==================== END STAFF INCOME PORTAL ====================''',
    '''    # NEXUS_STAFF_GOALS_V1 — el progreso solo se calcula cuando el periodo
    # de la meta configurada por el manager coincide con la ventana que el
    # frontend está pidiendo ("week"=7 días / "month"=30 días); en
    # cualquier otro caso (día, o meta configurada al otro periodo) no se
    # expone progreso para no comparar peras con manzanas.
    goal_amount = barber.get("goal_amount")
    goal_period = barber.get("goal_period")
    requested_period = "week" if period == "week" else ("month" if period == "month" else None)
    period_matches = (goal_period == "weekly" and requested_period == "week") or (goal_period == "monthly" and requested_period == "month")
    goal_progress_percent = None
    if goal_amount and goal_amount > 0 and period_matches:
        goal_progress_percent = round(min(total_staff / goal_amount, 1) * 100, 1)
    else:
        goal_amount = goal_amount if period_matches else None
    return {
        "barber_id": barber["barber_id"],
        "professional_name": barber.get("display_name") or barber.get("name") or current_user.name,
        "service_count": service_count,
        "total_net_service_amount": total_net,
        "total_commission_amount": total_commission,
        "total_tip_amount": total_tips,
        "total_staff_amount": total_staff,
        "average_staff_amount": round(total_staff / service_count, 2) if service_count else 0.0,
        "goal_amount": goal_amount,
        "goal_period": barber.get("goal_period"),
        "goal_progress_percent": goal_progress_percent,
        "daily_totals": [daily[key] for key in sorted(daily)]
    }


@api_router.get("/staff/income/team-ranking")
async def get_team_ranking(
    period: str = "month",
    authorization: Optional[str] = Header(None),
    session_token: Optional[str] = Cookie(None)
):
    # NEXUS_STAFF_GOALS_V1 — ranking del equipo completo, visible para
    # cualquier staff de la organización (no solo managers). Muestra a
    # todos los profesionales activos, ordenados por lo generado
    # (comisión + propinas) en la ventana pedida.
    current_user = await get_current_user(authorization, session_token)
    me = await resolve_current_staff_barber(current_user)
    organization_id = me["organization_id"]

    if period not in ("week", "month"):
        raise HTTPException(status_code=400, detail="period must be 'week' or 'month'")
    days = 6 if period == "week" else 29
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=days)
    created_filter = transaction_date_filter(start.strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d"))

    teammates = await db.barbers.find(
        {"organization_id": organization_id, "active": True},
        {"_id": 0, "barber_id": 1, "display_name": 1, "name": 1, "avatar": 1, "goal_amount": 1, "goal_period": 1}
    ).to_list(500)
    barber_ids = [item["barber_id"] for item in teammates]

    match_query = {"organization_id": organization_id, "barber_id": {"$in": barber_ids}, "status": "confirmed"}
    if created_filter:
        match_query["created_at"] = created_filter
    pipeline = [
        {"$match": match_query},
        {"$group": {"_id": "$barber_id", "total_staff_amount": {"$sum": "$staff_total_amount"}, "service_count": {"$sum": 1}}}
    ]
    totals = {row["_id"]: row async for row in db.transactions.aggregate(pipeline)}

    goal_key = "weekly" if period == "week" else "monthly"
    ranking = []
    for item in teammates:
        row_totals = totals.get(item["barber_id"], {})
        total = round(float(row_totals.get("total_staff_amount", 0) or 0), 2)
        goal_amount = item.get("goal_amount") if item.get("goal_period") == goal_key else None
        progress = round(min(total / goal_amount, 1) * 100, 1) if goal_amount and goal_amount > 0 else None
        ranking.append({
            "barber_id": item["barber_id"],
            "professional_name": item.get("display_name") or item.get("name") or "Profesional",
            "avatar": item.get("avatar"),
            "total_staff_amount": total,
            "service_count": int(row_totals.get("service_count", 0) or 0),
            "goal_amount": goal_amount,
            "goal_progress_percent": progress,
            "is_me": item["barber_id"] == me["barber_id"],
        })
    ranking.sort(key=lambda row: row["total_staff_amount"], reverse=True)
    for index, row in enumerate(ranking, start=1):
        row["rank"] = index

    return {"period": period, "start_date": start.strftime("%Y-%m-%d"), "end_date": end.strftime("%Y-%m-%d"), "ranking": ranking}


# ==================== END STAFF INCOME PORTAL ===================='''
))

failures = []
for i, (old, new) in enumerate(edits, start=1):
    count = content.count(old)
    if count != 1:
        failures.append((i, count))
        continue
    content = content.replace(old, new)

if failures:
    print("ABORTADO — no se escribió nada. Ediciones con problema:")
    for i, count in failures:
        print(f"  edición #{i}: se encontraron {count} coincidencias (se esperaba 1)")
    print("Si ya aplicaste este parche antes, probablemente sea eso. Avísame y lo revisamos.")
    sys.exit(1)

with open(PATH, "w", encoding="utf-8") as f:
    f.write(content)

print(f"OK — {len(edits)}/{len(edits)} ediciones aplicadas correctamente sobre {PATH}")
