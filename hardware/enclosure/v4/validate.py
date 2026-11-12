"""R4 geometry, positive retention, service paths and flat-part layer support.

Layer support is a geometric diagnostic at 0.2 mm, not a printer/material test.
"""

import argparse
import hashlib
import itertools
import json
from pathlib import Path

import cadquery as cq
import numpy as np
import trimesh
from shapely.geometry import GeometryCollection, Point, Polygon


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


def support_layers(mesh, bridge_limit):
    """45-degree layer support; finite bridges must have support on both ends."""
    previous = None
    bad = []
    bridges = []
    checked = 0
    for z in np.arange(0.1, mesh.bounds[1, 2], 0.2):
        section = mesh.section(plane_origin=(0, 0, float(z)), plane_normal=(0, 0, 1))
        if section is None:
            continue
        # Preserve XY coordinates rather than PCA-changing the basis each layer.
        planar, _ = section.to_2D(to_2D=np.eye(4))
        current = GeometryCollection()
        for coords in planar.discrete:
            poly = Polygon(coords).buffer(0)
            current = current.symmetric_difference(poly)
        if not current.is_valid:
            current = current.buffer(0)
        if previous is not None:
            unsupported = current.difference(previous.buffer(0.235))
            geoms = (
                list(unsupported.geoms)
                if hasattr(unsupported, "geoms")
                else [unsupported]
            )
            for patch in geoms:
                if patch.area < 0.03:
                    continue
                rect = patch.minimum_rotated_rectangle
                if rect.geom_type != "Polygon":
                    continue
                pts = np.asarray(rect.exterior.coords)[:4]
                es = np.roll(pts, -1, axis=0) - pts
                lengths = np.linalg.norm(es, axis=1)
                idx = int(np.argmin(lengths))
                width = float(lengths[idx])
                direction = es[idx] / max(width, 1e-9)
                c = np.array([patch.centroid.x, patch.centroid.y])
                ends = [
                    Point(*(c + sign * (width / 2 + 0.5) * direction))
                    for sign in (-1, 1)
                ]
                supported = all(previous.buffer(0.02).covers(q) for q in ends)
                row = {
                    "z_mm": round(float(z), 2),
                    "span_mm": round(width, 3),
                    "area_mm2": round(patch.area, 3),
                }
                if width <= bridge_limit and supported:
                    bridges.append(row)
                else:
                    bad.append(row)
        previous = current
        checked += 1
    return {"layers": checked, "unsupported_patches": bad, "two_sided_bridges": bridges}


