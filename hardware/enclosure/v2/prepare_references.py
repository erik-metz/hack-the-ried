"""Normalize the user's Fusion component references; never invent PCB dimensions.

Reference STEP files stay in the artifact bundle, not in the source repository.
"""

import argparse
import json
from pathlib import Path

import cadquery as cq


def main():
    a = argparse.ArgumentParser(description=__doc__)
    a.add_argument("fusion_step", type=Path)
    a.add_argument("inventory", type=Path)
    a.add_argument("--out", type=Path, required=True)
    args = a.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    objects = json.loads(args.inventory.read_text())["objects"]
    shapes = cq.importers.importStep(str(args.fusion_step)).solids().vals()

    def find(o):
        def score(s):
            b = s.BoundingBox()
            ds = [b.xlen, b.ylen, b.zlen]
            return (
                abs(s.Volume() - o["volume_mm3"])
                + sum(abs(x - y) for x, y in zip(ds, o["bounds"]["size_mm"])) * 100
            )

        found = min(shapes, key=score)
        bb = found.BoundingBox()
        ds = [bb.xlen, bb.ylen, bb.zlen]
        if max(abs(x - y) for x, y in zip(ds, o["bounds"]["size_mm"])) > 0.01 or abs(
            found.Volume() - o["volume_mm3"]
        ) > max(0.2, o["volume_mm3"] * 1e-4):
            raise ValueError("No matching reference body for " + o["name"])
        return found

    refs = {}
    for name in ("SHT41", "SGP41", "BME688", "SCD41", "IN43434", "LTR390", "INA226"):
        o = next(o for o in objects if o["name"] == name and o["visible"])
        shape = find(o)
        if name == "SCD41" or name in ("IN43434",):
            shape = shape.rotate((0, 0, 0), (0, 1, 0), -90)
        elif name == "LTR390":
            shape = shape.rotate((0, 0, 0), (0, 1, 0), 90)
        bb = shape.BoundingBox()
        if name in ("LTR390", "IN43434"):
            # Optical/acoustic face is front Z=0; connectors extend behind it.
            origin = ((bb.xmin + bb.xmax) / 2, (bb.ymin + bb.ymax) / 2, bb.zmax)
            shape = shape.translate(tuple(-v for v in origin))
            thickness = 2.5 if name == "LTR390" else 1.8
            b = shape.BoundingBox()
            w, h = b.xlen, b.ylen
            if name == "IN43434":
                w = h = 13.0
            # Align asymmetric/header board to its broad planar front face.
            planes = [
                f
                for f in shape.Faces()
                if f.geomType() == "PLANE" and f.normalAt().z > 0.999
            ]
            front = max(planes, key=lambda f: f.Area())
            fb = front.BoundingBox()
            if name == "LTR390":
                w, h = fb.xlen, fb.ylen
            ctr = cq.Vector((fb.xmin + fb.xmax) / 2, (fb.ymin + fb.ymax) / 2, fb.zmax)
            shape = shape.translate((-ctr.x, -ctr.y, -ctr.z))
        else:
            thickness = {
                "SHT41": 1.0,
                "SGP41": 1.0,
                "BME688": 1.6,
                "INA226": 1.5,
                "SCD41": 1.5,
            }[name]
            planes = [
                f
                for f in shape.Faces()
                if f.geomType() == "PLANE" and f.normalAt().z < -0.999
            ]
            bottom = max(planes, key=lambda f: f.Area())
            b = bottom.BoundingBox()
            w, h = b.xlen, b.ylen
            origin = ((b.xmin + b.xmax) / 2, (b.ymin + b.ymax) / 2, b.zmin)
            shape = shape.translate(tuple(-v for v in origin))
        # The highest planar face belongs to the symbolic pin connector, not the
        # sensing element. Put that keepout at +Y before constructing PCB clips.
        if name not in ("LTR390", "IN43434"):
            bb = shape.BoundingBox()
            top = [
                f
                for f in shape.Faces()
                if f.geomType() == "PLANE"
                and f.normalAt().z > 0.999
                and abs(f.Center().z - bb.zmax) < 0.02
            ]
            if top:
                header = max(top, key=lambda f: f.Area()).Center()
                if abs(header.x / w) > abs(header.y / h):
                    shape = shape.rotate(
                        (0, 0, 0), (0, 0, 1), 90 if header.x > 0 else -90
                    )
                    w, h = h, w
                elif header.y < 0:
                    shape = shape.rotate((0, 0, 0), (0, 0, 1), 180)
        cq.exporters.export(shape, str(args.out / f"{name}.step"))
        refs[name] = {
            "pcb_width": w,
            "pcb_height": h,
            "pcb_thickness": thickness,
            "source": "Fusion 3D-Prints v169 / case_sensor, 2026-11-07",
            "front_plane_z": 0 if name in ("LTR390", "IN43434") else thickness,
        }
    for name, component in [
        ("SPS30", "PS_CAD_SPS30_D1 v1"),
        ("RAK_BASE", "3D_RAK3112 v2"),
    ]:
        os = [o for o in objects if o["component"] == component and o["visible"]]
        if name == "SPS30":
            shape = find(os[0]).rotate((0, 0, 0), (0, 0, 1), 180)
            bb = shape.BoundingBox()
            origin = ((bb.xmin + bb.xmax) / 2, (bb.ymin + bb.ymax) / 2, bb.zmin)
            shape = shape.translate(tuple(-v for v in origin))
            refs[name] = {"width": bb.xlen, "height": bb.ylen, "depth": bb.zlen}
        else:
            base = find(next(o for o in os if o["name"] == "Body2"))
            bb = base.BoundingBox()
            origin = ((bb.xmin + bb.xmax) / 2, (bb.ymin + bb.ymax) / 2, bb.zmin)
            shape = cq.Compound.makeCompound(
                [find(o).translate(tuple(-v for v in origin)) for o in os]
            )
            refs[name] = {
                "pcb_width": bb.xlen,
                "pcb_height": bb.ylen,
                "pcb_thickness": bb.zlen,
            }
        cq.exporters.export(shape, str(args.out / f"{name}.step"))
    (args.out / "components.json").write_text(json.dumps(refs, indent=2))
    print(json.dumps(refs, indent=2))


if __name__ == "__main__":
    main()
