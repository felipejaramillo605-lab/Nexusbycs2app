"""Nexus AI bounds: tool-round cap, bounded chat cache, per-user message rate limit (no network, no Mongo)."""

import sys
from pathlib import Path
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import nexus_ai  # noqa: E402
from request_security import rate_limiter  # noqa: E402


class _Collection:
    def __init__(self, doc=None):
        self.doc = doc
        self.inserted = []

    async def find_one(self, query, projection=None):
        return dict(self.doc) if self.doc else None

    async def insert_one(self, doc):
        self.inserted.append(doc)

    async def update_one(self, query, update):
        return None


class _LoopingChat:
    """A model that asks for a tool on every single turn."""

    streams = 0

    def __init__(self, *args, **kwargs):
        pass

    async def stream_message(self, user_message):
        _LoopingChat.streams += 1
        yield nexus_ai.ToolCallReady(
            nexus_ai.ToolCall(id=f"call_{_LoopingChat.streams}", name="get_top_customers", arguments={})
        )
        yield nexus_ai.StreamDone()

    def add_tool_result(self, tool_id, content):
        pass


def _client(monkeypatch):
    nexus_ai._ACTIVE_CHATS.clear()
    _LoopingChat.streams = 0
    db = SimpleNamespace(
        organizations=_Collection({"organization_id": "org_a", "nexus_ai_contracted": True, "nexus_ai_enabled": True}),
        nexus_ai_conversations=_Collection({"conversation_id": "c1", "title": "Nueva conversación"}),
        nexus_ai_messages=_Collection(),
    )

    async def current_user(*_):
        return SimpleNamespace(role="manager", access_status="approved", organization_id="org_a", user_id="user_bounds")

    async def resolve(user, requested):
        return "org_a"

    async def fake_dispatch(*args, **kwargs):
        return {"ok": True}

    monkeypatch.setattr(nexus_ai, "LlmChat", _LoopingChat)
    monkeypatch.setattr(nexus_ai, "_key", lambda: "test-key")
    monkeypatch.setattr(nexus_ai, "_dispatch_tool", fake_dispatch)
    monkeypatch.setattr(nexus_ai.LlmChat, "with_model", lambda self, *a: self, raising=False)
    monkeypatch.setattr(nexus_ai.LlmChat, "with_tools", lambda self, *a, **k: self, raising=False)
    app = FastAPI()
    app.include_router(nexus_ai.build_nexus_ai_router(db, current_user, lambda user: None, resolve))
    return TestClient(app, raise_server_exceptions=False), db


def test_tool_loop_stops_after_the_round_cap(monkeypatch):
    rate_limiter._windows.clear()
    client, db = _client(monkeypatch)
    response = client.post("/nexus-ai/conversations/c1/messages", json={"message": "hola"})
    assert response.status_code == 200
    assert _LoopingChat.streams == nexus_ai.MAX_TOOL_ROUNDS + 1
    assert "me detuve" in response.text
    assert '"done": true' in response.text
    assert db.nexus_ai_messages.inserted[-1]["role"] == "assistant"


def test_messages_are_rate_limited_per_user(monkeypatch):
    rate_limiter._windows.clear()
    client, _ = _client(monkeypatch)
    monkeypatch.setattr(nexus_ai, "MAX_TOOL_ROUNDS", 0)
    statuses = [
        client.post("/nexus-ai/conversations/c1/messages", json={"message": "hola"}).status_code
        for _ in range(nexus_ai.MESSAGES_PER_MINUTE + 1)
    ]
    assert statuses[: nexus_ai.MESSAGES_PER_MINUTE] == [200] * nexus_ai.MESSAGES_PER_MINUTE
    assert statuses[-1] == 429
    rate_limiter._windows.clear()


def test_active_chat_cache_is_bounded_and_evicts_least_recently_used(monkeypatch):
    nexus_ai._ACTIVE_CHATS.clear()
    monkeypatch.setattr(nexus_ai, "LlmChat", _LoopingChat)
    monkeypatch.setattr(nexus_ai, "_key", lambda: "test-key")
    monkeypatch.setattr(nexus_ai.LlmChat, "with_model", lambda self, *a: self, raising=False)
    monkeypatch.setattr(nexus_ai.LlmChat, "with_tools", lambda self, *a, **k: self, raising=False)
    monkeypatch.setattr(nexus_ai, "MAX_ACTIVE_CHATS", 3)
    for name in ("a", "b", "c"):
        nexus_ai._get_or_create_chat(name, {"name": "Org"})
    nexus_ai._get_or_create_chat("a", {"name": "Org"})  # touch: "b" is now the oldest
    nexus_ai._get_or_create_chat("d", {"name": "Org"})
    assert list(nexus_ai._ACTIVE_CHATS) == ["c", "a", "d"]
    nexus_ai._ACTIVE_CHATS.clear()
