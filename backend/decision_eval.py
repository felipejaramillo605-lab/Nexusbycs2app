"""Offline evaluation harness for interchangeable decision providers.

The harness deliberately makes no network calls and needs no credentials.  It
evaluates a provider's closed decisions against versioned, synthetic fixtures.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import statistics
import time
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Iterable

from decision_engine import HeuristicProvider


FIXTURES_DIR = Path(__file__).parent / "tests" / "fixtures"
SET_FILES = {
    "support": "decision_support_es.json",
    "nexus-ai-intent": "decision_nexus_ai_intent_es.json",
    "reviews": "decision_reviews_es.json",
}


def _safe_mean(values: Iterable[float]) -> float:
    values = list(values)
    return statistics.fmean(values) if values else 0.0


def _label_values(label: Any) -> dict[str, str]:
    """Normalize a fixture label or provider choice into named comparisons."""
    if isinstance(label, dict):
        return {str(key): str(value) for key, value in label.items()}
    return {"choice": str(label)}


def confusion_matrix(rows: list[tuple[str, str]]) -> dict[str, dict[str, int]]:
    matrix: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for expected, actual in rows:
        matrix[expected][actual] += 1
    return {expected: dict(actuals) for expected, actuals in sorted(matrix.items())}


def classification_metrics(rows: list[tuple[str, str]]) -> dict[str, Any]:
    """Return per-class and macro precision/recall/F1 for closed labels."""
    labels = sorted({value for row in rows for value in row})
    per_class: dict[str, dict[str, float | int]] = {}
    for label in labels:
        true_positive = sum(expected == label and actual == label for expected, actual in rows)
        false_positive = sum(expected != label and actual == label for expected, actual in rows)
        false_negative = sum(expected == label and actual != label for expected, actual in rows)
        precision = true_positive / (true_positive + false_positive) if true_positive + false_positive else 0.0
        recall = true_positive / (true_positive + false_negative) if true_positive + false_negative else 0.0
        f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
        per_class[label] = {"support": true_positive + false_negative, "precision": precision, "recall": recall, "f1": f1}
    return {
        "accuracy": sum(expected == actual for expected, actual in rows) / len(rows) if rows else 0.0,
        "macro_precision": _safe_mean(item["precision"] for item in per_class.values()),
        "macro_recall": _safe_mean(item["recall"] for item in per_class.values()),
        "macro_f1": _safe_mean(item["f1"] for item in per_class.values()),
        "per_class": per_class,
        "confusion_matrix": confusion_matrix(rows),
    }


def calibration(confidences: list[tuple[float, bool]], bucket_count: int = 5) -> dict[str, Any]:
    """Compute fixed-bucket expected calibration error (ECE)."""
    buckets = [{"count": 0, "confidence": [], "correct": []} for _ in range(bucket_count)]
    for confidence, correct in confidences:
        confidence = min(1.0, max(0.0, float(confidence)))
        buckets[min(bucket_count - 1, int(confidence * bucket_count))]["confidence"].append(confidence)
        buckets[min(bucket_count - 1, int(confidence * bucket_count))]["correct"].append(1.0 if correct else 0.0)
    total = len(confidences) or 1
    result, ece = [], 0.0
    for index, bucket in enumerate(buckets):
        count = len(bucket["confidence"])
        average_confidence = _safe_mean(bucket["confidence"])
        accuracy = _safe_mean(bucket["correct"])
        ece += (count / total) * abs(accuracy - average_confidence)
        result.append({"range": [index / bucket_count, (index + 1) / bucket_count], "count": count, "confidence": average_confidence, "accuracy": accuracy})
    return {"ece": ece, "buckets": result}


async def evaluate(provider: Any, examples: list[dict[str, Any]], kind: str) -> dict[str, Any]:
    comparisons: dict[str, list[tuple[str, str]]] = defaultdict(list)
    confidences: list[tuple[float, bool]] = []
    latencies: list[float] = []
    for example in examples:
        started = time.perf_counter()
        result = await provider.decide(kind, example["text"], example.get("options"))
        latencies.append((time.perf_counter() - started) * 1000)
        expected = _label_values(example["label"])
        actual = _label_values(result.get("choice"))
        matched = True
        for name, expected_value in expected.items():
            actual_value = actual.get(name, "__missing__")
            comparisons[name].append((expected_value, actual_value))
            matched = matched and actual_value == expected_value
        confidences.append((float(result.get("confidence", 0)), matched))
    ordered = sorted(latencies)
    p95 = ordered[max(0, int(len(ordered) * 0.95) - 1)] if ordered else 0.0
    return {
        "examples": len(examples),
        "metrics": {name: classification_metrics(rows) for name, rows in comparisons.items()},
        "calibration": calibration(confidences),
        "latency_ms": {"mean": _safe_mean(latencies), "p95": p95},
    }


def load_examples(name: str) -> list[dict[str, Any]]:
    try:
        filename = SET_FILES[name]
    except KeyError as error:
        raise ValueError(f"Unknown evaluation set: {name}") from error
    return json.loads((FIXTURES_DIR / filename).read_text(encoding="utf-8"))


def _format_report(name: str, report: dict[str, Any]) -> str:
    lines = [f"Decision evaluation: {name} ({report['examples']} examples)"]
    for dimension, metrics in report["metrics"].items():
        lines.append(f"{dimension}: accuracy={metrics['accuracy']:.3f} macro_f1={metrics['macro_f1']:.3f}")
    lines.append(f"calibration: ECE={report['calibration']['ece']:.3f}")
    lines.append(f"latency: mean={report['latency_ms']['mean']:.2f}ms p95={report['latency_ms']['p95']:.2f}ms")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--provider", choices=["heuristic"], default="heuristic")
    parser.add_argument("--set", dest="set_name", choices=sorted(SET_FILES), required=True)
    args = parser.parse_args()
    report = asyncio.run(evaluate(HeuristicProvider(), load_examples(args.set_name), "support" if args.set_name == "support" else args.set_name))
    print(_format_report(args.set_name, report))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
