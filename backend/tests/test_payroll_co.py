"""Motor de nomina colombiana: reglas y redondeos."""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import payroll_co as subject  # noqa: E402

P = subject.params_for(2026)
SMMLV = P["smmlv"]


def line(base, **kwargs):
    kwargs.setdefault("frequency", "monthly")
    kwargs.setdefault("risk_class", "I")
    return subject.compute_line(base_salary=base, params=P, **kwargs)


def amounts(rows):
    return {r["code"]: r["amount"] for r in rows}


def test_minimum_wage_gets_transport_aid_and_the_exact_legal_breakdown():
    result = line(SMMLV)
    assert result["gross"] == 2_000_000  # SMMLV + auxilio de transporte
    assert result["ibc"] == SMMLV  # el auxilio de transporte no hace parte del IBC
    assert amounts(result["employee_deductions"]) == {"health": 70_100, "pension": 70_100}
    assert result["net_pay"] == 1_859_800
    employer = amounts(result["employer_contributions"])
    assert employer == {"health": 0, "pension": 210_200, "arl": 9_200, "ccf": 70_100, "sena": 0, "icbf": 0}
    provisions = amounts(result["provisions"])
    assert provisions["cesantias"] == pytest.approx(166_666.67, abs=0.01)
    assert provisions["cesantias_interest"] == pytest.approx(20_000, abs=0.01)
    assert provisions["prima"] == pytest.approx(166_666.67, abs=0.01)
    assert provisions["vacations"] == pytest.approx(72_954.38, abs=0.02)  # sin auxilio de transporte
    assert result["employer_cost"] == pytest.approx(
        result["gross"] + result["employer_total"] + result["provisions_total"], abs=0.01
    )


def test_transport_aid_stops_above_two_minimum_wages():
    assert line(2 * SMMLV)["transport_eligible"] is True
    above = line(2 * SMMLV + 1000)
    assert above["transport_eligible"] is False
    assert "transport_aid" not in amounts(above["earnings"])
    assert any("2 SMMLV" in note for note in above["notes"])


def test_solidarity_fund_starts_at_four_minimum_wages():
    assert "fsp" not in amounts(line(3.9 * SMMLV)["employee_deductions"])
    four = amounts(line(4 * SMMLV)["employee_deductions"])
    assert four["fsp"] == subject.round100_up(4 * SMMLV * 0.01)
    assert subject.fsp_percent(20.5 * SMMLV, SMMLV) == 2.0


def test_exoneration_ends_at_ten_minimum_wages_and_can_be_turned_off():
    assert amounts(line(9 * SMMLV)["employer_contributions"])["health"] == 0
    full = amounts(line(11 * SMMLV)["employer_contributions"])
    assert full["health"] > 0 and full["sena"] > 0 and full["icbf"] > 0
    not_exonerated = amounts(line(SMMLV, exonerated=False)["employer_contributions"])
    assert not_exonerated["health"] == subject.round100_up(SMMLV * 0.085)


def test_arl_rate_follows_the_risk_class():
    assert amounts(line(SMMLV, risk_class="V")["employer_contributions"])["arl"] == subject.round100_up(SMMLV * 0.0696)
    assert amounts(line(SMMLV, risk_class="??")["employer_contributions"])["arl"] == 9_200  # clase I por defecto


def test_extras_fixed_or_percent_and_salary_nature_changes_the_contribution_base():
    fixed = {
        "extra_id": "x1",
        "name": "Auxilio de internet",
        "kind": "fixed",
        "value": 50_000,
        "constitutes_salary": False,
    }
    percent = {"extra_id": "x2", "name": "Rodamiento", "kind": "percent", "value": 10, "constitutes_salary": False}
    result = line(SMMLV, extras=[fixed, percent])
    got = amounts(result["earnings"])
    assert got["extra:x1"] == 50_000 and got["extra:x2"] == pytest.approx(SMMLV * 0.10, abs=0.01)
    assert result["ibc"] == SMMLV  # no constituye salario y no pasa del 40%
    salary_extra = dict(fixed, constitutes_salary=True)
    assert line(SMMLV, extras=[salary_extra])["ibc"] == SMMLV + 50_000


def test_non_salary_payments_above_forty_percent_are_added_to_the_ibc():
    big = {"extra_id": "b", "name": "Bono", "kind": "fixed", "value": 3_000_000, "constitutes_salary": False}
    result = line(SMMLV, extras=[big])
    expected_excess = 3_000_000 - 0.4 * (SMMLV + 3_000_000)
    assert result["ibc"] == pytest.approx(SMMLV + expected_excess, abs=0.01)
    assert any("40%" in note for note in result["notes"])


def test_partial_period_is_prorated_over_thirty_days_and_biweekly_pays_half():
    twenty = line(SMMLV, days_worked=20)
    assert amounts(twenty["earnings"])["salary"] == pytest.approx(SMMLV * 20 / 30, abs=0.01)
    assert amounts(twenty["earnings"])["transport_aid"] == pytest.approx(P["transport_aid"] * 20 / 30, abs=0.01)
    half = line(SMMLV, frequency="biweekly")
    assert half["period_days"] == 15 and half["gross"] == pytest.approx(1_000_000, abs=0.01)
    with pytest.raises(ValueError):
        line(SMMLV, days_worked=31)


def test_manual_adjustments_add_earnings_or_deductions():
    result = line(
        SMMLV,
        adjustments=[
            {"label": "Horas extra", "amount": 100_000, "kind": "earning", "constitutes_salary": True},
            {"label": "Préstamo", "amount": 50_000, "kind": "deduction"},
        ],
    )
    assert amounts(result["earnings"])["adjustment"] == 100_000
    assert result["ibc"] == SMMLV + 100_000
    assert result["employee_deductions"][-1] == {"code": "adjustment", "label": "Préstamo", "amount": 50_000}
    assert result["net_pay"] == pytest.approx(result["gross"] - result["deductions_total"], abs=0.01)


def test_salary_below_the_minimum_is_rejected_and_unknown_years_use_the_latest_default():
    with pytest.raises(ValueError):
        subject.validate_contract(SMMLV - 1000, SMMLV)
    subject.validate_contract(SMMLV, SMMLV)
    assert subject.params_for(2031)["smmlv"] == SMMLV and subject.params_for(2031)["known_year"] is False
    assert subject.params_for(2026, {"2026": {"smmlv": 2_000_000}})["smmlv"] == 2_000_000
