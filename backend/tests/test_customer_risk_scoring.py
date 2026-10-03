import asyncio
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from customer_risk_scoring import score_client

NOW=datetime(2026,10,3,tzinfo=timezone.utc)
def client(**extra): return {'client_id':'c1','organization_id':'o1','total_visits':4,'created_at':(NOW-timedelta(days=90)).isoformat(),'last_visit':(NOW-timedelta(days=45)).isoformat(),**extra}
def test_overdue_client_gets_transparent_risk_score():
    score=score_client(client(), NOW)
    assert score['band'] in {'medium','high'} and score['signals']['days_since_last_visit']==45

def test_recent_client_without_no_shows_is_not_scored():
    assert score_client(client(last_visit=(NOW-timedelta(days=10)).isoformat()), NOW) is None

def test_no_show_creates_risk_signal_even_when_recent():
    score=score_client(client(last_visit=(NOW-timedelta(days=10)).isoformat(), no_show_count=2), NOW)
    assert score['signals']['no_show_count']==2
