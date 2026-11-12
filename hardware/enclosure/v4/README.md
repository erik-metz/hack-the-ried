# KAMÜ Sensorgehäuse R4

R4 ersetzt R3. Die Dateien der Revisionen nicht mischen. Der Hauptkörper ist neu
konstruiert; aus dem ursprünglichen Fusion-Export werden die Sensor-/Platinenkörper
übernommen. Quelle: `case_sensor_current.step`, Fusion 3D-Prints v169, 07.11.2026.

## Hauptgehäuse und Außenflächen

- Grundkörper 168 × 168 × 50 mm, normale Wände/Rückwand 2,4 mm, gerundete Ecken R4.
- Die durchgehende obere Schräge liegt bei Y + Z = 106 mm, Neigung 45°.
  Ihre Dicke ist lokal 4,24 mm: Die Projektion bildet 6 mm Auflage an der
  Gehäusekante. Durch den schrägen Deckelabschluss verbleiben oben 5 mm Kontaktbreite. Die Schräge ist Bestandteil des Hauptgehäuses.
- LTR und Mikrofon liegen vollständig innerhalb des Grundkörpers. Außen sitzen
  nur Quarzfenster/Randdichtung beziehungsweise die bündige Gore-Membran.
  Die Glasdichtung ragt normal zur Schräge maximal 0,4 mm auf und läuft konisch aus.
- Der Deckel entsteht aus einem 168 × 140 × 3-mm-Profil mit angeschrägtem
  oberem Abschluss. Sechs M3-Schrauben sitzen auf runden
  Innenaufnahmen Ø9,2 mm mit R2-Fußverrundung. Es gibt keine äußeren Schraubohren.
  Die oberen Außenübergänge sind R1,2, die sichtbare Deckelkante R0,6 gerundet.
- Durchgehende TPU-Flachdichtung: 6-mm-Rand und 6-mm-Trennsteg. Frei 1,2 mm,
  modelliert montiert 1,0 mm. Die Schraubaufnahmen liegen innerhalb ihrer Öffnungen;
  die breite umlaufende Dichtspur wird nicht von den Schraubpunkten unterbrochen.
  Schräge, Dichtung und Deckel schließen entlang derselben geneigten Außenfläche
  ab; am oberen Deckelrand entsteht keine waagerechte vorstehende Ablagekante.
- Die Schraubköpfe erhalten eigene TPU-Dichtscheiben in den Deckel-Senkungen.
  Diese sind erforderlich, weil die Schrauben innerhalb der Hauptdichtkontur liegen.
  Gedruckte Dichtungen sind kein Nachweis einer IP-Schutzart.
- M3-Einschmelzmuttern: Ø3,6 mm, 0,3-mm-Einlauffase, angenommene Länge 5 mm.

X zeigt nach rechts, Y nach oben zur Antenne, Z von der Rückwand zum Deckel.
Das alte seitliche Mikrofongehäuse und der äußere optische Tubus werden nicht
weiterverwendet. Die normale Einbaulage bleibt Antenne nach oben.

## Platinenaufnahmen

Die bisherigen hohen, dünnen Haltefinger und Dachschienen entfallen vollständig.
Jeder Träger ist ein separates flach gedrucktes Teil: breite Bodenplatte,
zusammenhängende niedrige Seitenwand und 45°-Übergang zur Randfassung. Der Träger
sitzt auf einer nur 3 mm hohen breiten Auflage im Gehäuse. Zwei elastische
Blindniete sichern ihn in geschlossenen Aufnahmen; keine Bohrung führt ins Freie.
Die Niete haben einen umlaufenden elastischen Wulst hinter einem kleineren Hals.
Die Rückhaltung beruht dadurch auf Formschluss, nicht allein auf Reibung/Klebstoff.

Eine separat flach gedruckte TPU-Randfassung umfasst die Platinenkante hinten,
seitlich und vorne. Ihr umlaufender Außenwulst greift in die Trägernut. Die
Anschlussseite bleibt frei. Weder Stecker noch Bauteiloberseiten werden als
Klemmfläche verwendet. Am BME688 ist zusätzlich die schmale untere Bauteilzunge
freigestellt. Der LTR-Träger hat einen rückwärtigen, seitlich offenen Steckerweg.

