"""Isolated media API regressions; no MongoDB or external requests required."""
import ast
import asyncio
from copy import deepcopy
from io import BytesIO
from pathlib import Path
from types import SimpleNamespace
from typing import Optional, List, Literal
from datetime import datetime
import sys
import unittest
from unittest.mock import patch, AsyncMock
from pydantic import BaseModel, Field

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import service_media


class Services:
    def __init__(self):
        self.document = {"organization_id": "org_a", "service_id": "service_a", "photos": [],
                         "cover_image_url": "/api/media/catalog/org_a/old.webp"}
        self.fail = False
        self.conflict = False

    async def find_one(self, query, projection):
        return deepcopy(self.document) if all(self.document.get(k) == v for k, v in query.items()) else None

    async def update_one(self, query, update):
        if self.fail:
            raise RuntimeError("database unavailable")
        if self.conflict or not all(self.document.get(k) == v for k, v in query.items()):
            return SimpleNamespace(matched_count=0)
        self.document.update(update["$set"])
        return SimpleNamespace(matched_count=1)


class PresentationMediaTests(unittest.TestCase):
    def setUp(self):
        self.services = Services()
        self.role = "manager"

        async def current_user(*args):
            return SimpleNamespace(role=self.role, organization_id="org_a")

        def management(user):
            if user.role != "manager":
                raise HTTPException(403, "Management required")

        async def resolve(user, requested):
            if requested and requested != user.organization_id:
                raise HTTPException(403, "Access denied")
            return user.organization_id

        app = FastAPI()
        app.include_router(service_media.build_service_media_router(
            SimpleNamespace(services=self.services), current_user, management, resolve))
        self.client = TestClient(app, raise_server_exceptions=False)
        output = BytesIO()
        Image.new("RGB", (8, 8), "red").save(output, "PNG")
        self.image = output.getvalue()
        self.old = self.services.document["cover_image_url"]
        self.new = "/api/media/catalog/org_a/new.webp"
        self.write = self.enterContext(patch.object(service_media, "_write_catalog_image", return_value=self.new))
        self.delete = self.enterContext(patch.object(service_media, "_delete_catalog_image"))

    def upload(self, slot="cover", **kwargs):
        return self.client.post(f"/services/service_a/presentation/{slot}",
                                files={"file": ("cover.png", self.image, "image/png")}, **kwargs)

    def test_upload_normalizes_and_replaces(self):
        response = self.upload()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.services.document["cover_image_url"], self.new)
        self.assertEqual(Image.open(BytesIO(self.write.call_args.args[1])).format, "WEBP")
        self.delete.assert_called_once_with(self.old)

    def test_shared_banner_is_preserved(self):
        self.services.document["banner_image_url"] = self.old
        self.assertEqual(self.upload().status_code, 200)
        self.delete.assert_not_called()

    def test_shared_gallery_is_preserved(self):
        self.services.document["photos"] = [self.old]
        self.assertEqual(self.upload().status_code, 200)
        self.delete.assert_not_called()

    def test_gallery_deletion_preserves_cover(self):
        self.services.document["photos"] = [self.old]
        response = self.client.delete("/services/service_a/photos/0")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.services.document["photos"], [])
        self.delete.assert_not_called()

    def test_database_failure_preserves_previous_file(self):
        self.services.fail = True
        self.assertEqual(self.upload().status_code, 500)
        self.assertEqual(self.services.document["cover_image_url"], self.old)
        self.delete.assert_not_called()

    def test_failed_gallery_delete_preserves_file(self):
        self.services.document["photos"] = [self.old]
        self.services.fail = True
        self.assertEqual(self.client.delete("/services/service_a/photos/0").status_code, 500)
        self.delete.assert_not_called()

    def test_concurrent_edit_rejected_and_unused_upload_cleaned(self):
        self.services.conflict = True
        self.assertEqual(self.upload().status_code, 409)
        self.assertEqual(self.services.document["cover_image_url"], self.old)
        self.delete.assert_called_once_with(self.new)

    def test_invalid_slot_and_payload_do_not_write(self):
        self.assertEqual(self.upload("invalid").status_code, 400)
        self.image = b"not an image"
        self.assertEqual(self.upload().status_code, 400)
        self.write.assert_not_called()

    def test_non_management_cannot_upload(self):
        self.role = "staff"
        self.assertEqual(self.upload().status_code, 403)
        self.write.assert_not_called()

    def test_other_organization_cannot_upload(self):
        self.assertEqual(self.upload(params={"organization_id": "org_b"}).status_code, 403)
        self.services.document["organization_id"] = "org_b"
        self.assertEqual(self.upload().status_code, 404)
        self.write.assert_not_called()

    def test_cleanup_never_deletes_other_organization_file(self):
        self.services.document["cover_image_url"] = "/api/media/catalog/org_b/old.webp"
        self.assertEqual(self.upload().status_code, 200)
        self.delete.assert_not_called()

    def test_cleanup_failure_does_not_fail_committed_upload(self):
        self.delete.side_effect = OSError("filesystem unavailable")
        self.assertEqual(self.upload().status_code, 200)
        self.assertEqual(self.services.document["cover_image_url"], self.new)


