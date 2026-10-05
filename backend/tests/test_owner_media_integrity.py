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
        self.platform_settings=Collection(); self.organizations=Collection(); self.services=Collection(); self.barbers=Collection(); self.catalog_products=Collection(); self.media_blobs=Collection()

def test_candidate_recognizes_managed_catalog_url(monkeypatch, tmp_path):
    monkeypatch.setattr(subject, "_safe_catalog_path", lambda org, name: tmp_path / org / name)
    assert subject._candidate("/api/media/catalog/org_1/0123456789abcdef0123456789abcdef.webp") == ("catalog", "org_1/0123456789abcdef0123456789abcdef.webp", tmp_path / "org_1" / "0123456789abcdef0123456789abcdef.webp")

def test_candidate_ignores_external_url(): assert subject._candidate("https://example.com/image.png") is None

def test_report_marks_missing_reference_recoverable(monkeypatch, tmp_path):
    db=DB(); url='/api/media/catalog/org_1/0123456789abcdef0123456789abcdef.webp'
    db.catalog_products=Collection([{'organization_id':'org_1','product_id':'p1','photos':[url]}])
    db.media_blobs=Collection([{'namespace':'catalog','key':'org_1/0123456789abcdef0123456789abcdef.webp','data':b'x'}])
    monkeypatch.setattr(subject, '_safe_catalog_path', lambda *_: tmp_path/'missing.webp')
    report=asyncio.run(subject.build_report(db))
    assert report['broken'][0]['recoverable_from_mirror'] is True

def test_report_marks_lost_reference(monkeypatch, tmp_path):
    db=DB(); url='/api/media/catalog/org_1/0123456789abcdef0123456789abcdef.webp'
    db.catalog_products=Collection([{'organization_id':'org_1','product_id':'p1','photos':[url]}])
    monkeypatch.setattr(subject, '_safe_catalog_path', lambda *_: tmp_path/'missing.webp')
    assert asyncio.run(subject.build_report(db))['broken'][0]['recoverable_from_mirror'] is False

def test_router_rejects_non_owner():
    async def current(*_): return SimpleNamespace(role='manager', access_status='approved')
    route=next(r for r in subject.build_owner_media_integrity_router(DB(), current).routes if r.path.endswith('/integrity'))
    with pytest.raises(HTTPException) as exc: asyncio.run(route.endpoint())
    assert exc.value.status_code == 403


def test_platform_logo_is_read_by_its_settings_id_and_reported_when_missing(monkeypatch, tmp_path):
    db = DB()
    url = '/api/media/platform/0123456789abcdef0123456789abcdef.webp'
    db.platform_settings = Collection([
        {'settings_id': 'something_else', 'platform_logo_url': None},
        {'settings_id': 'platform_branding', 'platform_logo_url': url},
    ])
    monkeypatch.setattr(subject, 'platform_root', lambda: tmp_path)
    broken = asyncio.run(subject.build_report(db))['broken']
    assert [b['kind'] for b in broken] == ['platform_logo'] and broken[0]['url'] == url


def test_professional_avatar_field_is_checked(monkeypatch, tmp_path):
    db = DB()
    url = '/api/media/professionals/org_1/0123456789abcdef0123456789abcdef.webp'
    db.barbers = Collection([{'organization_id': 'org_1', 'barber_id': 'b1', 'avatar': url}])
    monkeypatch.setattr(subject, 'professional_root', lambda: tmp_path)
    broken = asyncio.run(subject.build_report(db))['broken']
    assert [(b['kind'], b['entity_id']) for b in broken] == [('professional_photo', 'b1')]
    (tmp_path / 'org_1').mkdir()
    (tmp_path / 'org_1' / '0123456789abcdef0123456789abcdef.webp').write_bytes(b'x')
    assert asyncio.run(subject.build_report(db))['broken'] == []


def test_findings_carry_the_organization_name_so_the_page_does_not_show_raw_ids(monkeypatch, tmp_path):
    db = DB()
    url = '/api/media/catalog/org_1/0123456789abcdef0123456789abcdef.webp'
    db.organizations = Collection([{'organization_id': 'org_1', 'name': 'Fortis Barber Shop'}])
    db.catalog_products = Collection([{'organization_id': 'org_1', 'product_id': 'p1', 'photos': [url]}])
    monkeypatch.setattr(subject, '_safe_catalog_path', lambda *_: tmp_path / 'missing.webp')
    broken = asyncio.run(subject.build_report(db))['broken']
    assert broken[0]['organization_id'] == 'org_1' and broken[0]['organization_name'] == 'Fortis Barber Shop'
