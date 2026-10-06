"""Motor de calculo de nomina para Colombia (empleado dependiente, contrato fijo).

IMPORTANTE: es una herramienta de apoyo para estimar y organizar los costos de personal. NO reemplaza un software
de nomina ni la nomina electronica ante la DIAN, ni la liquidacion de PILA, ni la asesoria de un contador. Los
parametros legales (salario minimo, auxilio de transporte) son valores por defecto editables: verifica el decreto.

Reglas aplicadas (Codigo Sustantivo del Trabajo y normas de seguridad social):
- Auxilio de transporte: solo si el salario basico es de hasta 2 SMMLV; cuenta para prima y cesantias, no para aportes
  ni vacaciones.
- IBC (base de aportes) = salario + pagos que constituyen salario; piso 1 SMMLV (proporcional a los dias), tope 25
  SMMLV. Los pagos que NO constituyen salario y superen el 40% del total devengado se suman al IBC (art. 30 Ley
  1393/2010).
- Deducciones del empleado: salud 4%, pension 4%, fondo de solidaridad pensional desde 4 SMMLV (1% a 2% segun tramo).
- Aportes del empleador: salud 8,5%, pension 12%, ARL segun clase de riesgo, caja de compensacion 4%, SENA 2% e
  ICBF 3%. Salud, SENA e ICBF no se pagan si el empleador esta exonerado (art. 114-1 E.T.) y el trabajador gana
  menos de 10 SMMLV.
- Provisiones (costo para el empleador, no se pagan en la colilla): cesantias 8,33%, intereses a las cesantias 12%
  de las cesantias, prima de servicios 8,33% y vacaciones 4,17% (15 dias habiles por ano, sin auxilio de transporte).
- Los aportes de seguridad social se aproximan al multiplo de 100 superior, como en la PILA.
"""

from __future__ import annotations

import math
from typing import Dict, List, Optional

# Valores por defecto por ano. Se pueden sobrescribir por organizacion (payroll_settings.params_overrides).
DEFAULT_PARAMS: Dict[int, Dict[str, float]] = {
    2025: {"smmlv": 1_423_500, "transport_aid": 200_000},
    2026: {"smmlv": 1_750_905, "transport_aid": 249_095},
}
LATEST_YEAR = max(DEFAULT_PARAMS)

ARL_RATES = {"I": 0.522, "II": 1.044, "III": 2.436, "IV": 4.350, "V": 6.960}
RISK_CLASS_LABELS = {
    "I": "Riesgo I (mínimo, administrativo)",
    "II": "Riesgo II (bajo)",
    "III": "Riesgo III (medio)",
    "IV": "Riesgo IV (alto)",
    "V": "Riesgo V (máximo)",
}

EMPLOYEE_HEALTH = 4.0
EMPLOYEE_PENSION = 4.0
EMPLOYER_HEALTH = 8.5
EMPLOYER_PENSION = 12.0
EMPLOYER_CCF = 4.0
EMPLOYER_SENA = 2.0
EMPLOYER_ICBF = 3.0
CESANTIAS_PCT = 100 / 12  # 8,33 %
CESANTIAS_INTEREST_PCT = 12.0  # sobre las cesantias
PRIMA_PCT = 100 / 12  # 8,33 %
VACATION_PCT = 15 / 360 * 100  # 4,17 %
TRANSPORT_AID_LIMIT_SMMLV = 2
EXONERATION_LIMIT_SMMLV = 10
IBC_MIN_SMMLV = 1
IBC_MAX_SMMLV = 25
NON_SALARY_LIMIT = 0.40
PERIOD_DAYS = {"monthly": 30, "biweekly": 15}

# Fondo de solidaridad pensional: (desde SMMLV, porcentaje)
FSP_BANDS = [(4, 1.0), (16, 1.2), (17, 1.4), (18, 1.6), (19, 1.8), (20, 2.0)]

DISCLAIMER = (
    "Documento informativo generado por Nexus. No reemplaza un software de nómina ni la asesoría de un contador, y "
    "esta app no sirve como soporte de nómina electrónica, facturas electrónicas ni para la UGPP. "
    "Verifica los parámetros legales vigentes."
)


def params_for(year: int, overrides: Optional[dict] = None) -> dict:
    base = DEFAULT_PARAMS.get(year) or DEFAULT_PARAMS[LATEST_YEAR]
    custom = (overrides or {}).get(str(year)) or {}
    return {
        "year": year,
        "smmlv": float(custom.get("smmlv") or base["smmlv"]),
        "transport_aid": float(custom.get("transport_aid") or base["transport_aid"]),
        "is_default": not custom,
        "known_year": year in DEFAULT_PARAMS,
    }


