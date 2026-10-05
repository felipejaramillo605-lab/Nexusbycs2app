import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import scoring_daemon


def test_daemon_is_disabled_by_default(monkeypatch):
    monkeypatch.delenv("CUSTOMER_RISK_DAEMON_ENABLED", raising=False)
    assert scoring_daemon.enabled() is False


def test_daemon_only_enables_with_explicit_true(monkeypatch):
    monkeypatch.setenv("CUSTOMER_RISK_DAEMON_ENABLED", "true")
    assert scoring_daemon.enabled() is True


def test_disabled_cycle_does_not_need_database_configuration(monkeypatch):
    monkeypatch.delenv("CUSTOMER_RISK_DAEMON_ENABLED", raising=False)
    monkeypatch.delenv("MONGO_URL", raising=False)
    assert asyncio.run(scoring_daemon.run_cycle()) == {"mode": "disabled"}
