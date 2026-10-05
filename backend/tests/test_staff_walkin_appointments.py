import ast
from pathlib import Path


def test_staff_walkin_route_is_scoped_to_the_authenticated_professional():
    source = (Path(__file__).resolve().parents[1] / "server.py").read_text(encoding="utf-8")
    tree = ast.parse(source)
    route = next(
        node
        for node in ast.walk(tree)
        if isinstance(node, ast.AsyncFunctionDef) and node.name == "create_staff_walkin_appointment"
    )
    body = ast.get_source_segment(source, route) or ""
    assert "resolve_current_staff_barber(current_user)" in body
    assert 'organization_id, barber_id = barber["organization_id"], barber["barber_id"]' in body
    assert "marketing_consent=False" in body
    assert '"is_registered": False' in body
    assert '"source": "staff_walkin"' in body
    assert "create_public_appointment" in body


def test_blank_email_from_the_form_is_optional_not_invalid():
    import os
    import sys

    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    for key, value in {
        "MONGO_URL": "mongodb://localhost:27017",
        "DB_NAME": "t",
        "EMERGENT_LLM_KEY": "k",
        "CORS_ORIGINS": "http://localhost:3000",
    }.items():
        os.environ.setdefault(key, value)
    import server

    base = {
        "service_id": "s",
        "client_name": "Ana",
        "client_phone": "3001234567",
        "date": "2030-01-01",
        "time": "10:00",
    }
    assert server.StaffWalkinAppointmentCreate(**base, client_email="").client_email is None
    assert server.StaffWalkinAppointmentCreate(**base, client_email="  ").client_email is None
    assert server.StaffWalkinAppointmentCreate(**base).client_email is None
    assert server.StaffWalkinAppointmentCreate(**base, client_email="a@b.co").client_email == "a@b.co"


def test_appointments_without_email_are_stored_as_text_so_listing_does_not_break():
    source = (Path(__file__).resolve().parents[1] / "server.py").read_text(encoding="utf-8")
    assert '"client_email": data.client_email or ""' in source
