"""Perfiles de pais de operacion de una organizacion (Colombia o Estados Unidos).

El perfil decide moneda funcional, prefijo telefonico, zona horaria, idioma por defecto del portal del cliente y
que funciones estan disponibles. Colombia conserva todo lo que ya existe. Estados Unidos oculta de forma temporal lo que
depende de normativa colombiana (nomina, RRHH) o que aun requiere revision legal estadounidense (campanas de marketing:
TCPA, ley de telemarketing de Florida y CAN-SPAM). Los recordatorios y confirmaciones de citas NO son marketing y se
mantienen. Es apoyo tecnico, no asesoria legal: la lista se ajusta aqui cuando un abogado lo valide.
"""

from __future__ import annotations

from typing import Dict, Iterable, Optional

from fastapi import HTTPException

DEFAULT_COUNTRY = "CO"

# Claves de funcion que un perfil puede deshabilitar.
FEATURE_MARKETING = "marketing_campaigns"
FEATURE_PAYROLL = "payroll"
FEATURE_HR = "hr"

COUNTRY_PROFILES: Dict[str, dict] = {
    "CO": {
        "country": "CO",
        "label": "Colombia",
        "currency": "COP",
        "phone_country": "CO",
        "phone_prefix": "+57",
        "timezone": "America/Bogota",
        "portal_language": "es",
        "fiscal_country": "Colombia",
        "disabled_features": frozenset(),
        # Colombia: publicidad con horario (Ley 2300 de 2023) y consentimiento previo (Ley 1581).
        "messaging_consent_required": False,
    },
    "US": {
        "country": "US",
        "label": "Estados Unidos",
        "currency": "USD",
        "phone_country": "US",
        "phone_prefix": "+1",
        "timezone": "America/New_York",
        "portal_language": "en",
        "fiscal_country": "United States",
        # Hasta validar normativa estadounidense: sin campanas ni segmentos de marketing, y sin nomina/RRHH colombianos.
        "disabled_features": frozenset({FEATURE_MARKETING, FEATURE_PAYROLL, FEATURE_HR}),
        # Los textos por WhatsApp/SMS (aun transaccionales) requieren consentimiento registrado del cliente.
        "messaging_consent_required": True,
    },
}


def normalize_country(value: Optional[str]) -> str:
    code = str(value or "").strip().upper()
    return code if code in COUNTRY_PROFILES else DEFAULT_COUNTRY


def profile_for(organization: Optional[dict]) -> dict:
    return COUNTRY_PROFILES[normalize_country((organization or {}).get("operating_country"))]


def feature_enabled(organization: Optional[dict], feature: str) -> bool:
    return feature not in profile_for(organization)["disabled_features"]


def feature_blocked_detail(organization: Optional[dict], feature: str) -> dict:
    profile = profile_for(organization)
    return {
        "code": "feature_unavailable_for_country",
        "feature": feature,
        "country": profile["country"],
        "message": (
            f"Esta función aún no está disponible para organizaciones de {profile['label']}. "
            "Estamos adaptándola a la normativa local."
        ),
    }


def assert_feature_enabled(organization: Optional[dict], feature: str) -> None:
    if not feature_enabled(organization, feature):
        raise HTTPException(status_code=403, detail=feature_blocked_detail(organization, feature))


def public_profile(organization: Optional[dict]) -> dict:
    profile = profile_for(organization)
    return {**profile, "disabled_features": sorted(profile["disabled_features"])}


def organization_defaults(country: Optional[str]) -> dict:
    """Campos de la organizacion que se fijan al elegir el pais en el alta."""
    profile = COUNTRY_PROFILES[normalize_country(country)]
    return {
        "operating_country": profile["country"],
        "currency": profile["currency"],
        "timezone": profile["timezone"],
    }


def gated_current_user(get_current_user, db, feature: str):
    """Envuelve ``get_current_user``: el router completo da 403 si la organizacion del usuario no tiene la funcion."""

    async def inner(*args, **kwargs):
        user = await get_current_user(*args, **kwargs)
        organization_id = getattr(user, "organization_id", None)
        if organization_id:
            organization = await db.organizations.find_one(
                {"organization_id": organization_id}, {"_id": 0, "operating_country": 1}
            )
            assert_feature_enabled(organization, feature)
        return user

    return inner


def gated_team_resolver(resolve_team_organization, db, feature: str):
    """Igual, para el resolvedor de organizacion de equipo (cubre al owner que actua sobre otra organizacion)."""

    async def inner(user, requested_org_id=None):
        organization_id = await resolve_team_organization(user, requested_org_id)
        organization = await db.organizations.find_one(
            {"organization_id": organization_id}, {"_id": 0, "operating_country": 1}
        )
        assert_feature_enabled(organization, feature)
        return organization_id

    return inner


def disabled_summary(features: Iterable[str]) -> str:
    return ", ".join(sorted(features))
