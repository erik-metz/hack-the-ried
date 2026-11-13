"""R6: bevelled main enclosure and separately printed PETG clip carriers.

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
    return s.rotate((0, 0, 0), (1, 0, 0), -math.degrees(math.atan(1 / 1.4))).translate(
        (53, 71, 55 / 1.4)
    )


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


def extrude_xz(points, length):
    return (
        cq.Workplane("XZ")
        .polyline(points)
        .close()
        .extrude(length)
        .translate((0, length / 2, 0))
        .val()
    )


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


def clip_holder(w, h, t, holes=(), round_board=False):
    """Two accessible PETG PCB catches flex in the XY print plane.
    Two separate TPU push clips fasten the carrier to blind case sockets.
    Replacing a sensor requires only spreading its two PCB catches.
    """
    base = rr(w + 12, h + 12, 1.6, (0, 0, 0.8), 2)
    carrier = fuse(
        base,
        box(w + 0.2, h + 0.2, 0.8, (0, 0, 2)).cut(box(w - 1.6, h - 1.6, 2, (0, 0, 2))),
    )
    carrier = carrier.cut(
        cyl(6.2, 5, (0, 0, -1)) if round_board else box(w - 4, h - 4, 5, (0, 0, 0))
    )
    front = 2.4 + t
    for sign in (-1, 1):
        carrier = carrier.cut(
            rr(
                2.3,
                h / 2 + 8,
                front + 3,
                (sign * (w / 2 + 1.1), -h / 4 + 1, (front + 1) / 2),
                0.6,
            )
        )
        root = -h / 2 - 5
        arm = box(
            1.0,
            -root + 2,
            front + 0.1,
            (sign * (w / 2 + 0.75), (root + 2) / 2, (front + 0.1) / 2),
        )
        pts = [
            (w / 2 - 0.45, front + 0.1),
            (w / 2 + 1.35, front + 0.1),
            (w / 2 + 1.35, front + 0.7),
            (w / 2 + 0.15, front + 0.7),
        ]
        carrier = fuse(carrier, arm, extrude_xz([(sign * x, z) for x, z in pts], 4))
    for yy in (-h / 2 - 0.5, h / 2 + 0.5):
        carrier = fuse(carrier, box(w - 2, 1, 1.2, (0, yy, 2.2)))
    for x, y, r in holes:
        bridge = box(2 * r + 0.8, h / 2 + y + 1, 1.6, (x, (y - h / 2) / 2, 0.8))
        carrier = fuse(carrier, bridge, cyl(r - 0.2, 0.8 + t, (x, y, 1.6)))
    pegx = w / 2 + (5.5 if round_board else 4)
    for x in (-pegx, pegx):
        carrier = fuse(carrier, cyl(3.5, 1.6, (x, 0, 0)))
        carrier = carrier.cut(cyl(1.6, 2, (x, 0, -0.1))).cut(
            cone(1.6, 2.4, 0.8, 0.8).translate((x, 0, 0))
        )
    receiver = rr(2 * pegx + 7, h + 12, 4, (0, 0, -2), 2).cut(
        box(w - 4, h - 4, 5, (0, 0, -2))
    )
    for x in (-pegx, pegx):
        receiver = receiver.cut(socket(0).translate((x, 0, 0)))
    return carrier, receiver


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
        .rotate((0, 0, 0), (1, 0, 0), -math.degrees(math.atan(height / 1.4)))
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
            prints[n] = normalize(s if flat is None else flat)

    def bevel(limit):
        return (
            box(400, 400, 200, (0, 0, 100))
            .rotate((0, 0, 0), (1, 0, 0), -math.degrees(math.atan(1 / 1.4)))
            .translate((0, 56, (limit - 56) / 1.4))
        )

    outer = rr(168, 168, 50, (0, 0, 25), 4).cut(bevel(126))
    roof_edges = []
    for e in outer.Edges():
        c = e.Center()
        b = e.BoundingBox()
        if e.geomType() == "LINE" and (
            (abs(c.y - 84) < 0.01 and abs(c.z - 30) < 0.01)
            or (
                abs(abs(c.x) - 84) < 0.01
                and abs(c.y + 1.4 * c.z - 126) < 0.01
                and b.zlen > 10
            )
        ):
            roof_edges.append(e)
    if len(roof_edges) != 3:
        raise ValueError("Missing exterior bevel blends")
    outer = cq.Workplane(obj=outer).newObject(roof_edges).fillet(1.2).val()
    inner = rr(163.2, 163.2, 70, (0, 0, 37.4), 1.6).cut(bevel(120))
    body = outer.cut(inner)
    rim = rr(168, 140, 3, (0, -14, 48.5), 4).cut(rr(156, 128, 5, (0, -14, 48.5), 1.6))
    body = fuse(
        body,
        rim,
        box(163.2, 2.4, 47.6, (0, -12, 26.2)),
        box(163.2, 6, 3, (0, -12, 48.5)),
    )
    lid = (
        cq.Workplane(obj=rr(168, 140, 3, (0, -14, 52.5), 4))
        .edges(">Z")
        .fillet(0.6)
        .val()
        .cut(bevel(126))
    )
    screws = [(x, y) for x in (-77, 77) for y in (-72, 4, 44)]
    for x, y in screws:
        sign = 1 if x > 0 else -1
        # Only the last 15.9 mm of depth; root follows a printable 45-degree ramp.
        bottom = wire(2.4, 8.6, 0.6, 35.1).translate((sign * 82.8, y, 0))
        top = wire(11.3, 8.6, 0.6, 44).translate((sign * 78.35, y, 0))
        brace = cq.Solid.makeLoft([bottom, top], True)
        body = fuse(
            body,
            brace,
            cyl(4.3, 6, (x, y, 44)),
            box(4, 8.6, 6, (sign * 82, y, 47)),
            cyl(2.5, 1, (x, y, 50)),
        )
        body = body.cut(cyl(1.8, 6.6, (x, y, 44.4))).cut(
            cone(1.8, 2.1, 0.3, 50.7).translate((x, y, 0))
        )
        lid = lid.cut(cyl(1.7, 5, (x, y, 50))).cut(cyl(3.7, 0.6, (x, y, 53.4)))
        add(
            f"lid_screw_seal_{x}_{y}",
            ring(3.5, 1.6, 0.6).translate((x, y, 53.4)),
            "tpu",
            ring(3.5, 1.6, 0.8),
        )
    manifest["screw_centers"] = screws
    manifest["lid_boss_depth"] = [35.1, 51]
    positions = {
        "RAK_BASE": (-50.936850074508, 16, 0),
        "INA226": (4, 35, 0),
        "SHT41": (5, 3.5, 90),
        "SCD41": (37, -39, 0),
        "BME688": (4, -39, 0),
        "SGP41": (67, -39, 0),
        "SPS30": (-44, -49, 0),
        "BUS": (50, 6, 0),
    }
    for name, (x, y, rz) in positions.items():
        if name == "SPS30":
            w, h = 40.2, 41.2
            t = 12.2
            ref = refs[name]
        elif name == "BUS":
            w, h, t = 40, 20, 1.6
            ref = box(w, h, t, (0, 0, t / 2))
            for yy in (-5, 5):
                ref = fuse(ref, box(34, 2.5, 8, (0, yy, t + 4)))
        else:
            m = info[name]
            w, h, t = [m[k] for k in ("pcb_width", "pcb_height", "pcb_thickness")]
            ref = refs[name]
        holes = board_holes(ref) if name not in ("SPS30", "BUS") else []
        tray, receiver = clip_holder(w, h, t, holes)
        if name == "SPS30":
            # Clear four real lateral casing tabs while retaining the metal rim.
            for xx in (-20.45, 20.45):
                for yy in (-15, -5):
                    tray = tray.cut(box(0.6, 1.6, 1.1, (xx, yy, 12.9)))

        def pose(q, dz=0, rz=rz, x=x, y=y):
            return q.rotate((0, 0, 0), (0, 0, 1), rz).translate((x, y, dz))

        body = fuse(body, pose(receiver, 6.4))
        for i, px in enumerate((-w / 2 - 4, w / 2 + 4)):
            add(
                f"carrier_clip_{name}_{i}",
                pose(rivet(0).translate((px, 0, 0)), 6.4),
                "tpu",
                rivet(0),
            )
        add("tray_" + name, pose(tray, 6.4), flat=tray)
        add("ref_" + name, pose(ref, 8.8), "reference")
        fixtures[name] = pose(tray, 6.4)
        mounts[name] = {
            "tray": "tray_" + name,
            "rivets": [f"carrier_clip_{name}_{i}" for i in range(2)],
            "slide_axis": pose(box(1, 1, 1)).Center().toTuple(),
            "rz": rz,
            "release": "pull the two TPU push clips; lift carrier",
            "pcb_release": "spread two inner catches outward",
        }
    add("reserve_bus_wiring", box(40, 20, 20, (50, 6, 18.8)), "reserve")
    add("reserve_silica", box(50, 18, 24, (-15, 60, 20)), "reserve")
    # Two downward screened apertures, no SPS duct or separate air channels.
    for i, x in enumerate((-58, 58)):
        body = body.cut(cyl(9.2, 8, (x, -88, 14.5), (0, 1, 0)))
        body = body.cut(
            cq.Solid.makeCone(
                9.2, 10.05, 0.85, cq.Vector(x, -82.45, 14.5), cq.Vector(0, 1, 0)
            )
        )
        bezel = fuse(
            ring(12, 8.5, 2.8),
            ring(9.15, 8.5, 1.55, 2.8),
            cone(9.15, 10, 0.85, 4.35).cut(cyl(8.5, 1, (0, 0, 4.3))),
            ring(10, 8.5, 0.8, 5.2),
        )
        bezel = (
            bezel.cut(cyl(10.1, 0.3, (0, 0, 0.5)))
            .cut(cyl(9.6, 0.5, (0, 0, 0)))
            .cut(cone(10.1, 8.5, 1.6, 0.8))
        )

        def gp(q, x=x):
            return q.rotate((0, 0, 0), (1, 0, 0), -90).translate((x, -86.8, 14.5))

        add(f"mesh_bezel_{i}", gp(bezel), "tpu", bezel)
        add(f"ref_mesh_{i}", gp(ring(10, 8.5, 0.3, 0.5)), "mesh")
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
    # Window remains flush. Chip is a separate STEP reference, not a back-side dot.
    roof_t = 6 / math.sqrt(2.96)
    back = -roof_t - 0.8
    body = body.cut(op(cyl(11.2, 12, (0, 0, -10)))).cut(
        op(cyl(12.05, 0.2, (0, 0, -0.2)))
    )
    body = fuse(
        body,
        op(fuse(ring(13.5, 8.8, 1.6, back - 1.6), ring(13.5, 12.1, 2.6, back - 1.6))),
    )
    rubber = fuse(
        cyl(11.2, 0.4 - back, (0, 0, back)),
        cyl(12, 0.8, (0, 0, back)),
        cyl(12, 0.2, (0, 0, -0.2)),
        cone(12, 11.2, 0.4),
    )
    rubber = (
        rubber.cut(cyl(8.8, -2 - back + 0.2, (0, 0, back - 0.1)))
        .cut(cyl(10.05, 2, (0, 0, -2)))
        .cut(cyl(9.5, 1))
    )
    add("quartz_grommet", op(rubber), "tpu", rubber)
    add("ref_quartz_glass", op(cyl(10, 2, (0, 0, -2))), "glass")
    w, h, t = 18.4, 14, 2.5
    origin = -14.4
    cx = -7
    tray, receiver = clip_holder(w, h, t)
    # Header has a rear-facing clearance channel on the left.
    channel = box(4, h + 1, 2.41, (-w / 2 + 1, 0, 1.195))
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
    tray = tray.cut(ramp)
    # Optical carrier clips sit above/below PCB, leaving its header exit open.
    for px in (-w / 2 - 4, w / 2 + 4):
        tray = fuse(tray, cyl(2.6, 1.6, (px, 0, 0)))
        receiver = fuse(receiver, cyl(2.2, 4, (px, 0, -4)))
    tray = tray.intersect(box(w + 12, h + 12, 10, (0, 0, 4)))
    for py in (-11, 11):
        tray = fuse(tray, cyl(3.5, 1.6, (0, py, 0)))
        tray = tray.cut(cyl(1.6, 2, (0, py, -0.1))).cut(
            cone(1.6, 2.4, 0.8, 0.8).translate((0, py, 0))
        )
        receiver = fuse(receiver, cyl(3.8, 4, (0, py, -4)))
        receiver = receiver.cut(socket(0).translate((0, py, 0)))
    receiver = receiver.cut(box(100, h + 1, 8, (-w / 2 + 3 - 50, 0, -1)))

    def lp(q):
        return op(q.translate((cx, 0, origin)))

    rb = lp(receiver).BoundingBox()
    support = rr(
        rb.xlen - 0.4,
        rb.ylen - 0.4,
        rb.zmax - 2.4,
        ((rb.xmin + rb.xmax) / 2, (rb.ymin + rb.ymax) / 2, (rb.zmax + 2.4) / 2),
        2,
    )
    support = support.cut(op(box(150, 150, 100, (0, 0, origin - 3 + 50))))
    core = rr(
        rb.xlen - 12,
        rb.ylen - 10,
        60,
        ((rb.xmin + rb.xmax) / 2, (rb.ymin + rb.ymax) / 2, 32.4),
        2,
    )
    support = support.cut(core).cut(
        op(box(100, h + 1, 55, (cx - w / 2 + 3 - 50, 0, -25)))
    )
    body = fuse(body, support, lp(receiver))
    for py in (-11, 11):
        body = body.cut(lp(socket(0).translate((0, py, 0))))
    for i, py in enumerate((-11, 11)):
        add(
            f"carrier_clip_LTR390_{i}",
            lp(rivet(0).translate((0, py, 0))),
            "tpu",
            rivet(0),
        )
    add("tray_LTR390", lp(tray), flat=tray)
    ltr = refs["LTR390"].rotate((0, 0, 0), (0, 0, 1), -90).translate((0, 0, 2.4 + t))
    add("ref_LTR390", lp(ltr), "reference")
    chip = box(1.2, 1.2, 0.35, (7, 0, 2.4 + t + 0.175))
    add("ref_LTR390_UV_FACE", lp(chip), "marker")
    fixtures["LTR390"] = lp(tray)
    mounts["LTR390"] = {
        "tray": "tray_LTR390",
        "rivets": ["carrier_clip_LTR390_0", "carrier_clip_LTR390_1"],
        "release": "pull two TPU push clips, then remove carrier",
        "rz": 0,
    }
    manifest["UV"] = {
        "board_front_normal": [0, 1 / math.sqrt(2.96), 1.4 / math.sqrt(2.96)],
        "window_normal": [0, 1 / math.sqrt(2.96), 1.4 / math.sqrt(2.96)],
        "chip_offset_assumed": 7,
        "marker_is_photographic_reference": True,
        "chip_center": lp(chip).Center().toTuple(),
        "window_center": [53, 71, 55 / 1.4],
    }
    # Microphone cassette: no screws. Hollow wall support with 45-degree roots.
    body = body.cut(mp(cyl(1.5, 5, (0, 0, -3)))).cut(mp(cyl(10.1, 0.2, (0, 0, -0.2))))
    add("ref_gore_membrane", mp(cyl(10, 0.2, (0, 0, -0.2))), "membrane")
    tray, receiver = clip_holder(13, 13, 1.8, round_board=True)

    def mm(q):
        return mp(q.rotate((0, 0, 0), (0, 0, 1), 90).translate((0, 0, -8.6)))

    # A shallow wall frame supports two blind push clips, not screw tubes.
    cradle = rr(31, 25, 4.8, (0, 0, 4), 2).cut(box(18, 27, 8, (0, 0, 4)))
    for i, px in enumerate((-12, 12)):

        def back(q):
            return q.rotate((0, 0, 0), (1, 0, 0), 180).translate((0, 0, 1.6))

        cradle = cradle.cut(back(socket(0)).translate((px, 0, 0)))
        tray = tray.cut(cone(2.4, 1.6, 0.8).translate((px, 0, 0)))
        add(
            f"carrier_clip_IN43434_{i}",
            mm(back(rivet(0)).translate((px, 0, 0))),
            "tpu",
            rivet(0),
        )
    body = fuse(body, mm(cradle))
    # Wall-frame lower roots slope 45 degrees in the case's printing direction.
    for yy in (12, 36):
        ramp = (
            cq.Workplane("XZ")
            .polyline([(-81.6, 10.9), (-77, 15.5), (-81.6, 15.5)])
            .close()
            .extrude(6.5)
            .translate((0, yy + 3.25, 0))
            .val()
        )
        body = fuse(body, ramp)
    add("tray_IN43434", mm(tray), flat=tray)
    add("ref_IN43434", mm(refs["IN43434"].translate((0, 0, 4.2))), "reference")
    add(
        "microphone_acoustic_gasket",
        mp(ring(3.5, 1.7, 2, -4.4)),
        "tpu",
        ring(3.5, 1.7, 2),
    )
    fixtures["IN43434"] = mm(tray)
    mounts["IN43434"] = {
        "tray": "tray_IN43434",
        "rivets": ["carrier_clip_IN43434_0", "carrier_clip_IN43434_1"],
        "release": "pull two TPU push clips, then remove carrier",
        "rz": 0,
    }
    gy, gz = 24, 24
    body = body.cut(cyl(6.1, 5, (80, gy, gz), (1, 0, 0)))
    add(
        "reserve_gland_nut",
        ring(9.5, 6.1, 6).rotate((0, 0, 0), (0, 1, 0), 90).translate((75.6, gy, gz)),
        "reserve",
    )
    add(
        "reserve_gland_body",
        ring(9, 6.1, 18).rotate((0, 0, 0), (0, 1, 0), 90).translate((84, gy, gz)),
        "reserve",
    )
    add("ref_power_cable", cyl(2.5, 35, (75, gy, gz), (1, 0, 0)), "cable")
    ant_origin = (-44.5, 78.6, 14)
    bulk = refs["ANTENNA_BULKHEAD"].cut(cyl(1.501, 20.1, (0, -6.5, 0), (0, -1, 0)))
    add("ref_ANTENNA", refs["ANTENNA"].translate(ant_origin), "reference")
    add("ref_ANTENNA_BULKHEAD", bulk.translate(ant_origin), "reference")
    add(
        "antenna_bulkhead_seal",
        ring(12, 8.1, 0.6).rotate((0, 0, 0), (1, 0, 0), -90).translate((-44.5, 84, 14)),
        "tpu",
        ring(12, 8.1, 0.8),
    )
    n_cut = cyl(8.1, 8, (-44.5, 78, 14), (0, 1, 0)).intersect(
        box(13.7, 8, 20, (-44.5, 82, 14))
    )
    body = body.cut(n_cut)
    add(
        "ref_N_PANEL_NUT_ENVELOPE",
        ring(11, 8.1, 3).rotate((0, 0, 0), (1, 0, 0), -90).translate((-44.5, 84.6, 14)),
        "marker",
    )
    port = (-44.5, 16 + 15.919059925498, 10.4)
    start = cq.Vector(-44.5, 72.1, 14)
    end = cq.Vector(-44.5, port[1] + 3, 11.6)
    # Both end tangents follow the connector axes. The low MHF4 outlet points
    # OUT of the module's corner cutout, never over its metal shield.
    path = cq.Edge.makeBezier(
        [start, start + cq.Vector(0, -12, 0), end + cq.Vector(0, 12, 0), end]
    )
    profile = cq.Workplane(cq.Plane(origin=start, normal=(0, -1, 0)))
    cable = (
        profile.circle(0.6).sweep(cq.Wire.assembleEdges([path]), isFrenet=True).val()
    )
    corridor = (
        cq.Workplane(cq.Plane(origin=start, normal=(0, -1, 0)))
        .circle(1.5)
        .sweep(cq.Wire.assembleEdges([path]), isFrenet=True)
        .val()
    )
    add("ref_ANTENNA_CABLE_GENTLE", cable, "cable")
    add("reserve_ANTENNA_CABLE_3mm", corridor, "reserve")
    plug = fuse(cyl(1.3, 0.8, port), box(3, 4, 1.2, (-44.5, port[1] + 1, 11.6)))
    add("ref_MHF4_RIGHT_ANGLE_ENVELOPE", plug, "marker")
    samples = [path.positionAt(i / 1000) for i in range(1001)]
    radii = []
    for a, b, c in zip(samples, samples[1:], samples[2:]):
        ab, bc, ac = b - a, c - b, c - a
        area = ab.cross(ac).Length
        if area > 1e-10:
            radii.append(ab.Length * bc.Length * ac.Length / (2 * area))
    manifest["antenna"] = {
        "port": port,
        "modeled_path_mm": path.Length(),
        "available_mm": 50,
        "connector_allowance_mm": 5,
        "minimum_radius_mm": min(radii),
        "panel_cut_diameter": 16.2,
        "panel_cut_flats_mm": 13.7,
        "original_case_cut_diameter": 16,
        "connector_shape": "N female to MHF4 low-profile right-angle; detailed plug/nut are envelopes",
        "actual_free_length_unconfirmed": True,
        "product_image_length_mm": 100,
        "cable_corridor_diameter_mm": 3,
        "outlet_direction": "+Y, away from module shield",
    }
    manifest["roof"] = {
        "equation": "Y + 1.4 Z = 126",
        "angle_deg": math.degrees(math.atan(1 / 1.4)),
        "normal_wall_mm": roof_t,
    }
    # Mounting inserts only: local pads, all bores 3.6 mm; no internal tubes.
    rear_points = [(x, y) for x in (-60, 60) for y in (-2, 58)]
    for x, y in rear_points:
        body = fuse(body, cyl(5, 6.4, (x, y, 0))).cut(cyl(1.8, 5.6, (x, y, -0.01)))
        body = body.cut(cone(2.1, 1.8, 0.3).translate((x, y, 0)))
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
    seal = flat_seal(p, 1)
    free = flat_seal(p, 1.2)
    for x, y in screws:
        seal = seal.cut(cyl(2.6, 3, (x, y, -1)))
        free = free.cut(cyl(2.6, 3, (x, y, -1)))
    add("body", body)
    add("lid", lid)
    add("flat_gasket_tpu", seal.translate((0, 0, 50)), "tpu", free)
    manifest["carrier_fastening"] = (
        "PETG PCB catches; separate TPU carrier push clips; no glue or screws"
    )
    return parts, kinds, prints, fixtures, mounts, manifest


def export_mount_coupons(out):
    block = rr(14, 16, 6.4, (0, 0, 3.2), 2).cut(socket(6.4))
    plate = (
        rr(14, 14, 1.6, (0, 0, 0.8), 2)
        .cut(cyl(1.6, 2, (0, 0, -0.1)))
        .cut(cone(1.6, 2.4, 0.8, 0.8))
    )
    panel = fuse(box(28, 2.4, 30, (0, 0, 15)), box(28, 12, 2.4, (0, 4.8, 1.2)))
    panel = panel.cut(
        cyl(8.1, 8, (0, -4, 14), (0, 1, 0)).intersect(box(13.7, 8, 20, (0, 0, 14)))
    )
    cq.exporters.export(
        normalize(panel),
        str(out / "N_panel_trial.stl"),
        tolerance=0.05,
        angularTolerance=0.12,
    )
    for n, q in [
        ("mount_socket", block),
        ("mount_plate", plate),
        ("mount_clip", rivet(0)),
    ]:
        cq.exporters.export(
            normalize(q), str(out / (n + ".stl")), tolerance=0.05, angularTolerance=0.12
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
    assembly = cq.Assembly(name="KAMUE_R6")
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
    export_mount_coupons(cd)
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
                "revision": "R6",
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
    print("Built R6:", len(parts), "parts/references; run validate.py.", flush=True)


if __name__ == "__main__":
    main()
