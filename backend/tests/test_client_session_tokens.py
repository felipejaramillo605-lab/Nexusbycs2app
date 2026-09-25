"""Regression coverage for hash-only client portal session tokens.

Mirrors test_session_tokens.py (manager/owner sessions, PR #56) for
client_sessions, which previously stored session_token in plaintext despite
being the larger-population, longer-lived (up to 30-day) cookie population.
"""

import asyncio
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from http.cookies import SimpleCookie
import sys
from pathlib import Path

import bcrypt
from fastapi import HTTPException
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server


class AsyncCursor:
    def __init__(self, rows):
        self.rows = iter(rows)

    def __aiter__(self):
        return self

    async def __anext__(self):
        try:
            return next(self.rows)
        except StopIteration:
            raise StopAsyncIteration


class MemoryCollection:
    def __init__(self, documents=()):
        self.documents = [deepcopy(document) for document in documents]
        self.indexes = {}

    @staticmethod
    def _matches(document, query):
        for key, expected in query.items():
            actual = document.get(key)
            if isinstance(expected, dict) and "$exists" in expected:
                if (key in document) != expected["$exists"]:
                    return False
            elif actual != expected:
                return False
        return True

    async def find_one(self, query, projection=None):
        return next((deepcopy(row) for row in self.documents if self._matches(row, query)), None)

    async def insert_one(self, document):
        self.documents.append(deepcopy(document))
        return SimpleNamespace(inserted_id=len(self.documents))

    async def update_one(self, query, update, upsert=False):
        for document in self.documents:
            if self._matches(document, query):
                document.update(deepcopy(update.get("$set", {})))
                return SimpleNamespace(matched_count=1, upserted_id=None)
        if upsert:
            document = deepcopy(query)
            document.update(deepcopy(update.get("$set", {})))
            self.documents.append(document)
            return SimpleNamespace(matched_count=0, upserted_id=len(self.documents))
        return SimpleNamespace(matched_count=0, upserted_id=None)

    async def delete_one(self, query):
        for index, document in enumerate(self.documents):
            if self._matches(document, query):
                del self.documents[index]
                return SimpleNamespace(deleted_count=1)
        return SimpleNamespace(deleted_count=0)

    async def delete_many(self, query):
        before = len(self.documents)
        self.documents = [row for row in self.documents if not self._matches(row, query)]
        return SimpleNamespace(deleted_count=before - len(self.documents))

    def find(self, query=None, projection=None):
        query = query or {}
        return AsyncCursor([deepcopy(row) for row in self.documents if self._matches(row, query)])

    async def index_information(self):
        return deepcopy(self.indexes)

    async def drop_index(self, name):
        self.indexes.pop(name, None)

    async def create_index(self, keys, **options):
        name = options.get("name", str(keys))
        self.indexes[name] = {"key": keys, **options}
        return name


def _registered_client(organization_id="org_client_session_test"):
    return {
        "client_id": "client_session_test",
        "organization_id": organization_id,
        "phone": "+15551234567",
        "name": "Client Session Test",
        "email": None,
        "pin_hash": bcrypt.hashpw(b"1234", bcrypt.gensalt()).decode(),
        "is_registered": True,
        "failed_pin_attempts": 0,
        "pin_locked_until": None,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }


def _fake_request():
    return SimpleNamespace(client=None)


def _cookie_token(response):
    cookie = SimpleCookie()
    cookie.load(response.headers["set-cookie"])
    return cookie["client_session_token"].value