def round100_up(value: float) -> float:
    return float(math.ceil(round(value, 6) / 100.0) * 100)


def money(value: float) -> float:
    return round(float(value), 2)


def fsp_percent(ibc: float, smmlv: float) -> float:
    ratio = ibc / smmlv if smmlv else 0
    percent = 0.0
    for threshold, pct in FSP_BANDS:
        if ratio >= threshold:
            percent = pct
    return percent


def extra_amount(extra: dict, base_salary: float, factor: float) -> float:
    """Valor del auxilio extra para el periodo: monto fijo mensual o porcentaje del basico, proporcional a los dias."""
    value = float(extra.get("value") or 0)
    monthly = base_salary * value / 100.0 if extra.get("kind") == "percent" else value
    return monthly * factor


def validate_contract(base_salary: float, smmlv: float) -> None:
    if base_salary < smmlv - 0.5:
        raise ValueError(f"El salario básico no puede ser menor al salario mínimo (${smmlv:,.0f}).")


def compute_line(
    *,
    base_salary: float,
    frequency: str,
    risk_class: str,
    params: dict,
    days_worked: Optional[float] = None,
    extras: Optional[List[dict]] = None,
    adjustments: Optional[List[dict]] = None,
    exonerated: bool = True,
) -> dict:
    """Calcula una linea de nomina (un trabajador, un periodo). Devuelve todos los rubros desglosados."""
    smmlv = params["smmlv"]
    period_days = PERIOD_DAYS.get(frequency, 30)
    days = float(period_days if days_worked is None else days_worked)
    if days < 0 or days > period_days:
        raise ValueError(f"Los días trabajados deben estar entre 0 y {period_days}.")
    factor = days / 30.0  # el periodo se prorratea sobre el mes comercial de 30 dias
    risk = risk_class if risk_class in ARL_RATES else "I"

    salary = base_salary * factor
    transport_eligible = base_salary <= TRANSPORT_AID_LIMIT_SMMLV * smmlv + 0.5
    transport = params["transport_aid"] * factor if transport_eligible else 0.0

    earnings: List[dict] = [{"code": "salary", "label": "Salario básico", "amount": money(salary), "salary": True}]
    if transport_eligible:
        earnings.append(
            {"code": "transport_aid", "label": "Auxilio de transporte", "amount": money(transport), "salary": False}
        )
    salary_extras = nonsalary_extras = 0.0
    for extra in extras or []:
        amount = money(extra_amount(extra, base_salary, factor))
        if amount <= 0:
            continue
        constitutive = bool(extra.get("constitutes_salary"))
        earnings.append(
            {
                "code": f"extra:{extra.get('extra_id', extra.get('name'))}",
                "label": extra["name"],
                "amount": amount,
                "salary": constitutive,
            }
        )
        if constitutive:
            salary_extras += amount
        else:
            nonsalary_extras += amount

    manual_salary = manual_nonsalary = manual_deductions = 0.0
    deduction_rows: List[dict] = []
    for adj in adjustments or []:
        amount = money(abs(float(adj.get("amount") or 0)))
        if amount <= 0:
            continue
        if adj.get("kind") == "deduction":
            manual_deductions += amount
            deduction_rows.append({"code": "adjustment", "label": adj.get("label") or "Descuento", "amount": amount})
        else:
            constitutive = bool(adj.get("constitutes_salary"))
            earnings.append(
                {"code": "adjustment", "label": adj.get("label") or "Novedad", "amount": amount, "salary": constitutive}
            )
            if constitutive:
                manual_salary += amount
            else:
                manual_nonsalary += amount

    salary_pay = salary + salary_extras + manual_salary
    nonsalary_pay = nonsalary_extras + manual_nonsalary
    total_pay = salary_pay + nonsalary_pay  # sin auxilio de transporte
    excess_non_salary = max(0.0, nonsalary_pay - NON_SALARY_LIMIT * total_pay) if total_pay else 0.0

    ibc_floor = IBC_MIN_SMMLV * smmlv * factor
    ibc_cap = IBC_MAX_SMMLV * smmlv * factor
    ibc = min(max(salary_pay + excess_non_salary, ibc_floor if days > 0 else 0.0), ibc_cap)
    monthly_ibc_equivalent = ibc / factor if factor else ibc

    health_emp = round100_up(ibc * EMPLOYEE_HEALTH / 100)
    pension_emp = round100_up(ibc * EMPLOYEE_PENSION / 100)
    fsp_pct = fsp_percent(monthly_ibc_equivalent, smmlv)
    fsp = round100_up(ibc * fsp_pct / 100) if fsp_pct else 0.0
    employee_deductions = [
        {"code": "health", "label": "Salud (4%)", "amount": health_emp},
        {"code": "pension", "label": "Pensión (4%)", "amount": pension_emp},
    ]
    if fsp:
        employee_deductions.append(
            {"code": "fsp", "label": f"Fondo de solidaridad pensional ({fsp_pct:g}%)", "amount": fsp}
        )
    employee_deductions.extend(deduction_rows)

    exempt = bool(exonerated) and monthly_ibc_equivalent < EXONERATION_LIMIT_SMMLV * smmlv
    employer_contributions = [
        {
            "code": "health",
            "label": "Salud (8,5%)" + (" — exonerado" if exempt else ""),
            "amount": 0.0 if exempt else round100_up(ibc * EMPLOYER_HEALTH / 100),
        },
        {"code": "pension", "label": "Pensión (12%)", "amount": round100_up(ibc * EMPLOYER_PENSION / 100)},
        {
            "code": "arl",
            "label": f"ARL clase {risk} ({ARL_RATES[risk]:g}%)".replace(".", ","),
            "amount": round100_up(ibc * ARL_RATES[risk] / 100),
        },
        {"code": "ccf", "label": "Caja de compensación (4%)", "amount": round100_up(ibc * EMPLOYER_CCF / 100)},
        {
            "code": "sena",
            "label": "SENA (2%)" + (" — exonerado" if exempt else ""),
            "amount": 0.0 if exempt else round100_up(ibc * EMPLOYER_SENA / 100),
        },
        {
            "code": "icbf",
            "label": "ICBF (3%)" + (" — exonerado" if exempt else ""),
            "amount": 0.0 if exempt else round100_up(ibc * EMPLOYER_ICBF / 100),
        },
    ]

    benefits_base = salary_pay + transport  # base de prima y cesantias
    vacation_base = salary_pay  # vacaciones: sin auxilio de transporte
    cesantias = money(benefits_base * CESANTIAS_PCT / 100)
    provisions = [
        {"code": "cesantias", "label": "Cesantías (8,33%)", "amount": cesantias},
        {
            "code": "cesantias_interest",
            "label": "Intereses a las cesantías (12%)",
            "amount": money(cesantias * CESANTIAS_INTEREST_PCT / 100),
        },
        {"code": "prima", "label": "Prima de servicios (8,33%)", "amount": money(benefits_base * PRIMA_PCT / 100)},
        {"code": "vacations", "label": "Vacaciones (4,17%)", "amount": money(vacation_base * VACATION_PCT / 100)},
    ]

    gross = money(sum(e["amount"] for e in earnings))
    deductions_total = money(sum(d["amount"] for d in employee_deductions))
    employer_total = money(sum(c["amount"] for c in employer_contributions))
    provisions_total = money(sum(p["amount"] for p in provisions))
    net = money(gross - deductions_total)
    notes = []
    if not transport_eligible:
        notes.append("El salario supera 2 SMMLV: no aplica auxilio de transporte.")
    if exempt:
        notes.append("Empleador exonerado de salud, SENA e ICBF (art. 114-1 E.T.) por salario menor a 10 SMMLV.")
    if excess_non_salary:
        notes.append(
            "Los pagos que no constituyen salario superan el 40% del total: el exceso se sumó al IBC (Ley 1393/2010)."
        )
    if ibc == ibc_floor and ibc_floor and salary_pay + excess_non_salary < ibc_floor:
        notes.append("El IBC se ajustó al piso de 1 SMMLV proporcional a los días.")

    return {
        "frequency": frequency,
        "period_days": period_days,
        "days_worked": days,
        "base_salary": money(base_salary),
        "risk_class": risk,
        "earnings": earnings,
        "gross": gross,
        "ibc": money(ibc),
        "employee_deductions": employee_deductions,
        "deductions_total": deductions_total,
        "net_pay": net,
        "employer_contributions": employer_contributions,
        "employer_total": employer_total,
        "provisions": provisions,
        "provisions_total": provisions_total,
        "employer_cost": money(gross + employer_total + provisions_total),
        "transport_eligible": transport_eligible,
        "notes": notes,
    }
