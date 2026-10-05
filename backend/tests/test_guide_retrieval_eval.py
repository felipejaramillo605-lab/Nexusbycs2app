from pathlib import Path

from guide_retrieval_eval import HELP_EXPECTATIONS, evaluate, load_guides, normalize, retrieve, tokenize


def test_tokenize_normalizes_spanish_and_ignores_stop_words():
    assert tokenize("¿Dónde cambio mi horario?") == ["cambio", "horario"]
    assert normalize("Membresía") == "membresia"


def test_retrieval_returns_no_result_below_threshold():
    guides = {"agenda": ["cita", "horario"], "equipo": ["profesional", "horario"]}
    assert retrieve("poema", guides, threshold=0.1)["guide_id"] is None


def test_versioned_help_fixture_maps_to_expected_guides():
    report = evaluate()
    assert report["examples"] == 20
    assert report["coverage"] == 1.0
    assert report["accuracy"] >= 0.75
    assert {row["expected"] for row in report["rows"]} == set(HELP_EXPECTATIONS.values())


def test_load_guides_reads_the_real_guide_content():
    guides = load_guides(Path(__file__).resolve().parents[2] / "frontend" / "src" / "guide" / "guideContent")
    assert {"servicios", "equipo", "premium"}.issubset(guides)