Die Führungszapfen werden nur aus **geschlossenen kreisförmigen Innenkonturen der
realen PCB-Unterseite** abgeleitet. Außenradien und Bauteilbohrungen gelten nicht
als Montagebohrungen. Maße in mm:

| Komponente | PCB aus CAD | Nutzung der PCB-Bohrungen |
|---|---|---|
| INA226 | 20,2 × 21 × 1,5 | zwei kurze Ø2,6-Zapfen in Ø3-Bohrungen |
| SHT41 | 10,5 × 13 × 1,0 | ein kurzer Ø2,6-Zapfen in Ø3-Bohrung |
| SGP41 | 10,5 × 13 × 1,0 | ein kurzer Ø2,6-Zapfen in Ø3-Bohrung |
| BME688 | 16,5 × 18,5 × 1,6 | zwei kurze Ø1,6-Zapfen in Ø2-Bohrungen |
| RAK_BASE | 29 × 40 × 1,0 | Randfassung; die Ø1-Bohrungen werden nicht für dünne Zapfen verwendet |
| SCD41 | 13,7 × 21,5 × 1,5 | Randfassung; keine CAD-Montagebohrung vorhanden |
| LTR390 | 14 × 18,4 × 2,5 | Randfassung; keine CAD-Montagebohrung vorhanden |
| Mikrofon | Ø13 × 1,8 | runde Randfassung |

Die Zapfen positionieren die Platinen. Die TPU-Randfassung sichert sie gegen
Herausheben. Die Niete befestigen den **Träger**, sie gehen nicht durch die PCB.
Die vorhandenen Verbinder sind teilweise symbolisch; reale Kabelradien und
Anschlussbelegungen sind in den Passproben zu kontrollieren.

Normale Träger zuerst ohne PCB mit den beiden Nieten einsetzen. Dann die
Platine in ihre TPU-Randfassung legen und diese in den Träger drücken. Zum
Entnehmen zunächst Randfassung samt PCB lösen, dann sind die unter der PCB
liegenden Trägerniete zugänglich. Kein Verkleben der Platinen ist erforderlich.

## SPS30

Der SPS30 sitzt in einer separaten flachen U-Wiege mit breiter Bodenauflage,
durchgehenden Seitenwänden und Endanschlag. Zwei vollständig umlaufende TPU-Bänder
umgreifen Wiege und Sensor; ihre unteren Abschnitte liegen in Nuten unter der
Wiege. Die Bänder werden flach als geschlossene Rahmen gedruckt. Sie haben keine
frei stehenden starren Rastnasen. Die vordere linke Ecke der Wiege bleibt für
den Luftanschluss frei. Die Anschlüsse des SPS30 werden nicht geklemmt.

Die zwei Trägerniete werden vor dem Sensor eingesetzt. Sensor einlegen, Bänder
aufziehen und in den Nuten ausrichten. Zur Demontage Bänder lösen und Sensor
herausheben; danach sind die Trägerniete zugänglich.

SPS30, SCD41, BME688 und SGP41 teilen sich den unteren Messraum. Ausschließlich
zwei gesiebte Öffnungen Ø18 an der Unterseite führen Außenluft. Die Mitten liegen
116 mm auseinander. Jedes Ø20-Sieb wird mit einem abnehmbaren Zweischraubenring
gehalten. Kein Siebklebstoff. Maschenweite und freie Fläche sind am realen Sieb
zu prüfen. Eine kurze Führung verbindet nur den SPS-Auslass mit dem linken Sieb;
der Einlass öffnet in den gemeinsamen Messraum. Die Konstruktion ist kein CFD-
oder Messluftwechselnachweis. Es gibt keine weiteren Außenluftschlitze.

## LTR und Quarzglas

