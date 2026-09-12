# NEXUS_BIRTHDAY_CAMPAIGN_V1
"""
Códigos de recompensa de cumpleaños.

Un birthday_rewards es lo que un cliente puede canjear en el checkout: un
descuento por porcentaje, o uno o más servicios reales del catálogo del
manager marcados como regalo. El daemon de recordatorios
(birthday_alerts.py) genera uno automáticamente cuando la organización
tiene la campaña habilitada y detecta un cumpleaños próximo; el staff lo
valida y lo aplica manualmente en el checkout (NEXUS_CHECKOUT_BACKEND_V1) --
nunca se auto-aplica, así queda trazado quién lo confirmó.
"""
from __future__ import annotations

import secrets
import uuid
from datetime import datetime, timedelta, timezone


async def ensure_birthday_reward_indexes(db):
    await db.birthday_rewards.create_index("reward_id", unique=True, name="birthday_reward_id_unique")
    await db.birthday_rewards.create_index("code", unique=True, name="birthday_reward_code_unique")
    await db.birthday_rewards.create_index(
        [("client_id", 1), ("status", 1)], name="birthday_reward_client_status"
    )
    # Un solo reward activo por cliente por año de cumpleaños -- evita que el
    # daemon genere duplicados si corre más de una vez para el mismo cumpleaños.
    await db.birthday_rewards.create_index(
        [("client_id", 1), ("birthday_year", 1)],
        unique=True,
        sparse=True,
        name="birthday_reward_client_year_unique",
    )


def _generate_code() -> str:
    return "CUMPLE-" + secrets.token_hex(3).upper()


async def create_birthday_reward(db, *, organization_id: str, client_id: str, campaign: dict, birthday_year: int, now=None):
    """Crea (o devuelve la ya existente) recompensa para este cliente/año."""
    now = now or datetime.now(timezone.utc)
    reward_type = campaign.get("reward_type", "percentage")
    expires_days = int(campaign.get("reward_expires_days") or 30)
    row = {
        "reward_id": f"bday_rwd_{uuid.uuid4().hex[:16]}",
        "organization_id": organization_id,
        "client_id": client_id,
        "code": _generate_code(),
        "reward_type": reward_type,
        "percentage": campaign.get("percentage") if reward_type == "percentage" else None,
        "free_service_ids": campaign.get("free_service_ids") if reward_type == "free_services" else None,
        "status": "active",
        "birthday_year": birthday_year,
        "issued_at": now.isoformat(),
        "expires_at": (now + timedelta(days=expires_days)).isoformat(),
        "redeemed_at": None,
        "redeemed_by_appointment_id": None,
    }
    try:
        await db.birthday_rewards.insert_one(row)
        return row
    except Exception:
        # ya existía un reward para este cliente/año (índice único) -- devolverlo
        return await db.birthday_rewards.find_one(
            {"client_id": client_id, "birthday_year": birthday_year}, {"_id": 0}
        )


async def find_redeemable_reward(db, *, organization_id: str, client_id: str, code: str, now=None):
    """Busca un reward válido para este cliente exacto. No lo modifica."""
    now = now or datetime.now(timezone.utc)
    reward = await db.birthday_rewards.find_one(
        {"organization_id": organization_id, "client_id": client_id, "code": code.strip().upper()}, {"_id": 0}
    )
    if not reward:
        return None, "code_not_found"
    if reward["status"] != "active":
        return None, "code_already_used_or_expired"
    if reward["expires_at"] < now.isoformat():
        return None, "code_expired"
    return reward, None


async def redeem_reward(db, *, reward_id: str, appointment_id: str, now=None):
    now = now or datetime.now(timezone.utc)
    result = await db.birthday_rewards.update_one(
        {"reward_id": reward_id, "status": "active"},
        {"$set": {"status": "redeemed", "redeemed_at": now.isoformat(), "redeemed_by_appointment_id": appointment_id}},
    )
    return result.modified_count == 1
