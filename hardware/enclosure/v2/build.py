"""New enclosure: reproducible engineering layout, not a qualified outdoor product.

Coordinates in mm: X right, Y up (antenna), Z from rear toward service lid.
All geometry is new. Existing Fusion geometry is only a dimensional reference.
Run with --out /absolute/output/path. No files are written to the Fusion session.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import cadquery as cq

HERE = Path(__file__).resolve().parent


def box(x, y, z, center):
    return cq.Workplane("XY").box(x, y, z).translate(center)


def cylinder(radius, length, start, direction=(0, 0, 1)):
    return cq.Workplane(
        obj=cq.Solid.makeCylinder(
            radius, length, cq.Vector(*start), cq.Vector(*direction)
        )
    )


def ring_xy(half, width, height, z):
    return box(2 * half + width, 2 * half + width, height, (0, 0, z + height / 2)).cut(
        box(2 * half - width, 2 * half - width, height + 2, (0, 0, z + height / 2))
    )


def seal_network(width, height, z, sx, sy):
    ring = ring_xy(81.5, width, height, z)
    ring = ring.union(box(163, width, height, (0, sy, z + height / 2)))
    return ring.union(
        box(width, sy + 81.5, height, (sx, (sy - 81.5) / 2, z + height / 2))
    )


def pcb_holder(w, h, p):
    """Edge support / flexible tongues. PCB fit is a coupon-verified assumption."""
    c = p["pcb_side_clearance"]
    t = p["pcb_thickness_assumed"]
    base = box(w + 6, h + 6, 2, (0, 0, 1))
    # A large open underside leaves solder joints and bottom components accessible.
    base = base.cut(box(max(w - 5, 3), max(h - 5, 3), 4, (0, 0, 1)))
    for x in (-w / 2 - c - 0.7, w / 2 + c + 0.7):
        base = base.union(box(1.4, max(h - 5, 4), 3, (x, 0, 3.5)))
    # End stop; the connector side (+Y) is open.
    base = base.union(box(w, 1.5, 3, (0, -h / 2 - c - 0.75, 3.5)))
    # Two independent tongues, with relief on either side and a small retaining lip.
    for sign in (-1, 1):
        x = sign * (w / 2 + c + 0.65)
        y = h / 2 - 1
        base = base.union(box(1.3, 3, 4.5 + t, (x, y, 2 + (4.5 + t) / 2)))
        base = base.union(box(2.1, 3, 0.65, (x - sign * 0.4, y, 5 + t + 0.325)))
    return base


def basket(w, h, depth):
    b = box(w + 4, h + 4, 2, (0, 0, 1))
    # Posts hold a sachet, while slots and a retaining bar permit easy exchange.
    for x in (-w / 2 - 1, w / 2 + 1):
        b = b.union(box(2, h + 4, depth, (x, 0, 2 + depth / 2)))
    for y in (-h / 2 - 1, h / 2 + 1):
        b = b.union(box(w, 2, 5, (0, y, 4.5)))
    for x in range(-int(w / 2) + 4, int(w / 2), 8):
        b = b.cut(box(3, h - 4, 4, (x, 0, 1)))
    return b


def build(p):
    W, H, D, t = (p[k] for k in ("body_width", "body_height", "body_depth", "wall"))
    if (W, H) != (180, 180):
        raise ValueError(
            "V0.1 component layout is fixed to 180 x 180; adjust layout before changing the envelope"
        )
    sx, sy = p["split_x"], p["split_y"]
    screws = [(x, y) for x in (-86, 86) for y in (-86, 20, 86)] + [(0, -86), (0, 86)]
    body = box(W, H, D, (0, 0, D / 2)).cut(
        box(W - 2 * t, H - 2 * t, D + 1, (0, 0, t + (D + 1) / 2))
    )
    # Broad front sealing lands, separate from thin rear walls.
    rim = box(W, H, 5, (0, 0, D - 2.5)).cut(box(156, 156, 7, (0, 0, D - 2.5)))
    body = body.union(rim)
    body = body.union(box(174, 3, D - t, (0, sy, (D + t) / 2)))
    body = body.union(box(3, sy + 87, D - t, (sx, (sy - 87) / 2, (D + t) / 2)))
    body = body.union(box(174, 7, 5, (0, sy, D - 2.5)))
    body = body.union(box(7, sy + 87, 5, (sx, (sy - 87) / 2, D - 2.5)))
    # Blind M3 insert towers. These are outside the gasket path.
    for x, y in screws:
        body = body.union(cylinder(3.25, 15, (x, y, D - 15)))
        body = body.cut(
            cylinder(
                p["insert_hole"] / 2,
                p["insert_length_assumed"] + 0.6,
                (x, y, D - p["insert_length_assumed"] - 0.6),
            )
        )
        body = body.cut(
            cq.Workplane(
                obj=cq.Solid.makeCone(
                    p["insert_hole"] / 2,
                    p["insert_hole"] / 2 + p["insert_entry_chamfer"],
                    p["insert_entry_chamfer"],
                    cq.Vector(x, y, D - p["insert_entry_chamfer"]),
                )
            )
        )
    gd = p["gasket_groove_depth"]
    body = body.cut(seal_network(p["gasket_groove_width"], gd + 0.1, D - gd, sx, sy))
    # Rear adapter attachment, blind bosses; no open hole through the rear wall.
    mounts = [(x, y) for x in (-65, 65) for y in (-5, 60)]
    for x, y in mounts:
        body = body.union(cylinder(5, 10, (x, y, 0)))
        body = body.cut(cylinder(1.8, p["insert_length_assumed"] + 0.6, (x, y, -0.01)))
    # Downward climate openings. The cassette/baffle remains a serviceable part.
    for x in (-65, -35, -5):
        for z in (15, 23, 31):
            body = body.cut(box(17, 12, 4, (x, -87, z)))
    # Two same-face downward PM apertures; port-specific adapter is deliberately not guessed.
    for x in (40, 66):
        body = body.cut(cylinder(9, 12, (x, -96, 18), (0, 1, 0)))
    # Individually sealed mic pod, facing down and offset in Z from the climate boards.
    body = body.cut(cylinder(13.75, 35, (-15, -96, 49), (0, 1, 0)))
    # Cable gland: side entry inclined 45 degrees downward, wholly in the dry chamber.
    n = (-math.sqrt(0.5), -math.sqrt(0.5), 0)
    body = body.union(cylinder(11, 9, (-86, 5, 40), n))
    body = body.cut(cylinder(p["gland_hole_assumed"] / 2, 28, (-78, 13, 40), n))
    # Antenna and optical cassette at the top. Bulkhead sealing hardware is purchased.
    body = body.cut(cylinder(3.3, 12, (-45, 84, 35), (0, 1, 0)))
    ang = math.radians(p["window_tilt_deg"])
    opt_n = (0, math.cos(ang), math.sin(ang))
    # Seating bore is coaxial with the tilted cassette; cut along its axis.
    start = (45, 90 - opt_n[1] * 14, 38 - opt_n[2] * 14)
    body = body.cut(cylinder(15.2, 30, start, opt_n))
    # Two protected inter-chamber cable glands; actual seals depend on wire bundle.
    for x in (-42, 47):
        body = body.cut(cylinder(4, 12, (x, sy - 6, 44), (0, 1, 0)))
    # Tray supports. Holder bases are at z=12; no loose glue needed for stand-off.
    for x, y in [
        (-70, 0),
        (70, 0),
        (-70, 72),
        (70, 72),
        (-75, -30),
        (1, -30),
        (-75, -75),
        (1, -75),
    ]:
        body = body.union(cylinder(3.5, 9, (x, y, 3)))
    lid = box(W, H, p["lid_thickness"], (0, 0, D + p["lid_thickness"] / 2))
    for x, y in screws:
        lid = lid.cut(cylinder(1.7, 8, (x, y, D - 1)))
        lid = lid.cut(cylinder(3.1, 1.8, (x, y, D + p["lid_thickness"] - 1.8)))
    gasket = seal_network(p["gasket_width"], p["gasket_height"], 0, sx, sy)
    # Components mount on removable plates; tabs constrain them after PCB fit checks.
    dry_tray = box(151, 94, 2, (0, 36, 13))
    wet_tray = box(86, 52, 2, (-37, -53, 13))
    # Strap/clip windows keep the carrier removable. Restraint clips are not qualified yet.
    for x in (-68, 68):
        for y in (1, 71):
            dry_tray = dry_tray.cut(box(3, 10, 4, (x, y, 13)))
    holders = [
        ("rak_carrier", 29, 40, (-49, 38, 14)),
        ("ina226_carrier", 21, 20.2, (-9, 49, 14)),
        ("sht41_carrier", 13, 10.5, (-65, -65, 14)),
        ("scd41_carrier", 18.1, 21.5, (-37, -61, 14)),
        ("bme688_carrier", 16.5, 18.5, (-9, -61, 14)),
        ("sgp41_carrier", 10.5, 13, (-65, -39, 14)),
    ]
    parts = {
        "body": body,
        "lid": lid,
        "gasket_tpu": gasket,
        "dry_tray": dry_tray,
        "climate_tray": wet_tray,
    }
    placement = {
        "body": (0, 0, 0),
        "lid": (0, 0, 0),
        "gasket_tpu": (0, 0, D - gd),
        "dry_tray": (0, 0, 0),
        "climate_tray": (0, 0, 0),
    }
    for name, w, h, pos in holders:
        parts[name] = pcb_holder(w, h, p)
        placement[name] = pos
    parts["perfboard_tray"] = basket(42, 22, 5)
    placement["perfboard_tray"] = (34, 14, 14)
    parts["desiccant_basket"] = basket(52, 27, 18)
    placement["desiccant_basket"] = (36, 53, 14)
    # Slot-guided retaining bar, printed separately. Fit to sachet after measurement.
    parts["desiccant_strap"] = box(58, 5, 1.6, (0, 0, 0.8))
    placement["desiccant_strap"] = (36, 53, 34)
    # Rigid SPS30 cradle uses the exact case envelope, with clearance on its thin axis.
    cradle = box(47, 47, 2, (0, 0, 1))
    for x in (-23, 23):
        cradle = cradle.union(box(2, 40, 7, (x, 0, 5.5)))
    cradle = cradle.union(box(44, 2, 7, (0, 23, 5.5)))
    parts["sps30_cradle"] = cradle
    placement["sps30_cradle"] = (51, -54, 7)
    # A detachable holder for each 20-mm mesh disk. Screen is retained by a second ring.
    screen = cylinder(12, 3, (0, 0, 0)).cut(cylinder(9, 5, (0, 0, -1)))
    screen = screen.cut(cylinder(10.15, 0.6, (0, 0, 2.4)))
    parts["mesh_seat"] = screen
    parts["mesh_retainer"] = cylinder(11, 1.4, (0, 0, 0)).cut(
        cylinder(9, 3, (0, 0, -1))
    )
    # Keep these loose service parts in the exploded view, not falsely fastened in assembly.
    placement["mesh_seat"] = (110, -45, 0)
    placement["mesh_retainer"] = (140, -45, 0)
    # Window cassette: local Z points to sky; assembled normal tilts 10 degrees toward front.
    window = (
        cylinder(15, 13, (0, 0, -6))
        .union(cylinder(17, 3, (0, 0, 4)))
        .cut(cylinder(8, 16, (0, 0, -7)))
    )
    window = window.cut(
        cylinder(
            p["quartz_diameter"] / 2 + 0.2, p["quartz_thickness"] + 0.3, (0, 0, 4.7)
        )
    )
    parts["optical_cassette"] = window
    placement["optical_cassette"] = (45, 90, 38)
    parts["window_gasket_tpu"] = cylinder(10.1, 0.8, (0, 0, 0)).cut(
        cylinder(8, 2, (0, 0, -0.5))
    )
    placement["window_gasket_tpu"] = (113, 10, 0)
    parts["ltr390_carrier"] = pcb_holder(19, 18.9, p)
    placement["ltr390_carrier"] = (110, 45, 0)
    # Sealed acoustic capsule needs a tuned membrane/PCB interface; port is only 2 mm.
    mic = cylinder(16, 3, (0, 0, 0)).union(cylinder(13.5, 23, (0, 0, 3)))
    mic = mic.cut(cylinder(11.7, 22, (0, 0, 4)))
    mic = mic.cut(cylinder(1, 6, (0, 0, -1)))
    parts["microphone_pod"] = mic
    placement["microphone_pod"] = (-15, -93, 49)
    # Generic ring is a clearance coupon; shape of real microphone board must be measured.
    parts["microphone_clip_coupon"] = cylinder(11.5, 2, (0, 0, 0)).cut(
        cylinder(8.5, 4, (0, 0, -1))
    )
    placement["microphone_clip_coupon"] = (140, 10, 0)
    # External flat mounting plate, wall holes and paired band slots.
    plate = box(150, 174, 5, (0, 0, -7.5))
    for x, y in mounts:
        plate = plate.cut(cylinder(1.7, 8, (x, y, -11)))
    for x in (-62, 62):
        for y in (-75, 75):
            plate = plate.cut(cylinder(2.7, 8, (x, y, -11)))
    for x in (-34, 34):
        for y in (-45, 45):
            plate = plate.cut(box(4, 16, 8, (x, y, -7.5)))
    parts["mount_wall"] = plate
    placement["mount_wall"] = (0, 0, 0)
    for diameter in (40, 50):
        saddle = box(62, 24, 16, (0, 0, -18))
        saddle = saddle.cut(
            cylinder(diameter / 2 + 0.3, 30, (0, -15, -20 - diameter / 2), (0, 1, 0))
        )
        parts[f"mast_saddle_{diameter}"] = saddle
        placement[f"mast_saddle_{diameter}"] = (0, 45 if diameter == 40 else -45, 0)
    # Rain/sun roof is an envelope part with an optical aperture, attachment still to detail.
    roof = box(204, 3, 86, (0, 98, 35)).rotate((0, 98, 0), (1, 98, 0), 5)
    roof = roof.cut(cylinder(20, 40, (45, 80, 38), opt_n))
    parts["weather_roof_envelope"] = roof
    placement["weather_roof_envelope"] = (0, 0, 0)
    return parts, placement


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    p = json.loads((HERE / "parameters.json").read_text())
    parts, places = build(p)
    overlap = parts["body"].intersect(parts["lid"]).val().Volume()
    if overlap > 1e-5:
        raise RuntimeError(f"Lid penetrates housing by {overlap} mm3")
    if p["insert_length_assumed"] + 0.6 >= 10:
        raise ValueError("Rear insert would break through its blind boss")
    args.out.mkdir(parents=True, exist_ok=True)
    assembly = cq.Assembly(name="KAMUE_v2_engineering_layout")
    results = []
    for name, part in parts.items():
        s = part.val()
        if not s.isValid() or len(s.Solids()) != 1 or s.Volume() <= 0:
            raise RuntimeError(f"Invalid or disconnected solid: {name}")
        part_dir = args.out / "parts"
        part_dir.mkdir(exist_ok=True)
        cq.exporters.export(part, str(part_dir / f"{name}.step"))
        cq.exporters.export(
            part, str(part_dir / f"{name}.stl"), tolerance=0.05, angularTolerance=0.1
        )
        # Several loose coupons intentionally sit beside the assembly. See README.
        placed = part.translate(places[name])
        if name == "optical_cassette":
            placed = part.rotate((0, 0, 0), (1, 0, 0), -80).translate(places[name])
        elif name == "microphone_pod":
            placed = part.rotate((0, 0, 0), (1, 0, 0), -90).translate(places[name])
        color = (
            cq.Color(0.8, 0.7, 0.25)
            if "tpu" in name
            else cq.Color(0.3, 0.65, 0.65)
            if "carrier" in name or "tray" in name
            else cq.Color(0.75, 0.77, 0.79)
        )
        assembly.add(placed, name=name, color=color)
        bb = s.BoundingBox()
        results.append(
            {
                "part": name,
                "valid": True,
                "solid_count": len(s.Solids()),
                "volume_mm3": s.Volume(),
                "bounds_mm": [bb.xlen, bb.ylen, bb.zlen],
            }
        )
    assembly.export(str(args.out / "layout.step"))
    (args.out / "placement.json").write_text(json.dumps(places, indent=2))
    (args.out / "validation.json").write_text(
        json.dumps(
            {
                "status": p["status"],
                "checks": "BRep validity / positive volume / one solid per part; no fit, acoustics, seal or flow qualification",
                "body_lid_overlap_mm3": overlap,
                "parts": results,
            },
            indent=2,
        )
    )
    print(f"Exported {len(parts)} valid single-solid parts to {args.out}")


if __name__ == "__main__":
    main()
