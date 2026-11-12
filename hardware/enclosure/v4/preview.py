"""R4 offline review: installed geometry, interior service paths and actual flat STLs."""

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
    return {
        "origin": origin.tolist(),
        "vertices": base64.b64encode(data.tobytes()).decode(),
        "indices": base64.b64encode(f.astype("<u2").tobytes()).decode(),
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
    boards = ("RAK_BASE", "INA226", "SHT41", "SCD41", "BME688", "SGP41")
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
            if kind in ("reserve", "cable")
            else "reference"
            if kind in ("reference", "glass", "membrane", "mesh")
            else "service"
        )
        focuses = ["air", "optics"] if n == "body" else []
        for name in boards:
            if n.endswith("_" + name) or n.startswith("rivet_" + name + "_"):
                focuses.append("pcb_" + name)
        if any(
            n.endswith("_" + q) or n.startswith("rivet_" + q + "_") for q in air
        ) or n.startswith(("mesh_", "ref_mesh", "sps_")):
            focuses.append("air")
        if "LTR390" in n or n.startswith(("quartz_", "ref_quartz")):
            focuses.append("optics")
        if "IN43434" in n or n.startswith(("microphone_", "ref_gore")):
            focuses.append("mic")
        explode = 0
        direction = [0, 0, 1]
        if n in ("tray_LTR390", "collar_LTR390", "ref_LTR390"):
            explode = 30
            direction = [-1, 0, 0]
        if n.startswith("rivet_LTR390"):
            explode = 5.3
            direction = [0, 0.7071, 0.7071]
        if n in ("tray_IN43434", "collar_IN43434", "ref_IN43434"):
            explode = 25
            direction = [1, 0, 0]
        if n.startswith("rivet_IN43434"):
            explode = 32
            direction = [1, 0, 0]
        scene.append(
            {
                "name": n,
                "category": cat,
                "focuses": focuses,
                "tpu": kind == "tpu",
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
        "all": {
            "target": [0, -3, 25],
            "distance": 340,
            "az": 0.6,
            "el": 0.35,
            "note": "Ziehen: drehen · Mausrad: zoomen. Deckel und Gehäuse lassen sich ausblenden.",
        },
        "air": {
            "target": [0, -48, 18],
            "distance": 245,
            "az": 0.4,
            "el": -0.15,
            "note": "Unterer Messraum im Schnitt an der Trennwand: zwei Sieböffnungen. SPS30 mit umlaufenden TPU-Bändern; kurze Führung nur am Auslass.",
        },
        "optics": {
            "target": [34, 61, 24],
            "distance": 145,
            "az": 0.5,
            "el": -0.4,
            "note": "LTR innen unter dem Fenster. Zum Ausbau Niete ziehen, dann den Träger 30 mm nach links verschieben. Orange Chipmarkierung: Fotoannahme.",
        },
        "mic": {
            "target": [-74, 25, 28],
            "distance": 100,
            "az": 1.0,
            "el": 0.1,
            "note": "Mikrofon innen hinter der linken Seitenwand. Niete von innen ziehen, dann den Träger von der Wand wegnehmen. Membran liegt außen bündig.",
        },
        "print_SHT41": {
            "target": [0, 0, 3],
            "distance": 105,
            "az": 0.4,
            "el": 0.65,
            "note": "Tatsächliche STL-Drucklagen: starre Aufnahme links, TPU-Randfassung mittig, zwei elastische Niete rechts. Aufbau in Z.",
        },
        "print_SPS30": {
            "target": [0, 0, 5],
            "distance": 175,
            "az": 0.4,
            "el": 0.65,
            "note": "Tatsächliche STL-Drucklagen: SPS-Wiege links, ein TPU-Band rechts (zweimal drucken), zwei Niete darüber.",
        },
    }
    crops = [
        ("mic", (-68, 25, 25), (38, 38, 50)),
    ]
    for name in boards:
        b = parts["tray_" + name].BoundingBox()
        cx, cy = (b.xmin + b.xmax) / 2, (b.ymin + b.ymax) / 2
        targets["pcb_" + name] = {
            "target": [cx, cy, 8],
            "distance": max(b.xlen, b.ylen) * 2.3 + 25,
            "az": 0.5,
            "el": 0.6,
            "note": name
            + ": separate flach gedruckte Aufnahme, TPU-Randfassung und zwei Blindniete. Die Aufnahme ist hier separat dargestellt; die Rückwandauflage ist im Gesamtmodell sichtbar.",
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
    marker = (
        cq.Solid.makeCylinder(0.7, 0.1, cq.Vector(0, 0, -9.5))
        .rotate((0, 0, 0), (1, 0, 0), -45)
        .translate((43, 71, 35))
    )
    scene.append(
        {
            "name": "uv_photo_assumption",
            "category": "reference",
            "focuses": ["optics"],
            "data": mesh(marker),
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
                ("collar_SHT41", (13, 0, 0)),
                ("rivet_SHT41_0", (34, -5, 0)),
                ("rivet_SHT41_1", (34, 5, 0)),
            ],
        ),
        (
            "print_SPS30",
            "SPS30",
            [
                ("tray_SPS30", (-32, 0, 0)),
                ("sps_band_0", (26, 0, 0)),
                ("rivet_SPS30_0", (18, 18, 0)),
                ("rivet_SPS30_1", (30, 18, 0)),
            ],
        ),
    ]:
        for n, shift in placements:
            key = "rivet_SHT41_0" if n.startswith("rivet_") else n
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
                    "tpu": n.startswith(("collar", "rivet", "sps_band")),
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
            "Sensorgehäuse R4", "R4 · Zwischenstand, noch nicht freigegeben"
        )
    (p / "review.html").write_text(template.replace("__SCENE__", payload))
    print("R4 review:", (p / "review.html").stat().st_size, "bytes")


if __name__ == "__main__":
    main()
