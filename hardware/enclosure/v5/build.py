"""R5: one bevelled main enclosure, internal modules, no cantilever PCB fingers.

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
    return s.rotate((0, 0, 0), (0, 1, 0), -90).translate((-84, 24, 28))


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


def holder(w, h, t, holes=(), header="y+", pin_locations=None):
    """Two rigid flat prints. Low tray + cap with short locating pegs.

    Tiny adhesive drops in cap-peg sockets lock the cap; no PETG flex arms,
    no TPU collar, and no adhesive touches the PCB. Carrier floor bonds to case.
    """
    front = 2.4 + t
    base = rr(w + 12, h + 12, 1.6, (0, 0, 0.8), 3)
    walls = rr(w + 10, h + 10, front - 1.6, (0, 0, (front + 1.6) / 2), 2.5)
    walls = walls.cut(box(w + 0.2, h + 0.2, front + 2, (0, 0, front / 2)))
    # Existing 0.8-mm seating ledge, keeping the CAD connector back clear.
    ledge = box(w + 0.2, h + 0.2, 0.8, (0, 0, 2)).cut(
        box(w - 1.6, h - 1.6, 2, (0, 0, 2))
    )
    tray = fuse(base, walls, ledge)
    cap = rr(w + 6.8, h + 6.8, 1.8, (0, 0, front + 0.9), 1.4).cut(
        box(w - 1.2, h - 1.2, 3, (0, 0, front + 0.9))
    )
    if header == "y+":
        cap = cap.cut(box(w + 2, 10, 3, (0, h / 2 + 0.2, front + 0.9)))
    elif header == "x-":
        cap = cap.cut(box(10, h + 2, 3, (-w / 2 - 0.2, 0, front + 0.9)))
        tray = tray.cut(box(4, h + 1, 2.41, (-w / 2 + 1, 0, 1.195)))
        # The rear header channel closes with 45-degree ramps, never with an
        # unsupported horizontal shelf across the 4-mm opening.
        ramp = (
            cq.Workplane("XY", origin=(-w / 2 + 1, 0, 2.4))
            .rect(4, h + 1)
            .workplane(offset=0.9)
            .center(0.45, 0)
            .rect(3.1, h + 1)
            .loft()
            .val()
        )
        end_ramp = (
            cq.Workplane("XY", origin=(-w / 2 + 1.45, 0, 3.3))
            .rect(3.1, h + 1)
            .workplane(offset=0.4)
            .rect(3.1, h + 0.2)
            .loft()
            .val()
        )
        tray = tray.cut(fuse(ramp, end_ramp))
    pegpoints = (
        [(0, -h / 2 - 2), (0, h / 2 + 2)]
        if header == "x-"
        else [(-w / 2 - 2, 0), (w / 2 + 2, 0)]
    )
    for x, y in pegpoints:
        cap = fuse(
            cap,
            cyl(1.2, 1.8, (x, y, front - 1.8)),
            cone(1.0, 1.2, 0.2, front - 2).translate((x, y, 0)),
        )
        tray = tray.cut(cyl(1.3, 2.1, (x, y, front - 2.1)))
    for x, y, r in holes:
        tray = fuse(tray, cyl(r - 0.2, 0.8 + t, (x, y, 1.6)))
    pins = fastener_xy(w, h, holes) if pin_locations is None else pin_locations
    if pin_locations is not None:
        for px, py in pins:
            tray = fuse(tray, rr(8, 10, 1.6, (px, math.copysign(14.5, py), 0.8), 2))
    for x, y in pins:
        tray = tray.cut(cyl(1.7, 1.8, (x, y, -0.1)))
    return tray, cap, pins


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
    # Each insert column is joined to its nearest SIDE WALL along its whole
    # useful depth by a 6-mm-wide round-ended rib. No free 50-mm cantilever.
    for x, y in screw_points:
        web = rr(15.4, 6, 47.6, (math.copysign(76.3, x), y, 26.2), 2.5)
        body = fuse(body, cyl(4.6, 51, (x, y, 0)), web)
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
    manifest["tower_wall_web"] = {
        "width_mm": 6,
        "z_min": 2.4,
        "z_max": 50,
        "sidewall_inner_x": 81.6,
    }
    # Low broad plinths; all PCB retaining parts are separate flat prints.
    positions = {
        "RAK_BASE": (-33, 54),
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
            collar = collar.cut(box(4, 3, 3, (0, -h / 2 + 0.4, t + 3.3)))
        rz = -90 if name == "SHT41" else 0

        def placed(q, dz=0, rz=rz, x=x, y=y):
            return q.rotate((0, 0, 0), (0, 0, 1), rz).translate((x, y, dz))

        pedestal = placed(rr(w + 10, h + 10, 3, (0, 0, 3.9), 3))
        body = fuse(body, pedestal)
        for i, (px, py) in enumerate(pins):
            body = fuse(body, placed(cyl(1.5, 1.6, (px, py, 5.4))))
        ts = placed(tray, 5.4)
        cs = placed(collar, 5.4)
        add("tray_" + name, ts, flat=tray)
        add("cap_" + name, cs, flat=collar.rotate((0, 0, 0), (1, 0, 0), 180))
        ref = placed(refs[name], 7.8)
        add("ref_" + name, ref, "reference")
        fixtures[name] = fuse(ts, cs)
        mounts[name] = {
            "tray": "tray_" + name,
            "rivets": [],
            "cap": "cap_" + name,
            "bond_direction": [0, 0, -1],
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
        cap = box(50.2, 6, 2, (0, yy, 21.6))
        for xx in (-23, 23):
            cradle = fuse(cradle, box(4.4, 6, 3, (xx, yy, 6.9)))
            post = box(4.4, 6, 12.2, (xx, yy, 14.5))
            post = post.cut(cyl(1.5, 2.6, (xx, yy, 18)))
            cradle = fuse(cradle, post)
            cap = fuse(cap, cyl(1.4, 2.3, (xx, yy, 18.3)))
        bands.append(cap)
    pedestal = rr(47.8, 47.8, 3, (sx, sy, 3.9), 3)
    body = fuse(body, pedestal)
    for i, yy in enumerate((-16, 16)):
        body = fuse(body, cyl(1.5, 1.6, (sx, sy + yy, 5.4)))
        cradle = cradle.cut(cyl(1.7, 3.2, (0, yy, 5.3)))
    cradle = cradle.cut(box(26, 5, 10, (-51.5 - sx, -71.7 - sy, 10.3)))
    installed = cradle.translate((sx, sy, 0))
    add("tray_SPS30", installed, flat=cradle)
    for i, band in enumerate(bands):
        add(
            f"sps_cap_{i}",
            band.translate((sx, sy, 0)),
            flat=band.rotate((0, 0, 0), (1, 0, 0), 180),
        )
    add("ref_SPS30", refs["SPS30"].translate((sx, sy, 8.4)), "reference")
    fixtures["SPS30"] = fuse(installed, *[b.translate((sx, sy, 0)) for b in bands])
    mounts["SPS30"] = {
        "tray": "tray_SPS30",
        "rivets": [],
        "caps": ["sps_cap_0", "sps_cap_1"],
        "bond_direction": [0, 0, -1],
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
    seal = box(22.8, 14.8, 0.7, (0, 0, 0.35)).cut(box(18, 10, 2, (0, 0, 0.35)))

    def ap(s):
        return s.rotate((0, 0, 0), (1, 0, 0), -90).translate((-50.5, -70, 14.5))

    body = body.cut(ap(box(22.8, 14.8, 0.7, (0, 0, 0.35))))
    add(
        "sps_air_seal",
        ap(seal),
        "tpu",
        box(22.8, 14.8, 0.8, (0, 0, 0.4)).cut(box(18, 10, 2, (0, 0, 0.4))),
    )
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
    # Low adhesive land only: board + wires are an ENVELOPE, never material.
    # Its entire footprint stays in the dry chamber and clear of lid bosses.
    body = fuse(body, rr(42, 22, 6, (43, 2, 5.4), 2))
    add("reserve_bus", box(40, 20, 20, (43, 2, 18.4)), "reserve")
    # A loose desiccant sachet needs free space, not a tall rigid housing.
    add("reserve_silica", box(50, 18, 24, (-40, -0.5, 20)), "reserve")
    manifest["bus_land"] = {"size_mm": [42, 22, 6], "center": [43, 2, 5.4]}
    manifest["silica"] = "loose sachet; planning envelope only"
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
    wedge = rr(
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
    # Hollow pedestal: broad cheeks and end supports rather than a solid block.
    core = rr(
        footprint.xlen - 12,
        footprint.ylen - 10,
        60,
        (
            (footprint.xmin + footprint.xmax) / 2,
            (footprint.ymin + footprint.ymax) / 2,
            32.4,
        ),
        2,
    )
    wedge = wedge.cut(core)
    connector = box(100, h + 1, 55, (cx - w / 2 + 3 - 50, 0, -25))
    wedge = wedge.cut(op(connector))
    body = fuse(body, wedge)
    add("tray_LTR390", lp(tray), flat=tray)
    add("cap_LTR390", lp(collar), flat=collar.rotate((0, 0, 0), (1, 0, 0), 180))
    ref = refs["LTR390"].rotate((0, 0, 0), (0, 0, 1), -90).translate((0, 0, 2.4 + t))
    add("ref_LTR390", lp(ref), "reference")
    fixtures["LTR390"] = fuse(lp(tray), lp(collar))
    mounts["LTR390"] = {
        "tray": "tray_LTR390",
        "rivets": [],
        "cap": "cap_LTR390",
        "bond_direction": [0, -0.70710678, -0.70710678],
        "axes": [(1, 0, 0), (0, 0.70710678, -0.70710678), (0, 0.70710678, 0.70710678)],
    }
    # Microphone completely inside, membrane flush with the left sidewall.
    body = body.cut(mp(cyl(1.5, 5, (0, 0, -3))))
    body = body.cut(mp(cyl(10.1, 0.2, (0, 0, -0.2))))
    add("ref_gore_membrane", mp(cyl(10, 0.2, (0, 0, -0.2))), "membrane")
    mic_origin = -8.6

    def mm(s):
        return mp(s.translate((0, 0, mic_origin)))

    mt = fuse(
        ring(13.1, 6.2, 1.6), ring(11.2, 6.65, 2.6, 1.6), ring(6.65, 6.2, 0.8, 1.6)
    )
    mc = ring(9.9, 5.9, 1.8, 4.2)
    for xx in (-8.3, 8.3):
        mt = mt.cut(cyl(1.3, 2.1, (xx, 0, 2.1)))
        mc = fuse(mc, cyl(1.2, 2, (xx, 0, 2.2)))

    # Two short wall bosses, accessible from INSIDE. No closed cup trapping the
    # microphone carrier: it slides away from the wall after its rivets are pulled.
    for i, yy in enumerate((-12.5, 12.5)):
        mt = fuse(mt, rr(8, 5, 1.6, (0, yy, 0.8), 1.5))
        mt = mt.cut(cyl(1.7, 2, (0, yy, -0.1)))
        mt = mt.cut(cyl(3.7, 4, (0, yy, 1.6)))
        mt = mt.cut(box(20, 6.4, 4, (-10, yy, 3.6)))
        mc = mc.cut(cyl(4.7, 6, (0, yy, 1.5)))
        mc = mc.cut(box(20, 6.4, 6, (-10, yy, 4.5)))
        boss = fuse(cyl(3.5, 3.6, (0, 0, -7)), cone(3.5, 5, 1.2, -3.4)).translate(
            (0, yy, 0)
        )
        boss = fuse(boss, cyl(1.5, 1.6, (0, yy, -8.6)))
        body = fuse(body, mp(boss))
        support = (
            cq.Workplane("XZ")
            .polyline([(-81.8, 19.7), (-77, 24.5), (-77, 28), (-81.8, 28)])
            .close()
            .extrude(6)
            .translate((0, 24 + yy + 3, 0))
            .val()
        )
        body = fuse(body, support)
    add("tray_IN43434", mm(mt), flat=mt)
    add("cap_IN43434", mm(mc), flat=mc.rotate((0, 0, 0), (1, 0, 0), 180))
    add("ref_IN43434", mm(refs["IN43434"].translate((0, 0, 4.2))), "reference")
    ag = ring(3.5, 1.7, 2, -4.4)
    manifest["microphone_port"] = {
        "diameter_mm": 3,
        "wall_path_mm": 2.4,
        "gasket_path_mm": 2,
        "gasket_bore_mm": 3.4,
        "membrane_model_assumed": "20 mm patch; active adhesive-free area must cover 3 mm port",
    }
    add("microphone_acoustic_gasket", mp(ag), "tpu", ag)
    fixtures["IN43434"] = fuse(mm(mt), mm(mc))
    mounts["IN43434"] = {
        "tray": "tray_IN43434",
        "rivets": [],
        "cap": "cap_IN43434",
        "bond_direction": [-1, 0, 0],
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
    # Original Fusion antenna and bulkhead, mounted vertically at the upper wall.
    # The STEP bulkhead contains a symbolic 20-mm straight cable stub; replace
    # ONLY that stub with a real 50-mm swept route to the CAD MHF4 connector.
    ant_origin = (-45, 84.6, 12)
    bulk = refs["ANTENNA_BULKHEAD"].cut(cyl(1.501, 20.1, (0, -6.5, 0), (0, -1, 0)))
    add("ref_ANTENNA", refs["ANTENNA"].translate(ant_origin), "reference")
    add("ref_ANTENNA_BULKHEAD", bulk.translate(ant_origin), "reference")
    ant_seal = (
        ring(8.5, 3.1, 0.6).rotate((0, 0, 0), (1, 0, 0), -90).translate((-45, 84, 12))
    )
    add("antenna_bulkhead_seal", ant_seal, "tpu", ring(8.5, 3.1, 0.8))
    body = body.cut(cyl(3.3, 8, (-45, 78, 12), (0, 1, 0)))
    # Connector centers are cylindrical MHF4 faces in the actual RAK STEP.
    # LoRa is the +X/+Y connector; Wi-Fi is the diagonally opposite connector.
    endpoint = cq.Vector(-33 + 6.436850074508, 54 + 15.919059925498, 7.8 + 1.6)
    start = cq.Vector(-45, 78.1, 12)

    def route(bulge):
        return cq.Edge.makeBezier(
            [
                start,
                cq.Vector(-45, 78.1 - bulge, 12),
                endpoint + cq.Vector(0, 0, 30),
                endpoint,
            ]
        )

    lo, hi = 0.0, 80.0
    for _ in range(45):
        mid = (lo + hi) / 2
        if route(mid).Length() < 50:
            lo = mid
        else:
            hi = mid
    path = route((lo + hi) / 2)
    profile = cq.Workplane(cq.Plane(origin=start, normal=(0, -1, 0))).circle(0.565)
    cable = profile.sweep(cq.Wire.assembleEdges([path]), isFrenet=True).val()
    add("ref_ANTENNA_CABLE_50mm", cable, "cable")
    # Sample curvature numerically: a route is not qualified by straight distance.
    samples = [path.positionAt(i / 1000).toTuple() for i in range(1001)]
    radii = []
    for a, b, c in zip(samples, samples[1:], samples[2:]):
        av, bv, cv = (cq.Vector(*q) for q in (a, b, c))
        ab, bc, ac = bv - av, cv - bv, cv - av
        cross = ab.cross(ac).Length
        if cross > 1e-10:
            radii.append(ab.Length * bc.Length * ac.Length / (2 * cross))
    manifest["antenna"] = {
        "mount_origin": ant_origin,
        "cable_start": start.toTuple(),
        "rak_lora_connector": endpoint.toTuple(),
        "route_length_mm": path.Length(),
        "available_cable_mm": 50,
        "sampled_min_bend_radius_mm": min(radii),
        "cable_diameter_assumed_mm": 1.13,
        "source": "Original Fusion antenna/bulkhead; RAK cylindrical connector faces",
        "interface_note": "MHF4 cable diameter and final connector seating to verify physically",
    }
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
    manifest["carrier_fastening"] = (
        "PETG locating pegs + adhesive at broad PETG/PETG lands; no PCB adhesive"
    )
    manifest["cap_fastening"] = (
        "2.4 mm rigid pegs in 2.6 mm sockets; tiny adhesive drops REQUIRED to lock cap"
    )
    return parts, kinds, prints, fixtures, mounts, manifest


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
    assembly = cq.Assembly(name="KAMUE_R5")
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
        if kinds[n] not in ("alternative", "reserve"):
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
    for n in fixtures:
        for capname in mounts[n].get("caps", [mounts[n].get("cap")]):
            if capname:
                cq.exporters.export(
                    prints[capname],
                    str(cd / (capname + ".stl")),
                    tolerance=0.05,
                    angularTolerance=0.12,
                )
    (a.out / "validation.json").write_text(
        json.dumps(
            {
                "revision": "R5",
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
    print("Built R5:", len(parts), "parts/references; run validate.py.", flush=True)


if __name__ == "__main__":
    main()
