"""Contract coverage for the database-side transaction dashboard summary."""

import asyncio
import sys
from pathlib import Path
from types import SimpleNamespace


BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

import server  # noqa: E402


class AggregateCursor:
    async def to_list(self, length):
        assert length == 1
        return [
            {
                "totals": [
                    {
                        "transaction_count": 2,
                        "total_service_price": 30000,
                        "total_discount": 2500,
                        "total_net_service_amount": 27500,
                        "total_tips": 1500,
                        "total_received": 29000,
                        "total_staff_commission": 12000,
                        "total_business_amount": 15500,
                        "total_staff_amount": 13500,
                    }
                ],
                "payment_methods": [
                    {"method": "cash", "count": 2, "total_received": 29000},
                ],
                "daily_totals": [
                    {
                        "date": "2026-10-10",
                        "total_received": 29000,
                        "net_service_amount": 27500,
                        "transaction_count": 2,
                    }
                ],
            }
        ]


class Transactions:
    def __init__(self):
        self.pipeline = None

    def aggregate(self, pipeline):
        self.pipeline = pipeline
        return AggregateCursor()

    def find(self, *_args, **_kwargs):
        raise AssertionError("transaction_summary must not load all transactions into the API process")


def test_transaction_summary_uses_one_aggregate_and_preserves_response(monkeypatch):
    transactions = Transactions()
    monkeypatch.setattr(server, "db", SimpleNamespace(transactions=transactions))

    async def current_user(*_args):
        return SimpleNamespace(role="manager", organization_id="org-a")

    async def query(*_args):
        return {"organization_id": "org-a", "status": "confirmed"}

    monkeypatch.setattr(server, "get_current_user", current_user)
    monkeypatch.setattr(server, "transaction_query", query)

    result = asyncio.run(server.transaction_summary())

    assert result["transaction_count"] == 2
    assert result["total_received"] == 29000.0
    assert result["average_ticket"] == 14500.0
    assert result["payment_methods"] == [{"method": "cash", "count": 2, "total_received": 29000.0}]
    assert result["daily_totals"][0]["net_service_amount"] == 27500.0
    assert transactions.pipeline[0] == {"$match": {"organization_id": "org-a", "status": "confirmed"}}
    assert "$facet" in transactions.pipeline[-1]


def test_transaction_summary_returns_zeroes_when_the_aggregate_has_no_matches(monkeypatch):
    class EmptyCursor:
        async def to_list(self, _length):
            return [{"totals": [], "payment_methods": [], "daily_totals": []}]

    class EmptyTransactions:
        def aggregate(self, _pipeline):
            return EmptyCursor()

    monkeypatch.setattr(server, "db", SimpleNamespace(transactions=EmptyTransactions()))

    async def current_user(*_args):
        return SimpleNamespace(role="manager", organization_id="org-a")

    async def query(*_args):
        return {"organization_id": "org-a"}

    monkeypatch.setattr(server, "get_current_user", current_user)
    monkeypatch.setattr(server, "transaction_query", query)

    result = asyncio.run(server.transaction_summary())

    assert result["transaction_count"] == 0
    assert result["total_received"] == 0.0
    assert result["average_ticket"] == 0.0
    assert result["payment_methods"] == []
    assert result["daily_totals"] == []
