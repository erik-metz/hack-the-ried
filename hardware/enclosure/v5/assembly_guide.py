"""Interactive holder section, generated from the actual exported R5 CAD bodies."""

import argparse
from pathlib import Path

import cadquery as cq
import numpy as np
import trimesh


def section_path(shape):
    vertices, faces = shape.tessellate(0.04, 0.12)
    mesh = trimesh.Trimesh([v.toTuple() for v in vertices], faces, process=True)
    section = mesh.section(plane_origin=(61, -39, 0), plane_normal=(0, 1, 0))
    if section is None:
        raise ValueError("Missing section through SGP41")
    commands = []
    for points in section.discrete:
        xy = np.column_stack((250 + 9 * (points[:, 0] - 61), 350 - 9 * points[:, 2]))
        commands.append("M" + "L".join(f"{x:.2f},{y:.2f}" for x, y in xy) + "Z")
    return "".join(commands)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("export_dir", type=Path)
    args = ap.parse_args()
    p = args.export_dir
    paths = {}
    for name in ("body", "tray_SGP41", "ref_SGP41", "cap_SGP41"):
        shape = cq.importers.importStep(str(p / "parts" / (name + ".step"))).val()
        if name == "body":
            shape = shape.intersect(
                cq.Workplane().box(28, 2, 13).translate((61, -39, 6.5)).val()
            )
        paths[name] = section_path(shape)
    html = """<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>:root{font-family:var(--font-sans,system-ui);color:var(--foreground,#26313c)}body{margin:0}p{line-height:1.5}button{padding:7px 12px;margin:0 7px 4px 0;border-radius:7px;border:1px solid var(--border,#ccc);color:inherit;background:var(--secondary,#eee);cursor:pointer}svg{width:100%;height:auto;display:block;color:var(--foreground,#26313c)}.part{transition:transform .5s}.exploded .cap{transform:translateY(-120px)}.exploded .pcb{transform:translateY(-62px)}.partLabel{font-size:14px;fill:currentColor}.assembled .partLabel{display:none}.details{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.detail{padding:16px;background:var(--secondary,#eee);border-radius:var(--radius,10px);font-size:14px;line-height:1.5}.small{font-size:13px;color:var(--muted-foreground,#687580)}@media(max-width:520px){.details{grid-template-columns:1fr}}</style><body>
<p><b>So wird der PETG-Halter zusammengesetzt</b><br><span class="small">Echter Schnitt durch die erzeugten SGP41-STEP-Körper. Auflage und Sicherungsrahmen sind zwei separate PETG-Druckteile.</span></p>
<button id="explode">Auseinandergezogen</button><button id="assemble">Montiert</button>
<svg id="drawing" class="exploded" viewBox="0 100 720 270" role="img" aria-label="CAD-Schnitt: Gehäuse, Auflage, Platine und Sicherungsrahmen"><defs><clipPath id="partClip"><rect x="70" y="95" width="360" height="260"/></clipPath></defs>
<g clip-path="url(#partClip)"><path fill="#9ba9b3" fill-rule="evenodd" d="__BODY__"/><path fill="#448d9c" fill-rule="evenodd" d="__TRAY__"/>
<g fill="#df8d31"><circle cx="196" cy="301.4" r="2.4"/><circle cx="304" cy="301.4" r="2.4"/><circle cx="184.75" cy="282.5" r="2.4"/><circle cx="315.25" cy="282.5" r="2.4"/></g><g class="part pcb"><path fill="#459c62" fill-rule="evenodd" d="__PCB__"/></g><g class="part cap"><path fill="#756bc0" fill-rule="evenodd" d="__CAP__"/></g></g>
<g class="part cap partLabel"><path d="M335 262H410" stroke="currentColor" fill="none"/><text x="420" y="263">PETG-Sicherungsrahmen</text><text x="420" y="284" font-size="12">kurze Zapfen nach unten einsetzen</text></g>
<g class="part pcb partLabel"><path d="M300 276H410" stroke="currentColor" fill="none"/><text x="420" y="278">Platine einlegen</text><text x="420" y="299" font-size="12">Kanten geführt, Platine kleberfrei</text></g>
<g class="partLabel"><path d="M353 292H410" stroke="currentColor" fill="none"/><text x="420" y="294">PETG-Auflage</text><path d="M359 330H410" stroke="currentColor" fill="none"/><text x="420" y="333">Gehäuse mit breiter Auflagefläche</text></g>
</svg>
<div class="details"><div class="detail"><b>1 · Auflage befestigen</b><br>Kurze Gehäusezapfen positionieren. Kleine Klebepunkte verbinden die breiten PETG-Flächen.</div><div class="detail"><b>2 · Platine einsetzen</b><br>PCB liegt auf dem niedrigen Rand. Vorhandene Montagebohrungen erhalten Führungszapfen.</div><div class="detail"><b>3 · Rahmen sichern</b><br>Ø2,4-mm-Zapfen in Ø2,6-mm-Sitze drücken und an den PETG-Sitzen mit kleinen Klebepunkten sichern.</div></div>
<p class="small">Orange Punkte markieren Klebestellen schematisch. Der Rahmen erscheint im Schnitt zweimal; außerhalb der Schnittebene ist er ein zusammenhängendes Teil. Kein TPU am Platinenhalter, kein Materialwechsel während des Drucks. Rahmen separat mit großer Fläche auf dem Druckbett und Zapfen nach oben drucken. Die Zapfen sind starr; die Klebesicherung ist erforderlich. Für Demontage die kleinen Klebestellen lösen. Die im Schnitt nicht getroffenen Gehäuse- und PCB-Führungszapfen sind in der 3D-Ansicht sichtbar.</p>
<script>const d=document.getElementById('drawing');document.getElementById('assemble').onclick=()=>d.classList.replace('exploded','assembled');document.getElementById('explode').onclick=()=>d.classList.replace('assembled','exploded');</script></body></html>"""
    for key, name in [
        ("BODY", "body"),
        ("TRAY", "tray_SGP41"),
        ("PCB", "ref_SGP41"),
        ("CAP", "cap_SGP41"),
    ]:
        html = html.replace("__" + key + "__", paths[name])
    (p / "assembly-guide.html").write_text(html)
    print("Holder section:", len(html), "characters")


if __name__ == "__main__":
    main()
