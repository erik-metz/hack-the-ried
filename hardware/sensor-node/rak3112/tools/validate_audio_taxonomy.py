#!/usr/bin/env python3
"""Validate the draft taxonomy and its aliases against a YAMNet class-map CSV."""

from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_TAXONOMY = ROOT / "audio-event-taxonomy-v1.json"


def validate(taxonomy_path: Path, class_map_path: Path) -> list[str]:
    taxonomy = json.loads(taxonomy_path.read_text(encoding="utf-8"))
    with class_map_path.open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        if not {"index", "mid", "display_name"}.issubset(reader.fieldnames or []):
            raise ValueError("YAMNet CSV must contain index, mid, display_name columns")
        rows = list(reader)

    errors: list[str] = []
    class_names = {row["display_name"] for row in rows}
    if len(rows) != taxonomy.get("reference_models", {}).get("yamnet", {}).get("class_count"):
        errors.append(f"YAMNet class count differs from taxonomy metadata ({len(rows)} rows)")

    parents = taxonomy.get("parents", [])
    parent_ids = [item.get("id") for item in parents]
    if len(parent_ids) != len(set(parent_ids)):
        errors.append("parent IDs must be unique")

    classes = taxonomy.get("classes", [])
    ids = [item.get("id") for item in classes]
    slugs = [item.get("slug") for item in classes]
    if len(ids) != len(set(ids)):
        errors.append("class IDs must be unique")
    if len(slugs) != len(set(slugs)):
        errors.append("class slugs must be unique")

    for item in classes:
        if item.get("parent_id") not in parent_ids:
            errors.append(f"{item.get('slug')}: unknown parent_id {item.get('parent_id')}")
        for label in item.get("yamnet_labels", []):
            if label not in class_names:
                errors.append(f"{item.get('slug')}: YAMNet label does not exist: {label}")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("class_map", type=Path, help="Official yamnet_class_map.csv")
    parser.add_argument("--taxonomy", type=Path, default=DEFAULT_TAXONOMY)
    args = parser.parse_args()
    try:
        errors = validate(args.taxonomy, args.class_map)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1

    taxonomy = json.loads(args.taxonomy.read_text(encoding="utf-8"))
    mapped = sum(bool(item.get("yamnet_labels")) for item in taxonomy["classes"])
    print(
        f"OK: {len(taxonomy['classes'])} draft classes, "
        f"{mapped} with exact YAMNet label aliases; mappings remain candidates."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
