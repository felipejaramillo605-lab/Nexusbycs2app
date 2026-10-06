"""Billetera de beneficios, referidos, linea etica anonima y beneficiarios (base simulada)."""

import sys
from pathlib import Path
from types import SimpleNamespace

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import hr_wellbeing as subject  # noqa: E402


class Cursor:
    def __init__(self, rows):
        self.rows = rows

    async def to_list(self, limit):
        return [dict(r) for r in self.rows[:limit]]


class Coll:
    def __init__(self, docs=()):
        self.docs = [dict(d) for d in docs]

    def _select(self, query):
        return [d for d in self.docs if all(d.get(k) == v for k, v in query.items())]

    def find(self, query, projection=None):
        return Cursor(self._select(query))

    async def find_one(self, query, projection=None):
        found = self._select(query)
        return dict(found[0]) if found else None

    async def insert_one(self, doc):
        self.docs.append(dict(doc))

    async def update_one(self, query, update):
        for doc in self._select(query):
            doc.update(update.get("$set", {}))
            return

    async def delete_one(self, query):
        found = self._select(query)
        if found:
            self.docs.remove(found[0])


USERS = {
    "boss": SimpleNamespace(user_id="u_boss", role="manager", organization_id="org_a"),
    "ana": SimpleNamespace(user_id="u_ana", role="staff", organization_id="org_a"),
    "luis": SimpleNamespace(user_id="u_luis", role="staff", organization_id="org_a"),
    "other": SimpleNamespace(user_id="u_x", role="staff", organization_id="org_b"),
}


def build():
    names = (
        "hr_benefits",
        "hr_redemptions",
        "hr_points_ledger",
        "hr_vacancies",
        "hr_referrals",
        "hr_ethics_reports",
        "hr_beneficiaries",
        "hr_secrets",
        "hr_documents",
        "payroll_novelties",
    )
    db = SimpleNamespace(
        barbers=Coll(
            [
                {"organization_id": "org_a", "barber_id": "b1", "name": "Ana", "user_id": "u_ana"},
                {"organization_id": "org_a", "barber_id": "b2", "name": "Luis", "user_id": "u_luis"},
                {"organization_id": "org_b", "barber_id": "b9", "name": "Otra", "user_id": "u_x"},
            ]
        ),
        payroll_contracts=Coll(
            [
                {
                    "organization_id": "org_a",
                    "barber_id": "b1",
                    "contract_type": "fixed_salary",
                    "base_salary": 2000000,
                },
                {"organization_id": "org_a", "barber_id": "b2", "contract_type": "service_commission"},
            ]
        ),
        **{n: Coll() for n in names},
    )

    async def get_current_user(authorization=None, session_token=None):
        user = USERS.get(authorization)
        if not user:
            raise HTTPException(status_code=401, detail="Not authenticated")
        return user

    def require_management_role(user):
        if user.role not in ("manager", "admin", "owner"):
            raise HTTPException(status_code=403, detail="Management only")

    async def resolve_team_organization(user, requested):
        return user.organization_id

    app = FastAPI()
    app.include_router(
        subject.build_wellbeing_router(db, get_current_user, require_management_role, resolve_team_organization),
        prefix="/api",
    )
    return db, TestClient(app)


def H(who):
    return {"Authorization": who}


# ---------------------------------------------------------------- billetera


