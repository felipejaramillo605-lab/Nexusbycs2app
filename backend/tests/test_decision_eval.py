import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from decision_eval import calibration, classification_metrics, evaluate  # noqa: E402


class FixedProvider:
    async def decide(self, kind, text, options=None):
        return {"choice": {"category": "technical", "priority": "high"}, "confidence": 0.8}


def test_metrics_and_confusion_matrix_for_hand_calculated_rows():
    metrics = classification_metrics([("technical", "technical"), ("technical", "billing"), ("billing", "billing")])
    assert metrics["accuracy"] == 2 / 3
    assert metrics["per_class"]["technical"]["recall"] == 0.5
    assert metrics["confusion_matrix"]["technical"] == {"technical": 1, "billing": 1}


def test_calibration_uses_fixed_buckets_and_weighted_ece():
    report = calibration([(0.9, True), (0.9, False), (0.1, False), (0.1, False)], bucket_count=5)
    assert len(report["buckets"]) == 5
    assert report["ece"] == 0.25


def test_evaluate_accepts_any_async_decision_provider():
    report = asyncio.run(evaluate(FixedProvider(), [{"text": "error", "label": {"category": "technical", "priority": "high"}}], "support"))
    assert report["metrics"]["category"]["macro_f1"] == 1
    assert report["metrics"]["priority"]["macro_f1"] == 1
    assert report["latency_ms"]["p95"] >= 0
