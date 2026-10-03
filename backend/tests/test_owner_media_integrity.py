from pathlib import Path
import asyncio
import sys
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import owner_media_integrity as subject

class Cursor:
    def __init__(self, rows): self.rows = rows
    async def to_list(self, limit): return self.rows[:limit]
class Collection:
    def __init__(self, rows=()): self.rows = list(rows)
    def find(self, *args, **kwargs): return Cursor(self.rows)
    async def find_one(self, query, *args, **kwargs):
        for row in self.rows:
            if all(row.get(k) == v for k, v in query.items()): return row
        return None
class DB:
    def __init__(self):
        self.platform_settings=Collection(); self.organizations=Collection(); self.services=Collection(); self.barbers=Collection(); self.catalog=Collection(); self.media_blobs=Collection()

def test_candidate_recognizes_managed_catalog_url(monkeypatch, tmp_path):
    monkeypatch.setattr(subject, "_safe_catalog_path", lambda org, name: tmp_path / org / name)
    assert subject._candidate("/api/media/catalog/org_1/0123456789abcdef0123456789abcdef.webp") == ("catalog", "org_1/0123456789abcdef0123456789abcdef.webp", tmp_path / "org_1" / "0123456789abcdef0123456789abcdef.webp")

def test_candidate_ignores_external_url(): assert subject._candidate("https://example.com/image.png") is None

def test_report_marks_missing_reference_recoverable(monkeypatch, tmp_path):
    db=DB(); url='/api/media/catalog/org_1/0123456789abcdef0123456789abcdef.webp'
    db.catalog=Collection([{'organization_id':'org_1','product_id':'p1','photos':[url]}])
    db.media_blobs=Collection([{'namespace':'catalog','key':'org_1/0123456789abcdef0123456789abcdef.webp','data':b'x'}])
    monkeypatch.setattr(subject, '_safe_catalog_path', lambda *_: tmp_path/'missing.webp')
    report=asyncio.run(subject.build_report(db))
    assert report['broken'][0]['recoverable_from_mirror'] is True

def test_report_marks_lost_reference(monkeypatch, tmp_path):
    db=DB(); url='/api/media/catalog/org_1/0123456789abcdef0123456789abcdef.webp'
    db.catalog=Collection([{'organization_id':'org_1','product_id':'p1','photos':[url]}])
    monkeypatch.setattr(subject, '_safe_catalog_path', lambda *_: tmp_path/'missing.webp')
    assert asyncio.run(subject.build_report(db))['broken'][0]['recoverable_from_mirror'] is False

def test_router_rejects_non_owner():
    async def current(*_): return SimpleNamespace(role='manager', access_status='approved')
    route=next(r for r in subject.build_owner_media_integrity_router(DB(), current).routes if r.path.endswith('/integrity'))
    with pytest.raises(HTTPException) as exc: asyncio.run(route.endpoint())
    assert exc.value.status_code == 403
