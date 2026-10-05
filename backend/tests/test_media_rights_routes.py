"""Las seis rutas de subida de imagenes exigen la declaracion de derechos de uso (sin red, base simulada)."""

import sys
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import media_rights  # noqa: E402
import organization_background_media  # noqa: E402
import organization_media  # noqa: E402
import product_catalog  # noqa: E402
import professional_media  # noqa: E402
import service_media  # noqa: E402

ORG = {"organization_id": "org_a", "name": "Org A"}
SERVICE = {"organization_id": "org_a", "service_id": "s1", "photos": []}
PRODUCT = {"organization_id": "org_a", "product_id": "p1", "photos": [], "active": True}
BARBER = {"organization_id": "org_a", "barber_id": "b1", "user_id": "u_staff", "active": True}


class Coll:
    """Coleccion minima: devuelve siempre el mismo documento y acepta escrituras sin efecto."""

    def __init__(self, doc=None):
        self.doc = doc

    async def find_one(self, query, projection=None):
        return dict(self.doc) if self.doc else None

    async def update_one(self, *args, **kwargs):
        return SimpleNamespace(matched_count=1, modified_count=1)

    async def insert_one(self, doc):
        return None


class Users(Coll):
    def __init__(self):
        super().__init__()
        self.declared = set()

    async def find_one(self, query, projection=None):
        user_id = query["user_id"]
        return {
            "user_id": user_id,
            "media_rights_version": media_rights.MEDIA_RIGHTS_VERSION if user_id in self.declared else None,
        }


def build_db():
    return SimpleNamespace(
        users=Users(),
        organizations=Coll(ORG),
        services=Coll(SERVICE),
        catalog_products=Coll(PRODUCT),
        barbers=Coll(BARBER),
        media_blobs=Coll(),
    )


def build_app(db, role):
    async def current_user(*_):
        return SimpleNamespace(
            user_id="u_staff" if role == "staff" else "u_manager", role=role, organization_id="org_a"
        )

    async def resolve(user, requested):
        return "org_a"

    async def noop(*args, **kwargs):
        return None

    def require_management(user):
        if user.role == "staff":
            raise AssertionError("management route reached by staff")

    app = FastAPI()
    for router in (
        organization_media.build_organization_media_router(db, current_user, require_management, resolve),
        organization_background_media.build_organization_background_media_router(
            db, current_user, require_management, resolve
        ),
        product_catalog.build_product_catalog_router(db, current_user, require_management, resolve),
        service_media.build_service_media_router(db, current_user, require_management, resolve),
        professional_media.build_professional_media_router(db, current_user, require_management, resolve, noop, noop),
    ):
        app.include_router(router)
    return TestClient(app, raise_server_exceptions=False)


# (descripcion, rol, metodo, ruta, hay archivo)
ROUTES = [
    ("logo del negocio", "manager", "/organizations/org_a/logo", True),
    ("fondo del portal", "manager", "/organizations/org_a/portal-background", True),
    ("foto de producto (archivo)", "manager", "/catalog/products/p1/photos", True),
    ("foto de producto (URL)", "manager", "/catalog/products/p1/photos/url?url=https://example.com/a.jpg", False),
    ("foto de servicio", "manager", "/services/s1/photos", True),
    ("avatar propio del staff", "staff", "/barbers/me/avatar", True),
    ("avatar de un profesional", "manager", "/barbers/b1/avatar", True),
]


def send(client, path, with_file):
    if with_file:
        return client.post(path, files={"file": ("x.png", b"not-really-an-image", "image/png")})
    return client.post(path)


@pytest.mark.parametrize("label,role,path,with_file", ROUTES, ids=[r[0] for r in ROUTES])
def test_upload_without_the_declaration_is_rejected_with_409_and_the_text(label, role, path, with_file):
    client = build_app(build_db(), role)
    response = send(client, path, with_file)
    assert response.status_code == 409, (label, response.status_code, response.text[:200])
    detail = response.json()["detail"]
    assert detail["code"] == "media_rights_required" and "autorización" in detail["message"]


@pytest.mark.parametrize("label,role,path,with_file", ROUTES, ids=[r[0] for r in ROUTES])
def test_after_the_declaration_the_request_gets_past_the_gate(label, role, path, with_file):
    db = build_db()
    db.users.declared.add("u_staff" if role == "staff" else "u_manager")
    response = send(build_app(db, role), path, with_file)
    assert response.status_code != 409, (label, response.text[:200])


def test_the_declaration_of_one_user_does_not_unlock_another():
    db = build_db()
    db.users.declared.add("u_manager")
    assert send(build_app(db, "staff"), "/barbers/me/avatar", True).status_code == 409
    assert send(build_app(db, "manager"), "/organizations/org_a/logo", True).status_code != 409
