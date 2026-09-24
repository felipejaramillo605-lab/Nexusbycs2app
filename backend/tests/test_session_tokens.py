"""Regression coverage for hash-only manager/owner session tokens."""
import asyncio
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from http.cookies import SimpleCookie
import sys
from pathlib import Path

from fastapi import HTTPException, Response

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


def _approved_user(auth_method="manual"):
    return {
        "user_id": "user_session_test",
        "email": "session-test@example.com",
        "name": "Session Test",
        "password_hash": server.hash_password("CorrectPass1"),
        "auth_method": auth_method,
        "role": "manager",
        "access_status": "approved",
        "active": True,
        "organization_id": "org_session_test",
        "created_at": datetime.now(timezone.utc),
    }


def _cookie_token(response):
    cookie = SimpleCookie()
    cookie.load(response.headers["set-cookie"])
    return cookie["session_token"].value


class TestSessionTokenHash:
    def setup_method(self):
        self.user = _approved_user()
        self.users = MemoryCollection([self.user])
        self.sessions = MemoryCollection()
        self.database = SimpleNamespace(users=self.users, user_sessions=self.sessions)
        self.db_patch = patch.object(server, "db", self.database)
        self.db_patch.start()
        self.access_patch = patch.object(server, "enforce_subscription_access", AsyncMock())
        self.access_patch.start()

    def teardown_method(self):
        self.access_patch.stop()
        self.db_patch.stop()

    def test_manual_login_stores_only_digest_and_real_cookie_authenticates(self):
        async def run():
            response = Response()
            handler = getattr(server.login_user, "__wrapped__", server.login_user)
            await handler(
                server.LoginRequest(email=self.user["email"], password="CorrectPass1"),
                response,
                None,
            )
            token = _cookie_token(response)
            stored = self.sessions.documents[0]
            assert "session_token" not in stored
            assert stored["session_token_hash"] == server.token_digest(token)
            assert token not in repr(stored)

            authenticated = await server.get_current_user(session_token=token)
            assert authenticated.user_id == self.user["user_id"]

        asyncio.run(run())

    def test_oauth_session_stores_digest_but_returns_real_cookie(self):
        class OAuthResponse:
            def raise_for_status(self):
                return None

            @staticmethod
            def json():
                return {
                    "email": "session-test@example.com",
                    "name": "Session Test",
                    "picture": None,
                    "session_token": "oauth-bearer-token",
                }

        class OAuthClient:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *args):
                return None

            async def get(self, *args, **kwargs):
                return OAuthResponse()

        async def run():
            response = Response()
            handler = getattr(server.create_session, "__wrapped__", server.create_session)
            with patch.object(server.httpx, "AsyncClient", OAuthClient):
                await handler(response, None, "oauth-session-id")
            assert _cookie_token(response) == "oauth-bearer-token"
            stored = self.sessions.documents[0]
            assert "session_token" not in stored
            assert stored["session_token_hash"] == server.token_digest("oauth-bearer-token")

        asyncio.run(run())

    def test_legacy_plaintext_session_does_not_authenticate(self):
        async def run():
            self.sessions.documents.append({
                "user_id": self.user["user_id"],
                "session_token": "legacy-plaintext-token",
                "expires_at": datetime.now(timezone.utc) + timedelta(days=1),
            })
            try:
                await server.get_current_user(session_token="legacy-plaintext-token")
            except HTTPException as exc:
                assert exc.status_code == 401
            else:
                raise AssertionError("Legacy plaintext token unexpectedly authenticated")

        asyncio.run(run())

    def test_logout_deletes_session_by_digest(self):
        async def run():
            token = "logout-bearer-token"
            other_token = "other-bearer-token"
            await self.sessions.insert_one({
                "user_id": self.user["user_id"],
                "session_token_hash": server.token_digest(token),
            })
            await self.sessions.insert_one({
                "user_id": self.user["user_id"],
                "session_token_hash": server.token_digest(other_token),
            })
            await server.logout(Response(), session_token=token)
            assert len(self.sessions.documents) == 1
            assert self.sessions.documents[0]["session_token_hash"] == server.token_digest(other_token)

        asyncio.run(run())

    def test_startup_migration_removes_legacy_tokens_and_indexes_digests(self):
        async def run():
            self.sessions.indexes["user_sessions_token_unique"] = {"key": "session_token"}
            self.sessions.documents.append({
                "_id": "legacy",
                "user_id": self.user["user_id"],
                "session_token": "legacy-plaintext-token",
                "expires_at": datetime.now(timezone.utc) + timedelta(days=1),
                "created_at": datetime.now(timezone.utc),
            })
            await server._migrate_user_session_dates_and_indexes()
            assert all("session_token" not in row for row in self.sessions.documents)
            assert "user_sessions_token_unique" not in self.sessions.indexes
            assert self.sessions.indexes["user_sessions_token_hash_unique"]["key"] == "session_token_hash"

        asyncio.run(run())
