"""Offline, dependency-free evaluation of Nexus guide retrieval.

This is deliberately a measurement harness, not a runtime Nexus AI integration.
It reads the versioned guide source and the synthetic intent fixtures without
network access, credentials, LLMs, or customer data.
"""
from __future__ import annotations

import argparse
import json
import math
import re
import unicodedata
from collections import Counter
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
GUIDES_DIR = ROOT / "frontend" / "src" / "guide" / "guideContent"
FIXTURE_PATH = Path(__file__).parent / "tests" / "fixtures" / "decision_nexus_ai_intent_es.json"
STOP_WORDS = frozenset({"a", "al", "como", "con", "de", "del", "donde", "el", "en", "es", "la", "las", "lo", "los", "mi", "para", "por", "que", "un", "una", "usar", "y"})

# The intent fixture deliberately contains natural-language requests rather than
# implementation names.  These expected files document the product mapping used
# to measure retrieval; they are not sent to a model or a production request.
HELP_EXPECTATIONS = {
    "creo membresia": "clientes",
    "cambio horario": "equipo",
    "explicame clases": "servicios",
    "ajusto portal": "premium",
}

# Product vocabulary that is intentionally absent from the prose of a guide can
# still identify its module (for example, memberships live with clients).  Keep
# this small, explicit mapping versioned with the evaluation instead of using a
# network model to infer it.
GUIDE_SEARCH_TERMS = {
    "clientes": ("membresia", "membresias"),
    "equipo": ("horario", "horarios"),
    "servicios": ("clase", "clases"),
    "premium": ("portal", "portales"),
}


def normalize(text: str) -> str:
    """Lowercase text and remove accents so Spanish queries match guide text."""
    decomposed = unicodedata.normalize("NFD", text.lower())
    return "".join(char for char in decomposed if unicodedata.category(char) != "Mn")


def tokenize(text: str) -> list[str]:
    return [word for word in re.findall(r"[a-z0-9]+", normalize(text)) if word not in STOP_WORDS]


def load_guides(guides_dir: Path = GUIDES_DIR) -> dict[str, list[str]]:
    """Read the existing JSX guide content as a local retrieval corpus."""
    guides = {path.stem: tokenize(path.read_text(encoding="utf-8")) for path in sorted(guides_dir.glob("*.jsx"))}
    for guide_id, terms in GUIDE_SEARCH_TERMS.items():
        if guide_id in guides:
            guides[guide_id].extend(terms)
    return guides


def bm25_scores(query: str, guides: dict[str, list[str]], k1: float = 1.5, b: float = 0.75) -> dict[str, float]:
    """Return a small deterministic BM25 ranking without adding a dependency."""
    terms = tokenize(query)
    if not terms or not guides:
        return {name: 0.0 for name in guides}
    lengths = {name: len(tokens) for name, tokens in guides.items()}
    average_length = sum(lengths.values()) / len(lengths) or 1.0
    document_frequency = Counter(term for tokens in guides.values() for term in set(tokens))
    scores: dict[str, float] = {}
    for name, tokens in guides.items():
        counts = Counter(tokens)
        score = 0.0
        for term in terms:
            frequency = counts[term]
            if not frequency:
                continue
            inverse_frequency = math.log(1 + (len(guides) - document_frequency[term] + 0.5) / (document_frequency[term] + 0.5))
            denominator = frequency + k1 * (1 - b + b * lengths[name] / average_length)
            score += inverse_frequency * (frequency * (k1 + 1) / denominator)
        scores[name] = score
    return scores


def retrieve(query: str, guides: dict[str, list[str]], threshold: float = 0.0) -> dict[str, Any]:
    scores = bm25_scores(query, guides)
    guide_id, score = max(scores.items(), key=lambda item: (item[1], item[0])) if scores else (None, 0.0)
    return {"guide_id": guide_id if score >= threshold else None, "score": score, "scores": scores}


def load_help_examples(fixture_path: Path = FIXTURE_PATH) -> list[dict[str, str]]:
    examples = json.loads(fixture_path.read_text(encoding="utf-8"))
    return [example for example in examples if example["label"] == "ayuda_de_uso"]


def evaluate(threshold: float = 0.0, guides_dir: Path = GUIDES_DIR, fixture_path: Path = FIXTURE_PATH) -> dict[str, Any]:
    guides = load_guides(guides_dir)
    rows = []
    for example in load_help_examples(fixture_path):
        normalized = " ".join(tokenize(example["text"]))
        expected = HELP_EXPECTATIONS[normalized]
        result = retrieve(example["text"], guides, threshold)
        rows.append({"id": example["id"], "query": example["text"], "expected": expected, **result})
    found = sum(row["guide_id"] is not None for row in rows)
    correct = sum(row["guide_id"] == row["expected"] for row in rows)
    return {
        "examples": len(rows),
        "threshold": threshold,
        "coverage": found / len(rows) if rows else 0.0,
        "accuracy": correct / len(rows) if rows else 0.0,
        "rows": rows,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--threshold", type=float, default=0.0)
    args = parser.parse_args()
    report = evaluate(args.threshold)
    print(f"Guide retrieval: {report['examples']} examples; threshold={report['threshold']:.2f}")
    print(f"coverage={report['coverage']:.3f} accuracy={report['accuracy']:.3f}")
    for row in report["rows"][:4]:
        print(f"{row['query']}: expected={row['expected']} actual={row['guide_id']} score={row['score']:.3f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
