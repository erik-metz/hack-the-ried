# KAMÜ Gehäuse, Überarbeitung R3

R3 ersetzt R2; keine alten und neuen Teile mischen. Der Hauptkörper ist neu
konstruiert. Komponentenreferenzen kommen aus dem Fusion-Export vom 07.11.2026.

## Aktuelle Änderungen

- Mikrofon und SHT41 sind im oberen, nicht belüfteten Elektronikraum. Der linke
  schräge Auslass gehört jetzt zum Mikrofon. Die Versorgung bekommt rechts eine
  eigene nach unten geneigte Kabelverschraubung, angenommenes Bohrmaß 12,2 mm.
- SPS30, SCD41, BME688 und SGP41 teilen sich den unteren Messraum. Ausschließlich
  zwei Öffnungen auf der Unterseite führen Außenluft zu/ab. Keine zusätzlichen
  Klimaschlitze. Die Siebmitten liegen bei X = −58 / +58 mm, Abstand 116 mm.
  Der SPS sitzt links; nur sein Auslass bekommt einen kurzen separaten Kanal.
  Der rechte Einlass öffnet in den gemeinsamen Messraum. Keine CFD-Zusage.
- Jedes Metallsieb Ø20 liegt in einer vertieften Aufnahme und wird am Rand von
  einem eigenen Ring mit zwei M3-Schrauben gehalten. Kein Kleben nötig.
  Darstellung als Randring: die feinen Maschen sind nicht modelliert. Maschenweite
  und offene Fläche sind am realen Sieb festzulegen.
- Die Deckelschraubohren haben von unten 45°-Stützen. Hintere Montageaufnahmen
  liegen innerhalb des Gehäuses, sodass die Rückfläche auf dem Druckbett liegt.
- Platinen und SPS30: starre integrierte Auflagen/Anschläge und 45°-Dachschienen,
  separate flach gedruckte U-Halterahmen und TPU-Sicherungsstifte. Keine dünnen,
  senkrecht mit dem Gehäuse gedruckten Federn mehr. Kein Schrauben durch PCBs.
- Mikrofon: separate starre Hülse und TPU-Randfassung für die runde Platine.
  Der rückwärtige Kabelweg ist offen zum Elektronikraum. Die Frontplatte klemmt
  den Einsatz über einen umlaufenden Abstandring. Membran und akustischer Ring
  liegen zwischen Mikrofon und kleinem nach außen gerichtetem Schallkanal.

## LTR: Datenherkunft und offene Chipposition

Die tatsächliche CAD-Platinenfläche misst **14 × 18,4 mm**, Dicke 2,5 mm.
Das alte Maß 18,9 enthielt einen Anschlussüberstand. Die Vorderseite des originalen
STEP-Körpers ist eine einzige ebene Fläche, Fläche 257,6 mm² = 14 × 18,4.
Der UV-Chip und das mittige Montageloch auf dem Foto sind darin nicht separat
modelliert. Die Außenkontur wird übernommen; die Lage des Chips ist kein exakt
aus dem CAD ablesbares Maß.

Die Platine wird um 90° in ihrer Ebene gedreht: Der Anschluss liegt seitlich,
der UV-Chip auf der gegenüberliegenden Seite zeigt zum Glas. Der vorläufige
Chipversatz von +7 mm längs der nativen Platine stammt aus dem Foto, nicht aus
einer Messung. Er ist als `ltr_chip_offset_y_provisional` parametriert.
**LTR-Träger vorerst als Passprobe behandeln.** Vor der Freigabe die Messfläche
bei abgenommenem Glas kontrollieren und den Parameter bei Bedarf korrigieren.
Diese parametrische Korrektur erfordert einen neuen Trägerdruck.

Das Glas bleibt 45° geneigt. Drei M3-Schrauben lösen, Haltering, Druckpolster,
Glas und untere Dichtung entnehmen. Der separate Glassitz gibt anschließend den
von vorne herausziehbaren LTR-Träger frei. Kein Verkleben des Glases. Schnee
kann trotzdem liegen bleiben; eine passive Konstruktion garantiert keine
Schnee- oder Eisfreiheit. Die Neigung verändert die UV-Winkelantwort.

## Montage und Druck

Koordinaten: X rechts, Y zur Antenne/oben, Z von Rückwand zum Deckel.
Hauptkörper 168 × 168 × 50 mm, Grundwände 2,4 mm, Deckel 3 mm.
Breite TPU-Flachdichtung: 6 mm umlaufend plus 6-mm-Trennsteg; freie Dicke 1,2,
modellierte Einbaudicke 1,0 mm. Deckel M3; Einschmelzmuttern: Ø3,6-Bohrungen,
0,3-mm-Einlauffase, angenommene Mutternlänge 5 mm. Reale Länge bestätigen.

STEP enthält die Einbaulage; die Einzel-STLs sind auf Z=0 gesetzt und separat
zum Drucken ausgerichtet. Halterahmen liegen flach, Mikrofon-/Optikeinsätze mit
Achse Z, Siebringe und Dichtungen flach. Gehäuse Rückseite auf Druckbett.
Slicer-Überhangprüfung bleibt erforderlich, insbesondere bei horizontalen
Bohrungen, Bus-/Silicageltaschen und den seitlichen Auslässen. Die Konstruktion
ist kein Nachweis vollständig stützfreien Druckens.

Platinen auf die Auflagen legen. U-Rahmen von der anschlussfreien Seite unter
die Dachschienen schieben und den TPU-Stift in Rahmen und Sackloch drücken.
Beim SPS30 liegt die Einschubseite gegenüber der Luftseite. Zum Entnehmen
Stift ziehen, Rahmen herausschieben. Anschlüsse und Bauteile nicht als Klemmfläche
verwenden. Kleine Passproben vor dem großen Gehäusedruck prüfen.

RAK/INA226, Busreserve 40 × 20 × 20 mm und Silicagelreserve 50 × 25 × 18 mm
liegen im oberen Raum. Das SHT41 misst dort das innere Klima; Silicagel und
Elektronikwärme beeinflussen seine Werte. Trennwanddurchführungen werden mit
TPU-Septa passend zu den realen Leitungen geschlossen.

Wandplatte und Mastplatten Ø40 / Ø50 sind Alternativen. Mastbänder,
Kabeldurchmesser, Membrantyp, Glas und Mutternlängen vor Bestellung/Enddruck
mit den realen Teilen abgleichen. Einbaugeometrie ist keine IP-Zertifizierung.

## Erzeugen und prüfen

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python build.py --references /pfad/references --out /pfad/r3
.venv/bin/python validate.py /pfad/r3
.venv/bin/python preview.py /pfad/r3
```

`validate.py` prüft STEP-Rückimport, geschlossene orientierte STL-Netze,
Bauteilüberschneidungen, starre 1-mm-Bewegungen der neun Sensorreferenzen,
Ausziehweg des optischen Trägers sowie die geschlossene untere Wand außerhalb
der zwei vorgesehenen Sieböffnungen und blinden Schraublöcher.
Die starre Rückhalteprüfung ersetzt keine Kräfte-, Rotation-, Kriech-,
Vibrations-, Akustik-, Optik- oder Wetterprüfung am realen Druck.