Die reale PCB-Kontur wird verwendet, um 90° in ihrer Ebene gedreht. Der
UV-Chip ist im ursprünglichen Fusion-Körper nicht separat modelliert. Sein
angenommener Versatz von +7 mm in der nativen PCB-Längsrichtung stammt aus dem
Foto und bleibt als `ltr_chip_offset_y_provisional` gekennzeichnet. Vor dem
Enddruck die Messfläche am realen Modul durch die Öffnung ausrichten und die
Passprobe prüfen. Die orange Markierung der Ansicht ist nur diese Annahme.

Der vollständige LTR-Träger wird unter der Schräge **seitlich** eingebaut.
Seine beiden Befestigungen sind außerhalb der PCB zugänglich. Nach Herausziehen
der elastischen Niete lässt sich das Modul 30 mm nach links verschieben. Der
Steckerweg im inneren Sitz ist links offen. Zum vollständigen Herausnehmen
Leitungen vorher freigeben. Der Träger muss nicht durch das Glasloch passen.

Das Ø20 × 2-Quarzglas sitzt in einer umlaufenden TPU-Fassung mit Vorder-/Rücklippe.
Diese sitzt formschlüssig im Fensterloch der Gehäuseschräge. Ein innerer Sitz
stützt sie ab. Für den Glaswechsel Deckel öffnen, LTR-Modul seitlich herausnehmen,
die elastische Randlippe lösen und Glas/Fassung von innen nach außen ausdrücken.
Nicht am Glas hebeln. Kein Glas-Klebstoff und kein äußerer großer Haltering.

Die 45°-Fläche hat eine Fallrichtung. Sie garantiert keine Schnee-/Eisfreiheit.
Die geneigte Anordnung verändert die Winkelantwort; eine normgerechte horizontale
UV-Index-Messung wird nicht behauptet. Die erforderliche Fensterkorrektur hängt
vom realen Glas und Sensor ab.

## Mikrofon und Versorgung

Das Mikrofon sitzt innen hinter der linken Seitenwand. Seine runde PCB wird
in einer separaten TPU-Randfassung gehalten. Der offene rückwärtige Steckerweg
führt direkt in den Elektronikraum. Zwei kurze, breit abgestützte Wandaufnahmen
halten den Träger; die Niete sind von innen zugänglich. Nach deren Lösen wird
das Modul von der Wand weggenommen. Es gibt keine geschlossene Hülse, die den
Träger beim Zusammenbau einschließt.

Außen klebt die angenommene Ø20-Membran in einem 0,2 mm tiefen ebenen Klebesitz.
Ein Ø2-Schallkanal und ein kurzer TPU-Akustikring verbinden die Innenseite mit
dem Mikrofon. Membran-Durchmesser, Kleberand und zulässige Einbaulage am realen
Gore-Produkt prüfen. Eine schützende Membran verändert den akustischen Übertragungsweg;
eine unveränderte Messcharakteristik wird nicht behauptet.

Versorgung: gerade Ø12,2-M12-Aufnahme rechts, Y=24 / Z=24 mm. Die innere Mutter
hat einen reservierten Ø19 × 6-mm-Bauraum, außen sind Ø28 mm Werkzeugraum und
ein 5-mm-Kabel vorgesehen. Diese Maße sind Reserven, keine Festlegung auf ein
gekauftes Fabrikat. Das gesamte Bohrungsumfeld bleibt geschlossen; kein offener
Ausschnitt zur Deckelkante und keine Überschneidung mit einer Deckelaufnahme.

SHT41, RAK, INA226, Busverteilung und Silicagel liegen im geschlossenen Raum.
Das SHT41 misst dort das innere Klima. Silicagel und Elektronikwärme beeinflussen
seine Werte. Die Busreserve bleibt 40 × 20 × 20 mm. Die Silicareserve beträgt
50 × 24 × 18 mm; weitere freie Kammerbereiche bleiben für Kabel und ein weiches
Kissen nutzbar. Die Trennwanddurchführungen werden mit TPU-Septa passend zu den
realen Leitungen geschlossen.

