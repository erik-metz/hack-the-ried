"""R3: two chambers, integrated restraints, serviceable optical stack and mic clips.

The supplied Fusion bodies are used as installed references, not cuboid substitutes.
X right, Y up, Z from rear to service lid. All lengths are millimetres.
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


def cyl(r, length, start=(0, 0, 0), direction=(0, 0, 1)):
    return cq.Solid.makeCylinder(r, length, cq.Vector(*start), cq.Vector(*direction))


def clean_valid(shape):
    # OCP face unification can invalidate otherwise valid rotated boolean seams.
    unified = shape.copy().clean()
    return unified if unified.isValid() else shape


def fuse(*shapes):
    result = shapes[0].fuse(*shapes[1:], tol=1e-5)
    return clean_valid(result)


def ring(ro, ri, height, z=0):
    return cyl(ro, height, (0, 0, z)).cut(cyl(ri, height + 2, (0, 0, z - 1))).clean()


def pose(shape, angle=0, position=(0, 0, 0)):
    return shape.rotate((0, 0, 0), (1, 0, 0), angle).translate(position)


def rail_fixture(w, h, thickness, bottom=12, clip_y=None):
    """Rigid 45-degree roof rails; a separate flat U-frame locks with a TPU pin."""
    ys = clip_y if clip_y is not None else (-h * 0.30, -h * 0.05)
    top = bottom + thickness + 0.3
    pieces = [box(w + 9, h + 8, 1, (0, -1, 2.9))]
    frame = []
    for sign in (-1, 1):
        for yy in ys:
            pieces.append(
                box(3, 3, bottom - 2.4, (sign * (w / 2 - 1.8), yy, (bottom + 2.4) / 2))
            )
            pieces.append(
                box(
                    1.2,
                    3.2,
                    bottom + thickness - 2.4,
                    (sign * (w / 2 + 0.9), yy, (bottom + thickness + 2.4) / 2),
                )
            )
            # Extrude XZ polygons along -Y. Roof grows inward at 45 degrees.
            inner, outer = w / 2 + 2.3, w / 2 + 4.1
            points = [
                (sign * inner, 2.4),
                (sign * outer, 2.4),
                (sign * outer, top + 3.5),
                (sign * (inner - 1.6), top + 3.5),
                (sign * inner, top + 1.9),
            ]
            pieces.append(
                cq.Workplane("XZ")
                .polyline(points)
                .close()
                .extrude(3.2)
                .translate((0, yy + 1.6, 0))
                .val()
            )
        y0, y1 = -h / 2 - 4.0, max(ys) + 1.6
        frame.append(
            box(2.6, y1 - y0, 1.6, (sign * (w / 2 + 0.7), (y0 + y1) / 2, top + 0.8))
        )
    frame.append(box(w + 4, 3, 1.6, (0, -h / 2 - 2.5, top + 0.8)))
    for sign in (-1, 1):
        for xs in (0,) if sign < 0 else (-1, 1):
            pieces.append(
                box(
                    2.2,
                    1.2,
                    bottom + thickness - 2.4,
                    (xs * w / 4, sign * (h / 2 + 0.9), (bottom + thickness + 2.4) / 2),
                )
            )
    pin_y = -h / 2 - 2.5
    post = cyl(2.3, top - 2.4, (0, pin_y, 2.4)).cut(cyl(1.4, 7, (0, pin_y, top - 6)))
    pieces.append(post)
    frame = fuse(*frame).cut(cyl(1.4, 4, (0, pin_y, top - 1)))
    pin = fuse(cyl(1.4, 5, (0, pin_y, top - 3.4)), cyl(2.2, 0.8, (0, pin_y, top + 1.6)))
    return fuse(*pieces).cut(cyl(1.4, 7, (0, pin_y, top - 6))), frame, pin


def flat_seal(p, height):
    w, h = p["body_width"], p["body_height"]
    land = p["seal_land"]
    sy = p["split_y"]
    s = box(w, h, height, (0, 0, height / 2))
    # One broad, flat sheet with two openings; no groove / narrow cord seal.
    for y0, y1 in [(-h / 2 + land, sy - land / 2), (sy + land / 2, h / 2 - land)]:
        s = s.cut(
            box(w - 2 * land, y1 - y0, height + 2, (0, (y0 + y1) / 2, height / 2))
        )
    return s.clean()


def add_clip_pocket(w, h, depth, center):
    """Pocket rooted in the housing; a separate bridge locks into side windows."""
    pieces = [box(w + 4, h + 4, 2, (0, 0, 7))]
    for x in (-w / 2 - 1, w / 2 + 1):
        wall = box(2, h + 4, depth + 3, (x, 0, 8 + (depth + 3) / 2))
        wall = wall.cut(box(4, 6, 2.6, (x, 0, 8 + depth)))
        pieces.append(wall)
    for y in (-h / 2 - 1, h / 2 + 1):
        pieces.append(box(w, 2, depth + 3, (0, y, 8 + (depth + 3) / 2)))
    for x in (-w / 2 + 2, w / 2 - 2):
        for y in (-h / 2 + 2, h / 2 - 2):
            pieces.append(box(3, 3, 3.6, (x, y, 4.2)))
    pocket = fuse(*pieces).translate(center)
    bridge = box(w + 8, 5, 1.8, (0, 0, 8 + depth + 4.2))
    for sign in (-1, 1):
        x = sign * (w / 2 + 2.8)
        bridge = fuse(
            bridge,
            box(1.2, 5, 6.8, (x, 0, 8 + depth + 1.2)),
            box(1.6, 5, 0.8, (x - sign * 0.6, 0, 8 + depth)),
        )
    return pocket, bridge.translate(center)


def build(p, refdir):
    W, H, D, t = (p[k] for k in ("body_width", "body_height", "body_depth", "wall"))
    if (W, H, D) != (168, 168, 50):
        raise ValueError("Reposition components before changing the R3 envelope")
    refs = {
        n: cq.importers.importStep(str(refdir / f"{n}.step")).val()
        for n in (
            "RAK_BASE",
            "INA226",
            "SHT41",
            "SCD41",
            "BME688",
            "SGP41",
            "SPS30",
            "LTR390",
            "IN43434",
        )
    }
    info = json.loads((refdir / "components.json").read_text())
    body = box(W, H, D, (0, 0, D / 2)).cut(
        box(W - 2 * t, H - 2 * t, D + 2, (0, 0, t + (D + 2) / 2))
    )
    rim = box(W, H, 3, (0, 0, D - 1.5)).cut(box(W - 12, H - 12, 5, (0, 0, D - 1.5)))
    divider = box(W - 2 * t, t, D - t, (0, p["split_y"], (D + t) / 2))
    divider = fuse(divider, box(W - 2 * t, 6, 3, (0, p["split_y"], D - 1.5)))
    body = fuse(body, rim, divider)
    mic_pos = (-96.5, 28, 32)

    def mp(q):
        return (
            q.rotate((0, 0, 0), (1, 0, 0), 90)
            .rotate((0, 0, 0), (0, 0, 1), -45)
            .translate(mic_pos)
        )

    body = body.fuse(mp(box(26, 26, 27, (0, 0, -9.5))), tol=1e-4).fix()
    body = body.cut(mp(cyl(10.2, 27, (0, 0, -21))))
    body = body.cut(mp(cyl(7, 5, (0, 0, -25))))
    # Self-supporting buttresses below external capsule (rear face prints at Z=0).
    for yy in (25, 40):
        rib = (
            cq.Workplane("XZ")
            .polyline([(-81.5, 0), (-108, 26.5), (-81.5, 26.5)])
            .close()
            .extrude(2)
            .translate((0, yy, 0))
            .val()
        )
        rib = rib.intersect(mp(box(200, 200, 60, (0, 0, -26))))
        body = fuse(body, rib)
    body = body.cut(mp(cyl(10.2, 27, (0, 0, -21))))
    body = body.cut(mp(cyl(7, 5, (0, 0, -25))))

    # External ears are hard stops and M3 towers; the 2.4-mm walls stay thin.
    screw_points = [(x, y) for x in (-90, 90) for y in (-65, 0, 65)] + [
        (0, -90),
        (0, 90),
    ]
    lid_z = D + p["seal_compressed_height"]
    lid = box(W, H, p["lid_thickness"], (0, 0, lid_z + p["lid_thickness"] / 2))
    for x, y in screw_points:
        ear = cyl(5, 11, (x, y, 40))
        neck = box(
            9 if x else 10,
            10 if x else 9,
            10,
            (
                x - (math.copysign(3, x) if x else 0),
                y - (math.copysign(3, y) if not x else 0),
                45.0,
            ),
        )
        ramp = cq.Solid.makeCone(0.5, 5, 4.5, cq.Vector(x, y, 35.5))
        # Wide triangular neck from case wall to the ear; no unsupported ear starts.
        if x:
            ramp = fuse(
                ramp,
                cq.Workplane("XZ")
                .polyline(
                    [
                        (math.copysign(82, x), 27),
                        (math.copysign(95, x), 40),
                        (math.copysign(82, x), 40),
                    ]
                )
                .close()
                .extrude(10)
                .translate((0, y + 5, 0))
                .val(),
            )
        else:
            ramp = fuse(
                ramp,
                cq.Workplane("YZ")
                .polyline(
                    [
                        (math.copysign(82, y), 27),
                        (math.copysign(95, y), 40),
                        (math.copysign(82, y), 40),
                    ]
                )
                .close()
                .extrude(10)
                .translate((-5, 0, 0))
                .val(),
            )
        body = fuse(body, ear, neck, ramp)
        body = body.cut(
            cyl(
                1.8,
                p["insert_length_assumed"] + 0.6,
                (x, y, lid_z - p["insert_length_assumed"] - 0.6),
            )
        )
        body = body.cut(cq.Solid.makeCone(1.8, 2.1, 0.3, cq.Vector(x, y, lid_z - 0.3)))
        le = fuse(
            cyl(5, 3, (x, y, lid_z)),
            box(
                9 if x else 10,
                10 if x else 9,
                3,
                (
                    x - (math.copysign(3, x) if x else 0),
                    y - (math.copysign(3, y) if not x else 0),
                    lid_z + 1.5,
                ),
            ),
        )
        lid = fuse(lid, le).cut(cyl(1.7, 5, (x, y, lid_z - 1)))
    # Rear mounts seat directly against a mounting plate, with blind inserts.
    mounts = [(x, y) for x in (-60, 60) for y in (-2, 58)]
    for x, y in mounts:
        body = fuse(body, cyl(5, 7.4, (x, y, 0)))
        body = body.cut(cyl(1.8, 5.6, (x, y, -0.01)))
        body = body.cut(
            cq.Solid.makeCone(2.1, 1.8, 0.3, cq.Vector(x, y, 0), cq.Vector(0, 0, 1))
        )
    parts = {}
    kind = {}
    fixtures = {}
    components = {}

    def add(n, s, k="print"):
        parts[n] = clean_valid(s)
        kind[n] = k

    positions = {
        "RAK_BASE": (-48, 37, 12),
        "INA226": (-7, 53, 12),
        "SHT41": (-7, 19, 12),
        "SCD41": (29, -40, 12),
        "BME688": (1, -39, 12),
        "SGP41": (59, -38, 12),
        "SPS30": (-38, -50, 8),
    }
    for name, position in positions.items():
        m = info[name]
        w, h, th = (
            (41.2, 41.2, 12.2)
            if name == "SPS30"
            else (m["pcb_width"], m["pcb_height"], m["pcb_thickness"])
        )
        fixture, frame, pin = rail_fixture(
            w, h, th, bottom=position[2], clip_y=(0, 3.5) if name == "BME688" else None
        )
        if name == "SPS30":
            fixture, frame, pin = [
                q.rotate((0, 0, 0), (0, 0, 1), 180) for q in (fixture, frame, pin)
            ]
        shift = (position[0], position[1], 0)
        fixture, frame, pin = [q.translate(shift) for q in (fixture, frame, pin)]
        fixtures[name] = fuse(fixture, frame, pin)
        body = fuse(body, fixture)
        add("holder_frame_" + name, frame)
        add("holder_pin_" + name, pin, "tpu")
        components[name] = refs[name].translate(position)
        add("ref_" + name, components[name], "reference")

    # One shared measuring chamber. ONLY two screened exterior air openings.
    # A short exhaust adapter prevents the left SPS outlet recirculating inside.
    # Rectangular loft joins its left half to the widely separated left screen.
    def duct_shape(w, h):
        return (
            cq.Workplane("XZ", origin=(-48.5, -71.0, 14.1))
            .rect(w, h)
            .workplane(offset=11.4)
            .center(-9.5, 0)
            .rect(w, h)
            .loft()
            .val()
        )

    air = duct_shape(22.8, 14.8).cut(duct_shape(18, 10))
    # Grounded 45-degree underside support; airway remains unobstructed.
    support = box(36, 11, 4.3, (-52, -76.3, 4.55))
    body = fuse(body, air, support).cut(duct_shape(18, 10))
    # Thin rectangular face seal around exhaust only; inlet remains common-room.
    airseal = box(22.8, 14.8, 0.4, (0, 0, 0.2)).cut(box(18, 10, 2, (0, 0, 0.2)))
    add("sps_air_face_tpu", pose(airseal, -90, (-48.5, -71.0, 14.1)), "tpu")
    body = body.cut(pose(box(22.8, 14.8, 0.4, (0, 0, 0.2)), -90, (-48.5, -71, 14.1)))
    # No additional slots in either wall, including under the gas sensors.
    for x in (-58, 58):
        body = body.cut(cyl(9, 10, (x, -90, 14.1), (0, 1, 0)))
    # Shared service partition: routes are solid TPU septa, pierced to the actual wires.
    for x in (-40, 35):
        body = body.cut(cyl(4, 7, (x, -15.5, 35), (0, 1, 0)))
    for x in (-40, 35):
        add(
            "wire_septum_" + str(x),
            pose(
                fuse(
                    cyl(4.0, 2.4),
                    cyl(5.5, 0.8, (0, 0, -0.8)),
                    cyl(5.5, 0.8, (0, 0, 2.4)),
                ),
                -90,
                (x, -13.2, 35),
            ),
            "tpu",
        )
    # Power and antenna hardware footprints remain explicitly parametric.
    nn = (math.sqrt(0.5), -math.sqrt(0.5), 0)
    body = fuse(body, cyl(9, 7, (81, 8, 35), nn))
    body = body.cut(cyl(p["gland_hole_assumed"] / 2, 24, (75, 14, 35), nn))
    body = body.cut(cyl(3.3, 10, (-45, 79, 30), (0, 1, 0)))
    bus, busbridge = add_clip_pocket(42, 22, 20, (35, 5, 0))
    body = fuse(body, bus)
    add("bus_retaining_bridge", busbridge)
    bag, bagbridge = add_clip_pocket(54, 27, 18, (37, 46, 0))
    body = fuse(body, bag)
    add("desiccant_retaining_bridge", bagbridge)
    add("reserve_bus", box(40, 20, 20, (35, 5, 18)), "reserve")
    add("reserve_silica", box(50, 25, 18, (37, 46, 17)), "reserve")
    # Complete optical stack. Local +Z is the outward glass normal, tilted 45 deg.
    optical_pos = (42, 106, 34)
    optical_angle = -45
    opt = cyl(22, 27, (0, 0, -27)).cut(cyl(19.6, 26, (0, 0, -25)))
    opt = fuse(opt, ring(26, 19.6, 2, -2))
    optical_screws = []
    for angle in (30, 150, 270):
        a = math.radians(angle)
        x, y = 23 * math.cos(a), 23 * math.sin(a)
        optical_screws.append((x, y))
        opt = fuse(opt, cyl(3.5, 10, (x, y, -7)))
        opt = opt.cut(cyl(1.8, 5.6, (x, y, -2.6)))
        opt = opt.cut(
            cq.Solid.makeCone(2.1, 1.8, 0.3, cq.Vector(x, y, 3), cq.Vector(0, 0, -1))
        )
    body = fuse(body, pose(opt, optical_angle, optical_pos))
    body = body.cut(pose(cyl(19.6, 26, (0, 0, -25)), optical_angle, optical_pos))
    body = body.cut(pose(box(15, 4, 4, (0, -8, -26)), optical_angle, optical_pos))
    # PCB is rotated so header sits to the left of the window. The actual UV
    # chip is offset from the mounting hole; this datum MUST be measured on PCB.
    chip_offset = p["ltr_chip_offset_y_provisional"]
    cx, front = -chip_offset, -3
    m = info["LTR390"]
    w, h = m["pcb_height"], m["pcb_width"]
    carrier = cyl(19.3, 2, (0, 0, -25))
    # Rigid corner posts support the board, separate TPU pressure ring holds it.
    for xs in (-1, 1):
        for ys in (-1, 1):
            carrier = fuse(
                carrier,
                box(
                    2.0,
                    2.0,
                    17.5,
                    (cx + xs * (w / 2 - 0.8), ys * (h / 2 - 0.8), -14.25),
                ),
            )
    for xs in (-1, 1):
        carrier = fuse(
            carrier, box(1.2, h + 2.4, 21.2, (cx + xs * (w / 2 + 0.9), 0, -12.4))
        )
    for ys in (-1, 1):
        carrier = fuse(carrier, box(w + 3, 1.2, 21.2, (cx, ys * (h / 2 + 0.9), -12.4)))
    # Header relief (-X after rotation): rearward connector is not clamped.
    carrier = carrier.cut(box(4, 15, 18, (cx - w / 2 + 1, 0, -14.5)))
    for ys in (-1, 1):
        carrier = fuse(
            carrier, box(2, 3, 17.5, (cx - w / 2 + 4, ys * (h / 2 - 1.8), -14.25))
        )
    carrier = carrier.intersect(cyl(19.3, 25, (0, 0, -25)))
    # Side walls enclose PCB with .3 clearance; front pad seats on PCB perimeter.
    pad = box(w + 0.6, h + 0.6, 1.2, (cx, 0, -2.4)).cut(
        box(w - 1.4, h - 1.4, 3, (cx, 0, -2.4))
    )
    # Glass seat also captures the rigid cage through its peripheral wall tops.
    seat = ring(19.3, 8, 0.8, -0.8)
    # Solid datum shim behind the pad; pinning chip direction is visible in review.
    # Join pressure frame to seat using small pillars outside the optical aperture.
    for ys in (-1, 1):
        seat = fuse(seat, box(w + 2.4, 1.2, 1, (cx, ys * (h / 2 + 0.6), -1.3)))
    add("quartz_seat", pose(seat, optical_angle, optical_pos))
    add("ltr_edge_pad", pose(pad, optical_angle, optical_pos), "tpu")
    add("ltr_carrier", pose(carrier, optical_angle, optical_pos))
    components["LTR390"] = pose(
        refs["LTR390"].rotate((0, 0, 0), (0, 0, 1), -90).translate((cx, 0, front)),
        optical_angle,
        optical_pos,
    )
    add("ref_LTR390", components["LTR390"], "reference")
    fixtures["LTR390"] = fuse(
        pose(carrier, optical_angle, optical_pos), pose(pad, optical_angle, optical_pos)
    )
    add("quartz_lower_seal", pose(ring(10, 8, 0.8), optical_angle, optical_pos), "tpu")
    add(
        "ref_quartz_glass",
        pose(cyl(10, 2, (0, 0, 0.8)), optical_angle, optical_pos),
        "glass",
    )
    add(
        "quartz_upper_pad",
        pose(ring(10, 9, 0.2, 2.8), optical_angle, optical_pos),
        "tpu",
    )
    retainer = ring(26, 9, 1.5, 3)
    for x, y in optical_screws:
        retainer = retainer.cut(cyl(1.7, 4, (x, y, 2)))
    # Shallow outward drainage reliefs leave the sealing lands intact underneath.
    retainer = retainer.cut(box(3, 24, 0.7, (0, -12, 4.2)))
    add("quartz_retainer", pose(retainer, optical_angle, optical_pos))
    # Angled LEFT outlet is now microphone-only, open at rear into dry room.
    # Its PCB is captured by a separate flat-printed TPU edge collar, no thin tabs.
    mc = cyl(10, 21.8, (0, 0, -21)).cut(cyl(8.6, 21, (0, 0, -19)))
    mc = mc.cut(cyl(7, 5, (0, 0, -23)))
    shoulder = cyl(8.8, 1.9, (0, 0, -4.3)).cut(
        cq.Solid.makeCone(8.6, 6.7, 1.9, cq.Vector(0, 0, -4.3))
    )
    mc = fuse(mc, shoulder)
    collar = cyl(8.4, 3.2, (0, 0, -2.4)).cut(cyl(6.2, 4, (0, 0, -2.8)))
    collar = collar.cut(cyl(6.55, 2, (0, 0, -1.8)))
    collar = collar.cut(cyl(5.7, 2, (0, 0, 0.2)))
    add("microphone_carrier", mp(mc))
    add("microphone_board_collar", mp(collar), "tpu")
    add("microphone_peripheral_spacer", mp(ring(10, 8.8, 3.4, 0.8)), "tpu")
    components["IN43434"] = mp(refs["IN43434"])
    fixtures["IN43434"] = fuse(mp(mc), mp(collar))
    add("ref_IN43434", components["IN43434"], "reference")
    add("microphone_acoustic_gasket", mp(ring(3.5, 1.2, 4.2)), "tpu")
    add("ref_gore_membrane", mp(cyl(10, 0.2, (0, 0, 4.2))), "membrane")
    face = box(26, 26, 2.4, (0, 0, 5.6)).cut(cyl(1, 4, (0, 0, 4)))
    for sign in (-1, 1):
        boss = fuse(
            cyl(3.5, 8.4, (sign * 17, 0, -4)), box(6, 6, 8, (sign * 14.5, 0, 0))
        )
        boss = boss.cut(cyl(1.8, 5.6, (sign * 17, 0, -1.2)))
        boss = boss.cut(
            cq.Solid.makeCone(
                2.1, 1.8, 0.3, cq.Vector(sign * 17, 0, 4.4), cq.Vector(0, 0, -1)
            )
        )
        body = fuse(body, mp(boss))
        face = fuse(
            face,
            cyl(3.5, 2.4, (sign * 17, 0, 4.4)),
            box(6, 6, 2.4, (sign * 14.5, 0, 5.6)),
        )
        face = face.cut(cyl(1.7, 4, (sign * 17, 0, 4)))
    add("microphone_front_plate", mp(face))
    mflat = box(26, 26, 0.4, (0, 0, 4.2)).cut(box(20.4, 20.4, 2, (0, 0, 4.2)))
    add("microphone_face_seal", mp(mflat), "tpu")
    # Each sieve has its own two-screw clamp: replaceable, no adhesive.
    for i, x in enumerate((-58, 58)):
        body = body.cut(cyl(10.2, 0.7, (x, -84, 14.1), (0, 1, 0)))
        add(f"ref_mesh_{i}", pose(ring(10, 9, 0.3), -90, (x, -83.6, 14.1)), "mesh")
        cap = ring(13, 9, 1.5)
        cap = fuse(cap, ring(10, 9, 0.4, 1.5))
        for xx in (-16, 16):
            cap = fuse(cap, cyl(3.5, 1.5, (xx, 0, 0)))
            cap = cap.cut(cyl(1.7, 4, (xx, 0, -1)))
            bp = (x + xx, -84, 14.1)
            body = fuse(body, cyl(3.5, 9, bp, (0, 1, 0)))
            body = body.cut(cyl(1.8, 5.6, bp, (0, 1, 0)))
            body = body.cut(
                cq.Solid.makeCone(2.1, 1.8, 0.3, cq.Vector(*bp), cq.Vector(0, 1, 0))
            )
        add(f"mesh_service_frame_{i}", pose(cap, -90, (x, -85.5, 14.1)))
    # Mounting plate seats against the four rear pads; wall and mast versions separate.
    plate = box(142, 160, 3, (0, 0, -1.5))
    for x, y in mounts:
        plate = plate.cut(cyl(1.7, 5, (x, y, -4)))
    for x in (-60, 60):
        for y in (-70, 70):
            plate = plate.cut(cyl(2.7, 5, (x, y, -4)))
    for x in (-32, 32):
        for y in (-46, 46):
            plate = plate.cut(box(4, 14, 5, (x, y, -1.5)))
    add("mount_wall", plate)
    for diameter in (40, 50):
        saddle = box(60, 22, 20, (0, 0, -13)).cut(
            cyl(diameter / 2 + 0.3, 25, (0, -12.5, -13 - diameter / 2), (0, 1, 0))
        )
        variant = plate
        for y in (-46, 46):
            variant = fuse(variant, saddle.translate((0, y, 0)))
        add(f"mount_mast_{diameter}", variant, "alternative")
    # Light rain cap is fixed with two shared upper lid screws, not left floating.
    roof = box(196, 2.4, 64, (0, 98, 24))
    roof = roof.cut(
        box(65, 10, 65, (46, 98, 29))
    )  # optical cassette has its own inclined weather face
    for x in (-90, 90):
        ear = box(10, 35, 2.4, (x, 81.5, 55.2)).cut(cyl(1.7, 5, (x, 65, 53)))
        roof = fuse(roof, ear)
    add("rain_cap", roof)
    body = body.cut(box(400, 400, 10, (0, 0, -5)))
    add("body", body)
    add("lid", lid)
    add(
        "flat_gasket_tpu",
        flat_seal(p, p["seal_compressed_height"]).translate((0, 0, D)),
        "tpu",
    )
    free_prints = {
        "flat_gasket_tpu": flat_seal(p, p["seal_free_height"]),
        "quartz_lower_seal": pose(ring(10, 8, 1.0), optical_angle, optical_pos),
        "quartz_upper_pad": pose(ring(10, 9, 0.4, 2.8), optical_angle, optical_pos),
        "sps_air_face_tpu": pose(airseal, -90, (-48.5, -71.0, 14.1)),
        "microphone_acoustic_gasket": mp(ring(3.5, 1.2, 4.6)),
        "microphone_face_seal": mp(
            box(26, 26, 0.6, (0, 0, 4.3)).cut(box(20.4, 20.4, 2, (0, 0, 4.3)))
        ),
    }
    for x in (-40, 35):
        free_prints["wire_septum_" + str(x)] = pose(
            fuse(
                cyl(4.1, 2.4), cyl(5.5, 0.8, (0, 0, -0.8)), cyl(5.5, 0.8, (0, 0, 2.4))
            ),
            -90,
            (x, -13.2, 35),
        )
    # STL files are in deliberate print orientation, unlike installed STEP parts.
    for name, shape in parts.items():
        q = free_prints.get(name, shape)
        if name.startswith("holder_pin_"):
            q = fuse(cyl(1.45, 5), cyl(2.2, 0.8, (0, 0, 5)))
        if name.startswith("microphone"):
            q = (
                q.translate(tuple(-v for v in mic_pos))
                .rotate((0, 0, 0), (0, 0, 1), 45)
                .rotate((0, 0, 0), (1, 0, 0), -90)
            )
        elif name.startswith(("quartz_", "ltr_")):
            q = q.translate(tuple(-v for v in optical_pos)).rotate(
                (0, 0, 0), (1, 0, 0), 45
            )
        elif name.startswith(("mesh_service", "sps_air", "wire_septum")):
            q = q.rotate((0, 0, 0), (1, 0, 0), 90)
        bb = q.BoundingBox()
        free_prints[name] = q.translate(
            (-(bb.xmin + bb.xmax) / 2, -(bb.ymin + bb.ymax) / 2, -bb.zmin)
        ).fix()
    return parts, kind, fixtures, components, free_prints


def floor_coupon(shape, body):
    """Keep actual rear-wall material beneath the cropped rigid fixture."""
    b = shape.BoundingBox()
    return body.intersect(
        box(
            b.xlen + 0.4,
            b.ylen + 0.4,
            b.zmax + 0.2,
            ((b.xmin + b.xmax) / 2, (b.ymin + b.ymax) / 2, (b.zmax + 0.2) / 2),
        )
    ).fix()


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--references", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    a = ap.parse_args()
    p = json.loads((HERE / "parameters.json").read_text())
    parts, kinds, fixtures, _components, free_prints = build(p, a.references)
    a.out.mkdir(parents=True, exist_ok=True)
    pd = a.out / "parts"
    pd.mkdir(exist_ok=True)
    checks = []
    assembly = cq.Assembly(name="KAMUE_R3_installed_components")
    for name, s in parts.items():
        if not s.isValid() or s.Volume() <= 0:
            raise RuntimeError(f"Invalid: {name}")
        if kinds[name] != "reference" and len(s.Solids()) != 1:
            raise RuntimeError(f"Disconnected: {name}: {len(s.Solids())}")
        cq.exporters.export(s, str(pd / f"{name}.step"))
        if kinds[name] in ("print", "tpu", "alternative"):
            stl = free_prints.get(name, s)
            if not stl.isValid() or len(stl.Solids()) != 1:
                raise RuntimeError("Invalid free print shape: " + name)
            cq.exporters.export(
                stl, str(pd / f"{name}.stl"), tolerance=0.06, angularTolerance=0.15
            )
        color = (
            cq.Color(0.2, 0.6, 0.45)
            if kinds[name] == "reference"
            else cq.Color(0.3, 0.65, 0.8)
            if kinds[name] == "glass"
            else cq.Color(0.95, 0.65, 0.1)
            if kinds[name] == "tpu"
            else cq.Color(0.65, 0.72, 0.78)
        )
        if kinds[name] != "alternative":
            assembly.add(s, name=name, color=color)
        checks.append(
            {
                "part": name,
                "kind": kinds[name],
                "valid": True,
                "solid_count": len(s.Solids()),
                "volume_mm3": s.Volume(),
            }
        )
    assembly.export(str(a.out / "assembly.step"))
    for n, s in fixtures.items():
        if n not in ("LTR390", "IN43434"):
            # Reconstruct fixture from material actually retained in body + parts.
            s = cq.Compound.makeCompound(
                [
                    s.intersect(parts["body"]),
                    parts["holder_frame_" + n],
                    parts["holder_pin_" + n],
                ]
            )
        cq.exporters.export(s, str(pd / f"fixture_check_{n}.step"))
        if n in ("LTR390", "IN43434"):
            s = free_prints["ltr_carrier" if n == "LTR390" else "microphone_carrier"]
        else:
            s = floor_coupon(s.intersect(parts["body"]), parts["body"])
        if s.isValid() and len(s.Solids()) == 1:
            bb = s.BoundingBox()
            coupon = s.translate(
                (-(bb.xmin + bb.xmax) / 2, -(bb.ymin + bb.ymax) / 2, -bb.zmin)
            )
            cd = a.out / "coupons"
            cd.mkdir(exist_ok=True)
            cq.exporters.export(
                coupon,
                str(cd / f"holder_{n}.stl"),
                tolerance=0.06,
                angularTolerance=0.15,
            )
    (a.out / "validation.json").write_text(
        json.dumps(
            {
                "revision": "R3",
                "parts": checks,
                "status": "geometry-built-not-yet-validated",
            },
            indent=2,
        )
    )
    (a.out / "components.json").write_text(
        (a.references / "components.json").read_text()
    )
    print(
        f"Built {len(parts)} installed parts / references. Run validate.py before using output."
    )


if __name__ == "__main__":
    main()
