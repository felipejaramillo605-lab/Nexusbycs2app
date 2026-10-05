import ast
from pathlib import Path


SERVER = Path(__file__).resolve().parents[1] / "server.py"
NEXUS_AI = Path(__file__).resolve().parents[1] / "nexus_ai.py"


def test_business_type_contract_includes_new_verticals_and_rejects_unknown_values():
    source = SERVER.read_text(encoding="utf-8")
    tree = ast.parse(source)
    names = {node.targets[0].id: node.value for node in tree.body if isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Name)}
    keys = ast.literal_eval(names["BUSINESS_TYPE_KEYS"].args[0])
    assert {"pet_grooming", "wellness_spa", "pilates_studio", "health_clinic", "professional_services"} <= keys
    route = next(node for node in ast.walk(tree) if isinstance(node, ast.AsyncFunctionDef) and node.name == "update_organization_profile")
    route_source = ast.get_source_segment(source, route) or ""
    assert "business_type is not allowed" in route_source
    invalid_type_rejections = [
        node for node in ast.walk(route)
        if isinstance(node, ast.Raise)
        and isinstance(node.exc, ast.Call)
        and isinstance(node.exc.func, ast.Name)
        and node.exc.func.id == "HTTPException"
        and any(
            keyword.arg == "status_code"
            and isinstance(keyword.value, ast.Constant)
            and keyword.value.value == 422
            for keyword in node.exc.keywords
        )
    ]
    assert invalid_type_rejections, "Unknown business_type must return HTTP 422"


def test_nexus_ai_has_labels_for_each_new_business_type():
    tree = ast.parse(NEXUS_AI.read_text(encoding="utf-8"))
    labels = next(
        ast.literal_eval(node.value)
        for node in tree.body
        if isinstance(node, ast.Assign)
        and isinstance(node.targets[0], ast.Name)
        and node.targets[0].id == "VERTICAL_LABELS"
    )
    assert {"pet_grooming", "wellness_spa", "pilates_studio", "health_clinic", "professional_services"} <= set(labels)
