import os
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://clipper-manage-1.preview.emergentagent.com").rstrip("/")
ORIGIN = BASE_URL
ORG_ID = "org_demo001"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")


@pytest.fixture(scope="session")
def base_url():
    return BASE_URL


@pytest.fixture(scope="session")
def db():
    client = MongoClient(MONGO_URL)
    return client[DB_NAME]


def _new_session():
    s = requests.Session()
    s.headers.update({
        "Content-Type": "application/json",
        "Origin": ORIGIN,
        "Referer": ORIGIN + "/",
        "Sec-Fetch-Site": "same-origin",
    })
    return s


def _login(email, password):
    s = _new_session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="session")
def manager_client():
    return _login("manager@nexus.com", "manager123")


@pytest.fixture(scope="session")
def owner_client():
    return _login("admin@nexus.com", "admin123")


@pytest.fixture(scope="session")
def staff_client(db):
    """Create a temporary staff user with known password and return an authenticated session."""
    import bcrypt, uuid
    from datetime import datetime, timezone
    email = f"teststaff_{uuid.uuid4().hex[:8]}@nexus.local"
    password = "StaffPass1"
    pwd_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    db.users.insert_one({
        "user_id": user_id,
        "email": email,
        "name": "Test Staff",
        "password_hash": pwd_hash,
        "auth_method": "manual",
        "role": "staff",
        "access_status": "approved",
        "organization_id": ORG_ID,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "active": True,
    })
    yield _login(email, password), user_id
    db.users.delete_one({"user_id": user_id})
    db.user_sessions.delete_many({"user_id": user_id})
