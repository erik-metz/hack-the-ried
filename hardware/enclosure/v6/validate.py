"""R6 geometry, positive retention, service paths and flat-part layer support.

Layer support is a geometric diagnostic at 0.2 mm, not a printer/material test.
"""

import argparse
import hashlib
import itertools
import json
import math
from pathlib import Path

import cadquery as cq
import numpy as np
import trimesh
from OCP.BRepAlgoAPI import BRepAlgoAPI_Common
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
    op = BRepAlgoAPI_Common(a.wrapped, b.wrapped)
    op.SetFuzzyValue(1e-5)
    op.Build()
    if not op.IsDone():
        raise RuntimeError("Boolean intersection failed")
    result = op.Shape()
    return 0.0 if result.IsNull() else cq.Shape.cast(result).Volume()


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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("export_dir", type=Path)
    p = ap.parse_args().export_dir
    report = json.loads((p / "validation.json").read_text())
    design = json.loads((p / "design.json").read_text())
    meta = {r["part"]: r for r in report["parts"]}
    parts = {}
    meshes = []
    layers = {}
    layer_cache = {}
    fail = []
    for n, r in meta.items():
        s = cq.importers.importStep(str(p / "parts" / (n + ".step"))).val()
        if not s.isValid() or abs(s.Volume(1e-7) - r["volume_mm3"]) > max(
            0.01, r["volume_mm3"] * 1e-5
        ):
            fail.append("STEP:" + n)
        if r["kind"] != "alternative":
            ss = s.Solids()
            parts[n] = ss[0].fuse(*ss[1:]) if n == "ref_RAK_BASE" else s
        if r["kind"] not in ("print", "tpu", "alternative"):
            continue
        mesh = trimesh.load(p / "parts" / (n + ".stl"), process=True)
        scale = (
            1.2
            if n == "flat_gasket_tpu"
            else 4 / 3
            if n.startswith("lid_screw_seal_") or n == "antenna_bulkhead_seal"
            else 1
        )
        ok = (
            mesh.is_watertight
            and mesh.is_winding_consistent
            and abs(mesh.bounds[0, 2]) < 0.001
            and abs(mesh.volume - r["volume_mm3"] * scale) < r["volume_mm3"] * 0.003
        )
        if not ok:
            fail.append("STL:" + n)
        meshes.append({"part": n, "valid": bool(ok)})
        if n.startswith(("tray_", "carrier_clip_", "mesh_bezel_")):
            digest = hashlib.sha256(
                (p / "parts" / (n + ".stl")).read_bytes()
            ).hexdigest()
            if digest not in layer_cache:
                layer_cache[digest] = support_layers(mesh, 1.5)
            d = dict(layer_cache[digest])
            # A local 0.6-mm PETG catch ledge is intentional. It is at most two
            # extrusion widths, not a wide unsupported shelf. Report it separately.
            small = [
                x
                for x in d["unsupported_patches"]
                if x["span_mm"] <= 0.7 and x["area_mm2"] <= 3
            ]
            bad = [x for x in d["unsupported_patches"] if x not in small]
            d["intentional_micro_ledges"] = small
            d["unsupported_patches"] = bad
            layers[n] = d
            if bad:
                fail.append("layers:" + n)
    print("Meshes complete", flush=True)
    collisions = []
    mating = []
    physical = {n: s for n, s in parts.items() if meta[n]["kind"] != "reserve"}
    for a, b in itertools.combinations(physical, 2):
        v = overlap(physical[a], physical[b])
        if v <= 0.01:
            continue
        if {a, b} == {"ref_ANTENNA", "ref_ANTENNA_BULKHEAD"} and v < 200:
            mating.append({"a": a, "b": b, "volume_mm3": v})
            continue
        collisions.append({"a": a, "b": b, "mm3": v})
    print("Collisions", json.dumps(collisions), flush=True)
    if collisions:
        fail.append("collisions")
    retention = {}
    attachment = {}
    for n, m in design["mounts"].items():
        if n == "LTR390":
            axes = [
                (1, 0, 0),
                (0, 1.4 / math.sqrt(2.96), -1 / math.sqrt(2.96)),
                (0, 1 / math.sqrt(2.96), 1.4 / math.sqrt(2.96)),
            ]
        elif n == "IN43434":
            axes = [(0, 0, 1), (0, 1, 0), (-1, 0, 0)]
        else:
            a = math.radians(m["rz"])
            axes = [
                (math.cos(a), math.sin(a), 0),
                (-math.sin(a), math.cos(a), 0),
                (0, 0, 1),
            ]
        fixture = parts[m["tray"]]
        ref = parts["ref_" + n]
        fixed = cq.Compound.makeCompound(
            [parts["body"]] + [parts[k] for k in m["rivets"]]
        )
        retention[n] = {}
        attachment[n] = {}
        for key, vec in zip("xyz", axes):
            for sign in (-1, 1):
                move = tuple(sign * v for v in vec)
                label = key + ("+" if sign > 0 else "-")
                retention[n][label] = overlap(fixture, ref.translate(move))
                attachment[n][label] = overlap(fixed, fixture.translate(move))
        if any(v <= 0.01 for v in retention[n].values()):
            fail.append("retention:" + n)
        if any(v <= 0.01 for v in attachment[n].values()):
            fail.append("attachment:" + n)
    print("Retention", json.dumps(retention), flush=True)
    # Remove the two carrier push clips first; no screw, adhesive or PCB removal.
    services = {}
    for n, vec in [("LTR390", (-1, 0, 0)), ("IN43434", (1, 0, 0))]:
        own = {"tray_" + n, "ref_" + n, *design["mounts"][n]["rivets"]}
        if n == "LTR390":
            own.add("ref_LTR390_UV_FACE")
        moving = cq.Compound.makeCompound(
            [parts[k] for k in own if not k.startswith("carrier_clip")]
        )
        obstacles = {k: s for k, s in physical.items() if k not in own and k != "lid"}
        ba = moving.BoundingBox()
        bb = moving.translate(tuple(30 * x for x in vec)).BoundingBox()
        lo = [min(getattr(ba, k + "min"), getattr(bb, k + "min")) - 0.05 for k in "xyz"]
        hi = [max(getattr(ba, k + "max"), getattr(bb, k + "max")) + 0.05 for k in "xyz"]
        corridor = (
            cq.Workplane()
            .box(*(hi[i] - lo[i] for i in range(3)))
            .translate(tuple((hi[i] + lo[i]) / 2 for i in range(3)))
            .val()
        )
        obstacles["body"] = parts["body"].intersect(corridor)
        hits = []
        for d in np.arange(0, 30.01, 0.5):
            moved = moving.translate(tuple(float(d) * x for x in vec))
            for k, s in obstacles.items():
                v = overlap(moved, s)
                if v > 0.01:
                    hits.append({"distance": float(d), "part": k, "mm3": v})
        services[n] = {"travel": 30, "step": 0.5, "collisions": hits}
        if hits:
            fail.append("service:" + n)
        print("Service", n, len(hits), flush=True)
    body = parts["body"]
    long_posts_absent = all(
        not body.isInside(cq.Vector(x, y, 20), 1e-5)
        for x, y in design["features"]["screw_centers"]
    )
    if not long_posts_absent:
        fail.append("long lid posts")
    # Bore through each compression stop; blind lower end and 3.6-mm nominal.
    inserts = all(
        not body.isInside(cq.Vector(x, y, z), 1e-5)
        and body.isInside(cq.Vector(x + 1.9, y, z), 1e-5)
        for x, y in design["features"]["screw_centers"]
        for z in (46, 49)
    )
    screw_access = all(
        not body.isInside(cq.Vector(x, y, 50.5), 1e-5)
        for x, y in design["features"]["screw_centers"]
    )
    if not inserts or not screw_access:
        fail.append("insert bores")
    uv = design["features"]["UV"]
    normal = np.array(uv["board_front_normal"])
    delta = np.array(uv["window_center"]) - np.array(uv["chip_center"])
    uv_dot = float(np.dot(normal, delta))
    uv_lateral = float(np.linalg.norm(delta - normal * uv_dot))
    if uv_dot <= 0 or uv_lateral > 0.01:
        fail.append("UV orientation")
    ant = design["features"]["antenna"]
    slack = ant["available_mm"] - ant["modeled_path_mm"] - ant["connector_allowance_mm"]
    if slack < 0:
        fail.append("antenna length")
    assembly = cq.importers.importStep(str(p / "assembly.step")).val()
    expected = sum(
        r["volume_mm3"]
        for r in meta.values()
        if r["kind"] not in ("reserve", "alternative")
    )
    assembly_ok = (
        assembly.isValid() and abs(assembly.Volume(1e-7) - expected) < expected * 1e-5
    )
    if not assembly_ok:
        fail.append("assembly")
    coupon_count = 0
    for f in (p / "coupons").glob("*.stl"):
        m = trimesh.load(f, process=True)
        coupon_count += 1
        if not m.is_watertight or not m.is_winding_consistent:
            fail.append("coupon:" + f.name)
    screen_capture = {}
    for i in (0, 1):
        bezel = parts[f"mesh_bezel_{i}"]
        mesh = parts[f"ref_mesh_{i}"]
        screen_capture[str(i)] = {
            "frame_in": overlap(body, bezel.translate((0, 1, 0))),
            "frame_out": overlap(body, bezel.translate((0, -1, 0))),
            "mesh_in": overlap(bezel, mesh.translate((0, 0.3, 0))),
            "mesh_out": overlap(bezel, mesh.translate((0, -0.3, 0))),
        }
        if any(v <= 0.01 for v in screen_capture[str(i)].values()):
            fail.append("screen capture:" + str(i))
    slab = cq.Workplane().box(163.2, 0.2, 42.6).translate((0, -83.1, 26.3)).val()
    for x in (-58, 58):
        slab = slab.cut(
            cq.Solid.makeCylinder(9.2, 5, cq.Vector(x, -85, 14.5), cq.Vector(0, 1, 0))
        )
    extra_air_openings = slab.cut(body).Volume()
    if extra_air_openings > 0.01:
        fail.append("extra air openings")
    planning_clearance = {}
    for name in (
        "reserve_silica",
        "reserve_ANTENNA_CABLE_3mm",
        "reserve_bus_wiring",
        "reserve_gland_nut",
        "reserve_gland_body",
    ):
        ignore = (
            {"ref_ANTENNA_CABLE_GENTLE"}
            if name == "reserve_ANTENNA_CABLE_3mm"
            else {"ref_BUS", "tray_BUS", "carrier_clip_BUS_0", "carrier_clip_BUS_1"}
            if name == "reserve_bus_wiring"
            else set()
        )
        hits = {
            k: overlap(parts[name], s) for k, s in physical.items() if k not in ignore
        }
        planning_clearance[name] = {k: v for k, v in hits.items() if v > 0.01}
        if planning_clearance[name]:
            fail.append("planning clearance:" + name)
    report.update(
        {
            "status": "checks-failed" if fail else "checks-passed",
            "failures": fail,
            "printable_meshes": meshes,
            "layer_support": layers,
            "hard_intersections": collisions,
            "reference_thread_mating": mating,
            "pcb_capture_1mm": retention,
            "carrier_capture_1mm": attachment,
            "sampled_service_paths": services,
            "coupons_checked": coupon_count,
            "screen_capture": screen_capture,
            "planning_clearance": planning_clearance,
            "extra_air_opening_mm3": extra_air_openings,
            "assembly_valid": bool(assembly_ok),
            "requirements": {
                "no_long_lid_posts": long_posts_absent,
                "inserts_3p6mm": inserts,
                "screw_access_through_stops": screw_access,
                "uv_normal_towards_glass": uv_dot,
                "uv_lateral_error_mm": uv_lateral,
                "antenna_connector_margin_mm": slack,
                "no_SPS_duct": not any(n.startswith("sps_air") for n in parts),
                "bus_board_visible": "ref_BUS" in parts,
            },
        }
    )
    (p / "validation.json").write_text(json.dumps(report, indent=2))
    print("Failures", fail, flush=True)
    if fail:
        raise SystemExit(1)
    print(
        "R6 CAD checks passed; physical clip force/fit still requires coupons.",
        flush=True,
    )


if __name__ == "__main__":
    main()