def assembly_check(directory, meta):
    shape = cq.importers.importStep(str(directory / "assembly.step")).val()
    expected = sum(r["volume_mm3"] for r in meta.values() if r["kind"] != "alternative")
    count = sum(r["solid_count"] for r in meta.values() if r["kind"] != "alternative")
    volume = shape.Volume(1e-7)
    ok = (
        shape.isValid()
        and len(shape.Solids()) == count
        and abs(volume - expected) <= max(0.01, expected * 1e-5)
    )
    return {
        "valid": bool(ok),
        "solid_count": len(shape.Solids()),
        "expected_solid_count": count,
        "volume_mm3": volume,
        "expected_volume_mm3": expected,
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("export_dir", type=Path)
    a = ap.parse_args()
    p = a.export_dir
    report = json.loads((p / "validation.json").read_text())
    design = json.loads((p / "design.json").read_text())
    meta = {r["part"]: r for r in report["parts"]}
    parts = {}
    mesh_checks = []
    layer_checks = {}
    cache = {}
    roundtrip_failures = []
    for n, r in meta.items():
        s = cq.importers.importStep(str(p / "parts" / f"{n}.step")).val()
        if not s.isValid():
            raise RuntimeError("Invalid STEP: " + n)
        vol = s.Volume(r.get("volume_integration_tol"))
        if abs(vol - r["volume_mm3"]) > max(0.01, r["volume_mm3"] * 1e-5):
            roundtrip_failures.append(
                {"part": n, "before_mm3": r["volume_mm3"], "after_mm3": vol}
            )
        if r["kind"] != "alternative":
            parts[n] = s
        if r["kind"] not in ("print", "tpu", "alternative"):
            continue
        path = p / "parts" / f"{n}.stl"
        mesh = trimesh.load(path, process=True)
        valid = bool(
            mesh.is_watertight
            and mesh.is_winding_consistent
            and mesh.volume > 0
            and abs(mesh.bounds[0, 2]) < 0.001
        )
        if not valid:
            raise RuntimeError("Invalid printable STL / bed pose: " + n)
        free_scale = (
            1.2
            if n == "flat_gasket_tpu"
            else 4 / 3
            if n.startswith("lid_screw_seal_")
            else 1
        )
        expected_mesh_volume = r["volume_mm3"] * free_scale
        mesh_volume_error = (
            abs(mesh.volume - expected_mesh_volume) / expected_mesh_volume
        )
        if mesh_volume_error > 0.003:
            raise RuntimeError(
                "STL/STEP volume deviation " + n + ": " + str(mesh_volume_error)
            )
        mesh_checks.append(
            {
                "part": n,
                "watertight": True,
                "consistent_winding": True,
                "z_min_mm": float(mesh.bounds[0, 2]),
                "volume_mm3": float(mesh.volume),
                "relative_volume_error": float(mesh_volume_error),
            }
        )
        if n.startswith(("tray_", "collar_", "rivet_", "sps_band_")):
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            if digest not in cache:
                cache[digest] = support_layers(mesh, 6.5 if n == "tray_SPS30" else 1.5)
            layer_checks[n] = cache[digest]
    for path in (p / "coupons").glob("*.stl"):
        m = trimesh.load(path, process=True)
        if not m.is_watertight or not m.is_winding_consistent or m.volume <= 0:
            raise RuntimeError("Invalid coupon " + path.name)
    assembly = assembly_check(p, meta)
    print("STL/STEP checks complete; assembly", assembly["valid"], flush=True)
    collisions = []
    for na, nb in itertools.combinations(parts, 2):
        v = overlap(parts[na], parts[nb])
        if v > 0.01:
            collisions.append({"a": na, "b": nb, "volume_mm3": round(v, 5)})
    print("COLLISIONS", json.dumps(collisions), flush=True)
    retention = {}
    attachment = {}
    pin_capture = {}
    for n, mount in design["mounts"].items():
        fixture = cq.importers.importStep(
            str(p / "parts" / f"fixture_check_{n}.step")
        ).val()
        ref = parts["ref_" + n]
        tray = parts[mount["tray"]]
        fixed = cq.Compound.makeCompound(
            [parts["body"]] + [parts[r] for r in mount["rivets"]]
        )
        r = {}
        q = {}
        for axis, vec in zip("xyz", mount["axes"]):
            for sign in (-1, 1):
                move = tuple(sign * x for x in vec)
                key = axis + ("+" if sign > 0 else "-")
                r[key] = round(overlap(fixture, ref.translate(move)), 5)
                q[key] = round(overlap(fixed, tray.translate(move)), 5)
        retention[n] = r
        attachment[n] = q
        pull = (1, 0, 0) if n == "IN43434" else mount["axes"][-1]
        for name in mount["rivets"]:
            pin_capture[name] = round(
                overlap(parts["body"], parts[name].translate(pull)), 5
            )
    print("RETENTION", json.dumps(retention), flush=True)
    print("ATTACHMENT", json.dumps(attachment), flush=True)
    head_clearance = {}
    for name, mount in design["mounts"].items():
        pull = (1, 0, 0) if name == "IN43434" else mount["axes"][-1]
        direction = cq.Vector(*pull)
        removed = set(mount["rivets"])
        if name not in ("LTR390", "IN43434"):
            removed.update(("ref_" + name, "collar_" + name))
            if name == "SPS30":
                removed.update(("sps_band_0", "sps_band_1"))
        for pin_name in mount["rivets"]:
            front = max(
                (
                    f
                    for f in parts[pin_name].Faces()
                    if f.geomType() == "PLANE" and f.normalAt().dot(direction) > 0.999
                ),
                key=lambda f: f.Area(),
            )
            start = front.Center() - direction * 0.6
            sweep = cq.Solid.makeCylinder(2.31, 5.9, start, direction)
            hits = [
                key
                for key, fixed in parts.items()
                if key not in removed and overlap(sweep, fixed) > 0.01
            ]
            head_clearance[pin_name] = {
                "pull_mm": 5.3,
                "requires_pcb_removal": name not in ("LTR390", "IN43434"),
                "obstructions": hits,
            }
    # Geometric service insertion, checked every 0.5 mm. Deliberately reported as
    # sampled, not an unsupported claim of a continuous swept-volume proof.
    service = {}
    for n, vec, travel in [("LTR390", (-1, 0, 0), 30), ("IN43434", (1, 0, 0), 25)]:
        moving = cq.Compound.makeCompound(
            [parts["tray_" + n], parts["collar_" + n], parts["ref_" + n]]
        )
        obstacles = {
            k: v
            for k, v in parts.items()
            if k not in ("tray_" + n, "collar_" + n, "ref_" + n)
            and k not in design["mounts"][n]["rivets"]
        }
        # Source reference pins are included in the moving module.
        hits = []
        for d in np.arange(0, travel + 0.01, 0.5):
            shape = moving.translate(tuple(float(d) * x for x in vec))
            for key, fixed in obstacles.items():
                v = overlap(shape, fixed)
                if v > 0.01:
                    hits.append(
                        {
                            "distance_mm": float(d),
                            "part": key,
                            "volume_mm3": round(v, 4),
                        }
                    )
        service[n] = {"step_mm": 0.5, "travel_mm": travel, "collisions": hits}
        print("SERVICE", n, len(hits), flush=True)
    # Actual exterior envelope: both complete sensor references are internal.
    envelope = cq.Workplane().box(168, 168, 50).translate((0, 0, 25)).val()
    internal = {
        n: parts["ref_" + n].cut(envelope).Volume() < 0.01
        for n in ("LTR390", "IN43434")
    }
    body_outside = (
        parts["body"]
        .cut(cq.Workplane().box(168, 168, 51).translate((0, 0, 25.5)).val())
        .Volume()
    )

    above = (
        cq.Workplane()
        .box(400, 400, 200)
        .translate((0, 0, 100))
        .val()
        .rotate((0, 0, 0), (1, 0, 0), -45)
        .translate((0, 56, 50.0002))
    )
    roof_seam = {
        n: overlap(above, parts[n]) for n in ("body", "lid", "flat_gasket_tpu")
    }
    continuity = []
    for z, owner in [
        (48.5, "body"),
        (49.5, "body"),
        (50.5, "flat_gasket_tpu"),
        (51.5, "lid"),
        (52.5, "lid"),
        (53.5, "lid"),
    ]:
        continuity.append(parts[owner].isInside(cq.Vector(0, 106 - z - 0.7, z), 1e-5))

    # Clear optical / acoustic paths from the represented sensing face to outside.
    def op(s):
        return s.rotate((0, 0, 0), (1, 0, 0), -45).translate((43, 71, 35))

    def mp(s):
        return s.rotate((0, 0, 0), (0, 1, 0), -90).translate((-84, 25, 28))

    probes = {
        "UV": (
            op(cq.Solid.makeCylinder(0.5, 9.49, cq.Vector(0, 0, -9.49))),
            {"ref_quartz_glass"},
        ),
        "microphone": (
            mp(cq.Solid.makeCylinder(0.5, 4.19, cq.Vector(0, 0, -4.39))),
            {"ref_gore_membrane"},
        ),
    }
    probe_hits = {}
    for label, (shape, ignore) in probes.items():
        probe_hits[label] = [
            k for k, v in parts.items() if k not in ignore and overlap(shape, v) > 0.001
        ]
    # Unbroken lower wall outside exactly the two screened apertures and blind bores.
    slab = cq.Workplane().box(163.2, 0.2, 42.6).translate((0, -83.1, 26.3)).val()
    for x in (-58, 58):
        slab = slab.cut(
            cq.Solid.makeCylinder(9, 5, cq.Vector(x, -85, 14.5), cq.Vector(0, 1, 0))
        )
        for dx in (-16, 16):
            slab = slab.cut(
                cq.Solid.makeCylinder(
                    1.8, 5, cq.Vector(x + dx, -85, 14.5), cq.Vector(0, 1, 0)
                )
            )
    wall_missing = slab.cut(parts["body"]).Volume()
    blind = all(
        parts["body"].isInside(cq.Vector(x + dx, -77.5, 14.5), 1e-5)
        for x in (-58, 58)
        for dx in (-16, 16)
    )
    gy, gz = (
        design["parameters"]["gland_center_y"],
        design["parameters"]["gland_center_z"],
    )
    # Full material annulus around the cable hole, proving no open notch to an edge.
    ann = cq.Solid.makeCylinder(
        8.1, 0.2, cq.Vector(82.9, gy, gz), cq.Vector(1, 0, 0)
    ).cut(cq.Solid.makeCylinder(6.1, 1, cq.Vector(82.5, gy, gz), cq.Vector(1, 0, 0)))
    gland_missing = ann.cut(parts["body"]).Volume()
    tool = cq.Solid.makeCylinder(14, 26, cq.Vector(84, gy, gz), cq.Vector(1, 0, 0))
    tool_hits = [
        k
        for k, v in parts.items()
        if k not in ("ref_power_cable", "reserve_gland_body")
        and overlap(tool, v) > 0.01
    ]
    # Circular retaining flanges capture the complete window stack in the bevel.
    glass = parts["ref_quartz_glass"]
    rubber = parts["quartz_grommet"]
    window = {}
    axes = [(1, 0, 0), (0, 0.70710678, -0.70710678), (0, 0.70710678, 0.70710678)]
    for axis, vec in zip("xyz", axes):
        for sign in (-1, 1):
            key = axis + ("+" if sign > 0 else "-")
            window[key] = {
                "glass": overlap(rubber, glass.translate(tuple(sign * x for x in vec))),
                "grommet": overlap(
                    parts["body"], rubber.translate(tuple(sign * x for x in vec))
                ),
            }
    failed_restraint = [
        n + ":" + k for n, d in retention.items() for k, v in d.items() if v <= 0.01
    ]
    failed_attachment = [
        n + ":" + k for n, d in attachment.items() for k, v in d.items() if v <= 0.01
    ]
    failed_layers = {
        n: d["unsupported_patches"]
        for n, d in layer_checks.items()
        if d["unsupported_patches"]
    }
    failed = (
        roundtrip_failures
        or not assembly["valid"]
        or any(x["obstructions"] for x in head_clearance.values())
        or collisions
        or failed_restraint
        or failed_attachment
        or failed_layers
        or any(v <= 0.01 for v in pin_capture.values())
        or any(d["collisions"] for d in service.values())
        or not all(internal.values())
        or body_outside > 0.01
        or any(v > 0.01 for v in roof_seam.values())
        or not all(continuity)
        or any(probe_hits.values())
        or wall_missing > 0.01
        or not blind
        or gland_missing > 0.01
        or tool_hits
        or any(v <= 0.01 for d in window.values() for v in d.values())
    )
    report.update(
        {
            "status": "checks-failed" if failed else "checks-passed",
            "printable_meshes": mesh_checks,
            "coupon_meshes_checked": len(list((p / "coupons").glob("*.stl"))),
            "hard_intersections": collisions,
            "step_roundtrip_failures": roundtrip_failures,
            "assembly_step": assembly,
            "component_retention_1mm": retention,
            "carrier_attachment_1mm": attachment,
            "rivet_pull_1mm": pin_capture,
            "rivet_head_access": head_clearance,
            "unblocked_component_directions": failed_restraint,
            "unblocked_carrier_directions": failed_attachment,
            "sampled_service_paths": service,
            "layer_support_0p2mm": layer_checks,
            "layer_support_failures": failed_layers,
            "window_retention_1mm": window,
            "requirements": {
                "sensors_inside_main_envelope": internal,
                "body_outside_main_envelope_mm3": body_outside,
                "roof_seam_material_above_bevel_mm3": roof_seam,
                "roof_seam_continuity": continuity,
                "signal_path_obstructions": probe_hits,
                "lower_wall_missing_mm3": wall_missing,
                "mesh_service_bores_blind": blind,
                "cable_hole_annulus_missing_mm3": gland_missing,
                "gland_wrench_obstructions": tool_hits,
            },
        }
    )
    (p / "validation.json").write_text(json.dumps(report, indent=2))
    print("REQUIREMENTS", json.dumps(report["requirements"]), flush=True)
    print("LAYER FAILURES", json.dumps(failed_layers), flush=True)
    print("UNBLOCKED", failed_restraint, failed_attachment, flush=True)
    if failed:
        raise SystemExit("R4 checks failed; do not release as passed.")
    print(
        "R4 CAD/layer checks passed. Physical fit/force/weather testing remains required."
    )


if __name__ == "__main__":
    main()
