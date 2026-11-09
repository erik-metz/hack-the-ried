"""R2: two chambers, integrated restraints, serviceable optical stack and mic clips.

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


def fuse(*shapes):
    return shapes[0].fuse(*shapes[1:]).clean()


def ring(ro, ri, height, z=0):
    return cyl(ro, height, (0, 0, z)).cut(cyl(ri, height + 2, (0, 0, z - 1))).clean()


def pose(shape, angle=0, position=(0, 0, 0)):
    return shape.rotate((0, 0, 0), (1, 0, 0), angle).translate(position)


def pcb_fixture(w, h, thickness, bottom=12, clearance=0.3, overlap=0.6, clip_y=None):
    """Four rear pads, side spring lips and two end stops; connector edge is +Y."""
    clip_y = clip_y if clip_y is not None else (-h * 0.30, -h * 0.05)
    pieces = []
    for sign in (-1, 1):
        for yy in clip_y:
            # Three-mm pads sit beneath the PCB edge, away from its connector.
            pieces.append(
                box(3, 3, bottom - 2.4, (sign * (w / 2 - 1.8), yy, (bottom + 2.4) / 2))
            )
            x = sign * (w / 2 + clearance + 0.6)
            top = bottom + thickness + 0.3
            pieces.append(
                box(1.2, 3.2, top + 1.0 - 2.4, (x, yy, (top + 1.0 + 2.4) / 2))
            )
            lip_width = clearance + overlap + 1.2
            inner = w / 2 - overlap
            pieces.append(
                box(
                    lip_width,
                    3.2,
                    0.9,
                    (sign * (inner + lip_width / 2), yy, top + 0.45),
                )
            )
    for sign in (-1, 1):
        # End stops occupy the corners, keeping the middle of the header edge clear.
        for xsign in (0,) if sign < 0 else (-1, 1):
            pieces.append(
                box(
                    2.2,
                    1.2,
                    bottom + thickness - 2.4,
                    (
                        xsign * (w / 4),
                        sign * (h / 2 + clearance + 0.6),
                        (bottom + thickness + 2.4) / 2,
                    ),
                )
            )
    # A thin rear spider joins the fixture to itself and to the housing floor.
    pieces += [box(w + 4, 1.2, 1, (0, 0, 2.9)), box(1.2, h + 4, 1, (0, 0, 2.9))]
    # Connect every pad/tongue at floor level; the spider is not used as a loose tray.
    for yy in clip_y:
        pieces.append(box(w + 4, 3.2, 1, (0, yy, 2.9)))
    for y in (-h / 2 - clearance - 0.6, h / 2 + clearance + 0.6):
        pieces.append(box(w + 4, 1.2, 1, (0, y, 2.9)))
    return fuse(*pieces)


def sps_fixture():
    w = 41.2
    c = 0.3
    base = 8
    top = base + 12.2 + 0.3
    pieces = [box(47, 47, 1, (0, 0, 2.9))]
    for xsign in (-1, 1):
        for ysign in (-1, 1):
            pieces.append(
                box(4, 4, base - 2.4, (xsign * 17.5, ysign * 17.5, (base + 2.4) / 2))
            )
        for yy in (-12, 12):
            x = xsign * (w / 2 + c + 0.7)
            pieces.append(box(1.4, 5, top + 1.2 - 2.4, (x, yy, (top + 1.2 + 2.4) / 2)))
            pieces.append(box(2.8, 5, 1.2, (x - xsign * 0.7, yy, top + 0.6)))
    # Positive location in Y without covering the central air face (-Y).
    for ysign in (1,):
        for xsign in (-1, 1):
            pieces.append(
                box(
                    3,
                    1.4,
                    base + 2 - 2.4,
                    (xsign * 18.5, ysign * (w / 2 + c + 0.7), (base + 2 + 2.4) / 2),
                )
            )
    return fuse(*pieces)


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
        raise ValueError("Reposition components before changing the R2 envelope")
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
        body = fuse(body, ear, neck)
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
        body = fuse(body, cyl(5, 7.4, (x, y, -5)))
        body = body.cut(cyl(1.8, 5.6, (x, y, -5.01)))
        body = body.cut(
            cq.Solid.makeCone(2.1, 1.8, 0.3, cq.Vector(x, y, -5), cq.Vector(0, 0, 1))
        )
    parts = {}
    kind = {}
    fixtures = {}
    components = {}

    def add(n, s, k="print"):
        parts[n] = s.clean()
        kind[n] = k

    positions = {
        "RAK_BASE": (-48, 37, 12),
        "INA226": (-7, 53, 12),
        "SHT41": (-61, -38, 12),
        "SCD41": (-34, -55, 12),
        "BME688": (-7, -39, 12),
        "SGP41": (-7, -65, 12),
        "SPS30": (43, -52, 8),
    }
    for name, position in positions.items():
        if name == "SPS30":
            fixture = sps_fixture().translate((43, -52, 0))
        else:
            m = info[name]
            fixture = pcb_fixture(
                m["pcb_width"],
                m["pcb_height"],
                m["pcb_thickness"],
                clearance=p["pcb_clearance"],
                overlap=p["clip_overlap"],
                clip_y=(0, 3.5) if name == "BME688" else None,
            ).translate((position[0], position[1], 0))
        fixtures[name] = fixture
        body = fuse(body, fixture)
        components[name] = refs[name].translate(position)
        add("ref_" + name, components[name], "reference")
    # The common air chamber remains open behind the very short local air adapter.
    air = box(42, 8.6, 14, (43, -77.3, 14.1))
    for x in (32.5, 53.5):
        air = air.cut(box(18, 11, 10, (x, -77.3, 14.1)))
    body = fuse(body, air)
    fixtures["SPS30"] = fuse(fixtures["SPS30"], air, box(48, 12, 9, (43, -77, 4.5)))
    airseal = box(42, 14, 0.4, (0, 0, 0.2))
    for xx in (-10.5, 10.5):
        airseal = airseal.cut(box(18, 10, 2, (xx, 0, 0.2)))
    add("sps_air_face_tpu", pose(airseal, -90, (43, -73.0, 14.1)), "tpu")
    for x in (32.5, 53.5):
        body = body.cut(cyl(9, 10, (x, -90, 14.1), (0, 1, 0)))
    # Independent downward climate slots; no large compartment around the SPS30.
    for x in (-66, -37, -8):
        for z in (9, 16):
            body = body.cut(box(16, 9, 3.5, (x, -83, z)))
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
    nn = (-math.sqrt(0.5), -math.sqrt(0.5), 0)
    body = fuse(body, cyl(9, 7, (-81, 8, 35), nn))
    body = body.cut(cyl(p["gland_hole_assumed"] / 2, 24, (-75, 14, 35), nn))
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
    optical_pos = (42, 98, 34)
    optical_angle = -45
    opt = cyl(16, 27, (0, 0, -27)).cut(cyl(13.3, 26, (0, 0, -25)))
    opt = fuse(opt, ring(20, 13.3, 2, -2))
    optical_screws = []
    for angle in (30, 150, 270):
        a = math.radians(angle)
        x, y = 17 * math.cos(a), 17 * math.sin(a)
        optical_screws.append((x, y))
        opt = fuse(opt, cyl(3.5, 10, (x, y, -7)))
        opt = opt.cut(cyl(1.8, 5.6, (x, y, -2.6)))
        opt = opt.cut(
            cq.Solid.makeCone(2.1, 1.8, 0.3, cq.Vector(x, y, 3), cq.Vector(0, 0, -1))
        )
    body = fuse(body, pose(opt, optical_angle, optical_pos))
    body = body.cut(pose(cyl(13.3, 26, (0, 0, -25)), optical_angle, optical_pos))
    body = body.cut(pose(box(15, 4, 4, (0, -8, -26)), optical_angle, optical_pos))
    # Front-loading cage. Its flange is captured by the removable glass seat.
    carrier = cyl(13.1, 2, (0, 0, -25))
    m = info["LTR390"]
    w, h = m["pcb_width"], m["pcb_height"]
    front = -3
    tpcb = m["pcb_thickness"]
    for sign in (-1, 1):
        for yy in (-h * 0.24, h * 0.24):
            x = sign * (w / 2 + 0.8)
            carrier = fuse(
                carrier,
                box(1.2, 3, 22.2, (x, yy, -12.9)),
                box(2.4, 3, 0.8, (x - sign * 0.6, yy, front + 0.7)),
                box(2.6, 3, 1, (x - sign * 0.7, yy, front - tpcb - 0.5)),
            )
    for sign in (-1, 1):
        for xx in (-w / 4, w / 4):
            carrier = fuse(
                carrier, box(2.2, 1.2, 22, (xx, sign * (h / 2 + 0.9), -13.0))
            )
    for sign in (-1, 1):
        for yy in (-h * 0.24, h * 0.24):
            carrier = fuse(carrier, box(4.5, 3, 1, (sign * 9.1, yy, -1.3)))
    carrier = fuse(carrier, ring(13.1, 11, 1, -1.8)).cut(box(15, 4, 4, (0, -8, -24)))
    add("quartz_seat", pose(ring(13.1, 8, 0.8, -0.8), optical_angle, optical_pos))
    add("ltr_carrier", pose(carrier, optical_angle, optical_pos))
    components["LTR390"] = pose(
        refs["LTR390"].translate((0, 0, front)), optical_angle, optical_pos
    )
    add("ref_LTR390", components["LTR390"], "reference")
    fixtures["LTR390"] = pose(carrier, optical_angle, optical_pos)
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
    retainer = ring(20, 9, 1.5, 3)
    for x, y in optical_screws:
        retainer = retainer.cut(cyl(1.7, 4, (x, y, 2)))
    # Shallow outward drainage reliefs leave the sealing lands intact underneath.
    retainer = retainer.cut(box(3, 24, 0.7, (0, -12, 4.2)))
    add("quartz_retainer", pose(retainer, optical_angle, optical_pos))
    # Microphone: real round PCB retained at its edge, not an empty cup.
    mic_pos = (-60, -80, 35)
    mic_angle = 90
    mic = box(23, 23, 22.6, (0, 0, -9.7)).cut(box(17, 17, 26, (0, 0, -9.0)))
    micfix = []
    for sign in (-1, 1):
        for axis in (0, 1):
            xy = [0, 0]
            xy[axis] = sign * 7.5
            micfix.append(
                box(
                    1.0 if axis == 0 else 3,
                    3 if axis == 0 else 1.0,
                    16.1,
                    (xy[0], xy[1], -6.95),
                )
            )
            xy[axis] = sign * 8.0
            micfix.append(
                box(
                    2.5 if axis == 0 else 3,
                    3 if axis == 0 else 2.5,
                    2,
                    (xy[0], xy[1], -15),
                )
            )
            xy[axis] = sign * 7.0
            micfix.append(
                box(
                    2.2 if axis == 0 else 3,
                    3 if axis == 0 else 2.2,
                    0.8,
                    (xy[0], xy[1], 0.7),
                )
            )
    for xs in (-1, 1):
        for ys in (-1, 1):
            micfix.append(box(4.5, 4.5, 1.2, (xs * 6.45, ys * 6.45, -2.4)))
    mic = fuse(mic, *micfix)
    for sign in (-1, 1):
        for axis in (0, 1):
            xy = [0, 0]
            xy[axis] = sign * 9.4
            mic = mic.cut(
                box(
                    2.2 if axis == 0 else 3.6,
                    3.6 if axis == 0 else 2.2,
                    15.6,
                    (xy[0], xy[1], -6.2),
                )
            )
    body = fuse(body, pose(mic, mic_angle, mic_pos))
    body = body.cut(pose(box(17, 17, 4.4, (0, 0, 3.8)), mic_angle, mic_pos))
    components["IN43434"] = pose(refs["IN43434"], mic_angle, mic_pos)
    fixtures["IN43434"] = pose(mic, mic_angle, mic_pos)
    add("ref_IN43434", components["IN43434"], "reference")
    add(
        "microphone_acoustic_gasket",
        pose(ring(3.5, 1.2, 4.2), mic_angle, mic_pos),
        "tpu",
    )
    add(
        "ref_gore_membrane",
        pose(cyl(10, 0.2, (0, 0, 4.2)), mic_angle, mic_pos),
        "membrane",
    )
    face = box(23, 23, 2.4, (0, 0, 5.6)).cut(cyl(1, 4, (0, 0, 4)))
    for sign in (-1, 1):
        body = fuse(
            body,
            pose(
                fuse(
                    cyl(3.5, 8.4, (sign * 15, 0, -4)), box(5, 6, 8, (sign * 13, 0, 0))
                ),
                mic_angle,
                mic_pos,
            ),
        )
        body = body.cut(pose(cyl(1.8, 5.6, (sign * 15, 0, -1.2)), mic_angle, mic_pos))
        body = body.cut(
            pose(
                cq.Solid.makeCone(
                    2.1, 1.8, 0.3, cq.Vector(sign * 15, 0, 4.4), cq.Vector(0, 0, -1)
                ),
                mic_angle,
                mic_pos,
            )
        )
        face = fuse(
            face,
            cyl(3.5, 2.4, (sign * 15, 0, 4.4)),
            box(5, 6, 2.4, (sign * 13, 0, 5.6)),
        ).cut(cyl(1.7, 4, (sign * 15, 0, 4)))
    add("microphone_front_plate", pose(face, mic_angle, mic_pos))
    mflat = box(23, 23, 0.4, (0, 0, 4.2)).cut(box(20.4, 20.4, 2, (0, 0, 4.2)))
    add("microphone_face_seal", pose(mflat, mic_angle, mic_pos), "tpu")
    cap = fuse(box(23, 23, 1.8, (0, 0, -22.3)), box(15.2, 15.2, 2, (0, 0, -20.4))).cut(
        cyl(2, 6, (0, 0, -24))
    )
    for sign in (-1, 1):
        cap = fuse(
            cap,
            box(1, 4, 9, (sign * 7.8, sign * 4, -18.3)),
            box(2, 4, 0.8, (sign * 8.3, sign * 4, -14.9)),
        )
        body = body.cut(
            pose(box(3, 4.6, 1.0, (sign * 8.6, sign * 4, -14.9)), mic_angle, mic_pos)
        )
    add("microphone_rear_cap", pose(cap, mic_angle, mic_pos))
    rear_seal = box(23, 23, 0.4, (0, 0, -21.2)).cut(box(17, 17, 2, (0, 0, -21.2)))
    add("microphone_rear_seal", pose(rear_seal, mic_angle, mic_pos), "tpu")
    wireplug = fuse(
        cyl(2, 3.8, (0, 0, -23.2)),
        cyl(3, 0.6, (0, 0, -23.8)),
        cyl(3, 0.6, (0, 0, -19.4)),
    )
    add("microphone_wire_septum", pose(wireplug, mic_angle, mic_pos), "tpu")
    # One screwed service frame captures both metal screens in their recesses.
    # These are service fasteners; no sensor PCB is screwed down.
    meshframe = box(68, 26, 1.5, (0, 0, 0.75))
    for i, x in enumerate((32.5, 53.5)):
        body = body.cut(cyl(10.2, 0.7, (x, -84, 14.1), (0, 1, 0)))
        add(f"ref_mesh_{i}", pose(ring(10, 9, 0.3), -90, (x, -83.6, 14.1)), "mesh")
        xx = x - 43
        meshframe = meshframe.cut(cyl(9, 5, (xx, 0, -1)))
        meshframe = fuse(meshframe, ring(10, 9, 0.4, 1.5).translate((xx, 0, 0)))
    for xx in (-30, 30):
        for yy in (-10, 10):
            meshframe = meshframe.cut(cyl(1.7, 4, (xx, yy, -1)))
            bp = (43 + xx, -84, 14.1 - yy)
            body = fuse(body, cyl(3.25, 9, bp, (0, 1, 0)))
            body = body.cut(cyl(1.8, 5.6, bp, (0, 1, 0)))
            body = body.cut(
                cq.Solid.makeCone(2.1, 1.8, 0.3, cq.Vector(*bp), cq.Vector(0, 1, 0))
            )
    add("mesh_service_frame", pose(meshframe, -90, (43, -85.5, 14.1)))
    # Mounting plate seats against the four rear pads; wall and mast versions separate.
    plate = box(142, 160, 3, (0, 0, -6.5))
    for x, y in mounts:
        plate = plate.cut(cyl(1.7, 5, (x, y, -9)))
    for x in (-60, 60):
        for y in (-70, 70):
            plate = plate.cut(cyl(2.7, 5, (x, y, -9)))
    for x in (-32, 32):
        for y in (-46, 46):
            plate = plate.cut(box(4, 14, 5, (x, y, -6.5)))
    add("mount_wall", plate)
    for diameter in (40, 50):
        saddle = box(60, 22, 20, (0, 0, -18)).cut(
            cyl(diameter / 2 + 0.3, 25, (0, -12.5, -18 - diameter / 2), (0, 1, 0))
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
        "sps_air_face_tpu": pose(airseal, -90, (43, -73.0, 14.1)),
        "microphone_acoustic_gasket": pose(ring(3.5, 1.2, 4.6), mic_angle, mic_pos),
        "microphone_face_seal": pose(
            box(23, 23, 0.6, (0, 0, 4.3)).cut(box(20.4, 20.4, 2, (0, 0, 4.3))),
            mic_angle,
            mic_pos,
        ),
        "microphone_rear_seal": pose(
            box(23, 23, 0.6, (0, 0, -21.3)).cut(box(17, 17, 2, (0, 0, -21.3))),
            mic_angle,
            mic_pos,
        ),
    }
    air_free = box(42, 14, 0.6, (0, 0, 0.3))
    for xx in (-10.5, 10.5):
        air_free = air_free.cut(box(18, 10, 2, (xx, 0, 0.3)))
    free_prints["sps_air_face_tpu"] = pose(air_free, -90, (43, -73.0, 14.1))
    for x in (-40, 35):
        free_prints["wire_septum_" + str(x)] = pose(
            fuse(
                cyl(4.1, 2.4), cyl(5.5, 0.8, (0, 0, -0.8)), cyl(5.5, 0.8, (0, 0, 2.4))
            ),
            -90,
            (x, -13.2, 35),
        )
    free_prints["microphone_wire_septum"] = pose(
        fuse(
            cyl(2.1, 3.8, (0, 0, -23.2)),
            cyl(3, 0.6, (0, 0, -23.8)),
            cyl(3, 0.6, (0, 0, -19.4)),
        ),
        mic_angle,
        mic_pos,
    )
    return parts, kind, fixtures, components, free_prints


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
    assembly = cq.Assembly(name="KAMUE_R2_installed_components")
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
        if n != "LTR390":
            s = s.intersect(parts["body"])
        cq.exporters.export(s, str(pd / f"fixture_check_{n}.step"))
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
                "revision": "R2",
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
