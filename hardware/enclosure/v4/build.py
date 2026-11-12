"""R4: one bevelled main enclosure, internal modules, no cantilever PCB fingers.

X right, Y up to antenna, Z rear to service lid. Millimetres.
STEP uses installed poses; each STL uses its explicit flat manufacturing pose.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import cadquery as cq

HERE = Path(__file__).resolve().parent


def box(w, h, d, center=(0, 0, 0)):
    return cq.Workplane().box(w, h, d).translate(center).val()


def cyl(r, h, start=(0, 0, 0), direction=(0, 0, 1)):
    return cq.Solid.makeCylinder(r, h, cq.Vector(*start), cq.Vector(*direction))


def cone(r0, r1, h, z=0):
    return cq.Solid.makeCone(r0, r1, h, cq.Vector(0, 0, z))


def fuse(*ss):
    out = ss[0].fuse(*ss[1:], tol=1e-6)
    clean = out.copy().clean()
    return clean if clean.isValid() else out


def rr(w, h, d, center=(0, 0, 0), r=2):
    return cq.Workplane(obj=box(w, h, d, center)).edges("|Z").fillet(r).val()


def wire(w, h, r, z):
    return cq.Workplane(obj=rr(w, h, 0.2, (0, 0, z - 0.1), r)).faces(">Z").wires().val()


def taper(w0, h0, w1, h1, z0, z1, r=0.6):
    return cq.Solid.makeLoft([wire(w0, h0, r, z0), wire(w1, h1, r, z1)], True)


def ring(ro, ri, h, z=0):
    return cyl(ro, h, (0, 0, z)).cut(cyl(ri, h + 2, (0, 0, z - 1)))


def op(s):
    return s.rotate((0, 0, 0), (1, 0, 0), -45).translate((43, 71, 35))


def mp(s):
    return s.rotate((0, 0, 0), (0, 1, 0), -90).translate((-84, 25, 28))


def normalize(s):
    b = s.BoundingBox()
    return (
        s.copy()
        .translate((-(b.xmin + b.xmax) / 2, -(b.ymin + b.ymax) / 2, -b.zmin))
        .fix()
    )


def board_holes(ref):
    """Only enclosed circular wires in the actual PCB bottom face; no edge fillets."""
    faces = [
        f
        for f in ref.Faces()
        if f.geomType() == "PLANE"
        and f.normalAt().z < -0.999
        and abs(f.Center().z) < 0.01
    ]
    if not faces:
        return []
    f = max(faces, key=lambda f: f.Area())
    result = []
    for w in f.innerWires():
        es = w.Edges()
        if len(es) == 1 and es[0].geomType() == "CIRCLE":
            radius = es[0].radius()
            if radius >= 0.9:
                c = w.Center()
                result.append((c.x, c.y, radius))
    return result


def fastener_xy(w, h, holes):
    for x in (0, -w * 0.15, w * 0.15):
        points = [(x, -h / 4), (x, h / 4)]
        if abs(x) + 2.3 > (w - 1.6) / 2 - 0.05:
            continue
        if all(
            math.hypot(x - hx, y - hy) > 2.4 + radius - 0.2
            for x, y in points
            for hx, hy, radius in holes
        ):
            return points
    raise ValueError("No clear under-PCB rivet location")


def socket(top=5.4):
    z = top - 3.5
    return fuse(
        cyl(1.6, 3.7, (0, 0, z)), cyl(2.1, 1.4, (0, 0, z)), cone(2.1, 1.6, 0.5, z + 1.4)
    )


def rivet(top=5.4):
    z = top - 3.5
    return fuse(
        cone(1.5, 2, 0.5, z),
        cyl(2, 0.9, (0, 0, z + 0.5)),
        cone(2, 1.5, 0.5, z + 1.4),
        cyl(1.5, 2.4, (0, 0, z + 1.9)),
        cone(1.5, 2.3, 0.8, top + 0.8),
        cyl(2.3, 0.6, (0, 0, top + 1.6)),
    )


def holder(w, h, t, holes=(), header="y+", pin_locations=None):
    """Continuous low tray, short hole dowels, TPU edge groove; printed flat."""
    wall_height = t + 1.6
    base = rr(w + 12, h + 12, 1.6, (0, 0, 0.8), 3)
    wall = rr(w + 11.8, h + 11.8, wall_height, (0, 0, 1.6 + wall_height / 2), 2.8)
    wall = wall.cut(
        rr(w + 5.8, h + 5.8, wall_height + 2, (0, 0, 1.6 + wall_height / 2), 0.6)
    )
    groove = fuse(
        rr(w + 7, h + 7, t + 0.2, (0, 0, 1.6 + (t + 0.2) / 2), 0.6),
        taper(w + 7, h + 7, w + 5.8, h + 5.8, 1.8 + t, 2.4 + t),
    )
    wall = wall.cut(groove)
    tray = fuse(base, wall)
    collar = fuse(
        rr(w + 6.8, h + 6.8, t + 0.2, (0, 0, 1.6 + (t + 0.2) / 2), 0.6),
        taper(w + 6.8, h + 6.8, w + 5.6, h + 5.6, 1.8 + t, 2.4 + t),
        rr(w + 5.6, h + 5.6, 0.8, (0, 0, 2.8 + t), 0.6),
    )
    collar = collar.cut(box(w - 1.6, h - 1.6, 1, (0, 0, 1.9)))
    collar = collar.cut(box(w + 0.2, h + 0.2, t, (0, 0, 2.4 + t / 2)))
    collar = collar.cut(
        taper(w + 0.2, h + 0.2, w - 1.2, h - 1.2, 2.4 + t, 3.1 + t, 0.1)
    )
    collar = collar.cut(box(w - 1.2, h - 1.2, 0.3, (0, 0, 3.25 + t)))
    # Keep connector hardware clear. The continuous dovetail below still captures
    # the TPU collar; the PCB is held on three front edges, not on its connector.
    if header == "y+":
        collar = collar.cut(box(w + 2, 10, 1, (0, h / 2 + 0.2, 2.9 + t)))
    elif header == "x-":
        collar = collar.cut(box(10, h + 2, 1, (-w / 2 - 0.2, 0, 2.9 + t)))
        channel = box(4, h + 1, 10, (-w / 2 + 1, 0, -2.6))
        tray = tray.cut(channel)
        ramp = (
            cq.Workplane("XY", origin=(-w / 2 + 1, 0, 2.4))
            .rect(4, h + 1)
            .workplane(offset=0.9)
            .center(0.45, 0)
            .rect(3.1, h + 1)
            .loft()
            .val()
        )
        top_ramp = (
            cq.Workplane("XY", origin=(-w / 2 + 1.45, 0, 3.3))
            .rect(3.1, h + 1)
            .workplane(offset=0.4)
            .rect(3.1, h + 0.2)
            .loft()
            .val()
        )
        collar = collar.cut(fuse(channel, ramp, top_ramp))
    for x, y, r in holes:
        tray = fuse(tray, cyl(r - 0.2, 0.8 + t, (x, y, 1.6)))
        collar = collar.cut(cyl(r - 0.1, t + 3, (x, y, 1)))
    pins = fastener_xy(w, h, holes) if pin_locations is None else pin_locations
    if pin_locations is not None:
        for px, py in pins:
            tray = fuse(tray, rr(8, 10, 1.6, (px, math.copysign(14.5, py), 0.8), 2))
    for x, y in pins:
        tray = tray.cut(cyl(1.6, 3, (x, y, -0.1)))
        tray = tray.cut(cone(1.6, 2.4, 0.8, 0.8).translate((x, y, 0)))
    return tray, collar, pins


def flat_seal(p, height):
    ymax = p["lid_top_y"]
    ymin = -84
    h = ymax - ymin
    cy = (ymax + ymin) / 2
    seal = rr(168, h, height, (0, cy, height / 2), 4)
    for a, b in [(ymin + 6, -15), (-9, ymax - 6)]:
        seal = seal.cut(rr(156, b - a, height + 2, (0, (a + b) / 2, height / 2), 1.5))

    # Compressed sheet continues the same exterior bevel as body and lid.
    cut = (
        box(400, 400, 200, (0, 0, 100))
        .rotate((0, 0, 0), (1, 0, 0), -math.degrees(math.atan(height)))
        .translate((0, 56, 0))
    )
    return seal.cut(cut)


def build(p, refdir):
    refs = {
        f.stem: cq.importers.importStep(str(f)).val() for f in refdir.glob("*.step")
    }
    info = json.loads((refdir / "components.json").read_text())
    parts = {}
    kinds = {}
    prints = {}
    fixtures = {}
    mounts = {}
    manifest = {}

    def add(n, s, k="print", flat=None):
        parts[n] = s
        kinds[n] = k
        if k in ("print", "tpu", "alternative"):
            prints[n] = normalize(flat if flat is not None else s)

    def bevel(limit):
        return (
            box(400, 400, 200, (0, 0, 100))
            .rotate((0, 0, 0), (1, 0, 0), -45)
            .translate((0, 56, limit - 56))
        )

    outer = rr(168, 168, 50, (0, 0, 25), 4).cut(bevel(106))
    roof_edges = []
    for e in outer.Edges():
        c = e.Center()
        b = e.BoundingBox()
        if e.geomType() == "LINE" and (
            (abs(c.y - 84) < 0.01 and abs(c.z - 22) < 0.01)
            or (
                abs(abs(c.x) - 84) < 0.01
                and abs(c.y + c.z - 106) < 0.01
                and b.zlen > 10
            )
        ):
            roof_edges.append(e)
    if len(roof_edges) != 3:
        raise ValueError("Missing exterior bevel blends")
    outer = cq.Workplane(obj=outer).newObject(roof_edges).fillet(1.2).val()
    inner = rr(163.2, 163.2, 70, (0, 0, 37.4), 1.6).cut(bevel(100))
    body = outer.cut(inner)
    rim = rr(168, 140, 3, (0, -14, 48.5), 4).cut(rr(156, 128, 5, (0, -14, 48.5), 1.6))
    body = fuse(
        body,
        rim,
        box(163.2, 2.4, 47.6, (0, -12, 26.2)),
        box(163.2, 6, 3, (0, -12, 48.5)),
    )
    # All lid screws are INSIDE the main rounded outline. No external ears.
    lid = (
        cq.Workplane(obj=rr(168, 140, 3, (0, -14, 52.5), 4))
        .edges(">Z")
        .fillet(0.6)
        .val()
        .cut(bevel(106))
    )
    screw_points = [(x, y) for x in (-70, 70) for y in (-72, 4, 44)]
    for x, y in screw_points:
        body = fuse(body, cyl(4.6, 51, (x, y, 0)))
    # Continuous round roots instead of angular external ears / triangular blocks.
    blend = []
    for e in body.Edges():
        c = e.Center()
        b = e.BoundingBox()
        if (
            e.geomType() == "CIRCLE"
            and abs(b.zmin - 2.4) < 0.01
            and b.zlen < 0.01
            and any(math.hypot(c.x - x, c.y - y) < 0.1 for x, y in screw_points)
        ):
            blend.append(e)
    if len(blend) != 6:
        raise ValueError("Missing round tower root")
    body = cq.Workplane(obj=body).newObject(blend).fillet(2.0).val()
    for x, y in screw_points:
        body = body.cut(cyl(1.8, 5.6, (x, y, 45.4)))
        body = body.cut(cone(1.8, 2.1, 0.3, 50.7).translate((x, y, 0)))
        lid = lid.cut(cyl(1.7, 5, (x, y, 50)))
        lid = lid.cut(cyl(3.7, 0.6, (x, y, 53.4)))
        washer = ring(3.5, 1.6, 0.6)
        add(
            f"lid_screw_seal_{x}_{y}",
            washer.translate((x, y, 53.4)),
            "tpu",
            ring(3.5, 1.6, 0.8),
        )
    manifest["screw_centers"] = screw_points
    manifest["tower_blends"] = len(blend)
    # Low broad plinths; all PCB retaining parts are separate flat prints.
    positions = {
        "RAK_BASE": (-33, 16),
        "INA226": (5, 31.5),
        "SHT41": (5, 2),
        "SCD41": (33, -39),
        "BME688": (4, -39),
        "SGP41": (61, -39),
    }
    for name, (x, y) in positions.items():
        m = info[name]
        w, h, t = [m[k] for k in ("pcb_width", "pcb_height", "pcb_thickness")]
        holes = board_holes(refs[name])
        tray, collar, pins = holder(w, h, t, holes)
        if name == "BME688":
            collar = collar.cut(box(4, 3, 1, (0, -h / 2 + 0.4, t + 2.9)))
        rz = -90 if name == "SHT41" else 0

        def placed(q, dz=0, rz=rz, x=x, y=y):
            return q.rotate((0, 0, 0), (0, 0, 1), rz).translate((x, y, dz))

        pedestal = placed(rr(w + 10, h + 10, 3, (0, 0, 3.9), 3))
        body = fuse(body, pedestal)
        for i, (px, py) in enumerate(pins):
            body = body.cut(placed(socket().translate((px, py, 0))))
            q = placed(rivet().translate((px, py, 0)))
            add(f"rivet_{name}_{i}", q, "tpu", rivet())
        ts = placed(tray, 5.4)
        cs = placed(collar, 5.4)
        add("tray_" + name, ts, flat=tray)
        add("collar_" + name, cs, "tpu", collar)
        ref = placed(refs[name], 7.8)
        add("ref_" + name, ref, "reference")
        fixtures[name] = fuse(ts, cs)
        mounts[name] = {
            "tray": "tray_" + name,
            "rivets": [f"rivet_{name}_{i}" for i in range(2)],
            "axes": [(1, 0, 0), (0, 1, 0), (0, 0, 1)],
        }
        manifest[name] = {
            "pcb_hole_dowels": holes,
            "rivet_xy": pins,
            "body_plinth_height": 3,
        }
    # SPS30: U-shaped solid cradle and two complete flexible loops.
    sx, sy = -40, -49
    base = rr(47.8, 47.8, 3, (0, 0, 6.9), 3)
    walls = rr(47.8, 47.8, 6, (0, 0, 11.4), 3).cut(rr(41.8, 41.8, 8, (0, 0, 11.4), 0.6))
    walls = walls.cut(box(44, 8, 10, (0, -23.9, 11.4)))
    cradle = fuse(base, walls, box(4, 1.6, 5, (19.8, -21.7, 10.9)))
    bands = []
    for yy in (-10, 10):
        cutpts = [
            (-22.1, -7),
            (22.1, -7),
            (23.9, -5.2),
            (23.9, 5.2),
            (22.1, 7),
            (-22.1, 7),
            (-23.9, 5.2),
            (-23.9, -5.2),
        ]
        inner = (
            cq.Workplane()
            .polyline(cutpts)
            .close()
            .extrude(8)
            .translate((0, 0, -1))
            .val()
        )
        loop = rr(50.2, 16.8, 6, (0, 0, 3), 3).cut(inner)
        band = loop.rotate((0, 0, 0), (1, 0, 0), 90).translate((0, yy + 3, 13.8))
        cradle = cradle.cut(band)
        bands.append(band)
    pedestal = rr(47.8, 47.8, 3, (sx, sy, 3.9), 3)
    body = fuse(body, pedestal)
    for i, yy in enumerate((-16, 16)):
        body = body.cut(socket().translate((sx, sy + yy, 0)))
        cradle = cradle.cut(cyl(1.6, 4, (0, yy, 5.3)))
        cradle = cradle.cut(cyl(2.4, 1.5, (0, yy, 7)))
        cradle = cradle.cut(cone(1.6, 2.4, 0.8, 6.2).translate((0, yy, 0)))
        # Thick SPS base puts the rivet head below its 8.4-mm seating plane.
        add(f"rivet_SPS30_{i}", rivet().translate((sx, sy + yy, 0)), "tpu", rivet())
    cradle = cradle.cut(box(26, 5, 10, (-51.5 - sx, -71.7 - sy, 10.3)))
    installed = cradle.translate((sx, sy, 0))
    add("tray_SPS30", installed, flat=cradle)
    for i, band in enumerate(bands):
        add(
            f"sps_band_{i}",
            band.translate((sx, sy, 0)),
            "tpu",
            band.translate((0, -(-10 if i == 0 else 10) - 3, -13.8)).rotate(
                (0, 0, 0), (1, 0, 0), -90
            ),
        )
    add("ref_SPS30", refs["SPS30"].translate((sx, sy, 8.4)), "reference")
    fixtures["SPS30"] = fuse(installed, *[b.translate((sx, sy, 0)) for b in bands])
    mounts["SPS30"] = {
        "tray": "tray_SPS30",
        "rivets": ["rivet_SPS30_0", "rivet_SPS30_1"],
        "axes": [(1, 0, 0), (0, 1, 0), (0, 0, 1)],
    }

    # Shared air chamber, one short exhaust adapter, only two screened openings.
    def duct(w, h):
        return (
            cq.Workplane("XZ", origin=(-50.5, -70, 14.5))
            .rect(w, h)
            .workplane(offset=12.4)
            .center(-7.5, 0)
            .rect(w, h)
            .loft()
            .val()
        )

    adapter = duct(22.8, 14.8).cut(duct(18, 10))
    body = fuse(body, adapter, box(35, 8.8, 4.7, (-53, -77.6, 4.75))).cut(duct(18, 10))
    seal = box(22.8, 14.8, 0.4, (0, 0, 0.2)).cut(box(18, 10, 2, (0, 0, 0.2)))

    def ap(s):
        return s.rotate((0, 0, 0), (1, 0, 0), -90).translate((-50.5, -70, 14.5))

    body = body.cut(ap(box(22.8, 14.8, 0.4, (0, 0, 0.2))))
    add("sps_air_seal", ap(seal), "tpu", seal)
    for i, x in enumerate((-58, 58)):
        body = body.cut(cyl(9, 10, (x, -90, 14.5), (0, 1, 0)))
        body = body.cut(cyl(10.2, 0.7, (x, -84, 14.5), (0, 1, 0)))

        def bp(s, x=x):
            return s.rotate((0, 0, 0), (1, 0, 0), -90).translate((x, -85.5, 14.5))

        cap = fuse(ring(13, 9, 1.5), ring(10, 9, 0.4, 1.5))
        for xx in (-16, 16):
            cap = fuse(cap, cyl(3.5, 1.5, (xx, 0, 0)))
            cap = cap.cut(cyl(1.7, 4, (xx, 0, -1)))
            start = (x + xx, -84, 14.5)
            body = fuse(body, cyl(3.5, 9, start, (0, 1, 0)))
            body = body.cut(cyl(1.8, 5.6, start, (0, 1, 0)))
        add(f"mesh_frame_{i}", bp(cap), flat=cap)
        add(
            f"ref_mesh_{i}",
            ring(10, 9, 0.3)
            .rotate((0, 0, 0), (1, 0, 0), -90)
            .translate((x, -83.6, 14.5)),
            "mesh",
        )
    # Sealed partition wiring, kept separate from exterior screened ports.
    for x in (-40, 35):
        body = body.cut(cyl(4, 7, (x, -15.5, 35), (0, 1, 0)))
        plug = fuse(
            cyl(4, 2.4), cyl(5.5, 0.8, (0, 0, -0.8)), cyl(5.5, 0.8, (0, 0, 2.4))
        )
        add(
            "wire_septum_" + str(x),
            plug.rotate((0, 0, 0), (1, 0, 0), -90).translate((x, -13.2, 35)),
            "tpu",
            plug,
        )
    # Internal bus/silica trays have broad walls, no slender retaining fingers.
    for name, w, h, cx, cy, depth in [
        ("bus", 44, 22, 44, 0, 20),
        ("silica", 52, 26, -45, 61.5, 18),
    ]:
        pocket = rr(w + 6, h + 6, depth, (cx, cy, 7 + depth / 2), 3).cut(
            rr(w, h, depth + 1, (cx, cy, 8 + (depth + 1) / 2), 1)
        )
        body = fuse(body, pocket, rr(w + 6, h + 6, 4.6, (cx, cy, 4.7), 3))
    add("reserve_bus", box(40, 20, 20, (44, 0, 18)), "reserve")
    add("reserve_silica", box(50, 24, 18, (-45, 61.5, 17)), "reserve")
    # Flush quartz window in the continuous bevel, not an external sensor pod.
    roof_t = 6 / math.sqrt(2)
    body = body.cut(op(cyl(11.2, 12, (0, 0, -10))))
    body = body.cut(op(cyl(12.05, 0.2, (0, 0, -0.2))))
    back = -roof_t - 0.8
    seat = fuse(ring(13.5, 8.8, 1.6, back - 1.6), ring(13.5, 12.1, 2.6, back - 1.6))
    body = fuse(body, op(seat))
    rubber = fuse(
        cyl(11.2, 0.4 - back, (0, 0, back)),
        cyl(12, 0.8, (0, 0, back)),
        cyl(12, 0.2, (0, 0, -0.2)),
        cone(12, 11.2, 0.4, 0),
    )
    rubber = rubber.cut(cyl(8.8, -2 - back + 0.2, (0, 0, back - 0.1)))
    rubber = rubber.cut(cyl(10.05, 2, (0, 0, -2)))
    rubber = rubber.cut(cyl(9.5, 1, (0, 0, 0)))
    add("quartz_grommet", op(rubber), "tpu", rubber)
    add("ref_quartz_glass", op(cyl(10, 2, (0, 0, -2))), "glass")
    # LTR carrier mounts on a broad internal wedge rooted on the rear wall.
    m = info["LTR390"]
    w, h, t = m["pcb_height"], m["pcb_width"], m["pcb_thickness"]
    tray, collar, pins = holder(
        w, h, t, header="x-", pin_locations=[(0, -15.7), (0, 15.7)]
    )
    cx = -p["ltr_chip_offset_y_provisional"]
    origin = -14.4

    def lp(s):
        return op(s.translate((cx, 0, origin)))

    footprint = op(rr(w + 10, 39, 5.4, (cx, 0, origin - 2.7), 3)).BoundingBox()
    wedge = box(
        footprint.xlen,
        footprint.ylen,
        footprint.zmax - 2.4,
        (
            (footprint.xmin + footprint.xmax) / 2,
            (footprint.ymin + footprint.ymax) / 2,
            (footprint.zmax + 2.4) / 2,
        ),
    )
    wedge = wedge.cut(op(box(200, 200, 100, (0, 0, origin + 50))))
    for i, (px, py) in enumerate(pins):
        wedge = wedge.cut(op(socket().translate((cx + px, py, origin - 5.4))))
        add(
            f"rivet_LTR390_{i}",
            op(rivet().translate((cx + px, py, origin - 5.4))),
            "tpu",
            rivet(),
        )
    connector = box(100, h + 1, 55, (cx - w / 2 + 3 - 50, 0, -25))
    wedge = wedge.cut(op(connector))
    body = fuse(body, wedge)
    add("tray_LTR390", lp(tray), flat=tray)
    add("collar_LTR390", lp(collar), "tpu", collar)
    ref = refs["LTR390"].rotate((0, 0, 0), (0, 0, 1), -90).translate((0, 0, 2.4 + t))
    add("ref_LTR390", lp(ref), "reference")
    fixtures["LTR390"] = fuse(lp(tray), lp(collar))
    mounts["LTR390"] = {
        "tray": "tray_LTR390",
        "rivets": ["rivet_LTR390_0", "rivet_LTR390_1"],
        "axes": [(1, 0, 0), (0, 0.70710678, -0.70710678), (0, 0.70710678, 0.70710678)],
    }
    # Microphone completely inside, membrane flush with the left sidewall.
    body = body.cut(mp(cyl(1, 5, (0, 0, -3))))
    body = body.cut(mp(cyl(10.1, 0.2, (0, 0, -0.2))))
    add("ref_gore_membrane", mp(cyl(10, 0.2, (0, 0, -0.2))), "membrane")
    mic_origin = -8.6

    def mm(s):
        return mp(s.translate((0, 0, mic_origin)))

    mt = fuse(ring(13.1, 6.2, 1.6), ring(12.4, 9.4, 3.4, 1.6))
    mt = mt.cut(ring(10, 9.4, 2, 1.6))
    mt = mt.cut(cone(10, 9.4, 0.6, 3.6))
    mc = fuse(
        cyl(9.9, 2, (0, 0, 1.6)), cone(9.9, 9.3, 0.6, 3.6), cyl(9.3, 0.8, (0, 0, 4.2))
    )
    mc = mc.cut(cyl(6.2, 0.9, (0, 0, 1.5)))
    mc = mc.cut(cyl(6.55, 1.8, (0, 0, 2.4)))
    mc = mc.cut(cone(6.55, 5.9, 0.65, 4.2))
    mc = mc.cut(cyl(5.9, 0.3, (0, 0, 4.85)))

    # Two short wall bosses, accessible from INSIDE. No closed cup trapping the
    # microphone carrier: it slides away from the wall after its rivets are pulled.
    def back_pin(q):
        return q.rotate((0, 0, 0), (1, 0, 0), 180).translate((0, 0, -1.6))

    for i, yy in enumerate((-10.5, 10.5)):
        mt = mt.cut(cyl(1.6, 2, (0, yy, -0.1)))
        mt = mt.cut(cone(2.4, 1.6, 0.8, 0).translate((0, yy, 0)))
        mt = mt.cut(cyl(3.7, 4, (0, yy, 1.6)))
        mt = mt.cut(box(20, 6.4, 4, (-10, yy, 3.6)))
        mc = mc.cut(cyl(3.7, 4, (0, yy, 1.5)))
        mc = mc.cut(box(20, 6.4, 4, (-10, yy, 3.5)))
        boss = fuse(cyl(3.5, 3.6, (0, 0, -7)), cone(3.5, 5, 1.2, -3.4)).translate(
            (0, yy, 0)
        )
        boss = boss.cut(back_pin(socket()).translate((0, yy, 0)))
        body = fuse(body, mp(boss))
        add(
            f"rivet_IN43434_{i}",
            mp(back_pin(rivet()).translate((0, yy, 0))),
            "tpu",
            rivet(),
        )
        support = (
            cq.Workplane("XZ")
            .polyline([(-81.8, 19.7), (-77, 24.5), (-77, 28), (-81.8, 28)])
            .close()
            .extrude(6)
            .translate((0, 25 + yy + 3, 0))
            .val()
        )
        body = fuse(body, support)
        body = body.cut(mp(back_pin(socket()).translate((0, yy, 0))))
    add("tray_IN43434", mm(mt), flat=mt)
    add("collar_IN43434", mm(mc), "tpu", mc)
    add("ref_IN43434", mm(refs["IN43434"].translate((0, 0, 4.2))), "reference")
    ag = ring(3.5, 1.2, 2, -4.4)
    add("microphone_acoustic_gasket", mp(ag), "tpu", ag)
    fixtures["IN43434"] = fuse(mm(mt), mm(mc))
    mounts["IN43434"] = {
        "tray": "tray_IN43434",
        "rivets": ["rivet_IN43434_0", "rivet_IN43434_1"],
        "axes": [(0, 0, 1), (0, 1, 0), (-1, 0, 0)],
    }
    # Straight M12 footprint through uninterrupted sidewall, far from lid edge.
    gy, gz = p["gland_center_y"], p["gland_center_z"]
    body = body.cut(cyl(p["gland_hole_assumed"] / 2, 5, (80, gy, gz), (1, 0, 0)))
    nut = ring(9.5, 6.1, 6).rotate((0, 0, 0), (0, 1, 0), 90).translate((75.6, gy, gz))
    external = ring(9, 6.1, 18).rotate((0, 0, 0), (0, 1, 0), 90).translate((84, gy, gz))
    add("reserve_gland_nut", nut, "reserve")
    add("reserve_gland_body", external, "reserve")
    add("ref_power_cable", cyl(2.5, 35, (75, gy, gz), (1, 0, 0)), "cable")
    manifest["gland"] = {
        "center": [84, gy, gz],
        "hole_diameter": 12.2,
        "tool_radius": 14,
        "axis": [1, 0, 0],
    }
    body = body.cut(cyl(3.3, 8, (-45, 78, 13), (0, 1, 0)))
    # Existing two installation alternatives, no fasteners penetrate wet/dry divider.
    rear_points = [(x, y) for x in (-60, 60) for y in (-2, 58)]
    for x, y in rear_points:
        body = fuse(body, cyl(5, 7.4, (x, y, 0)))
        body = body.cut(cyl(1.8, 5.6, (x, y, -0.01)))
    plate = rr(142, 160, 3, (0, 0, -1.5), 3)
    for x, y in rear_points:
        plate = plate.cut(cyl(1.7, 5, (x, y, -4)))
    for x in (-60, 60):
        for y in (-70, 70):
            plate = plate.cut(cyl(2.7, 5, (x, y, -4)))
    for x in (-32, 32):
        for y in (-46, 46):
            plate = plate.cut(box(4, 14, 5, (x, y, -1.5)))
    add("mount_wall", plate)
    for d in (40, 50):
        saddle = box(60, 22, 20, (0, 0, -13)).cut(
            cyl(d / 2 + 0.3, 25, (0, -12.5, -13 - d / 2), (0, 1, 0))
        )
        add(
            "mount_mast_" + str(d),
            fuse(plate, *[saddle.translate((0, y, 0)) for y in (-46, 46)]),
            "alternative",
        )
    add("body", body)
    add("lid", lid)
    add(
        "flat_gasket_tpu",
        flat_seal(p, 1).translate((0, 0, 50)),
        "tpu",
        flat_seal(p, 1.2),
    )
    return parts, kinds, prints, fixtures, mounts, manifest


def export_lock_coupons(out):
    """Small actual socket/plate pairs for a fit and insertion-force trial."""
    out.mkdir(exist_ok=True)
    flat = rr(14, 16, 5.4, (0, 0, 2.7), 2).cut(socket())
    angled = rr(14, 16, 24, (0, 0, 12), 2)
    cut = (
        box(80, 80, 60, (0, 0, 30))
        .rotate((0, 0, 0), (1, 0, 0), -45)
        .translate((0, 0, 14))
    )
    angled = angled.cut(cut)
    tool = (
        socket()
        .rotate((0, 0, 0), (1, 0, 0), -45)
        .translate((0, -5.4 / math.sqrt(2), 14 - 5.4 / math.sqrt(2)))
    )
    angled = angled.cut(tool)
    plate = rr(14, 14, 1.6, (0, 0, 0.8), 2).cut(cyl(1.6, 2, (0, 0, -0.1)))
    plate = plate.cut(cone(1.6, 2.4, 0.8, 0.8))
    for name, shape in [
        ("socket_flat", flat),
        ("socket_45deg", angled),
        ("socket_plate", plate),
    ]:
        if not shape.isValid() or len(shape.Solids()) != 1:
            raise ValueError("Invalid lock coupon " + name)
        cq.exporters.export(
            normalize(shape),
            str(out / (name + ".stl")),
            tolerance=0.05,
            angularTolerance=0.12,
        )


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--references", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    a = ap.parse_args()
    p = json.loads((HERE / "parameters.json").read_text())
    parts, kinds, prints, fixtures, mounts, manifest = build(p, a.references)
    a.out.mkdir(parents=True, exist_ok=True)
    pd = a.out / "parts"
    pd.mkdir(exist_ok=True)
    rows = []
    assembly = cq.Assembly(name="KAMUE_R4")
    for n, s in parts.items():
        if not s.isValid() or s.Volume() <= 0:
            raise RuntimeError("Invalid part: " + n)
        if kinds[n] != "reference" and len(s.Solids()) != 1:
            raise RuntimeError(f"Disconnected {n}: {len(s.Solids())}")
        cq.exporters.export(s, str(pd / (n + ".step")))
        if n == "body":
            # STEP normalizes trimmed fillet parameterizations. Use the imported
            # deliverable as the common model for STL, assembly and mass checks.
            before = s.Volume(1e-7)
            s = cq.importers.importStep(str(pd / (n + ".step"))).val()
            after = s.Volume(1e-7)
            manifest["step_body_normalization"] = {
                "native_mm3": before,
                "step_mm3": after,
                "relative_mass_delta": abs(after - before) / before,
                "max_relative_delta": 1e-4,
            }
            if not s.isValid() or abs(after - before) > before * 1e-4:
                raise RuntimeError("Excessive STEP body conversion deviation")
            parts[n] = s
            prints[n] = normalize(s)
        if n == "body":
            cq.exporters.export(s, str(a.out / "body.brep"))
        if n in prints:
            pr = prints[n]
            if not pr.isValid() or len(pr.Solids()) != 1:
                raise RuntimeError("Invalid print pose: " + n)
            cq.exporters.export(
                pr, str(pd / (n + ".stl")), tolerance=0.05, angularTolerance=0.12
            )
        if kinds[n] != "alternative":
            assembly.add(
                s,
                name=n,
                color=cq.Color(0.24, 0.6, 0.4)
                if kinds[n] == "reference"
                else cq.Color(0.65, 0.73, 0.78),
            )
        rows.append(
            {
                "part": n,
                "kind": kinds[n],
                "volume_mm3": s.Volume(1e-7),
                "volume_integration_tol": 1e-7,
                "solid_count": len(s.Solids()),
            }
        )
    assembly.export(str(a.out / "assembly.step"))
    cd = a.out / "coupons"
    cd.mkdir(exist_ok=True)
    for n, s in fixtures.items():
        cq.exporters.export(s, str(pd / f"fixture_check_{n}.step"))
        # Actual separate carriers, already correctly oriented for manufacturing.
        cq.exporters.export(
            prints["tray_" + n],
            str(cd / f"tray_{n}.stl"),
            tolerance=0.05,
            angularTolerance=0.12,
        )
    export_lock_coupons(cd)
    (a.out / "validation.json").write_text(
        json.dumps(
            {
                "revision": "R4",
                "status": "geometry-built-not-yet-validated",
                "parts": rows,
            },
            indent=2,
        )
    )
    (a.out / "design.json").write_text(
        json.dumps({"parameters": p, "features": manifest, "mounts": mounts}, indent=2)
    )
    (a.out / "components.json").write_text(
        (a.references / "components.json").read_text()
    )
    print("Built R4:", len(parts), "parts/references; run validate.py.", flush=True)


if __name__ == "__main__":
    main()
