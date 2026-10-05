"""PIN recovery stores digests, accepts outstanding links, and consumes each link once."""

import asyncio
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

import bcrypt
from fastapi import HTTPException
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server  # noqa: E402


class MemoryCollection:
    def __init__(self, documents=()):
        self.documents = deepcopy(list(documents))
        self.queries = []

    async def find_one(self, query, projection=None):
        self.queries.append(deepcopy(query))
        for document in self.documents:
            if all(document.get(key) == value for key, value in query.items()):
                result = deepcopy(document)
                for key, included in (projection or {}).items():
                    if included == 0:
                        result.pop(key, None)
                return result
        return None

    async def update_one(self, query, update):
        for document in self.documents:
            if all(document.get(key) == value for key, value in query.items()):
                document.update(deepcopy(update.get("$set", {})))
                return SimpleNamespace(matched_count=1)
        return SimpleNamespace(matched_count=0)


def client_document(token="emailed-token", legacy=False, expired=False):
    expires = datetime.now(timezone.utc) + timedelta(hours=-1 if expired else 1)
    return {
        "client_id": "client_pin_test",
        "organization_id": "org_pin_test",
        "phone": "+573001112233",
        "name": "Cliente QA",
        "email": "qa@example.com",
        "is_registered": True,
        "pin_hash": "old-pin-hash",
        "pin_reset_token" if legacy else "pin_reset_token_hash": token if legacy else server.token_digest(token),
        "pin_reset_expires": expires.isoformat(),
    }


def database_for(document):
    return SimpleNamespace(
        clients=MemoryCollection([document]),
        client_sessions=SimpleNamespace(delete_many=Mock()),
        organizations=SimpleNamespace(find_one=AsyncMock(return_value=None)),
    )


def reset_request(token="emailed-token"):
    return server.ClientResetPinRequest(token=token, new_pin="4567")


def test_recovery_stores_digest_and_emails_original_token():
    database = database_for(client_document(legacy=True))
    with (
        patch.object(server, "db", database),
        patch.object(server.secrets, "token_urlsafe", return_value="new-email-token"),
        patch.object(server.email_service, "send_pin_reset") as send_email,
    ):
        handler = getattr(server.forgot_client_pin, "__wrapped__", server.forgot_client_pin)
        asyncio.run(
            handler(
                server.ClientForgotPinRequest(phone="+573001112233", organization_id="org_pin_test"),
                SimpleNamespace(client=None),
            )
        )
    saved = database.clients.documents[0]
    assert saved["pin_reset_token_hash"] == server.token_digest("new-email-token")
    assert saved["pin_reset_token_hash"] != "new-email-token"
    assert saved["pin_reset_token"] is None
    assert "new-email-token" not in repr(saved)
    assert send_email.call_args.kwargs["reset_url"].endswith("/portal/reset-pin?token=new-email-token")


@pytest.mark.parametrize("legacy", [False, True])
def test_valid_link_resets_pin_invalidates_sessions_and_cannot_be_reused(legacy):
    async def run():
        from unittest.mock import AsyncMock

        database = database_for(client_document(legacy=legacy))
        database.client_sessions.delete_many = AsyncMock()
        with patch.object(server, "db", database):
            result = await server.reset_client_pin(reset_request())
            assert "successful" in result["message"]
            saved = database.clients.documents[0]
            assert bcrypt.checkpw(b"4567", saved["pin_hash"].encode())
            assert saved["pin_reset_token"] is None
            assert saved["pin_reset_token_hash"] is None
            assert saved["pin_reset_expires"] is None
            database.client_sessions.delete_many.assert_awaited_once_with({"client_id": "client_pin_test"})
            with pytest.raises(HTTPException) as failure:
                await server.reset_client_pin(reset_request())
            assert failure.value.status_code == 400
        assert database.clients.queries[0] == {"pin_reset_token_hash": server.token_digest("emailed-token")}
        if legacy:
            assert database.clients.queries[1] == {"pin_reset_token": "emailed-token"}

    asyncio.run(run())