## Druck und Prüfungen

- Annahmen der geometrischen Schichtprüfung: 0,2-mm-Schichten, 45°-Aufbau, kleine
  beidseitig abgestützte Brücken. Dies ist keine G-Code-/Materialsimulation.
- Hauptgehäuse mit Rückwand auf dem Bett; Deckel separat flach. Nach Slicerprofil
  sind lokale Stützen/Brückeneinstellungen am kurzen SPS-Luftkanal zu prüfen.
  Ein vollständig stützfreier Gehäusedruck wird nicht behauptet.
- Alle `tray_`, `collar_`, `rivet_` und `sps_band_`-STLs sind tatsächlich in ihrer
  vorgesehenen flachen Drucklage auf Z=0 ausgegeben. Die STEP-Dateien enthalten
  dagegen die Einbaulage. Keine Halter in der Gehäuse-Drucklage mitdrucken.
- Die beiden Bandnuten der SPS-Wiege benötigen etwa 6 mm breite Brücken.
  Träger zuerst als Passprobe im vorgesehenen Endmaterial drucken.
- TPU-Niete und Randfassungen müssen sich elastisch einsetzen/lösen lassen.
  Passproben bestimmen das nötige Spiel für das konkrete Filament und Profil.
  Die Prüfungen liefern keine Haltekräfte, Dauerkriech- oder Bruchlastwerte.
- Vor dem großen Druck: Aufnahmeträger, Randfassung, Niete und reale PCB zusammen
  testen. Auch M3-Mutter, Dichtung, Glas, Membran und Kabelverschraubung prüfen.

`validate.py` kontrolliert STEP-/STL-Gültigkeit, Einbaulage, Überschneidungen,
54 starre PCB-Verschieberichtungen, Trägerbefestigungen, Nieten-Rückhaltung,
Fensterrückhaltung, Signalwege, die geschlossene untere Wand und das geschlossene
Umfeld der Kabelbohrung. Die Montagewege werden in 0,5-mm-Schritten geprüft;
das ist ausdrücklich kein kontinuierlicher Kollisionsnachweis. Die Halter-STLs
werden zusätzlich schichtweise in ihrer tatsächlichen Drucklage geprüft.

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python build.py --references /pfad/references --out /pfad/r4
.venv/bin/python validate.py /pfad/r4
.venv/bin/python preview.py /pfad/r4
```

Wandplatte und Mastplatten Ø40/50 sind Alternativen. Montagematerial, Antenne,
Wasser-/UV-Beständigkeit des Druckmaterials und Wetterdichtheit sind am realen
Aufbau zu prüfen. Für Gas-/Feuchtesensoren sind die Handhabungshinweise der
Hersteller zu beachten, insbesondere zu ausgasenden Materialien und Klebstoffen:
[Sensirion SGP-Handhabung](https://sensirion.com/media/documents/C16AA7D5/6440F28E/GAS_AN_SGPxx_HandlingAndAssemblyInstructions_D1.pdf).

Unter `coupons/` liegen zusätzlich kleine Nieten-Aufnahmen für 0° und 45° sowie
eine Gegenplatte. Zuerst eine Aufnahme, die Gegenplatte und einen `rivet_`-Stift
drucken. So lassen sich Einsteck-/Ausziehkraft und Druckspiel mit wenigen Gramm
Material prüfen. Anschließend Träger und TPU-Fassung mit der realen PCB testen.

Der Export vereinheitlicht die getrimmten Gehäuse-Verrundungen über STEP und nutzt
diesen eingelesenen Gehäusekörper auch für STL und Baugruppe. Die dabei auftretende
numerische Massenänderung wird auf 0,01 % begrenzt und in `design.json` protokolliert.
Der anschließende STEP-Rückimport wird mit 0,001 % relativer Volumentoleranz geprüft.
Die STL-Volumenprüfung berücksichtigt die freien TPU-Dicken und erlaubt 0,3 %
Tessellierungsabweichung. Die Soll-Drucklage aller Einzelteile wird separat geprüft.