class TestClientSessionTokenHash:
    def setup_method(self):
        self.client_doc = _registered_client()
        self.clients = MemoryCollection([self.client_doc])
        self.sessions = MemoryCollection()
        self.database = SimpleNamespace(clients=self.clients, client_sessions=self.sessions)
        self._patch = patch.object(server, "db", self.database)
        self._patch.start()

    def teardown_method(self):
        self._patch.stop()

    def test_register_stores_only_digest_and_real_cookie_authenticates(self):
        async def run():
            self.clients.documents.clear()  # register creates a brand-new client
            data = server.ClientRegisterRequest(
                phone="+15559876543",
                organization_id="org_client_session_test",
                name="New Client",
                pin="1234",
            )
            handler = getattr(server.register_client_with_pin, "__wrapped__", server.register_client_with_pin)
            response = await handler(data, _fake_request())
            token = _cookie_token(response)
            stored = self.sessions.documents[0]
            assert "session_token" not in stored
            assert stored["session_token_hash"] == server.token_digest(token)
            assert token not in repr(stored)
            assert isinstance(stored["expires_at"], datetime)

            authenticated = await server.get_current_client(client_session_token=token)
            assert authenticated.client_id == stored["client_id"]

        asyncio.run(run())

    def test_login_stores_only_digest_and_real_cookie_authenticates(self):
        async def run():
            data = server.ClientLoginRequest(
                phone=self.client_doc["phone"],
                organization_id=self.client_doc["organization_id"],
                pin="1234",
            )
            handler = getattr(server.login_client_with_pin, "__wrapped__", server.login_client_with_pin)
            response = await handler(data, _fake_request())
            token = _cookie_token(response)
            stored = self.sessions.documents[0]
            assert "session_token" not in stored
            assert stored["session_token_hash"] == server.token_digest(token)
            assert token not in repr(stored)
            assert isinstance(stored["expires_at"], datetime)

            authenticated = await server.get_current_client(client_session_token=token)
            assert authenticated.client_id == self.client_doc["client_id"]

        asyncio.run(run())

    def test_legacy_plaintext_session_does_not_authenticate(self):
        async def run():
            self.sessions.documents.append(
                {
                    "client_id": self.client_doc["client_id"],
                    "session_token": "legacy-plaintext-token",
                    "expires_at": datetime.now(timezone.utc) + timedelta(days=1),
                }
            )
            try:
                await server.get_current_client(client_session_token="legacy-plaintext-token")
            except HTTPException as exc:
                assert exc.status_code == 401
            else:
                raise AssertionError("Legacy plaintext client token unexpectedly authenticated")

        asyncio.run(run())

    def test_logout_deletes_session_by_digest(self):
        async def run():
            token = "logout-bearer-token"
            other_token = "other-bearer-token"
            await self.sessions.insert_one(
                {
                    "client_id": self.client_doc["client_id"],
                    "session_token_hash": server.token_digest(token),
                }
            )
            await self.sessions.insert_one(
                {
                    "client_id": self.client_doc["client_id"],
                    "session_token_hash": server.token_digest(other_token),
                }
            )
            await server.logout_client(client_session_token=token)
            assert len(self.sessions.documents) == 1
            assert self.sessions.documents[0]["session_token_hash"] == server.token_digest(other_token)

        asyncio.run(run())

    def test_startup_migration_removes_legacy_tokens_and_indexes_digests(self):
        async def run():
            self.sessions.documents.append(
                {
                    "_id": "legacy",
                    "client_id": self.client_doc["client_id"],
                    "session_token": "legacy-plaintext-token",
                    "expires_at": datetime.now(timezone.utc) + timedelta(days=1),
                    "created_at": datetime.now(timezone.utc),
                }
            )
            self.sessions.documents.append(
                {
                    "_id": "current",
                    "client_id": self.client_doc["client_id"],
                    "session_token_hash": server.token_digest("kept-token"),
                    "expires_at": datetime.now(timezone.utc) + timedelta(days=1),
                    "created_at": datetime.now(timezone.utc),
                }
            )
            await server._migrate_client_session_token_hash_and_indexes()
            assert all("session_token" not in row for row in self.sessions.documents)
            assert len(self.sessions.documents) == 1
            assert self.sessions.indexes["client_sessions_token_hash_unique"]["key"] == "session_token_hash"
            assert self.sessions.indexes["client_sessions_ttl"]["key"] == "expires_at"

        asyncio.run(run())
