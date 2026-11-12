"""R6: one bevelled main enclosure, internal modules, no cantilever PCB fingers.

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
    return s.rotate((0, 0, 0), (1, 0, 0), -45).translate((53, 71, 35))


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
    return cq.Workplane("XZ").polyline(points).close().extrude(length).translate((0,length/2,0)).val()


def clip_holder(w,h,t,holes=(),round_board=False):
    """Flat PETG print. In-plane springs: PCB catches and slide-lock catches.
    The case receiver captures the 45-degree base flanges; squeeze the two
    exposed outer tabs and slide +Y to release the complete cassette.
    """
    half=w/2+6
    base=extrude_xz([(-half,0),(half,0),(half-1.6,1.6),(-half+1.6,1.6)],h+12)
    ledge=box(w+.2,h+.2,.8,(0,0,2)).cut(box(w-1.6,h-1.6,2,(0,0,2)))
    carrier=fuse(base,ledge)
    carrier=carrier.cut(cyl(6.2,5,(0,0,-1)) if round_board else box(w-4,h-4,5,(0,0,0)))
    front=2.4+t
    for sign in (-1,1):
        # Clear the full spring travel down to the bed; no bonded spring feet.
        carrier=carrier.cut(box(2.3,h/2+6,front+3,(sign*(w/2+1.1),-h/4+1,(front+1)/2)))
        root=-h/2-5
        arm=box(1.2,-root+2,front+.1,(sign*(w/2+.75),(root+2)/2,(front+.1)/2))
        # 0.6-mm local hook ledge; lead-in is 45 degrees. Arm flexes in XY.
        pts=[(w/2-.45,front+.1),(w/2+1.35,front+.1),(w/2+1.35,front+.7),(w/2+.15,front+.7)]
        hook=extrude_xz([(sign*x,z) for x,z in pts],4)
        carrier=fuse(carrier,arm,hook)
        # Independent low side spring locks the cassette to its receiver.
        carrier=carrier.cut(box(3.8,h/2+7,3,(sign*(w/2+4.6),-h/4+.5,1)))
        tab=box(1.0,-root+1,.9,(sign*(w/2+4), (root+1)/2,.45))
        profile=[(w/2+3.5,-2),(w/2+4.5,-2),(w/2+6.1,-.8),(w/2+6.1,1),(w/2+3.5,1)]
        catch=cq.Workplane().polyline([(sign*x,y) for x,y in profile]).close().extrude(.7).val()
        carrier=fuse(carrier,tab,catch)
    # Fixed edge guides stop translation; the sprung hooks stop lifting.
    for yy in (-h/2-.5,h/2+.5):
        carrier=fuse(carrier,box(w-2,1,1.2,(0,yy,2.2)))
    for x,y,r in holes:
        carrier=fuse(carrier,cyl(r-.2,.8+t,(x,y,1.6)))
    receiver=rr(w+17,h+12,5.3,(0,0,-.35),2)
    cavity=cq.Solid.makeLoft([wire(w+12.5,h+16,.3,0),wire(w+6.5,h+16,.3,3)],True)
    receiver=receiver.cut(cavity).cut(box(w-4,h-4,3.1,(0,0,-1.5)))
    for sign in (-1,1):
        receiver=receiver.cut(box(5,3.4,4,(sign*(w/2+6),-.4,1.5)))
    receiver=fuse(receiver,box(w+12,1.4,2,(0,-h/2-6.4,1)))
    return carrier,receiver


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


def build(p,refdir):
    refs={f.stem:cq.importers.importStep(str(f)).val() for f in refdir.glob("*.step")}
    info=json.loads((refdir/"components.json").read_text())
    parts={};kinds={};prints={};fixtures={};mounts={};manifest={}
    def add(n,s,k="print",flat=None):
        parts[n]=s;kinds[n]=k
        if k in ("print","tpu","alternative"):prints[n]=normalize(s if flat is None else flat)
    def bevel(limit):
        return box(400,400,200,(0,0,100)).rotate((0,0,0),(1,0,0),-45).translate((0,56,limit-56))
    outer=rr(168,168,50,(0,0,25),4).cut(bevel(106))
    inner=rr(163.2,163.2,70,(0,0,37.4),1.6).cut(bevel(100))
    body=outer.cut(inner)
    rim=rr(168,140,3,(0,-14,48.5),4).cut(rr(156,128,5,(0,-14,48.5),1.6))
    body=fuse(body,rim,box(163.2,2.4,47.6,(0,-12,26.2)),box(163.2,6,3,(0,-12,48.5)))
    lid=rr(168,140,3,(0,-14,52.5),4).cut(bevel(106))
    screws=[(x,y) for x in (-77,77) for y in (-72,4,44)]
    for x,y in screws:
        sign=1 if x>0 else -1
        # Only the last 15.9 mm of depth; root follows a printable 45-degree ramp.
        bottom=wire(2.4,8.6,.6,35.1).translate((sign*82.8,y,0))
        top=wire(11.3,8.6,.6,44).translate((sign*78.35,y,0))
        brace=cq.Solid.makeLoft([bottom,top],True)
        body=fuse(body,brace,cyl(4.3,6,(x,y,44)),box(4,8.6,6,(sign*82,y,47)),cyl(2.5,1,(x,y,50)))
        body=body.cut(cyl(1.8,5.6,(x,y,44.4))).cut(cone(1.8,2.1,.3,49.7).translate((x,y,0)))
        lid=lid.cut(cyl(1.7,5,(x,y,50))).cut(cyl(3.7,.6,(x,y,53.4)))
        add(f"lid_screw_seal_{x}_{y}",ring(3.5,1.6,.6).translate((x,y,53.4)),"tpu",ring(3.5,1.6,.8))
    manifest["screw_centers"]=screws
    manifest["lid_boss_depth"]=[35.1,51]
    positions={"RAK_BASE":(-38.563149925492,48,180),"INA226":(2,33,0),"SHT41":(5,2,-90),"SCD41":(37,-39,0),"BME688":(4,-39,0),"SGP41":(67,-39,0),"SPS30":(-44,-49,0),"BUS":(50,6,0)}
    for name,(x,y,rz) in positions.items():
        if name=="SPS30":w=h=41.2;t=12.2;ref=refs[name]
        elif name=="BUS":
            w,h,t=40,20,1.6
            ref=box(w,h,t,(0,0,t/2))
            for yy in (-5,5):ref=fuse(ref,box(34,2.5,8,(0,yy,t+4)))
        else:
            m=info[name];w,h,t=[m[k] for k in ("pcb_width","pcb_height","pcb_thickness")];ref=refs[name]
        holes=board_holes(ref) if name not in ("SPS30","BUS") else []
        tray,receiver=clip_holder(w,h,t,holes)
        def pose(q,dz=0):return q.rotate((0,0,0),(0,0,1),rz).translate((x,y,dz))
        body=fuse(body,pose(receiver,5.4))
        add("tray_"+name,pose(tray,5.4),flat=tray)
        add("ref_"+name,pose(ref,7.8),"reference")
        fixtures[name]=pose(tray,5.4)
        mounts[name]={"tray":"tray_"+name,"rivets":[],"slide_axis":pose(box(1,1,1)).Center().toTuple(),"rz":rz,"release":"squeeze outer tabs inward, slide +local Y", "pcb_release":"spread two inner catches outward"}
    add("reserve_bus_wiring",box(40,20,20,(50,6,17.8)),"reserve")
    add("reserve_silica",box(50,18,24,(-40,-.5,20)),"reserve")
    # Two downward screened apertures, no SPS duct or separate air channels.
    for i,x in enumerate((-58,58)):
        body=body.cut(cyl(9.2,8,(x,-88,14.5),(0,1,0)))
        body=body.cut(cq.Solid.makeCone(9.2,10.05,.85,cq.Vector(x,-82.45,14.5),cq.Vector(0,1,0)))
        bezel=fuse(ring(12,8.5,1.2),ring(9.15,8.5,1.55,1.2),cone(9.15,10,.85,2.75).cut(cyl(8.5,1,(0,0,2.7))),ring(10,8.5,.8,3.6))
        bezel=bezel.cut(cyl(10.1,.3,(0,0,.5))).cut(cyl(9.6,.5,(0,0,0)))
        def gp(q):return q.rotate((0,0,0),(1,0,0),-90).translate((x,-85.2,14.5))
        add(f"mesh_bezel_{i}",gp(bezel),"tpu",bezel)
        add(f"ref_mesh_{i}",gp(ring(10,8.5,.3,.5)),"mesh")
    for x in (-40,35):
        body=body.cut(cyl(4,7,(x,-15.5,35),(0,1,0)))
        plug=fuse(cyl(4,2.4),cyl(5.5,.8,(0,0,-.8)),cyl(5.5,.8,(0,0,2.4)))
        add("wire_septum_"+str(x),plug.rotate((0,0,0),(1,0,0),-90).translate((x,-13.2,35)),"tpu",plug)
    # Window remains flush. Chip is a separate STEP reference, not a back-side dot.
    roof_t=6/math.sqrt(2);back=-roof_t-.8
    body=body.cut(op(cyl(11.2,12,(0,0,-10)))).cut(op(cyl(12.05,.2,(0,0,-.2))))
    body=fuse(body,op(fuse(ring(13.5,8.8,1.6,back-1.6),ring(13.5,12.1,2.6,back-1.6))))
    rubber=fuse(cyl(11.2,.4-back,(0,0,back)),cyl(12,.8,(0,0,back)),cyl(12,.2,(0,0,-.2)),cone(12,11.2,.4))
    rubber=rubber.cut(cyl(8.8,-2-back+.2,(0,0,back-.1))).cut(cyl(10.05,2,(0,0,-2))).cut(cyl(9.5,1))
    add("quartz_grommet",op(rubber),"tpu",rubber);add("ref_quartz_glass",op(cyl(10,2,(0,0,-2))),"glass")
    w,h,t=18.4,14,2.5;origin=-14.4;cx=-7
    tray,receiver=clip_holder(w,h,t)
    # Header has a rear-facing clearance channel on the left.
    channel=box(4,h+1,2.41,(-w/2+1,0,1.195))
    tray=tray.cut(channel);receiver=receiver.cut(box(6,h+1,8,(-w/2+1,0,-1)))
    def lp(q):return op(q.translate((cx,0,origin)))
    rb=lp(receiver).BoundingBox()
    support=rr(rb.xlen,rb.ylen,rb.zmax-2.4,((rb.xmin+rb.xmax)/2,(rb.ymin+rb.ymax)/2,(rb.zmax+2.4)/2),2)
    support=support.cut(op(box(150,150,100,(0,0,origin-3+50))))
    core=rr(rb.xlen-12,rb.ylen-10,60,((rb.xmin+rb.xmax)/2,(rb.ymin+rb.ymax)/2,32.4),2)
    body=fuse(body,support.cut(core),lp(receiver))
    add("tray_LTR390",lp(tray),flat=tray)
    ltr=refs["LTR390"].rotate((0,0,0),(0,0,1),-90).translate((0,0,2.4+t))
    add("ref_LTR390",lp(ltr),"reference")
    chip=box(1.2,1.2,.35,(7,0,2.4+t+.175))
    add("ref_LTR390_UV_FACE",lp(chip),"marker")
    fixtures["LTR390"]=lp(tray);mounts["LTR390"]={"tray":"tray_LTR390","rivets":[],"release":"two side tabs, slide local +Y","rz":0}
    manifest["UV"]={"board_front_normal":[0,1/math.sqrt(2),1/math.sqrt(2)],"window_normal":[0,1/math.sqrt(2),1/math.sqrt(2)],"chip_offset_assumed":7,"marker_is_photographic_reference":True,"chip_center":lp(chip).Center().toTuple(),"window_center":[53,71,35]}
    # Microphone cassette: no screws. Hollow wall support with 45-degree roots.
    body=body.cut(mp(cyl(1.5,5,(0,0,-3)))).cut(mp(cyl(10.1,.2,(0,0,-.2))))
    add("ref_gore_membrane",mp(cyl(10,.2,(0,0,-.2))),"membrane")
    tray,receiver=clip_holder(13,13,1.8,round_board=True)
    def mm(q):return mp(q.translate((0,0,-8.6)))
    cradle=box(30,25,9.2,(0,0,-7)).cut(box(26,21,12,(0,0,-7)))
    body=fuse(body,mp(cradle),mm(receiver))
    for yy in (-11.5,11.5):
        ramp=cq.Workplane("XZ").polyline([(-81.6,3.8),(-72.4,13),(-81.6,13)]).close().extrude(2).translate((0,24+yy+1,0)).val()
        body=fuse(body,ramp)
    add("tray_IN43434",mm(tray),flat=tray)
    add("ref_IN43434",mm(refs["IN43434"].translate((0,0,4.2))),"reference")
    add("microphone_acoustic_gasket",mp(ring(3.5,1.7,2,-4.4)),"tpu",ring(3.5,1.7,2))
    fixtures["IN43434"]=mm(tray);mounts["IN43434"]={"tray":"tray_IN43434","rivets":[],"release":"side tabs, slide local +Y","rz":0}
    gy,gz=24,24
    body=body.cut(cyl(6.1,5,(80,gy,gz),(1,0,0)))
    add("reserve_gland_nut",ring(9.5,6.1,6).rotate((0,0,0),(0,1,0),90).translate((75.6,gy,gz)),"reserve")
    add("reserve_gland_body",ring(9,6.1,18).rotate((0,0,0),(0,1,0),90).translate((84,gy,gz)),"reserve")
    add("ref_power_cable",cyl(2.5,35,(75,gy,gz),(1,0,0)),"cable")
    ant_origin=(-45,84.6,12)
    bulk=refs["ANTENNA_BULKHEAD"].cut(cyl(1.501,20.1,(0,-6.5,0),(0,-1,0)))
    add("ref_ANTENNA",refs["ANTENNA"].translate(ant_origin),"reference");add("ref_ANTENNA_BULKHEAD",bulk.translate(ant_origin),"reference")
    add("antenna_bulkhead_seal",ring(8.5,3.1,.6).rotate((0,0,0),(1,0,0),-90).translate((-45,84,12)),"tpu",ring(8.5,3.1,.8))
    body=body.cut(cyl(3.3,8,(-45,78,12),(0,1,0)))
    port=(-45,48-15.919059925498,9.4)
    # Coax axis is straight. Right-angle MHF4 plug is a stated clearance envelope.
    add("ref_ANTENNA_CABLE_STRAIGHT",cyl(.75,78.1-port[1]-2,(-45,port[1]+2,12),(0,1,0)),"cable")
    plug=fuse(cyl(1.3,1.5,port),box(2.6,4,1.1,(-45,port[1]+1,11.45)))
    add("ref_MHF4_RIGHT_ANGLE_ENVELOPE",plug,"marker")
    manifest["antenna"]={"port":port,"straight_axis_length_mm":78.1-port[1]-2,"available_mm":50,"connector_allowance_mm":5,"minimum_cable_bend_radius":"no bend in nominal route","connector_shape":"provisional 90-degree plug envelope; verify real connector"}
    # Mounting inserts only: local pads, all bores 3.6 mm; no internal tubes.
    rear_points=[(x,y) for x in (-60,60) for y in (-2,58)]
    for x,y in rear_points:
        body=fuse(body,cyl(5,6.4,(x,y,0))).cut(cyl(1.8,5.6,(x,y,-.01)))
    plate=rr(142,160,3,(0,0,-1.5),3)
    for x,y in rear_points:plate=plate.cut(cyl(1.7,5,(x,y,-4)))
    for x in (-60,60):
        for y in (-70,70):plate=plate.cut(cyl(2.7,5,(x,y,-4)))
    add("mount_wall",plate)
    for d in (40,50):
        saddle=box(60,22,20,(0,0,-13)).cut(cyl(d/2+.3,25,(0,-12.5,-13-d/2),(0,1,0)))
        add("mount_mast_"+str(d),fuse(plate,*[saddle.translate((0,y,0)) for y in (-46,46)]),"alternative")
    seal=flat_seal(p,1)
    free=flat_seal(p,1.2)
    for x,y in screws:
        seal=seal.cut(cyl(2.6,3,(x,y,-1)));free=free.cut(cyl(2.6,3,(x,y,-1)))
    add("body",body);add("lid",lid);add("flat_gasket_tpu",seal.translate((0,0,50)),"tpu",free)
    manifest["carrier_fastening"]="45-degree slide receiver with two XY spring catches; no glue or screws"
    return parts,kinds,prints,fixtures,mounts,manifest


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
