"""Reglas de deposito y no-show por servicio (primer corte: configuracion + aceptacion explicita + registro).

No cobra nada automaticamente: el deposito se registra como valor esperado y el cobro es manual/interno. Antes de
reservar el cliente ve las reglas y debe aceptarlas; la aceptacion queda guardada en la cita con una copia de ellas.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException

MAX_POLICY_TEXT = 300


def clean_policy_fields(deposit_percent, no_show_policy) -> dict:
    """Valida y normaliza los campos de politica recibidos al crear/editar un servicio."""
    if deposit_percent is not None and not (0 <= float(deposit_percent) <= 100):
        raise HTTPException(status_code=400, detail="El depósito debe estar entre 0 y 100%")
    text = (no_show_policy or "").strip()
    if len(text) > MAX_POLICY_TEXT:
        raise HTTPException(
            status_code=400, detail=f"La política de inasistencia admite máximo {MAX_POLICY_TEXT} caracteres"
        )
    percent = round(float(deposit_percent), 2) if deposit_percent else None
    return {"deposit_percent": percent, "no_show_policy": text or None}


def policy_active(service: dict) -> bool:
    return bool(service.get("deposit_percent")) or bool(service.get("no_show_policy"))


def deposit_amount(service: dict) -> float:
    percent = float(service.get("deposit_percent") or 0)
    return round(float(service.get("price") or 0) * percent / 100, 2)


def require_acceptance(service: dict, accepted: bool) -> None:
    if policy_active(service) and not accepted:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "POLICY_ACCEPTANCE_REQUIRED",
                "message": (
                    "Debes aceptar las condiciones de este servicio "
                    "(depósito y política de inasistencia) para reservar."
                ),
            },
        )


def acceptance_snapshot(service: dict, accepted: bool, now: Optional[datetime] = None) -> Optional[dict]:
    """Copia de las reglas que el cliente acepto, para poder auditarlas aunque el servicio cambie despues."""
    if not (policy_active(service) and accepted):
        return None
    return {
        "accepted_at": (now or datetime.now(timezone.utc)).isoformat(),
        "deposit_percent": service.get("deposit_percent"),
        "deposit_amount": deposit_amount(service),
        "deposit_status": "pending" if service.get("deposit_percent") else "not_applicable",
        "no_show_policy": service.get("no_show_policy"),
        "cancellation_cutoff_hours": service.get("cancellation_cutoff_hours"),
    }