def test_wallet_catalog_grants_redemptions_and_refunds():
    _, client = build()
    benefit = client.post(
        "/api/hr/benefits",
        json={"name": "Bono Sodexo", "points_cost": 100, "description": "Bono de $50.000"},
        headers=H("boss"),
    ).json()
    assert client.post("/api/hr/benefits", json={"name": "x", "points_cost": 0}, headers=H("boss")).status_code == 422
    assert client.post("/api/hr/benefits", json={"name": "Bono", "points_cost": 5}, headers=H("ana")).status_code == 403
    bid = benefit["benefit_id"]
    assert client.post(f"/api/staff/benefits/{bid}/redeem", headers=H("ana")).status_code == 409  # sin puntos
    assert client.post(
        "/api/hr/benefits/grant", json={"barber_id": "b1", "points": 250, "reason": "Meta cumplida"}, headers=H("boss")
    ).json() == {"balance": 250}
    assert (
        client.post(
            "/api/hr/benefits/grant", json={"barber_id": "b1", "points": -500, "reason": "Ajuste"}, headers=H("boss")
        ).status_code
        == 409
    )
    wallet = client.get("/api/staff/benefits", headers=H("ana")).json()
    assert wallet["balance"] == 250 and wallet["catalog"][0]["name"] == "Bono Sodexo"
    redemption = client.post(f"/api/staff/benefits/{bid}/redeem", headers=H("ana")).json()
    assert (
        redemption["status"] == "pending"
        and client.get("/api/staff/benefits", headers=H("ana")).json()["balance"] == 150
    )  # puntos retenidos
    rid = redemption["redemption_id"]
    assert (
        client.post(
            f"/api/hr/benefits/redemptions/{rid}/decide",
            json={"approve": False, "note": "Sin stock"},
            headers=H("boss"),
        ).json()["status"]
        == "rejected"
    )
    assert client.get("/api/staff/benefits", headers=H("ana")).json()["balance"] == 250  # devueltos
    assert (
        client.post(f"/api/hr/benefits/redemptions/{rid}/decide", json={"approve": True}, headers=H("boss")).status_code
        == 409
    )
    second = client.post(f"/api/staff/benefits/{bid}/redeem", headers=H("ana")).json()
    assert (
        client.post(
            f"/api/hr/benefits/redemptions/{second['redemption_id']}/decide", json={"approve": True}, headers=H("boss")
        ).json()["status"]
        == "approved"
    )
    overview = client.get("/api/hr/benefits", headers=H("boss")).json()
    assert {b["name"]: b["balance"] for b in overview["balances"]} == {"Ana": 150, "Luis": 0}
    assert client.delete(f"/api/hr/benefits/{bid}", headers=H("boss")).json() == {"archived": True}
    assert client.get("/api/staff/benefits", headers=H("ana")).json()["catalog"] == []  # archivado: ya no se ofrece


# ---------------------------------------------------------------- referidos


def vacancy(client, **extra):
    body = {"title": "Barbero senior", "reward_type": "amount", "reward_value": 500000, **extra}
    response = client.post("/api/hr/vacancies", json=body, headers=H("boss"))
    assert response.status_code == 200, response.text
    return response.json()


