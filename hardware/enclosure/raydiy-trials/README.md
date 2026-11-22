# RayDIY-Passproben für SHT41 und RAK

Jede Probe besteht aus einer Grundplatte und zwei separat gedruckten
PETG-Clips. Beim SHT41 kommt ein kleiner Steckanschlag hinzu. Die Clips werden von außen in die Schwalbenschwanzführungen
geschoben. Die Führung hält den starren Clipfuß beim Anheben der Platine
fest. In Einschubrichtung bleibt sie für den Prüfaufbau lösbar.

| Platine | Maße aus der R7-Referenz | Anpassung |
| --- | --- | --- |
| SHT41 | 10,5 × 13 × 1 mm | Innenprofil gegenüber dem 15-mm-Generatorprofil verschmälert. Nasenbreite und äußere Wandstärken bleiben nominell erhalten. Der Clip an der Steckerseite sitzt weiter innen. Ein eigener Anschlag hält die Platine in Längsrichtung. |
| RAK | 29 × 40 × 1 mm | Generatorprofil in Originalbreite mit der jeweiligen Druckzugabe. Die Basis hat eine verrundete 28 × 26-mm-Aussparung im freien Mittelbereich. Es bleiben seitlich mindestens 5 mm sowie an den Clip-Enden mindestens 9,7 mm Material stehen. |

Die Endungen 25, 40 und 55 geben die Druckzugabe in Hundertstelmillimetern
an. Mit 40 beginnen. Für jede Probe jeweils die Grundplatte und die beiden
Clips A und B derselben Variante drucken. Beim SHT41 auch den zugehörigen
Anschlag (`end_stop`) drucken. Die STLs liegen bereits in ihrer
Drucklage. Die Grundplatte liegt flach auf dem Bett und die Clips liegen auf
der Seite. Die Clipfedern arbeiten damit in der Druckebene.

Die Schichtprüfung bei 0,2 mm fand in den Drucklagen keine ungestützten
Flächen oberhalb der Prüftoleranz. Einen automatisch erzeugten Brim nach dem
Druck von den Gleitflächen entfernen.

Die Aussparung betrifft nur die RAK-Basis: Sie spart gegenüber der zuvor
vollflächigen Platte Material und Druckzeit, ohne die beiden Schwalbenschwanz-
Aufnahmen zu schwächen. Die berechnete Ersparnis steht je Variante in
`checks.json` unter `base_plate_material_saving_percent`.

Clip A und B jeweils an der Außenseite der passenden Führung ansetzen
und bis zum Anschlag einschieben. Beim SHT41 danach den Steckanschlag in
die rechteckige Öffnung drücken. Anschließend die Platine einclipsen. Die OBJ-Datei
zeigt die Einbaulage und dient zur Ansicht der Montage. Zum Ausclipsen die
Grundplatte festhalten und die PCB-Rastnasen an den freien Armen bedienen.

Mit der echten Platine Einrasten, Lösen und Abziehen eines Steckers prüfen.
Dabei auf Lötstellen unter der Platine und Bauteile am Rand achten. Die STEP-
Referenzen bilden diese Details teilweise vereinfacht ab. Die Prüfung erfasst
die Einbaulage im unbelasteten Zustand. Beim RAK wurde ein Volumenkörper
konservativ durch seinen umschließenden Quader geprüft.

Die Proben sind für den Tisch gedacht. Die R7-Träger setzen die PCB-Unterseite
2,4 mm über die Trägerschnittstelle, und der RayDIY-Generator beginnt bei 5 mm
Abstand unter der PCB. Die gemeinsame Probengrundplatte und der freie Federweg
ergeben hier zusammen 8 mm. Für den Gehäuseeinbau muss die Aufnahmeschnittstelle
tiefer liegen oder der Federaufbau neu ausgelegt werden. Beim RAK muss dabei
die Lage seiner Antennenbuchse erhalten bleiben. Diese Proben vergleichen
zuerst, welche Druckzugabe und Federgeometrie praktisch funktionieren.

## Reproduzieren

Das öffentlich ausgelieferte RayDIY-Modul `clip.js` der Version 1.2.3 als
`clip.mjs` neben `vendor/earcut.js` ablegen. Für den Unterordner `vendor`
eine `package.json` mit `{"type":"module"}` anlegen. Beide Quelldateien liegen
unter `https://raydiy.de/wp-content/plugins/pcb-clip-generator/`.

```sh
node generate.mjs /pfad/clip.mjs /tmp/pcb-clip-profile
python -m pip install -r ../v7/requirements.txt manifold3d
python build.py /tmp/pcb-clip-profile /pfad/zu/normalisierten/STEP-referenzen /tmp/pcb-clip-proben
```

PCB-Clip-Geometrie von [René Aye (RAYDIY)](https://raydiy.de/pcb-clips/)
unter [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
Anpassungen für dieses Projekt sind die schmalere SHT41-Geometrie, die
Positionierung auf der Grundplatte, die Einschubfüße und die Druckzugaben.
