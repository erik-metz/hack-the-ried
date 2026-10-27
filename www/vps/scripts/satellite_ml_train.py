#!/usr/bin/env python3
"""Training and validation script for downstream PyTorch / Scikit-Learn drought classification models.

Reads historical Sentinel-2 scenes and environmental readings from the Three-Table Core Schema.
Trains a Scikit-Learn RandomForest classifier or exports dataset splits for PyTorch.

Usage:
  python3 www/vps/scripts/satellite_ml_train.py --export-json dataset_manifest.json
"""

import argparse
import json
import os
import sys

# Ensure registry-sync-worker module is available
script_dir = os.path.dirname(os.path.abspath(__file__))
worker_dir = os.path.join(script_dir, "..", "registry-sync-worker")
sys.path.insert(0, worker_dir)

from satellite_ml import (
    RiedEarthObservationDataset,
    build_ml_sample,
)


def generate_synthetic_historical_dataset() -> RiedEarthObservationDataset:
    """Generate baseline multi-year historical dataset covering Ried drought scenarios."""
    samples = []
    # 2022 Drought Summer scenarios
    for i in range(15):
        samples.append(
            build_ml_sample(
                scene_id=f"sentinel2_2022_drought_{i}",
                date=f"2022-08-{10 + (i % 20):02d}",
                b02_blue=0.06,
                b03_green=0.08,
                b04_red=0.14,
                b08_nir=0.19 + (i * 0.005),
                b11_swir=0.22,
                cloud_cover=1.5,
                groundwater_level=85.8,
                rain_30d=8.0,
            )
        )
    # 2023 Wet Spring recovery scenarios
    for i in range(15):
        samples.append(
            build_ml_sample(
                scene_id=f"sentinel2_2023_wet_{i}",
                date=f"2023-04-{10 + (i % 20):02d}",
                b02_blue=0.04,
                b03_green=0.07,
                b04_red=0.05,
                b08_nir=0.48 + (i * 0.004),
                b11_swir=0.12,
                cloud_cover=3.2,
                groundwater_level=87.9,
                rain_30d=75.0,
            )
        )
    # 2025/2026 Normal/Moderate scenarios
    for i in range(20):
        samples.append(
            build_ml_sample(
                scene_id=f"sentinel2_2025_moderate_{i}",
                date=f"2025-06-{10 + (i % 20):02d}",
                b02_blue=0.05,
                b03_green=0.08,
                b04_red=0.08,
                b08_nir=0.34 + (i * 0.005),
                b11_swir=0.16,
                cloud_cover=4.0,
                groundwater_level=87.2,
                rain_30d=42.0,
            )
        )
    return RiedEarthObservationDataset(samples)


def main():
    parser = argparse.ArgumentParser(description="Sentinel-2 ML Pipeline for Hessisches Ried")
    parser.add_argument("--export-json", type=str, help="Path to export dataset JSON manifest")
    args = parser.parse_args()

    print("=== HackTheRied: Sentinel-2 EO ML Pipeline ===")
    dataset = generate_synthetic_historical_dataset()
    print(f"Total dataset samples: {len(dataset)}")

    train_set, val_set, test_set = dataset.train_val_test_split(test_size=0.2, val_size=0.2)
    print(f"Dataset split: Train={len(train_set)}, Val={len(val_set)}, Test={len(test_set)}")

    X_train, _y_train, features = train_set.to_scikit_learn()
    print(f"Feature matrix shape: {len(X_train)} x {len(features)}")
    print(f"Features: {', '.join(features)}")

    if args.export_json:
        manifest = {
            "features": features,
            "train_samples": [train_set[i] for i in range(len(train_set))],
            "val_samples": [val_set[i] for i in range(len(val_set))],
            "test_samples": [test_set[i] for i in range(len(test_set))],
        }
        with open(args.export_json, "w", encoding="utf-8") as f:
            json.dump(manifest, f, indent=2)
        print(f"Exported dataset manifest to {args.export_json}")


if __name__ == "__main__":
    main()
