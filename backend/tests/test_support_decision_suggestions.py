import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from support_center import normalize_support_suggestion

def test_maps_local_technical_suggestion_to_manager_categories():
    assert normalize_support_suggestion({'category':'technical','priority':'urgent'}) == {'category':'peticion','priority':'high'}
def test_maps_billing_suggestion_without_forcing_unrecognized_values():
    assert normalize_support_suggestion({'category':'billing','priority':'normal'}) == {'category':'reclamo','priority':'normal'}
def test_unknown_suggestion_falls_back_to_manager_defaults():
    assert normalize_support_suggestion({}) == {'category':'otro','priority':'normal'}