class PresentationContractTests(unittest.TestCase):
    def test_legacy_update_preserves_policy_and_presentation(self):
        tree = ast.parse((Path(__file__).resolve().parents[1] / "server.py").read_text(encoding="utf-8"))
        names = {"ServiceCreate", "update_service", "_validate_group_service_fields", "_normalize_spot_layout"}
        nodes = [n for n in tree.body if isinstance(n, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)) and n.name in names]
        for n in nodes:
            n.decorator_list = []
        record = {"service_id": "s", "organization_id": "org_a", "created_at": datetime.now(),
                  "booking_window_days": 7, "cancellation_cutoff_hours": 4,
                  "short_description": "Original", "image_alt": "Yoga", "image_focal_point": "top"}
        collection = SimpleNamespace(find_one=AsyncMock(return_value=record),
                                     update_one=AsyncMock(return_value=SimpleNamespace(matched_count=1)))
        scope = {"BaseModel": BaseModel, "Field": Field, "Optional": Optional, "List": List,
                 "Literal": Literal, "HTTPException": HTTPException, "datetime": datetime,
                 "Header": lambda *a: None, "Cookie": lambda *a: None,
                 "db": SimpleNamespace(services=collection), "Service": lambda **kwargs: kwargs,
                 "get_current_user": AsyncMock(return_value=SimpleNamespace(organization_id="org_a")),
                 "require_management_role": lambda user: None,
                 "validate_organization_access": AsyncMock(return_value=True),
                 "enforce_rls_on_write": AsyncMock()}
        exec(compile(ast.Module(body=nodes, type_ignores=[]), "server.py", "exec"), scope)
        data = scope["ServiceCreate"](name="Corte", duration=30, price=20)
        asyncio.run(scope["update_service"]("s", data))
        update = collection.update_one.call_args.args[1]["$set"]
        for key in ("booking_window_days", "cancellation_cutoff_hours", "short_description", "image_alt", "image_focal_point"):
            self.assertNotIn(key, update)
        data = scope["ServiceCreate"](name="Corte", duration=30, price=20, booking_window_days=None,
                                       cancellation_cutoff_hours=0, short_description=" Nuevo ")
        asyncio.run(scope["update_service"]("s", data))
        update = collection.update_one.call_args.args[1]["$set"]
        self.assertIsNone(update["booking_window_days"])
        self.assertEqual(update["cancellation_cutoff_hours"], 0)
        self.assertEqual(update["short_description"], "Nuevo")

    def test_legacy_fallback_and_policy(self):
        # Extract the pure helper without starting server.py or its background workers.
        tree = ast.parse((Path(__file__).resolve().parents[1] / "server.py").read_text(encoding="utf-8"))
        function = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "_service_presentation")
        scope = {"Optional": Optional}
        exec(compile(ast.Module(body=[function], type_ignores=[]), "server.py", "exec"), scope)
        present = scope["_service_presentation"]
        self.assertIsNone(present(None)["cover_image_url"])
        result = present({"name": "Yoga", "photos": ["/legacy.webp"], "spot_layout": ["A", "B"],
                          "booking_window_days": 7, "cancellation_cutoff_hours": 4})
        self.assertEqual(result["cover_image_url"], "/legacy.webp")
        self.assertEqual(result["banner_image_url"], "/legacy.webp")
        self.assertEqual(result["image_alt"], "Yoga")
        self.assertEqual(result["spot_layout"], ["A", "B"])
        self.assertEqual(result["booking_window_days"], 7)
        self.assertEqual(result["cancellation_cutoff_hours"], 4)


if __name__ == "__main__":
    unittest.main()
