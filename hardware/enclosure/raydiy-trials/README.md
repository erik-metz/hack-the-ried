# RayDIY-Passproben für SHT41 und RAK

Die beiden gegenüberliegenden Clips sind über ihre festen Füße
mit einer gemeinsamen PETG-Grundplatte verbunden. Unter den Federarmen
bleibt ein Spalt. Das Paar kommt als ein Teil aus dem Drucker und braucht
keinen Klebstoff. Die Platine liegt auf den Auflagen und rastet an den
Kanten ein.

| Platine | Maße aus der R7-Referenz | Anpassung |
| --- | --- | --- |
| SHT41 | 10,5 × 13 × 1 mm | Innenprofil gegenüber dem 15-mm-Generatorprofil verschmälert. Nasenbreite und äußere Wandstärken bleiben nominell erhalten. Der Clip an der Steckerseite sitzt weiter innen. Ein eigener Anschlag hält die Platine in Längsrichtung. |
| RAK | 29 × 40 × 1 mm | Generatorprofil in Originalbreite mit der jeweiligen Druckzugabe. |

Die drei Endungen 25, 40 und 55 geben die Zugabe in Hundertstelmillimetern an.
Mit 40 beginnen. Zu stramm sitzende Platinen mit 55, zu lockere mit 25 prüfen.
Die Clipbreite beträgt 4 mm. Die Proben mit der Grundplatte auf dem Bett
in PETG drucken. Im Slicer prüfen, wo die Nasen und freien Federarme Stützen
brauchen. Stützen im Spalt vollständig entfernen, bevor die Arme gebogen
werden. Das separat erzeugte Clipprofil liegt auf der Seite und dient zum
Vergleich der Druckrichtung.

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
Positionierung auf der gemeinsamen Grundplatte und die Druckzugaben.
