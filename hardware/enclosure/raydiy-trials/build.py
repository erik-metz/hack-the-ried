"""Build glue-free RayDIY trial carriers and check their nominal PCB fit."""

import argparse
import json
from pathlib import Path

import cadquery as cq
import numpy as np
import trimesh


def block(extents, center):
    mesh = trimesh.creation.box(extents)
    return mesh.apply_translation(center)


def rounded_rectangle_cutout(width, length, radius, height, center):
    """Make a rounded rectangular through-cut, centred on *center*."""
    if radius * 2 >= min(width, length):
        raise ValueError("Corner radius is too large for rounded rectangle")
    x, y, z = center
    pieces = [
        block((width - 2 * radius, length, height), (x, y, z)),
        block((width, length - 2 * radius, height), (x, y, z)),
    ]
    for dx in (-1, 1):
        for dy in (-1, 1):
            corner = trimesh.creation.cylinder(
                radius=radius, height=height, sections=32
            )
            corner.apply_translation(
                (
                    x + dx * (width / 2 - radius),
                    y + dy * (length / 2 - radius),
                    z,
                )
            )
            pieces.append(corner)
    return trimesh.boolean.union(pieces, engine="manifold")


def reference(path):
    shape = cq.importers.importStep(str(path)).val()
    solids = []
    approximated = 0
    for solid in shape.Solids():
        vertices, faces = solid.tessellate(0.025, 0.1)
        mesh = trimesh.Trimesh([v.toTuple() for v in vertices], faces)
        mesh.fix_normals()
        if not mesh.is_volume:
            bounds = solid.BoundingBox()
            mesh = block(
                (bounds.xlen, bounds.ylen, bounds.zlen),
                bounds.center.toTuple(),
            )
            approximated += 1
        solids.append(mesh)
    return (
        trimesh.boolean.union(solids, engine="manifold")
        if len(solids) > 1
        else solids[0]
    ), approximated


def dovetail(center_x, start_y, length, bottom_z, height, bottom_width, top_width):
    corners = [
        (center_x - bottom_width / 2, bottom_z),
        (center_x + bottom_width / 2, bottom_z),
        (center_x + top_width / 2, bottom_z + height),
        (center_x - top_width / 2, bottom_z + height),
    ]
    shape = cq.Workplane("XZ", origin=(0, start_y + length, 0)).polyline(corners)
    solid = shape.close().extrude(length).val()
    vertices, faces = solid.tessellate(0.02, 0.1)
    return trimesh.Trimesh([v.toTuple() for v in vertices], faces)


def rotate_pair(mesh):
    return mesh.copy().apply_transform(
        trimesh.transformations.rotation_matrix(np.pi, (0, 0, 1))
    )


def make_carrier(profile, spec):
    half = spec["opening"] / 2
    outer = (spec["length"] + spec["allowance"]) / 2 + 1.5
    vertices = profile.vertices
    # Native profile uses X across the board, Y up, Z along the board.
    clip = trimesh.Trimesh(
        np.column_stack(
            (vertices[:, 0] - 1.5 - half, outer - vertices[:, 2], vertices[:, 1] + 3)
        ),
        profile.faces,
    )
    anchor_x = (spec["anchorStart"] + spec["anchorEnd"]) / 2 - 1.5 - half
    plate_size = (spec["width"] + 9, 2 * outer + 2, 1.6)
    plate = block(plate_size, (0, 0, 0.8))
    # The RAK has a wide, otherwise unused centre area.  Opening it up saves
    # material and print time while retaining a 5 mm rim and solid end zones
    # around both dovetail fixtures.
    if spec["name"] == "RAK":
        plate = trimesh.boolean.difference(
            [plate, rounded_rectangle_cutout(28, 26, 6, 3, (0, 0, 0.8))],
            engine="manifold",
        )
    pedestal = block((5.6, 5.2, 1.4), (anchor_x, outer - 2.25, 2.25))
    parts = []
    feet = []
    for mirrored in (False, True):
        rail_clip = clip.copy()
        edge = outer
        length = 4
        if spec["name"] == "SHT41" and not mirrored:
            crop = block((100, 30, 30), (0, outer - 16.501, 10))
            rail_clip = trimesh.boolean.intersection(
                [rail_clip, crop], engine="manifold"
            )
            rail_clip.apply_translation((0, -4, 0))
            edge -= 5.501
            length = 2.499
        shoe = dovetail(anchor_x, edge - length, length, 1.8, 1.4, 3.6, 1.2)
        rail_clip = trimesh.boolean.union([rail_clip, shoe], engine="manifold")
        seat = pedestal.copy().apply_translation((0, edge - outer, 0))
        slot = dovetail(
            anchor_x, edge - length - 0.15, length + 1, 1.65, 1.6, 4.0, 1.45
        )
        seat = trimesh.boolean.difference([seat, slot], engine="manifold")
        parts.append(rotate_pair(rail_clip) if mirrored else rail_clip)
        feet.append(rotate_pair(seat) if mirrored else seat)
    base = trimesh.boolean.union([plate, *feet], engine="manifold")
    stop = None
    if spec["name"] == "SHT41":
        y = spec["length"] / 2 + 0.9
        peg = block((2.85, 1.25, 1.6), (0, y, 0.8))
        stop = trimesh.boolean.union(
            [peg, block((3, 1.4, 7.45), (0, y, 5.275))],
            engine="manifold",
        )
        socket = block((3.05, 1.45, 2), (0, y, 0.65))
        base = trimesh.boolean.difference([base, socket], engine="manifold")
    return base, parts, stop


