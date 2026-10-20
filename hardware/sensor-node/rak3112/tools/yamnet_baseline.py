#!/usr/bin/env python3
"""Run local YAMNet inference on one WAV file without writing audio or scores."""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path


MODEL_URL = "https://tfhub.dev/google/yamnet/1"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("audio", type=Path, help="Local mono 16 kHz WAV file")
    parser.add_argument("--top-k", type=int, default=10)
    parser.add_argument("--model-url", default=MODEL_URL)
    args = parser.parse_args()
    if args.top_k < 1:
        parser.error("--top-k must be positive")
    if not args.audio.is_file():
        parser.error(f"audio file does not exist: {args.audio}")

    try:
        import numpy as np
        import soundfile as sf
        import tensorflow as tf
        import tensorflow_hub as hub
    except ImportError as exc:
        print(
            "Missing optional packages. Install the audio-baseline requirements; "
            "audio content is not sent to the model host.",
            file=sys.stderr,
        )
        print(f"Import error: {exc}", file=sys.stderr)
        return 2

    waveform, sample_rate = sf.read(args.audio, dtype="float32", always_2d=True)
    if sample_rate != 16_000:
        parser.error(f"expected 16000 Hz audio, got {sample_rate} Hz")
    if waveform.shape[1] != 1:
        parser.error(f"expected mono audio, got {waveform.shape[1]} channels")
    samples = waveform[:, 0]
    if samples.size == 0:
        parser.error("audio file is empty")

    model = hub.load(args.model_url)
    inference_start = time.perf_counter()
    scores, embeddings, _ = model(samples)
    inference_time_ms = (time.perf_counter() - inference_start) * 1000
    del embeddings
    frame_scores = scores.numpy()
    mean_scores = frame_scores.mean(axis=0)
    top_indices = np.argsort(mean_scores)[::-1][: args.top_k]
    with Path(model.class_map_path().numpy().decode("utf-8")).open(
        encoding="utf-8", newline=""
    ) as stream:
        import csv

        class_names = [row["display_name"] for row in csv.DictReader(stream)]

    result = {
        "model": "YAMNet",
        "model_url": args.model_url,
        "versions": {
            "numpy": np.__version__,
            "soundfile": sf.__version__,
            "tensorflow": tf.__version__,
            "tensorflow_hub": hub.__version__,
        },
        "sample_rate_hz": sample_rate,
        "duration_seconds": round(samples.size / sample_rate, 3),
        "frame_count": int(frame_scores.shape[0]),
        "inference_time_ms": round(inference_time_ms, 2),
        "aggregation": "mean of frame scores; scores are not calibrated probabilities",
        "predictions": [
            {"label": class_names[index], "score": float(mean_scores[index])}
            for index in top_indices
        ],
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
