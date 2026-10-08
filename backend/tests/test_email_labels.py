import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from email_labels import (  # noqa: E402
    PROFESSIONAL_ICON_CHOICES,
    SERVICE_ICON_CHOICES,
    default_labels,
    resolve_email_labels,
    validate_email_labels,
)
from email_service import email_service  # noqa: E402


def capture_html(monkeypatch):
    captured = {}

    def fake_send(self, to, subject, html, text=None, **kwargs):
        captured["html"] = html
        return True

    monkeypatch.setattr(email_service.__class__, "_send_email", fake_send)
    return captured


def test_defaults_follow_the_business_type_and_scissors_are_not_universal():
    assert default_labels("barbershop")["service_icon"] == "💈"
    assert default_labels("hair_salon")["service_icon"] == "✂️"
    assert default_labels("pilates_studio")["service_icon"] == "🧘"
    assert default_labels("health_clinic")["service_icon"] == "🩺"
    assert default_labels("unknown-type")["service_icon"] == "✨"
    assert default_labels(None)["service_label"] == "Servicio"
    non_beauty = ["wellness_spa", "pilates_studio", "health_clinic", "professional_services", "pet_grooming"]
    assert all(default_labels(kind)["service_icon"] != "✂️" for kind in non_beauty)


def test_manager_choices_override_the_defaults_and_empty_values_restore_them():
    organization = {
        "business_type": "health_clinic",
        "email_labels": {"service_icon": "🥗", "service_label": "Consulta", "professional_label": "  "},
    }
    labels = resolve_email_labels(organization)
    assert labels["service_icon"] == "🥗"
    assert labels["service_label"] == "Consulta"
    assert labels["professional_label"] == "Profesional"
    assert labels["professional_icon"] == "👤"


def test_validation_only_accepts_icons_from_the_list_and_simple_words():
    assert validate_email_labels(None) == {}
    assert validate_email_labels({"service_icon": SERVICE_ICON_CHOICES[0]}) == {"service_icon": SERVICE_ICON_CHOICES[0]}
    assert validate_email_labels({"professional_icon": PROFESSIONAL_ICON_CHOICES[1]})
    for bad in (
        {"service_icon": "💣"},
        {"professional_icon": "x"},
        {"service_label": "<script>alert(1)</script>"},
        {"service_label": "a" * 25},
        {"professional_label": "Terapeuta\n"},
    ):
        if bad.get("professional_label") == "Terapeuta\n":
            assert validate_email_labels(bad) == {"professional_label": "Terapeuta"}
            continue
        with pytest.raises(ValueError):
            validate_email_labels(bad)
    with pytest.raises(ValueError):
        validate_email_labels("not a mapping")


def test_corrupt_stored_labels_never_block_an_email():
    labels = resolve_email_labels({"business_type": "barbershop", "email_labels": {"service_icon": "💣"}})
    assert labels["service_icon"] == "💈"


def test_confirmation_email_uses_the_chosen_icon_and_words(monkeypatch):
    captured = capture_html(monkeypatch)
    labels = resolve_email_labels(
        {
            "business_type": "health_clinic",
            "email_labels": {"service_label": "Consulta", "professional_label": "Especialista"},
        }
    )
    ok = email_service.send_appointment_confirmation(
        to_email="x@example.com",
        customer_name="Ana",
        barber_name="Dra. Rojas",
        service_name="Consulta de nutrición",
        date="2026-10-09",
        time="12:00",
        organization_name="Clínica",
        labels=labels,
    )
    assert ok is True
    html = captured["html"]
    assert "🩺 Consulta" in html and "👤 Especialista" in html
    assert "✂️" not in html
    assert "Dra. Rojas" in html


def test_confirmation_email_without_labels_keeps_the_previous_look(monkeypatch):
    captured = capture_html(monkeypatch)
    email_service.send_appointment_confirmation(
        to_email="x@example.com",
        customer_name="Ana",
        barber_name="Pedro",
        service_name="Corte",
        date="2026-10-09",
        time="12:00",
        organization_name="Barbería",
    )
    assert "✂️ Servicio" in captured["html"] and "👤 Profesional" in captured["html"]


def test_reminder_email_uses_the_chosen_icons_and_escapes_the_labels(monkeypatch):
    captured = capture_html(monkeypatch)
    email_service.send_appointment_reminder(
        to_email="x@example.com",
        customer_name="Ana",
        barber_name="Pedro",
        service_name="Sesión",
        date="2026-10-09",
        time="12:00",
        organization_name="Estudio",
        labels={"service_icon": "🧘", "professional_icon": "🌟", "service_label": "<b>x</b>"},
    )
    html = captured["html"]
    assert "🧘 Sesión" in html and "🌟 Pedro" in html
    assert "✂️" not in html
