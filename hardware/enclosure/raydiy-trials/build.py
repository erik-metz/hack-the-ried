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
    mate = clip.copy().apply_transform(
        trimesh.transformations.rotation_matrix(np.pi, (0, 0, 1))
    )
    left = spec["anchorStart"] - 1.5 - half + 0.2
    right = spec["anchorEnd"] - 1.5 - half - 0.2
    anchor = block((right - left, 3.8, 3.2), ((left + right) / 2, outer - 2, 1.6))
    other = anchor.copy().apply_transform(
        trimesh.transformations.rotation_matrix(np.pi, (0, 0, 1))
    )
    extra = []
    if spec["name"] == "SHT41":
        # The modeled plug occupies the +Y edge. Bring this crossbar
        # inboard and remove the end ribs that would enter the PCB.
        crop = block((100, 30, 30), (0, outer - 16.501, 10))
        clip = trimesh.boolean.intersection([clip, crop], engine="manifold")
        clip.apply_translation((0, -4, 0))
        anchor.apply_translation((0, -4, 0))
        extra.append(block((3, 1.4, 9), (0, spec["length"] / 2 + 0.9, 4.5)))
    base = block((spec["width"] + 9, 2 * outer + 2, 1.6), (0, 0, 0.8))
    return trimesh.boolean.union(
        [clip, mate, anchor, other, base, *extra], engine="manifold"
    )


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
        carrier = make_carrier(profile, spec)
        if not carrier.is_volume or len(carrier.split()) != 1:
            raise ValueError(f"Invalid carrier: {path.stem}")
        mesh, approximated = boards[spec["name"]]
        board = mesh.copy().apply_translation((0, 0, 8))
        common = trimesh.boolean.intersection([carrier, board], engine="manifold")
        results[path.stem] = {
            **spec,
            "mesh_closed": True,
            "reference_solids_using_bounds": approximated,
            "reference_interference_mm3": round(float(common.volume), 5),
            "board_underside_above_fixture_mm": 8,
        }
        carrier.export(args.output / f"{path.stem}.stl")
    (args.output / "checks.json").write_text(json.dumps(results, indent=2) + "\n")


if __name__ == "__main__":
    main()
