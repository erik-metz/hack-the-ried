"""R6 offline review: installed geometry, interior service paths and actual flat STLs."""

import argparse
import base64
import gzip
import hashlib
import json
from pathlib import Path

import cadquery as cq
import numpy as np
import trimesh


def packed(vertices, faces):
    v = np.asarray(vertices, dtype=float)
    f = np.asarray(faces, dtype=np.int64)
    if len(v) >= 65536:
        raise ValueError("Split oversized display mesh")
    normals = np.zeros_like(v)
    fn = np.cross(v[f[:, 1]] - v[f[:, 0]], v[f[:, 2]] - v[f[:, 0]])
    for i in range(3):
        np.add.at(normals, f[:, i], fn)
    lengths = np.linalg.norm(normals, axis=1)
    lengths[lengths == 0] = 1
    normals /= lengths[:, None]
    data = np.zeros(
        len(v), dtype=[("p", "<i2", (3,)), ("n", "i1", (3,)), ("pad", "u1")]
    )
    origin = np.round((v.min(axis=0) + v.max(axis=0)) / 2, 2)
    data["p"] = np.rint((v - origin) * 100).astype("<i2")
    data["n"] = np.rint(normals * 127).astype("i1")
    indices = f.ravel()
    deltas = np.diff(indices, prepend=0).astype("<u2")
    assert np.array_equal(np.cumsum(deltas, dtype=np.uint64) % 65536, indices)
    return {
        "origin": origin.tolist(),
        "vertices": base64.b64encode(data.tobytes()).decode(),
        "indices": base64.b64encode(deltas.tobytes()).decode(),
    }


