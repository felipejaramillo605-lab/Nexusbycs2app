"""seed_data.py must fail fast when DB_NAME is missing, never silently seed a
stray default database (previously defaulted to 'barbershop', unrelated to the
real DB_NAME the running app and tests use)."""
import asyncio
import pytest

from seed_data import seed_database


def test_seed_database_requires_db_name_env_var(monkeypatch):
    monkeypatch.delenv("DB_NAME", raising=False)
    with pytest.raises(KeyError):
        asyncio.run(seed_database())
