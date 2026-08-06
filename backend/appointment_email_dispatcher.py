# NEXUS_8A7G1B2B1_APPOINTMENT_EMAIL_DISPATCHER_V1
from __future__ import annotations

import asyncio
from typing import Any, Mapping

from appointment_email_delivery import normalize_sender_result
from email_service import email_service


EVENT_CONTRACTS = {
    "confirmation": {
        "required": {"customer_name", "professional_name", "service_name", "date", "time", "organization_name"},
        "forbidden": {"management_token", "cancellation_url"},
    },
    "admin_new_booking": {
        "required": {"customer_name", "professional_name", "service_name", "date", "time", "organization_name"},
        "forbidden": set(),
    },
    "cancelled": {
        "required": {"customer_name", "date", "time", "organization_name"},
        "forbidden": set(),
    },
    "completed": {
        "required": {"customer_name", "organization_name", "date", "service_name"},
        "forbidden": set(),
    },
    "reminder_24h": {
        "required": {"customer_name", "professional_name", "service_name", "date", "time", "organization_name"},
        "forbidden": set(),
    },
}


class DispatchContractError(ValueError):
    pass


def _nested_keys(value: Any) -> set[str]:
    keys: set[str] = set()
    if isinstance(value, Mapping):
        for key, nested in value.items():
            keys.add(str(key))
            keys.update(_nested_keys(nested))
    elif isinstance(value, (list, tuple)):
        for nested in value:
            keys.update(_nested_keys(nested))
    return keys


def validate_delivery_contract(delivery: Mapping[str, Any]) -> dict[str, Any]:
    event_type = str(delivery.get("event_type") or "")
    contract = EVENT_CONTRACTS.get(event_type)
    if not contract:
        raise DispatchContractError("unsupported_event_type")
    recipient = str(delivery.get("recipient") or "").strip()
    if not recipient:
        raise DispatchContractError("missing_recipient")
    payload = delivery.get("payload")
    if not isinstance(payload, Mapping):
        raise DispatchContractError("invalid_payload")
    missing = sorted(key for key in contract["required"] if payload.get(key) in (None, ""))
    if missing:
        raise DispatchContractError("missing_payload_fields:" + ",".join(missing))
    forbidden = sorted(contract["forbidden"] & _nested_keys(payload))
    if forbidden:
        raise DispatchContractError("forbidden_secret_fields:" + ",".join(forbidden))
    return {"event_type": event_type, "recipient": recipient, "payload": dict(payload)}


def build_sender(delivery: Mapping[str, Any], service=email_service):
    validated = validate_delivery_contract(delivery)
    event_type = validated["event_type"]
    recipient = validated["recipient"]
    payload = validated["payload"]

    if event_type == "confirmation":
        return lambda: service.send_appointment_confirmation(
            to_email=recipient,
            customer_name=payload["customer_name"],
            barber_name=payload["professional_name"],
            service_name=payload["service_name"],
            date=payload["date"],
            time=payload["time"],
            organization_name=payload["organization_name"],
            organization_address=payload.get("organization_address"),
            cancellation_url=None,
        )
    if event_type == "admin_new_booking":
        return lambda: service.send_admin_new_appointment_notification(
            admin_email=recipient,
            customer_name=payload["customer_name"],
            customer_phone=str(payload.get("customer_phone") or "No informado"),
            service_name=payload["service_name"],
            barber_name=payload["professional_name"],
            date=payload["date"],
            time=payload["time"],
            organization_name=payload["organization_name"],
        )
    if event_type == "cancelled":
        return lambda: service.send_appointment_cancelled(
            to_email=recipient,
            customer_name=payload["customer_name"],
            date=payload["date"],
            time=payload["time"],
            organization_name=payload["organization_name"],
        )
    if event_type == "completed":
        return lambda: service.send_appointment_completed(
            to_email=recipient,
            customer_name=payload["customer_name"],
            organization_name=payload["organization_name"],
            date=payload["date"],
            service_name=payload["service_name"],
        )
    return lambda: service.send_appointment_reminder(
        to_email=recipient,
        customer_name=payload["customer_name"],
        barber_name=payload["professional_name"],
        service_name=payload["service_name"],
        date=payload["date"],
        time=payload["time"],
        organization_name=payload["organization_name"],
        organization_phone=payload.get("organization_phone"),
    )


async def dispatch_claimed_delivery(delivery: Mapping[str, Any], service=email_service) -> dict[str, Any]:
    try:
        sender = build_sender(delivery, service=service)
        raw = await asyncio.to_thread(sender)
        return normalize_sender_result(raw)
    except DispatchContractError as exc:
        return {"accepted": False, "provider": "dispatcher", "provider_response_code": "contract_rejected", "error_code": str(exc)}
    except Exception as exc:
        return {"accepted": False, "provider": "smtp", "provider_response_code": "exception", "error_code": type(exc).__name__}
