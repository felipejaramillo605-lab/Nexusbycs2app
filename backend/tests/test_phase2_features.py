# NEXUS_PHASE2_FEATURE_TESTS
# Tests only the Phase 2 backend endpoints: birthday on clients,
# upcoming-birthdays listing, business_type on organizations, and
# service photos upload/delete (max 2).
import io
import os
import re
import time
from datetime import date, timedelta

import pytest
import requests
from PIL import Image

def _load_frontend_env():
    p = "/app/frontend/.env"
    if os.path.exists(p):
        for line in open(p):
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.strip().split("=", 1)[1]
    return None

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _load_frontend_env()).rstrip("/")
ORIGIN_HEADERS = {
    "Origin": BASE_URL,
    "Sec-Fetch-Site": "same-origin",
}
ORG_ID = "org_demo001"


def _login(email, password):
    s = requests.Session()
    r = s.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": email, "password": password},
        headers={**ORIGIN_HEADERS, "Content-Type": "application/json"},
        timeout=30,
    )
    assert r.status_code == 200, r.text
    s.headers.update(ORIGIN_HEADERS)
    return s


@pytest.fixture(scope="module")
def manager():
    return _login("manager@nexus.com", "manager123")


# ---------- Birthday on clients ----------
class TestClientBirthday:
    def test_set_birthday_and_read_back(self, manager):
        # Reuse an existing seeded client (POST /clients does not exist; clients
        # come from bookings). We use client_001 which is a stable seeded record.
        cid = "client_001"
        target = (date.today() + timedelta(days=5)).strftime("%Y-%m-%d")
        r2 = manager.put(
            f"{BASE_URL}/api/clients/{cid}",
            params={"organization_id": ORG_ID, "birthday": target},
        )
        assert r2.status_code == 200, r2.text
        r3 = manager.get(f"{BASE_URL}/api/clients", params={"organization_id": ORG_ID})
        assert r3.status_code == 200
        found = next((c for c in r3.json() if c.get("client_id") == cid), None)
        assert found and found.get("birthday") == target

        # bad format
        r4 = manager.put(
            f"{BASE_URL}/api/clients/{cid}",
            params={"organization_id": ORG_ID, "birthday": "2020/01/01"},
        )
        assert r4.status_code == 400

        # clear
        manager.put(
            f"{BASE_URL}/api/clients/{cid}",
            params={"organization_id": ORG_ID, "birthday": ""},
        )

    def test_upcoming_birthdays_lists_within_window(self, manager):
        cid = "client_002"
        target = (date.today() + timedelta(days=3)).strftime("%Y-%m-%d")
        r = manager.put(
            f"{BASE_URL}/api/clients/{cid}",
            params={"organization_id": ORG_ID, "birthday": target},
        )
        assert r.status_code == 200, r.text

        r2 = manager.get(
            f"{BASE_URL}/api/clients/upcoming-birthdays",
            params={"organization_id": ORG_ID, "days": 30},
        )
        assert r2.status_code == 200, r2.text
        listing = r2.json()
        assert isinstance(listing, list)
        found = [c for c in listing if c.get("client_id") == cid]
        assert found, "Newly set upcoming birthday client not returned"
        assert found[0]["days_until"] in (2, 3)

        # ascending order by days_until
        dus = [c["days_until"] for c in listing]
        assert dus == sorted(dus)

        # cleanup birthday
        manager.put(
            f"{BASE_URL}/api/clients/{cid}",
            params={"organization_id": ORG_ID, "birthday": ""},
        )


# ---------- Organization business_type ----------
class TestBusinessType:
    def test_update_business_type_persists(self, manager):
        r = manager.get(f"{BASE_URL}/api/organizations")
        assert r.status_code == 200
        orgs = r.json()
        org = next(o for o in orgs if o.get("organization_id") == ORG_ID)
        original = org.get("business_type", "barbershop")

        for new_val in ("nail_spa", "beauty_salon", original):
            r2 = manager.put(
                f"{BASE_URL}/api/organizations/{ORG_ID}", json={"business_type": new_val}
            )
            assert r2.status_code == 200, r2.text
            r3 = manager.get(f"{BASE_URL}/api/organizations")
            got = next(o for o in r3.json() if o["organization_id"] == ORG_ID)
            assert got.get("business_type") == new_val


# ---------- Service photos ----------
def _png_bytes(color=(200, 100, 50)):
    img = Image.new("RGB", (400, 400), color=color)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


class TestServicePhotos:
    def test_upload_two_and_reject_third(self, manager):
        # create service
        svc_payload = {
            "name": f"TEST_SvcPhotos_{int(time.time())}",
            "price": 15000,
            "duration": 30,
            "organization_id": ORG_ID,
        }
        r = manager.post(f"{BASE_URL}/api/services", json=svc_payload)
        assert r.status_code in (200, 201), r.text
        sid = r.json()["service_id"]

        try:
            urls = []
            for i in range(2):
                files = {"file": (f"pic{i}.png", _png_bytes((50 * i, 100, 200 - 50 * i)), "image/png")}
                r2 = manager.post(
                    f"{BASE_URL}/api/services/{sid}/photos",
                    params={"organization_id": ORG_ID},
                    files=files,
                )
                assert r2.status_code == 200, r2.text
                urls = r2.json()["photos"]
                assert len(urls) == i + 1

            # third should 400
            files = {"file": ("pic3.png", _png_bytes((10, 10, 10)), "image/png")}
            r3 = manager.post(
                f"{BASE_URL}/api/services/{sid}/photos",
                params={"organization_id": ORG_ID},
                files=files,
            )
            assert r3.status_code == 400, r3.text

            # delete index 0
            r4 = manager.delete(
                f"{BASE_URL}/api/services/{sid}/photos/0",
                params={"organization_id": ORG_ID},
            )
            assert r4.status_code == 200, r4.text
            assert len(r4.json()["photos"]) == 1

            # invalid index
            r5 = manager.delete(
                f"{BASE_URL}/api/services/{sid}/photos/5",
                params={"organization_id": ORG_ID},
            )
            assert r5.status_code == 400
        finally:
            manager.delete(f"{BASE_URL}/api/services/{sid}", params={"organization_id": ORG_ID})


# ---------- Regression smoke ----------
class TestRegressionSmoke:
    def test_manager_login_and_dashboard_endpoints(self, manager):
        for path in ("/api/services", "/api/clients", "/api/organizations"):
            r = manager.get(f"{BASE_URL}{path}", params={"organization_id": ORG_ID})
            assert r.status_code == 200, f"{path} -> {r.status_code} {r.text[:200]}"

    def test_owner_login(self):
        s = _login("admin@nexus.com", "admin123")
        r = s.get(f"{BASE_URL}/api/organizations")
        assert r.status_code == 200

    def test_staff_login(self):
        s = _login("staff@test.com", "Nexus2026")
        r = s.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 200