def mesh(shape, max_faces=None):
    v, f = shape.tessellate(0.6, 1.0)
    v = np.array([p.toTuple() for p in v])
    f = np.array(f)
    if max_faces and len(f) > max_faces:
        q = trimesh.Trimesh(v, f, process=True).simplify_quadric_decimation(
            face_count=max_faces, aggression=8
        )
        v, f = q.vertices, q.faces
    return packed(v, f)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("export_dir", type=Path)
    ap.add_argument(
        "--draft",
        action="store_true",
        help="Watermarked internal review before validation",
    )
    a = ap.parse_args()
    p = a.export_dir
    r = json.loads((p / "validation.json").read_text())
    if r["status"] != "checks-passed" and not a.draft:
        raise ValueError("Validate the CAD before publishing review")
    scene = []
    parts = {}
    boards = ("RAK_BASE", "INA226", "SHT41", "SCD41", "BME688", "SGP41", "BUS", "SPS30")
    air = ("SPS30", "SCD41", "BME688", "SGP41")
    for row in r["parts"]:
        n = row["part"]
        kind = row["kind"]
        if kind == "alternative":
            continue
        s = cq.importers.importStep(str(p / "parts" / f"{n}.step")).val()
        parts[n] = s
        cat = (
            "body"
            if n == "body"
            else "lid"
            if n == "lid" or n.startswith("lid_screw_seal")
            else "seal"
            if n == "flat_gasket_tpu"
            else "mount"
            if n.startswith("mount_")
            else "reserve"
            if kind == "reserve"
            else "reference"
            if kind in ("reference", "glass", "membrane", "mesh", "cable", "marker")
            else "service"
        )
        focuses = ["air", "optics", "mic"] if n == "body" else []
        for name in boards:
            if n.endswith("_" + name) or n.startswith("carrier_clip_" + name + "_"):
                focuses.append("pcb_" + name)
        if any(
            n.endswith("_" + q) or n.startswith("carrier_clip_" + q + "_") for q in air
        ) or n.startswith(("mesh_", "ref_mesh", "sps_")):
            focuses.append("air")
        if "LTR390" in n or n.startswith(("quartz_", "ref_quartz")):
            focuses.append("optics")
        if "IN43434" in n or n.startswith(("microphone_", "ref_gore")):
            focuses.append("mic")
        if (
            "ANTENNA" in n
            or n.startswith("ref_N_PANEL")
            or "MHF4" in n
            or n.endswith("RAK_BASE")
            or n in ("body", "antenna_bulkhead_seal")
        ):
            focuses.append("antenna")
        if n != "ref_ANTENNA":
            focuses.append("case")
        explode = (
            12
            if n.startswith(("cap_", "sps_cap_"))
            else 5
            if n.startswith("ref_") and n[4:] in boards
            else 0
        )
        direction = [0, 0, 1]
        if n in ("tray_LTR390", "ref_LTR390", "ref_LTR390_UV_FACE"):
            explode = 30
            direction = [-1, 0, 0]
        if n.startswith("carrier_clip_LTR390"):
            explode = 5.3
            direction = [0, 0.581238, 0.813733]
        if n in ("tray_IN43434", "cap_IN43434", "ref_IN43434"):
            explode = 25
            direction = [1, 0, 0]
        if n.startswith("carrier_clip_IN43434"):
            explode = 32
            direction = [1, 0, 0]
        scene.append(
            {
                "name": n,
                "category": cat,
                "focuses": focuses,
                "tpu": kind == "tpu",
                "variant": "short" if n == "ref_ANTENNA_CABLE_GENTLE" else None,
                "glass": kind == "glass",
                "explode": explode,
                "explodeDir": direction,
                "data": mesh(
                    s,
                    1800 if n == "ref_SPS30" else 1000 if n == "ref_RAK_BASE" else None,
                ),
            }
        )
    targets = {
        "case": {
            "target": [0, -3, 25],
            "distance": 340,
            "az": 0.6,
            "el": 0.35,
            "note": "Gehäuse und Einbauten im Detail. Mit Antenne zeigt die vollständige stehende Originalantenne. Halter einzeln wählen und auseinanderziehen.",
        },
        "antenna": {
            "target": [-35, 64, 16],
            "distance": 205,
            "az": 0.2,
            "el": 0.3,
            "note": "RAK liegt tiefer; der MHF4-Ausgang zeigt vom Modul weg zur Antenne. Sanfter Ø3-mm-Freiraum statt Kabel über dem Schirm. Freie Kabellänge bleibt abzugleichen.",
        },
        "all": {
            "target": [-20, 125, 20],
            "distance": 740,
            "az": 0.6,
            "el": 0.2,
            "note": "Ziehen: drehen · Mausrad: zoomen. Deckel und Gehäuse lassen sich ausblenden.",
        },
        "air": {
            "target": [0, -48, 18],
            "distance": 245,
            "az": 0.4,
            "el": -0.15,
            "note": "Ein gemeinsamer offener Messraum mit genau zwei gesiebten Öffnungen. Der SPS-Kanal ist vollständig entfernt. Keine zusätzlichen Lüftungsschlitze.",
        },
        "optics": {
            "target": [53, 67, 34],
            "distance": 120,
            "az": 0.0,
            "el": 0.620249,
            "note": "Gold: UV-Referenz auf der zum Glas gerichteten Fläche. Glas ist transparent. Gehäuse ausblenden zeigt die ganze Platine. Für den Ausbau Träger-Steckclips ziehen, dann Modul seitlich herausnehmen.",
        },
        "mic": {
            "target": [-74, 24, 28],
            "distance": 100,
            "az": 1.0,
            "el": 0.1,
            "note": "Mikrofon innen, Membran außen bündig. Platine aus zwei PETG-Laschen lösen. Zwei separate TPU-Steckclips halten nur den Träger: keine Schrauben, kein Klebstoff.",
        },
        "print_SHT41": {
            "target": [0, 0, 3],
            "distance": 105,
            "az": 0.4,
            "el": 0.65,
            "note": "Tatsächliche STL-Drucklagen: Flach gedruckter PETG-Träger mit federnden PCB-Laschen und zwei separat gedruckte TPU-Trägerclips. Zum Sensorwechsel bleiben die TPU-Clips eingesetzt. Aufbau in Z.",
        },
        "print_SPS30": {
            "target": [0, 0, 5],
            "distance": 175,
            "az": 0.4,
            "el": 0.65,
            "note": "Tatsächliche STL-Drucklagen: SPS30-Clipträger und zwei Träger-Steckclips, jeweils in tatsächlicher STL-Drucklage. Sensor an den beiden PETG-Laschen ausclipsen.",
        },
    }
    crops = []
    for name in boards:
        b = parts["tray_" + name].BoundingBox()
        cx, cy = (b.xmin + b.xmax) / 2, (b.ymin + b.ymax) / 2
        targets["pcb_" + name] = {
            "target": [cx, cy, 8],
            "distance": max(b.xlen, b.ylen) * 2.3 + 25,
            "az": 0.5,
            "el": 0.6,
            "note": name
            + ": PCB mit zwei PETG-Federlaschen gehalten. Zum Wechsel Laschen spreizen und Platine abheben; kein Klebstoff. Die orangefarbenen TPU-Steckclips befestigen nur den Träger.",
        }
    for focus, center, size in crops:
        s = parts["body"].intersect(cq.Workplane().box(*size).translate(center).val())
        scene.append(
            {
                "name": "detail_" + focus,
                "category": "detail",
                "focuses": [focus],
                "data": mesh(s),
            }
        )
    # These meshes come straight from the deliverable STLs, without invented poses.
    print_cache = {}
    for focus, name, placements in [
        (
            "print_SHT41",
            "SHT41",
            [
                ("tray_SHT41", (-20, 0, 0)),
                ("carrier_clip_SHT41_0", (13, -5, 0)),
                ("carrier_clip_SHT41_1", (13, 5, 0)),
            ],
        ),
        (
            "print_SPS30",
            "SPS30",
            [
                ("tray_SPS30", (-32, 0, 0)),
                ("carrier_clip_SPS30_0", (18, -5, 0)),
                ("carrier_clip_SPS30_1", (18, 5, 0)),
            ],
        ),
    ]:
        for n, shift in placements:
            key = "carrier_clip_SHT41_0" if n.startswith("carrier_clip_") else n
            if key not in print_cache:
                m = trimesh.load(p / "parts" / f"{key}.stl", process=True)
                m = trimesh.graph.smooth_shade(
                    m, angle=np.deg2rad(40), facet_minarea=15
                )
                print_cache[key] = packed(m.vertices, m.faces)
            data = {
                **print_cache[key],
                "origin": [
                    v + shift[i] for i, v in enumerate(print_cache[key]["origin"])
                ],
            }
            scene.append(
                {
                    "name": "print_" + n,
                    "category": "print",
                    "focuses": [focus],
                    "tpu": n.startswith("carrier_clip_"),
                    "data": data,
                }
            )
        bed = (
            cq.Workplane()
            .box(125 if name == "SPS30" else 90, 60, 0.1)
            .translate((0, 0, -0.15))
            .val()
        )
        scene.append(
            {
                "name": "printbed_" + name,
                "category": "bed",
                "focuses": [focus],
                "data": mesh(bed),
            }
        )
    geometries = []
    geometry_ids = {}
    for item in scene:
        data = item.pop("data")
        item["origin"] = data.pop("origin")
        key = hashlib.sha256((data["vertices"] + data["indices"]).encode()).hexdigest()
        if key not in geometry_ids:
            geometry_ids[key] = len(geometries)
            geometries.append(data)
        item["geometry"] = geometry_ids[key]
    payload = base64.b64encode(
        gzip.compress(
            json.dumps(
                {"scene": scene, "geometries": geometries, "targets": targets},
                separators=(",", ":"),
            ).encode()
        )
    ).decode()
    template = (Path(__file__).parent / "preview-template.html").read_text()
    if a.draft:
        template = template.replace(
            "Sensorgehäuse R6", "R6 · Zwischenstand, noch nicht freigegeben"
        )
    (p / "review.html").write_text(template.replace("__SCENE__", payload))
    print("R6 review:", (p / "review.html").stat().st_size, "bytes")


if __name__ == "__main__":
    main()
