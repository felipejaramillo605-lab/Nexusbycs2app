"""Portable, deterministic client-risk baseline. It recommends; it never contacts or modifies clients."""
from __future__ import annotations
from datetime import datetime, timezone


def _date(value):
    if not value: return None
    try: return datetime.fromisoformat(str(value).replace('Z', '+00:00')).astimezone(timezone.utc)
    except ValueError: return None


def score_client(client, now=None):
    """Return transparent recurrence/no-show signals from already-held tenant data."""
    now = now or datetime.now(timezone.utc)
    visits = int(client.get('total_visits') or 0)
    last, first = _date(client.get('last_visit')), _date(client.get('created_at'))
    no_shows = int(client.get('no_show_count') or 0)
    if not last or visits < 2: return None
    usual = max((last - (first or last)).days, 1) / max(visits - 1, 1)
    gap = max((now - last).days, 0)
    overdue = gap > usual * 1.4 + 7
    score = min(100, round((min(gap / max(usual, 1), 4) / 4) * 65 + min(no_shows, 3) * 12))
    if not overdue and no_shows == 0: return None
    return {
        'client_id': client.get('client_id'), 'organization_id': client.get('organization_id'),
        'score': score, 'band': 'high' if score >= 70 else 'medium',
        'signals': {'days_since_last_visit': gap, 'usual_interval_days': round(usual, 1), 'no_show_count': no_shows},
        'model_version': 'baseline-v1', 'generated_at': now.isoformat(),
    }


async def refresh_scores(db, now=None, limit=10000):
    """Upsert tenant-scoped recommendations. This is intentionally non-notifying."""
    clients = await db.clients.find({}, {'_id': 0, 'client_id': 1, 'organization_id': 1, 'total_visits': 1, 'last_visit': 1, 'created_at': 1, 'no_show_count': 1}).to_list(limit)
    saved = 0
    for client in clients:
        score = score_client(client, now)
        if not score or not score['client_id'] or not score['organization_id']: continue
        await db.decision_scores.update_one({'organization_id': score['organization_id'], 'client_id': score['client_id'], 'kind': 'retention_risk'}, {'$set': {**score, 'kind': 'retention_risk'}}, upsert=True)
        saved += 1
    return {'scanned': len(clients), 'saved': saved, 'mode': 'recommendation_only'}
