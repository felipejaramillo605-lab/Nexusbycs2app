"""Perfiles de pais: Colombia conserva todo; Estados Unidos oculta nomina, RRHH y campanas."""

import sys
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import country_profiles as subject  # noqa: E402


class Coll:
    def __init__(self, docs):
        self.docs = docs

    async def find_one(self, query, projection=None):
        for doc in self.docs:
            if all(doc.get(k) == v for k, v in query.items()):
                return dict(doc)
        return None


def make_db():
    return SimpleNamespace(
        organizations=Coll(
            [
                {"organization_id": "org_co", "operating_country": "CO"},
                {"organization_id": "org_us", "operating_country": "US"},
                {"organization_id": "org_old"},  # alta anterior a este cambio: sin campo
            ]
        )
    )


def test_missing_or_unknown_country_falls_back_to_colombia():
    assert subject.profile_for({})["country"] == "CO"
    assert subject.profile_for({"operating_country": "us"})["country"] == "US"
    assert subject.profile_for({"operating_country": "FR"})["country"] == "CO"
    assert subject.profile_for(None)["currency"] == "COP"


def test_us_profile_sets_dollars_phone_prefix_timezone_and_english_portal():
    us = subject.COUNTRY_PROFILES["US"]
    assert (us["currency"], us["phone_prefix"], us["phone_country"]) == ("USD", "+1", "US")
    assert us["timezone"] == "America/New_York" and us["portal_language"] == "en"
    assert us["messaging_consent_required"] is True
    co = subject.COUNTRY_PROFILES["CO"]
    assert (co["currency"], co["phone_prefix"], co["portal_language"]) == ("COP", "+57", "es")


def test_colombia_keeps_every_feature_and_us_hides_payroll_hr_and_marketing():
    for feature in (subject.FEATURE_MARKETING, subject.FEATURE_PAYROLL, subject.FEATURE_HR):
        assert subject.feature_enabled({"operating_country": "CO"}, feature)
        assert subject.feature_enabled({}, feature)
        assert not subject.feature_enabled({"operating_country": "US"}, feature)


def test_organization_defaults_fix_currency_and_timezone_from_the_country():
    assert subject.organization_defaults("US") == {
        "operating_country": "US",
        "currency": "USD",
        "timezone": "America/New_York",
    }
    assert subject.organization_defaults("nonsense")["operating_country"] == "CO"


def test_blocked_detail_names_the_country_and_is_stable_for_the_frontend():
    detail = subject.feature_blocked_detail({"operating_country": "US"}, subject.FEATURE_PAYROLL)
    assert detail["code"] == "feature_unavailable_for_country"
    assert detail["feature"] == "payroll" and detail["country"] == "US"
    with pytest.raises(HTTPException) as caught:
        subject.assert_feature_enabled({"operating_country": "US"}, subject.FEATURE_HR)
    assert caught.value.status_code == 403


@pytest.mark.asyncio
async def test_gated_current_user_blocks_users_of_us_organizations_only():
    db = make_db()

    async def get_current_user(*args, **kwargs):
        return SimpleNamespace(organization_id=kwargs["org"])

    guard = subject.gated_current_user(get_current_user, db, subject.FEATURE_PAYROLL)
    assert (await guard(org="org_co")).organization_id == "org_co"
    assert (await guard(org="org_old")).organization_id == "org_old"
    assert (await guard(org=None)).organization_id is None  # owner global sin organizacion
    with pytest.raises(HTTPException) as caught:
        await guard(org="org_us")
    assert caught.value.status_code == 403 and caught.value.detail["country"] == "US"


@pytest.mark.asyncio
async def test_gated_team_resolver_blocks_owner_acting_on_a_us_organization():
    db = make_db()

    async def resolve(user, requested):
        return requested

    guard = subject.gated_team_resolver(resolve, db, subject.FEATURE_MARKETING)
    assert await guard(None, "org_co") == "org_co"
    with pytest.raises(HTTPException):
        await guard(None, "org_us")
