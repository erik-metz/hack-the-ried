"""Create a standalone, offline WebGL review page from exported STEP parts.

Also checks each STEP reimport against its original validity and volume report.
No server or Fusion installation is needed. Not a manufacturing qualification.
"""

import argparse
import base64
import gzip
import json
import struct
from pathlib import Path

import cadquery as cq


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("export_dir", type=Path)
    args = parser.parse_args()
    out = args.export_dir
    positions = json.loads((out / "placement.json").read_text())
    report = json.loads((out / "validation.json").read_text())
    volumes = {r["part"]: r["volume_mm3"] for r in report["parts"]}
    scene = []
    fitted = {}
    loose = {
        "mesh_seat",
        "mesh_retainer",
        "window_gasket_tpu",
        "ltr390_carrier",
        "microphone_clip_coupon",
        "mast_saddle_40",
        "mast_saddle_50",
    }
    for name, pos in positions.items():
        shape = cq.importers.importStep(str(out / "parts" / f"{name}.step")).val()
        if not shape.isValid() or abs(shape.Volume() - volumes[name]) > max(
            0.01, volumes[name] * 1e-6
        ):
            raise ValueError(f"STEP round-trip failure: {name}")
        if name in loose:
            continue
        if name == "optical_cassette":
            shape = shape.rotate((0, 0, 0), (1, 0, 0), -80)
        elif name == "microphone_pod":
            shape = shape.rotate((0, 0, 0), (1, 0, 0), -90)
        shape = shape.translate(pos)
        fitted[name] = shape
        vs, fs = shape.tessellate(0.25, 0.35)
        data = []
        for face in fs:
            a, b, c = [vs[i] for i in face]
            norm = (b - a).cross(c - a)
            if norm.Length < 1e-9:
                continue
            norm = norm.normalized()
            for v in (a, b, c):
                data.extend((*v.toTuple(), *norm.toTuple()))
        cat = (
            "lid"
            if name == "lid"
            else "roof"
            if "roof" in name
            else "seal"
            if "tpu" in name
            else "body"
            if name == "body"
            else "mount"
            if name.startswith("mount")
            else "inside"
        )
        scene.append(
            {
                "name": name,
                "category": cat,
                "data": base64.b64encode(struct.pack(f"<{len(data)}f", *data)).decode(),
            }
        )
    # Reserved volumes are visually distinct from real detailed component CAD.
    refs = [
        ("RAK", 29, 40, 18, (-49, 38, 29)),
        ("INA226", 21, 20.2, 18, (-9, 49, 29)),
        ("I2C bus", 40, 20, 20, (34, 14, 26)),
        ("Silicagel", 50, 25, 18, (36, 53, 25)),
        ("SHT41", 13, 10.5, 17.6, (-65, -65, 28)),
        ("SCD41", 18.1, 21.5, 13.7, (-37, -61, 26)),
        ("BME688", 16.5, 18.5, 18.2, (-9, -61, 28)),
        ("SGP41", 10.5, 13, 17.6, (-65, -39, 28)),
        ("SPS30", 41.2, 41.2, 12.2, (51, -54, 15.1)),
    ]
    for name, w, h, d, pos in refs:
        shape = cq.Workplane().box(w, h, d).val().translate(pos)
        vs, fs = shape.tessellate(0.2, 0.3)
        data = []
        for face in fs:
            a, b, c = [vs[i] for i in face]
            n = (b - a).cross(c - a).normalized()
            for v in (a, b, c):
                data.extend((*v.toTuple(), *n.toTuple()))
        scene.append(
            {
                "name": name,
                "category": "reserve",
                "data": base64.b64encode(struct.pack(f"<{len(data)}f", *data)).decode(),
            }
        )
    collisions = {}
    for name in ("microphone_pod", "optical_cassette", "dry_tray", "climate_tray"):
        volume = fitted["body"].intersect(fitted[name]).Volume()
        collisions[name] = volume
        if volume > 1e-5:
            raise ValueError(f"Housing collision: {name}, {volume} mm3")
    report["selected_housing_collisions_mm3"] = collisions
    template = (Path(__file__).parent / "preview-template.html").read_text()
    (out / "review.html").write_text(
        template.replace(
            "__SCENE__",
            base64.b64encode(gzip.compress(json.dumps(scene).encode())).decode(),
        )
    )
    report["step_roundtrip"] = "all 26 parts valid, volumes match within tolerance"
    (out / "validation.json").write_text(json.dumps(report, indent=2))
    print("STEP reimport checked; review.html generated")


if __name__ == "__main__":
    main()
