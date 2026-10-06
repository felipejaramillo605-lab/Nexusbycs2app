"""Deposito y politica de inasistencia por servicio."""

import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest
from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import service_policy as subject  # noqa: E402

SERVICE = {
    "service_id": "s1",
    "price": 50000,
    "deposit_percent": 30,
    "no_show_policy": "Se pierde el depósito",
    "cancellation_cutoff_hours": 24,
}


def test_clean_fields_validate_range_and_trim_text():
    assert subject.clean_policy_fields(30, "  Se pierde el depósito ") == {
        "deposit_percent": 30.0,
        "no_show_policy": "Se pierde el depósito",
    }
    assert subject.clean_policy_fields(None, "") == {"deposit_percent": None, "no_show_policy": None}
    assert subject.clean_policy_fields(0, None) == {"deposit_percent": None, "no_show_policy": None}
    for bad in (-1, 101):
        with pytest.raises(HTTPException) as error:
            subject.clean_policy_fields(bad, None)
        assert error.value.status_code == 400
    with pytest.raises(HTTPException):
        subject.clean_policy_fields(None, "x" * 301)


def test_services_without_rules_never_ask_for_acceptance():
    plain = {"service_id": "s2", "price": 10000}
    assert subject.policy_active(plain) is False
    subject.require_acceptance(plain, False)
    assert subject.acceptance_snapshot(plain, True) is None


def test_active_rules_block_the_booking_until_accepted():
    assert subject.policy_active(SERVICE) is True
    with pytest.raises(HTTPException) as error:
        subject.require_acceptance(SERVICE, False)
    assert error.value.status_code == 400 and error.value.detail["code"] == "POLICY_ACCEPTANCE_REQUIRED"
    subject.require_acceptance(SERVICE, True)


def test_snapshot_keeps_a_copy_of_what_the_client_accepted():
    now = datetime(2026, 10, 6, 12, 0, tzinfo=timezone.utc)
    snapshot = subject.acceptance_snapshot(SERVICE, True, now)
    assert snapshot == {
        "accepted_at": now.isoformat(),
        "deposit_percent": 30,
        "deposit_amount": 15000.0,
        "deposit_status": "pending",
        "no_show_policy": "Se pierde el depósito",
        "cancellation_cutoff_hours": 24,
    }
    only_text = {"service_id": "s3", "price": 20000, "no_show_policy": "Avisar con 24 h"}
    assert subject.acceptance_snapshot(only_text, True)["deposit_status"] == "not_applicable"
    assert subject.acceptance_snapshot(SERVICE, False) is None