def print_clip(mesh, mirrored):
    angle = np.pi / 2 if mirrored else -np.pi / 2
    printable = mesh.copy().apply_transform(
        trimesh.transformations.rotation_matrix(angle, (1, 0, 0))
    )
    printable.apply_translation((0, 0, -printable.bounds[0, 2]))
    return printable


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("generated", type=Path)
    parser.add_argument("references", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    boards = {
        "SHT41": reference(args.references / "SHT41.step"),
        "RAK": reference(args.references / "RAK_BASE.step"),
    }
    results = {}
    for path in sorted(args.generated.glob("*.json")):
        spec = json.loads(path.read_text())
        profile = trimesh.load_mesh(path.with_name(path.stem + "_clip.stl"))
        profile.fix_normals()
        base, clips, stop = make_carrier(profile, spec)
        printed = [base, print_clip(clips[0], False), print_clip(clips[1], True)]
        tags = ["base", "clip_A", "clip_B"]
        if stop is not None:
            tags.append("end_stop")
            # Print upright on the short locating peg.
            printed.append(stop)
        for tag, part in zip(tags, printed, strict=True):
            if not part.is_volume or len(part.split()) != 1:
                raise ValueError(f"Invalid printable part: {path.stem}_{tag}")
            part.export(args.output / f"{path.stem}_{tag}.stl")
        installed = [base, *clips] + ([stop] if stop is not None else [])
        carrier = trimesh.util.concatenate(installed)
        insertion_overlap = max(
            abs(
                trimesh.boolean.intersection(
                    [base, clip.copy().apply_translation((0, direction * travel, 0))],
                    engine="manifold",
                ).volume
            )
            for clip, direction in zip(clips, (1, -1), strict=True)
            for travel in np.arange(0, 6.01, 0.5)
        )
        lift_overlap = min(
            abs(
                trimesh.boolean.intersection(
                    [base, clip.copy().apply_translation((0, 0, 0.4))],
                    engine="manifold",
                ).volume
            )
            for clip in clips
        )
        if insertion_overlap > 0.01 or lift_overlap <= 0.01:
            raise ValueError(f"Invalid slide or vertical capture: {path.stem}")
        mesh, approximated = boards[spec["name"]]
        board = mesh.copy().apply_translation((0, 0, 8))
        common = trimesh.boolean.intersection(
            [trimesh.boolean.union(installed, engine="manifold"), board],
            engine="manifold",
        )
        outer = (spec["length"] + spec["allowance"]) / 2 + 1.5
        solid_base_volume = (spec["width"] + 9) * (2 * outer + 2) * 1.6
        results[path.stem] = {
            **spec,
            "mesh_closed": True,
            "slide_max_overlap_mm3": round(insertion_overlap, 5),
            "vertical_capture_mm3_at_0p4_mm": round(lift_overlap, 5),
            "reference_solids_using_bounds": approximated,
            "reference_interference_mm3": round(float(common.volume), 5),
            "board_underside_above_fixture_mm": 8,
            "base_plate_volume_mm3": round(float(base.volume), 2),
            "base_plate_solid_volume_mm3": round(solid_base_volume, 2),
            "base_plate_material_saving_percent": round(
                (1 - float(base.volume) / solid_base_volume) * 100, 1
            ),
        }
        carrier.export(args.output / f"{path.stem}_assembled.obj")
    (args.output / "checks.json").write_text(json.dumps(results, indent=2) + "\n")


if __name__ == "__main__":
    main()
