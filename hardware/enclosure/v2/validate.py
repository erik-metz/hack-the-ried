"""Mechanical CAD checks; rigid translation tests are not load/creep certification."""

import argparse
import itertools
import json
import math
from pathlib import Path

import cadquery as cq
import trimesh


def overlap(a, b):
    aa, bb = a.BoundingBox(), b.BoundingBox()
    if any(
        getattr(aa, k + "max") <= getattr(bb, k + "min") + 1e-6
        or getattr(bb, k + "max") <= getattr(aa, k + "min") + 1e-6
        for k in "xyz"
    ):
        return 0.0
    # Exact spatial clipping: a box containing all of B cannot remove any A∩B.
    va = aa.xlen * aa.ylen * aa.zlen
    vb = bb.xlen * bb.ylen * bb.zlen
    if va > 3 * vb and len(a.Faces()) > 200:
        clip = (
            cq.Workplane()
            .box(bb.xlen + 0.1, bb.ylen + 0.1, bb.zlen + 0.1)
            .translate(
                (
                    (bb.xmin + bb.xmax) / 2,
                    (bb.ymin + bb.ymax) / 2,
                    (bb.zmin + bb.zmax) / 2,
                )
            )
            .val()
        )
        a = a.intersect(clip)
    elif vb > 3 * va and len(b.Faces()) > 200:
        clip = (
            cq.Workplane()
            .box(aa.xlen + 0.1, aa.ylen + 0.1, aa.zlen + 0.1)
            .translate(
                (
                    (aa.xmin + aa.xmax) / 2,
                    (aa.ymin + aa.ymax) / 2,
                    (aa.zmin + aa.zmax) / 2,
                )
            )
            .val()
        )
        b = b.intersect(clip)
    return a.intersect(b, tol=1e-5).Volume()


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("export_dir", type=Path)
    a = ap.parse_args()
    p = a.export_dir
    report = json.loads((p / "validation.json").read_text())
    meta = {r["part"]: r for r in report["parts"]}
    mesh_checks = []
    for name, row in meta.items():
        if row["kind"] not in ("print", "tpu", "alternative"):
            continue
        mesh = trimesh.load(p / "parts" / f"{name}.stl", process=True)
        ok = bool(mesh.is_watertight and mesh.is_winding_consistent and mesh.volume > 0)
        mesh_checks.append(
            {
                "part": name,
                "watertight": bool(mesh.is_watertight),
                "winding_consistent": bool(mesh.is_winding_consistent),
                "positive_volume": bool(mesh.volume > 0),
            }
        )
        if not ok:
            raise RuntimeError("Invalid printable STL: " + name)
    for path in sorted((p / "coupons").glob("*.stl")):
        mesh = trimesh.load(path, process=True)
        if not mesh.is_watertight or not mesh.is_winding_consistent or mesh.volume <= 0:
            raise RuntimeError("Invalid coupon mesh: " + path.name)
    report["printable_meshes"] = mesh_checks
    report["coupon_meshes_checked"] = len(list((p / "coupons").glob("*.stl")))
    parts = {}
    for name, row in meta.items():
        s = cq.importers.importStep(str(p / "parts" / f"{name}.step")).val()
        if not s.isValid() or abs(s.Volume() - row["volume_mm3"]) > max(
            0.01, row["volume_mm3"] * 1e-5
        ):
            raise RuntimeError("STEP mismatch: " + name)
        if row["kind"] != "alternative":
            parts[name] = s
    collisions = []
    for na, nb in itertools.combinations(parts, 2):
        if "body" in (na, nb):
            print("checking", na, nb, flush=True)
        v = overlap(parts[na], parts[nb])
        if v > 0.01:
            collisions.append({"a": na, "b": nb, "volume_mm3": round(v, 5)})
    print("COLLISIONS", json.dumps(collisions, indent=2), flush=True)
    retention = {}
    for name in (
        "SPS30",
        "SHT41",
        "SGP41",
        "SCD41",
        "BME688",
        "INA226",
        "RAK_BASE",
        "LTR390",
        "IN43434",
    ):
        fixture = cq.importers.importStep(
            str(p / "parts" / f"fixture_check_{name}.step")
        ).val()
        ref = parts["ref_" + name]
        if name in ("LTR390", "IN43434"):
            # These two references use a rotated outward-normal coordinate system.
            angle = -45 if name == "LTR390" else 90
            z = (0, -math.sin(math.radians(angle)), math.cos(math.radians(angle)))
            y = (0, math.cos(math.radians(angle)), math.sin(math.radians(angle)))
            axes = [(1, 0, 0), y, z]
            if name == "IN43434":
                axes = [
                    (0.70710678, -0.70710678, 0),
                    (0, 0, 1),
                    (-0.70710678, -0.70710678, 0),
                ]
        else:
            axes = [(1, 0, 0), (0, 1, 0), (0, 0, 1)]
        axes_results = {}
        for axis, vector in zip("xyz", axes):
            for sign in (-1, 1):
                # A 1-mm rigid attempted displacement must hit the restraint.
                v = overlap(fixture, ref.translate(tuple(sign * x for x in vector)))
                axes_results[axis + ("+" if sign > 0 else "-")] = round(v, 5)
        retention[name] = axes_results
    print("RETENTION", json.dumps(retention, indent=2), flush=True)
    failed = [
        name + ":" + axis
        for name, axes in retention.items()
        for axis, v in axes.items()
        if v <= 0.01
    ]
    extraction = []
    optical_bundle = parts["ltr_carrier"].fuse(
        parts["ref_LTR390"], parts["ltr_edge_pad"]
    )
    for distance in (0, 5, 10, 15, 20, 25, 30):
        move = (0, distance / math.sqrt(2), distance / math.sqrt(2))
        v = overlap(parts["body"], optical_bundle.translate(move))
        extraction.append({"outward_mm": distance, "overlap_mm3": round(v, 5)})
    # Conservative continuous corridor: it contains the complete moving bundle
    # for every intermediate position, not just the sampled 5-mm positions.
    corridor = (
        cq.Solid.makeCylinder(19.31, 55.0, cq.Vector(0, 0, -25.0))
        .rotate((0, 0, 0), (1, 0, 0), -45)
        .translate((42, 106, 34))
    )
    contained = optical_bundle.cut(corridor).Volume() <= 0.01
    sweep_collisions = []
    removed = {"ltr_carrier", "ltr_edge_pad", "ref_LTR390", "ref_quartz_glass"}
    for name, shape in parts.items():
        if name in removed or name.startswith("quartz_"):
            continue
        vol = overlap(corridor, shape)
        if vol > 0.01:
            sweep_collisions.append({"part": name, "volume_mm3": round(vol, 5)})
    report["continuous_optical_extraction"] = {
        "radius_mm": 19.31,
        "moving_parts": ["ltr_carrier", "ref_LTR390", "ltr_edge_pad"],
        "bundle_contained": contained,
        "obstacle_intersections": sweep_collisions,
        "travel_mm": 30,
    }
    extraction_failed = (
        any(v["overlap_mm3"] > 0.01 for v in extraction)
        or not contained
        or bool(sweep_collisions)
    )
    # Verify user requirements independently of the named construction cuts.
    zone_checks = {
        n: parts["ref_" + n].BoundingBox().ymin > -10.8 for n in ("IN43434", "SHT41")
    }
    # Exact lower-wall slab, subtract only the two intended air disks and the
    # finite blind service bores. Every other point must remain closed material.
    slab = cq.Workplane().box(163.2, 0.2, 42.6).translate((0, -83.1, 26.3)).val()
    for x in (-58, 58):
        slab = slab.cut(
            cq.Solid.makeCylinder(9, 5, cq.Vector(x, -85, 14.1), cq.Vector(0, 1, 0))
        )
        # Blind holes end in bosses; inspect their closed ends separately.
        for dx in (-16, 16):
            slab = slab.cut(
                cq.Solid.makeCylinder(
                    1.8, 5, cq.Vector(x + dx, -85, 14.1), cq.Vector(0, 1, 0)
                )
            )
    missing = slab.cut(parts["body"]).Volume()
    blind_closed = all(
        parts["body"].isInside(cq.Vector(x + dx, -77.5, 14.1), 1e-5)
        for x in (-58, 58)
        for dx in (-16, 16)
    )
    report["requirements"] = {
        "dry_room": zone_checks,
        "exterior_air_ports": 2,
        "unscreened_lower_wall_missing_mm3": round(missing, 5),
        "mesh_service_bores_blind": blind_closed,
    }
    requirements_failed = (
        not all(zone_checks.values()) or missing > 0.01 or not blind_closed
    )
    report["optical_front_extraction"] = extraction
    report.update(
        {
            "step_roundtrip": "all parts checked",
            "hard_intersections": collisions,
            "rigid_1mm_restraint_intersections": retention,
            "unblocked_directions": failed,
            "status": "checks-passed"
            if not collisions
            and not failed
            and not extraction_failed
            and not requirements_failed
            else "checks-failed",
        }
    )
    (p / "validation.json").write_text(json.dumps(report, indent=2))
    if collisions or failed or extraction_failed or requirements_failed:
        raise SystemExit("Mechanical checks failed; do not present as passed")
    print("Mechanical CAD checks passed; no outdoor/load certification implied.")


if __name__ == "__main__":
    main()