@pytest.mark.parametrize("legacy", [False, True])
def test_expired_link_does_not_change_pin_or_invalidate_sessions(legacy):
    async def run():
        database = database_for(client_document(legacy=legacy, expired=True))
        before = deepcopy(database.clients.documents)
        with patch.object(server, "db", database), pytest.raises(HTTPException) as failure:
            await server.reset_client_pin(reset_request())
        assert failure.value.status_code == 400
        assert database.clients.documents == before
        database.client_sessions.delete_many.assert_not_called()

    asyncio.run(run())


def test_nonexistent_link_is_rejected():
    async def run():
        database = database_for(client_document())
        with patch.object(server, "db", database), pytest.raises(HTTPException) as failure:
            await server.reset_client_pin(reset_request("unknown-link"))
        assert failure.value.status_code == 400
        assert database.clients.documents[0]["pin_hash"] == "old-pin-hash"
        database.client_sessions.delete_many.assert_not_called()

    asyncio.run(run())


def test_digest_itself_cannot_be_used_as_a_reset_link():
    async def run():
        database = database_for(client_document())
        with patch.object(server, "db", database), pytest.raises(HTTPException) as failure:
            await server.reset_client_pin(reset_request(server.token_digest("emailed-token")))
        assert failure.value.status_code == 400

    asyncio.run(run())


def test_token_replaced_between_read_and_update_is_not_consumed():
    async def run():
        database = database_for(client_document())
        update = database.clients.update_one

        async def replace_link(query, changes):
            database.clients.documents[0]["pin_reset_token_hash"] = server.token_digest("replacement-link")
            return await update(query, changes)

        database.clients.update_one = replace_link
        with patch.object(server, "db", database), pytest.raises(HTTPException) as failure:
            await server.reset_client_pin(reset_request())
        assert failure.value.status_code == 400
        assert database.clients.documents[0]["pin_hash"] == "old-pin-hash"
        assert database.clients.documents[0]["pin_reset_token_hash"] == server.token_digest("replacement-link")
        database.client_sessions.delete_many.assert_not_called()

    asyncio.run(run())


def test_public_history_response_excludes_every_pin_field():
    class EmptyCursor:
        def sort(self, *args):
            return self

        async def to_list(self, length):
            return []

    async def run():
        document = client_document(legacy=True)
        document["pin_reset_token_hash"] = server.token_digest("other-secret")
        empty = SimpleNamespace(find=lambda *args, **kwargs: EmptyCursor())
        database = SimpleNamespace(
            clients=MemoryCollection([document]), appointments=empty, services=empty, barbers=empty,
            organizations=SimpleNamespace(find_one=AsyncMock(return_value=None)),
        )
        handler = getattr(server.get_client_history_public, "__wrapped__", server.get_client_history_public)
        with patch.object(server, "db", database):
            result = await handler(SimpleNamespace(client=None), document["phone"], document["organization_id"])
        assert result["client"]["name"] == "Cliente QA"
        assert not any(key.startswith("pin_") for key in result["client"])

    asyncio.run(run())


@pytest.mark.parametrize("operation", ["list", "update"])
def test_manager_client_responses_exclude_legacy_tokens_and_digests(operation):
    async def run():
        from unittest.mock import AsyncMock

        document = client_document(legacy=True)
        document["pin_reset_token_hash"] = server.token_digest("stored-digest")
        database = database_for(document)

        class ClientCursor:
            def __init__(self, projection):
                self.projection = projection

            def sort(self, *args):
                return self

            async def to_list(self, length):
                return [await database.clients.find_one({"client_id": document["client_id"]}, self.projection)]

        database.clients.find = lambda query, projection: ClientCursor(projection)
        with (
            patch.object(server, "db", database),
            patch.object(server, "get_current_user", AsyncMock(return_value=SimpleNamespace(role="manager"))),
            patch.object(
                server, "get_organization_filter", AsyncMock(return_value={"organization_id": "org_pin_test"})
            ),
            patch.object(server, "validate_organization_access", AsyncMock(return_value=True)),
        ):
            if operation == "list":
                result = await server.get_clients(search=None)
                client = result[0]
            else:
                client = await server.update_client(client_id=document["client_id"], name="Updated client")
        assert client["client_id"] == document["client_id"]
        assert "pin_reset_token" not in client
        assert "pin_reset_token_hash" not in client

    asyncio.run(run())
