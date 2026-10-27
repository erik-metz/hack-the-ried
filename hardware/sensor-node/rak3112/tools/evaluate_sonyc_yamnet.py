#!/usr/bin/env python3
"""Evaluate YAMNet ranking on verified SONYC-UST test clips in local tar shards.

Only aggregate metrics are printed. Audio is read from tar members into memory;
this program does not extract or upload it. SONYC metadata coordinates are never
read or emitted. The source-to-YAMNet mappings below are coarse candidates.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import sys
import tarfile
import time
from collections import defaultdict
from pathlib import Path


MODEL_URL = "https://tfhub.dev/google/yamnet/1"
MAPPINGS = {
    "engine": (
        [
            "1-1_small-sounding-engine_presence",
            "1-2_medium-sounding-engine_presence",
            "1-3_large-sounding-engine_presence",
            "1-X_engine-of-uncertain-size_presence",
        ],
        [
            "1-1_small-sounding-engine_presence",
            "1-2_medium-sounding-engine_presence",
            "1-3_large-sounding-engine_presence",
            "1-X_engine-of-uncertain-size_presence",
        ],
        ["Engine"],
    ),
    "non_machinery_impact": (
        ["3-1_non-machinery-impact_presence"],
        ["3-1_non-machinery-impact_presence"],
        ["Bang"],
    ),
    "car_horn": (
        ["5-1_car-horn_presence"],
        [
            "5-1_car-horn_presence",
            "5-2_car-alarm_presence",
            "5-3_siren_presence",
            "5-4_reverse-beeper_presence",
            "5-X_other-unknown-alert-signal_presence",
        ],
        ["Vehicle horn, car horn, honking"],
    ),
    "siren": (
        ["5-3_siren_presence"],
        [
            "5-1_car-horn_presence",
            "5-2_car-alarm_presence",
            "5-3_siren_presence",
            "5-4_reverse-beeper_presence",
            "5-X_other-unknown-alert-signal_presence",
        ],
        ["Siren"],
    ),
    "reverse_beeper": (
        ["5-4_reverse-beeper_presence"],
        [
            "5-1_car-horn_presence",
            "5-2_car-alarm_presence",
            "5-3_siren_presence",
            "5-4_reverse-beeper_presence",
            "5-X_other-unknown-alert-signal_presence",
        ],
        ["Reversing beeps"],
    ),
    "music": (
        [
            "6-1_stationary-music_presence",
            "6-2_mobile-music_presence",
            "6-3_ice-cream-truck_presence",
            "6-X_music-from-uncertain-source_presence",
        ],
        [
            "6-1_stationary-music_presence",
            "6-2_mobile-music_presence",
            "6-3_ice-cream-truck_presence",
            "6-X_music-from-uncertain-source_presence",
        ],
        ["Music"],
    ),
    "human_voice": (
        [
            "7-1_person-or-small-group-talking_presence",
            "7-2_person-or-small-group-shouting_presence",
            "7-3_large-crowd_presence",
            "7-4_amplified-speech_presence",
            "7-X_other-unknown-human-voice_presence",
        ],
        [
            "7-1_person-or-small-group-talking_presence",
            "7-2_person-or-small-group-shouting_presence",
            "7-3_large-crowd_presence",
            "7-4_amplified-speech_presence",
            "7-X_other-unknown-human-voice_presence",
        ],
        ["Speech", "Conversation", "Shout", "Crowd"],
    ),
    "dog_vocalization": (
        ["8-1_dog-barking-whining_presence"],
        ["8-1_dog-barking-whining_presence"],
        ["Bark", "Whimper (dog)"],
    ),
}


def parse_annotations(path: Path) -> dict[str, list[dict[str, str]]]:
    records: dict[str, list[dict[str, str]]] = defaultdict(list)
    with path.open(encoding="utf-8", newline="") as stream:
        for row in csv.DictReader(stream):
            if row.get("annotator_id") == "0" and row.get("split") == "test":
                records[row["audio_filename"]].append(row)
    return records


def source_label(rows: list[dict[str, str]], positive_columns: list[str], scope: list[str]) -> int | None:
    if any(row.get(column) == "1" for row in rows for column in positive_columns):
        return 1
    values = [row.get(column, "-1") for row in rows for column in scope]
    if values and all(value == "0" for value in values):
        return 0
    return None


def roc_auc(samples: list[tuple[int, float]]) -> float | None:
    positives = [score for label, score in samples if label == 1]
    negatives = [score for label, score in samples if label == 0]
    if not positives or not negatives:
        return None
    wins = sum(
        1.0 if positive > negative else 0.5 if positive == negative else 0.0
        for positive in positives
        for negative in negatives
    )
    return wins / (len(positives) * len(negatives))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("annotations", type=Path, help="SONYC-UST v2.3 annotations.csv")
    parser.add_argument("archives", nargs="+", type=Path, help="One or more audio-*.tar.gz shards")
    parser.add_argument("--model-url", default=MODEL_URL)
    args = parser.parse_args()

    try:
        import numpy as np
        import resampy
        import soundfile as sf
        import tensorflow as tf
        import tensorflow_hub as hub
    except ImportError as exc:
        print(f"Missing optional audio-baseline package: {exc}", file=sys.stderr)
        return 2

    records = parse_annotations(args.annotations)
    found: set[str] = set()
    samples: dict[str, list[tuple[int, float]]] = {name: [] for name in MAPPINGS}
    model = hub.load(args.model_url)
    with Path(model.class_map_path().numpy().decode("utf-8")).open(
        encoding="utf-8", newline=""
    ) as stream:
        class_names = [row["display_name"] for row in csv.DictReader(stream)]
    class_index = {name: index for index, name in enumerate(class_names)}

    started = time.perf_counter()
    for archive in args.archives:
        with tarfile.open(archive, mode="r:gz") as tar:
            for member in tar:
                if not member.isfile():
                    continue
                filename = Path(member.name).name
                rows = records.get(filename)
                if not rows:
                    continue
                if filename in found:
                    print(f"Duplicate audio filename across shards: {filename}", file=sys.stderr)
                    return 2
                extracted = tar.extractfile(member)
                if extracted is None:
                    continue
                audio, sample_rate = sf.read(
                    io.BytesIO(extracted.read()), dtype="float32", always_2d=True
                )
                mono = audio.mean(axis=1)
                if sample_rate != 16_000:
                    mono = resampy.resample(mono, sample_rate, 16_000)
                frame_scores, _, _ = model(mono.astype(np.float32))
                mean_scores = frame_scores.numpy().mean(axis=0)
                for target, (positive_columns, scope, yamnet_labels) in MAPPINGS.items():
                    truth = source_label(rows, positive_columns, scope)
                    if truth is None:
                        continue
                    score = max(float(mean_scores[class_index[label]]) for label in yamnet_labels)
                    samples[target].append((truth, score))
                found.add(filename)

    elapsed = time.perf_counter() - started
    report = {
        "dataset": "SONYC-UST v2.3",
        "split": "verified test only",
        "model": args.model_url,
        "versions": {
            "numpy": np.__version__,
            "resampy": resampy.__version__,
            "soundfile": sf.__version__,
            "tensorflow": tf.__version__,
            "tensorflow_hub": hub.__version__,
        },
        "verified_test_clips_in_annotations": len(records),
        "verified_test_clips_found_in_archives": len(found),
        "audio_processing_seconds": round(elapsed, 2),
        "metric": "per-class ROC AUC over mapped YAMNet score; no threshold tuning",
        "classes": {},
        "limitations": [
            "candidate coarse label mapping; not a validated HackTheRied taxonomy mapping",
            "scores are uncalibrated and one-shard results are not a representative benchmark",
            "classes with fewer than five positives are exploratory only",
        ],
    }
    for name, values in samples.items():
        positives = sum(label == 1 for label, _ in values)
        negatives = sum(label == 0 for label, _ in values)
        auc = roc_auc(values)
        report["classes"][name] = {
            "known_clips": len(values),
            "positive_clips": positives,
            "negative_clips": negatives,
            "roc_auc": None if auc is None else round(auc, 4),
            "support_note": "low support" if positives < 5 or negatives < 5 else None,
        }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
