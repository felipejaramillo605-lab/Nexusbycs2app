"""Iconos y palabras de los correos de citas que cada negocio puede personalizar.

Antes todos los correos mostraban unas tijeras junto al servicio y la palabra "Profesional", aunque el negocio fuera
un estudio de pilates o una clínica. Ahora el valor por defecto depende del tipo de negocio y el manager puede elegir
otro icono de una lista cerrada (no se acepta emoji libre) y cambiar las palabras "Servicio" y "Profesional".
"""

from __future__ import annotations

import re
from typing import Mapping, Optional

SERVICE_ICON_CHOICES = (
    "✂️", "💈", "💆", "💅", "💄", "✨", "🌿", "🧘", "🏋️", "🩺", "🥗", "🐾", "🎨", "📋", "🗓️", "⭐",
)  # fmt: skip
PROFESSIONAL_ICON_CHOICES = ("👤", "💇", "🧑‍⚕️", "🧑‍🏫", "🧑‍🎨", "🤝", "⭐", "🌟")

# Palabras sugeridas en la pantalla de ajustes; el manager tambien puede escribir otra (max. 24 caracteres).
SERVICE_WORD_SUGGESTIONS = ("Servicio", "Sesión", "Consulta", "Clase", "Tratamiento", "Terapia", "Cita")
PROFESSIONAL_WORD_SUGGESTIONS = ("Profesional", "Especialista", "Terapeuta", "Instructor", "Estilista", "Entrenador")

DEFAULT_SERVICE_LABEL = "Servicio"
DEFAULT_PROFESSIONAL_LABEL = "Profesional"
DEFAULT_PROFESSIONAL_ICON = "👤"
GENERIC_SERVICE_ICON = "✨"

SERVICE_ICON_BY_BUSINESS_TYPE = {
    "barbershop": "💈",
    "hair_salon": "✂️",
    "beauty_salon": "💄",
    "nail_spa": "💅",
    "lash_spa": "✨",
    "wellness_spa": "🌿",
    "pilates_studio": "🧘",
    "health_clinic": "🩺",
    "pet_grooming": "🐾",
    "professional_services": "📋",
}

MAX_WORD_LENGTH = 24
_WORD_PATTERN = re.compile(r"^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9 .,&/'()+-]+$")
KEYS = ("service_icon", "professional_icon", "service_label", "professional_label")


def default_labels(business_type: Optional[str]) -> dict:
    return {
        "service_icon": SERVICE_ICON_BY_BUSINESS_TYPE.get(str(business_type or ""), GENERIC_SERVICE_ICON),
        "professional_icon": DEFAULT_PROFESSIONAL_ICON,
        "service_label": DEFAULT_SERVICE_LABEL,
        "professional_label": DEFAULT_PROFESSIONAL_LABEL,
    }


def validate_email_labels(raw: Optional[Mapping]) -> dict:
    """Devuelve solo los valores personalizados validos; lanza ValueError con un mensaje claro si algo no sirve."""
    if raw is None:
        return {}
    if not isinstance(raw, Mapping):
        raise ValueError("La personalización de correos no tiene un formato válido")
    clean = {}
    for key in KEYS:
        value = raw.get(key)
        if value is None or str(value).strip() == "":
            continue  # vacio = usar el valor por defecto del tipo de negocio
        value = str(value).strip()
        if key == "service_icon":
            if value not in SERVICE_ICON_CHOICES:
                raise ValueError("Elige un icono de servicio de la lista")
        elif key == "professional_icon":
            if value not in PROFESSIONAL_ICON_CHOICES:
                raise ValueError("Elige un icono de profesional de la lista")
        else:
            if len(value) > MAX_WORD_LENGTH:
                raise ValueError(f"Las palabras admiten máximo {MAX_WORD_LENGTH} caracteres")
            if not _WORD_PATTERN.match(value):
                raise ValueError("Las palabras solo admiten letras, números y signos simples")
        clean[key] = value
    return clean


def resolve_email_labels(organization: Optional[Mapping]) -> dict:
    """Valores finales para los correos: lo que eligio el manager y, si no, el predeterminado de su tipo de negocio."""
    organization = organization or {}
    labels = default_labels(organization.get("business_type"))
    try:
        labels.update(validate_email_labels(organization.get("email_labels")))
    except ValueError:
        pass  # un dato antiguo o corrupto nunca debe impedir que salga un correo
    return labels