def refer(client, vacancy_id, who="ana", name="Camila Torres"):
    response = client.post(
        "/api/staff/referrals",
        json={"vacancy_id": vacancy_id, "candidate_name": name, "candidate_contact": "3001112233"},
        headers=H(who),
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_vacancy_validation_and_only_open_vacancies_accept_referrals():
    _, client = build()
    assert (
        client.post(
            "/api/hr/vacancies", json={"title": "Barbero", "reward_type": "text"}, headers=H("boss")
        ).status_code
        == 400
    )
    assert (
        client.post(
            "/api/hr/vacancies",
            json={"title": "Barbero", "reward_type": "amount", "reward_value": 0},
            headers=H("boss"),
        ).status_code
        == 400
    )
    v = vacancy(client)
    assert client.get("/api/staff/referrals", headers=H("ana")).json()["vacancies"][0]["title"] == "Barbero senior"
    client.post(f"/api/hr/vacancies/{v['vacancy_id']}/toggle", headers=H("boss"))
    assert (
        client.post(
            "/api/staff/referrals",
            json={"vacancy_id": v["vacancy_id"], "candidate_name": "Camila", "candidate_contact": "3001112233"},
            headers=H("ana"),
        ).status_code
        == 404
    )


def test_referral_tracking_and_amount_reward_goes_to_payroll_as_a_non_salary_bonus():
    db, client = build()
    v = vacancy(client)
    referral = refer(client, v["vacancy_id"])
    assert client.get("/api/staff/referrals", headers=H("luis")).json()["items"] == []  # solo ve los suyos
    rid = referral["referral_id"]
    assert (
        client.post(f"/api/hr/referrals/{rid}/stage", json={"stage": "interview"}, headers=H("ana")).status_code == 403
    )
    client.post(
        f"/api/hr/referrals/{rid}/stage", json={"stage": "interview", "note": "Cita el lunes"}, headers=H("boss")
    )
    mine = client.get("/api/staff/referrals", headers=H("ana")).json()["items"][0]
    assert mine["stage_label"] == "En entrevista" and len(mine["history"]) == 2
    hired = client.post(f"/api/hr/referrals/{rid}/stage", json={"stage": "hired"}, headers=H("boss")).json()
    assert hired["reward_status"] == "added_to_payroll" and "no constitutivo de salario" in hired["reward_detail"]
    novelty = db.payroll_novelties.docs[0]
    assert (
        novelty["type"] == "bonus"
        and novelty["constitutes_salary"] is False
        and novelty["amount"] == 500000
        and novelty["status"] == "approved"
    )
    assert (
        client.post(f"/api/hr/referrals/{rid}/stage", json={"stage": "rejected"}, headers=H("boss")).status_code == 409
    )


def test_other_reward_types_points_manual_payment_and_in_kind():
    db, client = build()
    points = vacancy(client, title="Cajero", reward_type="points", reward_value=300)
    r1 = refer(client, points["vacancy_id"], name="Pedro Gómez")
    assert (
        client.post(f"/api/hr/referrals/{r1['referral_id']}/stage", json={"stage": "hired"}, headers=H("boss")).json()[
            "reward_status"
        ]
        == "granted_points"
    )
    assert client.get("/api/staff/benefits", headers=H("ana")).json()["balance"] == 300
    manual = vacancy(client, title="Auxiliar")
    r2 = refer(client, manual["vacancy_id"], who="luis", name="Laura Ríos")  # Luis tiene contrato por servicio
    assert (
        client.post(f"/api/hr/referrals/{r2['referral_id']}/stage", json={"stage": "hired"}, headers=H("boss")).json()[
            "reward_status"
        ]
        == "pending_manual"
    )
    kind = vacancy(client, title="Recepción", reward_type="text", reward_text="Medio día libre")
    r3 = refer(client, kind["vacancy_id"], name="Sara Peña")
    done = client.post(
        f"/api/hr/referrals/{r3['referral_id']}/stage", json={"stage": "hired"}, headers=H("boss")
    ).json()
    assert done["reward_status"] == "to_deliver" and done["reward_detail"] == "Medio día libre"
    assert len(db.payroll_novelties.docs) == 0


# ---------------------------------------------------------------- linea etica


def test_anonymous_report_stores_no_identity_encrypts_the_text_and_can_be_tracked_by_code():
    db, client = build()
    sent = client.post(
        "/api/staff/ethics/reports",
        json={"category": "harassment", "message": "Mi jefe inmediato me grita frente al equipo.", "anonymous": True},
        headers=H("ana"),
    ).json()
    assert sent["anonymous"] is True and len(sent["tracking_code"]) == 10
    stored = db.hr_ethics_reports.docs[0]
    assert (
        stored["barber_id"] is None and stored["reporter_name"] is None and len(stored["created_at"]) == 10
    )  # solo el dia
    assert "grita" not in stored["message"] and stored["message"].startswith("gAAAA")  # cifrado en reposo
    inbox = client.get("/api/hr/ethics", headers=H("boss")).json()["items"]
    assert (
        inbox[0]["message"] == "Mi jefe inmediato me grita frente al equipo."
        and inbox[0]["anonymous"] is True
        and inbox[0]["reporter_name"] is None
    )
    assert client.get("/api/hr/ethics", headers=H("ana")).status_code == 403
    rid = inbox[0]["report_id"]
    client.post(
        f"/api/hr/ethics/{rid}/respond",
        json={"message": "Gracias, lo estamos revisando.", "status": "in_review"},
        headers=H("boss"),
    )
    status = client.get(f"/api/staff/ethics/reports/{sent['tracking_code'].lower()}", headers=H("luis")).json()
    assert (
        status["status_label"] == "En revisión"
        and status["replies"][0]["message"].startswith("Gracias")
        and "message" not in status
    )
    assert (
        client.get(f"/api/staff/ethics/reports/{sent['tracking_code']}", headers=H("other")).status_code == 404
    )  # otra organizacion
    assert client.get("/api/staff/ethics/reports/NOEXISTE00", headers=H("ana")).status_code == 404


def test_non_anonymous_reports_show_the_name_and_can_be_escalated():
    _, client = build()
    assert (
        client.post(
            "/api/staff/ethics/reports",
            json={"category": "other", "message": "corto", "anonymous": True},
            headers=H("ana"),
        ).status_code
        == 422
    )
    client.post(
        "/api/staff/ethics/reports",
        json={"category": "safety_risk", "message": "El extintor de la bodega está vencido.", "anonymous": False},
        headers=H("luis"),
    )
    item = client.get("/api/hr/ethics", headers=H("boss")).json()["items"][0]
    assert item["reporter_name"] == "Luis" and item["category_label"] == "Riesgo o seguridad"
    escalated = client.post(
        f"/api/hr/ethics/{item['report_id']}/escalate",
        json={"to": "convivencia", "note": "Revisar con el comité"},
        headers=H("boss"),
    ).json()
    assert (
        escalated["status"] == "escalated"
        and escalated["escalations"][0]["to_label"] == "Comité de Convivencia Laboral"
    )
    assert client.post("/api/hr/ethics/nada/escalate", json={"to": "hr"}, headers=H("boss")).status_code == 404


def test_encryption_helpers_round_trip_and_depend_on_the_secret():
    a, b = subject.fernet_from_secret("uno"), subject.fernet_from_secret("dos")
    token = subject.encrypt(a, "texto reservado")
    assert subject.decrypt(a, token) == "texto reservado" and token != "texto reservado"
    try:
        subject.decrypt(b, token)
        raise AssertionError("otra clave no debe descifrar")
    except Exception as error:  # InvalidToken
        assert error.__class__.__name__ == "InvalidToken"


# ---------------------------------------------------------------- beneficiarios


def test_beneficiaries_are_private_to_the_employee_and_visible_to_the_manager():
    _, client = build()
    body = {
        "full_name": "Sofía Pérez",
        "relationship": "child",
        "document_type": "RC",
        "document_number": "1099887766",
        "birth_date": "2018-05-04",
    }
    created = client.post("/api/staff/beneficiaries", json=body, headers=H("ana"))
    assert created.status_code == 200 and created.json()["relationship_label"] == "Hijo(a)"
    assert (
        client.post("/api/staff/beneficiaries", json={**body, "birth_date": "ayer"}, headers=H("ana")).status_code
        == 400
    )
    assert (
        client.post("/api/staff/beneficiaries", json={**body, "document_id": "doc_ajeno"}, headers=H("ana")).status_code
        == 404
    )
    assert client.get("/api/staff/beneficiaries", headers=H("luis")).json()["items"] == []
    manager = client.get("/api/hr/beneficiaries", headers=H("boss")).json()["items"]
    assert manager[0]["employee_name"] == "Ana" and manager[0]["full_name"] == "Sofía Pérez"
    assert client.get("/api/hr/beneficiaries", headers=H("ana")).status_code == 403
    bid = created.json()["beneficiary_id"]
    assert client.delete(f"/api/staff/beneficiaries/{bid}", headers=H("luis")).status_code == 404
    assert client.delete(f"/api/staff/beneficiaries/{bid}", headers=H("ana")).json() == {"deleted": True}
