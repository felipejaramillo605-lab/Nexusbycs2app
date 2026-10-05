"""Deterministic, auditable decision providers; external providers stay disabled by default."""
from __future__ import annotations

import asyncio
import os
import re
import time
from abc import ABC, abstractmethod
from typing import Any

from audit_contracts import record_audit_event


TIMEOUT_SECONDS = 0.8
EMAIL = re.compile(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}")
PHONE = re.compile(r"(?<!\w)(?:\+?57[ .-]?)?(?:3\d{2}|\d{3})[ .-]?\d{3}[ .-]?\d{4}(?!\w)")
URL = re.compile(r"https?://[^\s<>()]+", re.IGNORECASE)
NIT = re.compile(r"\bNIT\s*[:#-]?\s*\d{3}(?:[.\s-]\d{3}){2,3}(?:-\d)?\b", re.IGNORECASE)
CEDULA = re.compile(r"\b(?:C[.]?C[.]?|c[eé]dula|documento)\s*(?:No[.]?|N[°º.]?)?\s*[:#-]?\s*\d{5,12}\b|\b\d{1,3}(?:\.\d{3}){2,3}\b", re.IGNORECASE)
ADDRESS = re.compile(r"\b(?:calle|cl|carrera|cra|avenida|av|diagonal|transversal)\s*\d{1,3}(?:\s*[A-Za-z])?(?:\s*(?:#|no[.]?)\s*\d{1,4}(?:\s*-\s*\d{1,4})?)?", re.IGNORECASE)
PLATE = re.compile(r"\b[A-Z]{3}\s?-?\s?\d{3}\b")
ACCOUNT = re.compile(r"\b(?:cuenta|nequi|daviplata|bancolombia)\s*(?:No[.]?|N[°º.]?|#|:)?\s*\d{6,20}\b", re.IGNORECASE)
CODE = re.compile(r"\b(?:c[oó]digo|reserva|booking|pin)\s*(?:#|:|es)\s*[A-Za-z0-9_-]{4,}\b", re.IGNORECASE)
SUPPORT_OPTIONS = {
    "category": ("technical", "billing", "general"),
    "priority": ("low", "normal", "high", "urgent"),
}


class NotConfigured(RuntimeError):
    pass


class DecisionContractError(ValueError):
    pass


class DecisionProvider(ABC):
    @abstractmethod
    async def decide(self, kind: str, text: str, options: dict[str, Any] | None = None) -> dict[str, Any]:
        raise NotImplementedError


def mask_pii(text: str | None) -> str:
    """Mask common Colombian PII before a text leaves the decision engine."""
    value = str(text or "")
    for pattern, replacement in (
        (URL, "[ENLACE]"), (EMAIL, "[CORREO]"), (ACCOUNT, "[CUENTA]"), (PHONE, "[TELEFONO]"),
        (NIT, "[NIT]"), (CEDULA, "[CEDULA]"), (ADDRESS, "[DIRECCION]"),
        (PLATE, "[PLACA]"), (CODE, "[CODIGO]"),
    ):
        value = pattern.sub(replacement, value)
    return value


def _contract_for(kind: str, options: dict[str, Any] | None) -> dict[str, Any]:
    options = options or {}
    if kind == "support" and not options:
        return {"output_type": "choice", "choices": SUPPORT_OPTIONS}
    return options


