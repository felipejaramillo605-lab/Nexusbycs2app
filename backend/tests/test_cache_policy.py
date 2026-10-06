"""Las descargas con datos privados nunca deben guardarse en el cache compartido del borde."""

import sys
from pathlib import Path

from fastapi import FastAPI, Request, Response
from fastapi.responses import FileResponse
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import cache_policy as subject  # noqa: E402


def make_app(tmp_path):
    app = FastAPI()
    image = tmp_path / "logo.webp"
    image.write_bytes(b"RIFF....WEBP")

    @app.middleware("http")
    async def policy(request: Request, call_next):
        response = await call_next(request)
        subject.apply_cache_policy(request.url.path, response.headers)
        return response

    @app.get("/api/payroll/runs/r1/report/xlsx")
    async def report():
        return Response(
            b"PK-private-payroll", media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )

    @app.get("/api/media/organizations/o1/logo.webp")
    async def media():
        return FileResponse(image, headers={"Cache-Control": "public, max-age=31536000, immutable"})

    @app.get("/api/hr/documents/d1")
    async def document():
        return Response(b"x", headers={"Cache-Control": "private, no-store"})

    @app.get("/health")
    async def health():
        return {"ok": True}

    return TestClient(app)


def test_private_downloads_get_no_store(tmp_path):
    response = make_app(tmp_path).get("/api/payroll/runs/r1/report/xlsx")
    assert response.headers["cache-control"] == "no-store, private" and response.headers["pragma"] == "no-cache"


def test_responses_with_their_own_policy_and_non_api_paths_are_left_alone(tmp_path):
    client = make_app(tmp_path)
    assert (
        client.get("/api/media/organizations/o1/logo.webp").headers["cache-control"]
        == "public, max-age=31536000, immutable"
    )
    assert client.get("/api/hr/documents/d1").headers["cache-control"] == "private, no-store"
    assert "cache-control" not in client.get("/health").headers
