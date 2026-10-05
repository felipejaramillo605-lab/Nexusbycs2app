import ast
from pathlib import Path


def test_staff_walkin_route_is_scoped_to_the_authenticated_professional():
    source = (Path(__file__).resolve().parents[1] / "server.py").read_text(encoding="utf-8")
    tree = ast.parse(source)
    route = next(node for node in ast.walk(tree) if isinstance(node, ast.AsyncFunctionDef) and node.name == "create_staff_walkin_appointment")
    body = ast.get_source_segment(source, route) or ""
    assert 'resolve_current_staff_barber(current_user)' in body
    assert 'organization_id, barber_id = barber["organization_id"], barber["barber_id"]' in body
    assert 'marketing_consent=False' in body
    assert '"is_registered": False' in body
    assert '"source": "staff_walkin"' in body
    assert 'create_public_appointment' in body