def validate_decision_result(result: dict[str, Any], *, kind: str, options: dict[str, Any] | None = None) -> dict[str, Any]:
    """Validate the portable, discriminated response contract for every provider."""
    if not isinstance(result, dict):
        raise DecisionContractError("decision result must be an object")
    output_type = result.get("output_type")
    if output_type not in {"choice", "score", "probability"}:
        raise DecisionContractError("output_type is required")
    value = result.get("value")
    contract = _contract_for(kind, options)
    if output_type == "choice":
        choices = contract.get("choices", ())
        if isinstance(choices, dict):
            if not isinstance(value, dict) or any(value.get(key) not in allowed for key, allowed in choices.items()):
                raise DecisionContractError("choice is outside closed options")
        elif value not in choices:
            raise DecisionContractError("choice is outside closed options")
    elif output_type == "score":
        minimum, maximum = contract.get("min"), contract.get("max")
        if not isinstance(value, (int, float)) or isinstance(value, bool) or minimum is None or maximum is None or not minimum <= value <= maximum:
            raise DecisionContractError("score is outside declared range")
    elif not isinstance(value, (int, float)) or isinstance(value, bool) or not 0 <= value <= 1:
        raise DecisionContractError("probability must be between zero and one")
    confidence = result.get("confidence")
    if not isinstance(confidence, (int, float)) or isinstance(confidence, bool) or not 0 <= confidence <= 1:
        raise DecisionContractError("confidence must be between zero and one")
    required = ("provider", "model_version", "latency_ms", "masked", "fallback")
    if any(key not in result for key in required):
        raise DecisionContractError("decision metadata is incomplete")
    if not isinstance(result["latency_ms"], (int, float)) or result["latency_ms"] < 0:
        raise DecisionContractError("latency_ms must be non-negative")
    if not isinstance(result["masked"], bool) or not isinstance(result["fallback"], bool):
        raise DecisionContractError("masked and fallback must be booleans")
    if result.get("kind") != kind:
        raise DecisionContractError("decision kind does not match request")
    return result


def decision_result(*, kind: str, output_type: str, value: Any, confidence: float, provider: str, model_version: str, latency_ms: float = 0, masked: bool = False, fallback: bool = False) -> dict[str, Any]:
    result = {"kind": kind, "output_type": output_type, "value": value, "confidence": confidence, "provider": provider, "model_version": model_version, "latency_ms": latency_ms, "masked": masked, "fallback": fallback}
    if output_type == "choice":
        result["choice"] = value
    return result


class HeuristicProvider(DecisionProvider):
    async def decide(self, kind: str, text: str, options: dict[str, Any] | None = None) -> dict[str, Any]:
        body = (text or "").lower()
        if kind != "support":
            return decision_result(kind=kind, output_type="choice", value="general", confidence=.5, provider="heuristic", model_version="v1")
        category = "technical" if any(word in body for word in ("error", "caído", "falla", "no funciona", "acceso")) else "billing" if any(word in body for word in ("factura", "cobro", "pago", "precio")) else "general"
        priority = "urgent" if any(word in body for word in ("urgente", "bloqueado", "caído")) else "high" if any(word in body for word in ("error", "falla", "no funciona")) else "normal"
        return decision_result(kind=kind, output_type="choice", value={"category": category, "priority": priority}, confidence=.72 if priority != "normal" else .6, provider="heuristic", model_version="v1")


class JevProvider(DecisionProvider):
    async def decide(self, kind: str, text: str, options: dict[str, Any] | None = None) -> dict[str, Any]:
        if not os.getenv("JEV_API_KEY"):
            raise NotConfigured("JEV_API_KEY is not configured")
        raise NotConfigured("Jev network provider is intentionally disabled")


async def _call_provider(provider: DecisionProvider, *, kind: str, text: str, options: dict[str, Any] | None, masked: bool, fallback: bool) -> dict[str, Any]:
    started = time.perf_counter()
    result = dict(await provider.decide(kind, text, options))
    result.update({"kind": kind, "latency_ms": (time.perf_counter() - started) * 1000, "masked": masked, "fallback": fallback})
    return validate_decision_result(result, kind=kind, options=options)


async def decide(db, *, actor_user_id: str, organization_id: str, kind: str, text: str, options: dict[str, Any] | None = None, provider: DecisionProvider | None = None) -> dict[str, Any]:
    heuristic = HeuristicProvider()
    selected = provider or heuristic
    if os.getenv("DECISION_ENGINE_ENABLED", "").lower() not in {"1", "true", "yes"}:
        result = await _call_provider(heuristic, kind=kind, text=text, options=options, masked=False, fallback=False)
        result["disabled"] = True
    else:
        try:
            result = await asyncio.wait_for(_call_provider(selected, kind=kind, text=mask_pii(text), options=options, masked=True, fallback=False), timeout=TIMEOUT_SECONDS)
        except (asyncio.TimeoutError, NotConfigured, DecisionContractError):
            result = await _call_provider(heuristic, kind=kind, text=text, options=options, masked=False, fallback=True)
    await record_audit_event(db, category="ai_decision", event_type="decision_made", actor_user_id=actor_user_id, organization_id=organization_id, entity_type=kind, metadata={"provider": result["provider"], "model_version": result["model_version"], "confidence": result["confidence"]})
    return result
