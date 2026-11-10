"""Offline review using installed Fusion references and actual R3 mounting solids."""

import argparse
import base64
import gzip
import json
import struct
from pathlib import Path

import cadquery as cq
import numpy as np
import trimesh


def mesh(shape, max_faces=None):
    # Indexed, quantized geometry keeps the offline review below the inline limit.
    # Quantization is visualization-only (0.01 mm); STEP/STL exports are untouched.
    vs, fs = shape.tessellate(0.3, 0.5)
    if max_faces and len(fs) > max_faces:
        simple = trimesh.Trimesh(
            vertices=np.array([v.toTuple() for v in vs]),
            faces=np.array(fs),
            process=True,
        ).simplify_quadric_decimation(face_count=max_faces, aggression=5)
        vs = [cq.Vector(*v) for v in simple.vertices]
        fs = simple.faces.tolist()
    normals = [[0.0, 0.0, 0.0] for _ in vs]
    indices = []
    for face in fs:
        a, b, c = [vs[i] for i in face]
        n = (b - a).cross(c - a)
        if n.Length < 1e-9:
            continue
        indices.extend(face)
        for i in face:
            for j, v in enumerate(n.toTuple()):
                normals[i][j] += v
    packed = []
    for v, n in zip(vs, normals):
        length = sum(x * x for x in n) ** 0.5
        nn = [x / length if length else 0 for x in n]
        packed.extend(round(x * 100) for x in v.toTuple())
        packed.extend(round(x * 32767) for x in nn)
    return {
        "vertices": base64.b64encode(struct.pack(f"<{len(packed)}h", *packed)).decode(),
        "indices": base64.b64encode(
            struct.pack(f"<{len(indices)}I", *indices)
        ).decode(),
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("export_dir", type=Path)
    a = ap.parse_args()
    out = a.export_dir
    report = json.loads((out / "validation.json").read_text())
    if report["status"] != "checks-passed":
        raise ValueError("Mechanical checks have not passed")
    parts = {}
    scene = []
    for row in report["parts"]:
        n = row["part"]
        kind = row["kind"]
        if kind == "alternative":
            continue
        s = cq.importers.importStep(str(out / "parts" / f"{n}.step")).val()
        parts[n] = s
        cat = (
            "body"
            if n == "body"
            else "lid"
            if n == "lid"
            else "roof"
            if n == "rain_cap"
            else "mount"
            if n.startswith("mount")
            else "seal"
            if n == "flat_gasket_tpu"
            else "reserve"
            if kind == "reserve"
            else "reference"
            if kind == "reference"
            else "service"
        )
        focus = (
            "optics"
            if n.startswith(("quartz", "ltr_", "ref_LTR", "ref_quartz"))
            else "mic"
            if n.startswith(("microphone", "ref_IN", "ref_gore"))
            else "sps"
            if n
            in (
                "ref_SPS30",
                "sps_air_face_tpu",
                "mesh_service_frame_0",
                "mesh_service_frame_1",
                "holder_frame_SPS30",
                "holder_pin_SPS30",
                "ref_mesh_0",
                "ref_mesh_1",
            )
            else "sps"
            if any(n.endswith("_" + q) for q in ("SCD41", "BME688", "SGP41"))
            else "all"
        )
        explode = {
            "quartz_retainer": 24,
            "quartz_seat": 6,
            "microphone_front_plate": 18,
            "microphone_face_seal": 13,
            "ref_gore_membrane": 10,
            "microphone_acoustic_gasket": 6,
            "quartz_upper_pad": 17,
            "ref_quartz_glass": 12,
            "quartz_lower_seal": 8,
        }.get(n, 0)
        scene.append(
            {
                "name": n,
                "category": cat,
                "focus": focus,
                "explode": explode,
                "explodeDir": [-0.7071, -0.7071, 0]
                if focus == "mic"
                else [0, 0.7071, 0.7071],
                "glass": kind == "glass",
                "data": mesh(
                    s,
                    1500 if n == "ref_SPS30" else 1200 if n == "ref_RAK_BASE" else None,
                ),
            }
        )
    marker = (
        cq.Solid.makeCylinder(0.75, 0.12, cq.Vector(0, 0, -3))
        .rotate((0, 0, 0), (1, 0, 0), -45)
        .translate((42, 106, 34))
    )
    scene.append(
        {
            "name": "uv_photo_assumption",
            "category": "reference",
            "focus": "optics",
            "data": mesh(marker),
        }
    )
    for focus, center, size in [
        ("mic", (-98, 30, 27), (40, 60, 56)),
        ("sps", (0, -50, 24), (166, 68, 49)),
    ]:
        cropped = parts["body"].intersect(
            cq.Workplane().box(*size).translate(center).val()
        )
        scene.append(
            {
                "name": focus + "_housing_detail",
                "category": "detail",
                "focus": focus,
                "data": mesh(cropped),
            }
        )
    crop = cq.Workplane().box(58, 64, 58).translate((42, 102, 27)).val()
    scene.append(
        {
            "name": "optical_housing_detail",
            "category": "detail",
            "focus": "optics",
            "data": mesh(parts["body"].intersect(crop)),
        }
    )
    template = (Path(__file__).parent / "preview-template.html").read_text()
    payload = base64.b64encode(gzip.compress(json.dumps(scene).encode())).decode()
    (out / "review.html").write_text(template.replace("__SCENE__", payload))
    print("R3 review generated:", (out / "review.html").stat().st_size, "bytes")


if __name__ == "__main__":
    main()
