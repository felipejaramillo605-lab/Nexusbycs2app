from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import owner_media_integrity as subject


def test_candidate_recognizes_managed_catalog_url(monkeypatch, tmp_path):
    monkeypatch.setattr(subject, "_safe_catalog_path", lambda org, name: tmp_path / org / name)
    assert subject._candidate("/api/media/catalog/org_1/0123456789abcdef0123456789abcdef.webp") == (
        "catalog", "org_1/0123456789abcdef0123456789abcdef.webp", tmp_path / "org_1" / "0123456789abcdef0123456789abcdef.webp"
    )


def test_candidate_ignores_external_url():
    assert subject._candidate("https://example.com/image.png") is None
