# Sensorgehäuse R6 — lösbare Sensorclips

R6 ersetzt R5. Die Revisionen nicht mischen. Der neue Stand entfernt die
geklebten Sicherungsrahmen, den SPS-Luftkanal und die bodentiefen Deckelsäulen.
Die ursprünglichen Fusion-Kaufteilreferenzen bleiben maßhaltig erhalten.

## Sensoren wechseln

Jeder Sensor sitzt in einem separat flach gedruckten PETG-Träger. Zwei lange,
seitlich freigestellte Federarme greifen über seine Ränder. Die Arme biegen in
der XY-Ebene ihres Drucks, nicht quer zu hohen senkrechten Haltefingern. Die
Federwurzel besitzt eine gerundete Freistellung. Zum Wechseln beide Laschen
leicht nach außen spreizen und Sensor herausnehmen. Weder Platine noch
Sicherung werden geklebt. Anschlüsse vorher abziehen.

Die vorhandenen PCB-Bohrungen positionieren INA226, SHT41, SGP41 und BME688 auf
kurzen Zapfen. Die Zapfen stehen auf flach gedruckten Stegen. RAK/SCD41/LTR
werden über Kanten geführt. Beim SPS30 greifen die Laschen am realen Gehäuserand;
vier seitliche Vorsprünge aus seinem STEP sind ausgespart. Beide Lufteinlässe
und der Auslass bleiben frei. Kein Bügel wird mit dem SPS-Gehäuse verklebt.

**Die zwei orangefarbenen TPU-Steckclips haben eine andere Aufgabe:** Sie halten
nur den kompletten PETG-Träger am Gehäuse. Beim gewöhnlichen Sensorwechsel bleiben
sie eingesetzt. Sie sind separate kleine Druckteile mit elastischem Wulst in
blinden Aufnahmen. Keine TPU-Umrandung der Platinen, kein Mehrmaterialdruck,
keine Schraube an einem Sensor. Zum Trägerwechsel Steckclips ziehen.

Auch das Mikrofon wird mit zwei PETG-Laschen gehalten. Sein Träger hängt mit
zwei TPU-Steckclips an flachen Wandauflagen. Es gibt dort keine Schrauben oder
Einschmelzmuttern. Nach Ziehen der Steckclips lässt sich das Modul ins Innere
herausnehmen. Die Klebemembran bleibt außen bündig; sie ist ein Kaufteil, kein
TPU-Ersatz. Mikrofonkanal Ø3 mm, Dichtring innen Ø3,4/außen Ø7 mm, Länge 2 mm.

Der LTR-Träger hat seine Befestigung ober- und unterhalb der PCB. Links bleibt
der rückwärtige Steckerweg offen. Steckclips ziehen und komplettes Modul 30 mm
nach links herausnehmen. Das ist geometrisch in 0,5-mm-Schritten geprüft.

## LTR und Quarzglas

Das Fenster liegt in der durchgehenden 35,5°-Gehäuseschräge, jetzt bei X=53 mm.
`ref_LTR390_UV_FACE` ist ein eigenes, eindeutig benanntes Referenzteil auf der
**zum Glas gerichteten PCB-Fläche**. In der Ansicht ist es goldfarben und das
Glas transparent. Es gibt keine zusätzliche lose Punktmarkierung hinter der
Platine. Der Normalenvektor der markierten Chipfläche zeigt zum Glas; seitlicher
Achsfehler und Vorzeichen des Abstands werden geprüft.

Der Chipversatz von 7 mm bleibt eine Fotoannahme. Die originale STEP enthält
PCB und symbolischen Anschluss, keinen vollständigen UV-Chip. Das goldene Teil
ist deshalb eine Orientierungsreferenz, kein vermeintlich vermessenes Kaufteil.
Die tatsächliche Chipmitte ist bei der Passprobe durch das Fenster zu kontrollieren.

Glas Ø20 × 2 mm, TPU-Fassung separat. Zum Glaswechsel vordere flexible Lippe
zurücklegen; für den vollständigen Fassungswechsel LTR-Träger herausnehmen und
rückseitigen Flansch erreichen. Das Gefälle erleichtert Wasserablauf, garantiert
aber keine Freiheit von Schnee/Eis. Glas- und Gore-Maße sind bisherige Annahmen.

## Deckel und Einschmelzmuttern

- Keine Deckelsäule geht zum Gehäuseboden.
- Sechs kurze Wandaufnahmen liegen bei X=±77 und Y=-72/4/44 mm.
- Die eigentliche runde Aufnahme liegt zwischen Z=44 und 50 mm; darunter führt
  eine 45°-Verstärkung zur Seitenwand (Beginn Z=35,1). Der mittlere Gehäuseraum
  bleibt frei.
- Alle **Einschmelzmutter-Bohrungen** haben Ø3,6 mm. Die Deckelaufnahmen besitzen
  eine 0,3-mm-Einlauffase. Die Bohrung bleibt auch im Kompressionsanschlag offen.
- Die normale Gehäusewand ist 2,4 mm dick. Die vom Nutzer bestätigten
  Muttern sind 5 mm lang. Dafür braucht es lokale Materialverstärkung;
  die dünne Wand allein würde keine geschlossene Aufnahme bieten.
- Die vier rückwärtigen Montagepunkte besitzen nur lokale 6,4-mm-Pads mit blinden
  Ø3,6-mm-Bohrungen, keine langen Röhren. Keine Sieb- oder Mikrofonmuttern.
- Durchgangslöcher im Deckel sind Schraubenfreibohrungen, keine Mutternsitze.
  Die kleineren Steckclip-Sitze gehören zu den TPU-Clips, nicht zu M3-Muttern.

Die TPU-Flachdichtung bleibt 1,2 mm frei / 1,0 mm montiert. Die Dichtspur läuft
um beide Kammern. Kleine Ausschnitte um die Kompressionsanschläge und separate
Schraubkopfdichtungen sind modelliert. Eine gedruckte Dichtung ist kein Nachweis
für eine IP-Schutzart.

## N-Anschluss und Antennenkabel

Die tatsächlich verbaute Antennenkabellänge ist vom Nutzer mit **5 cm (50 mm)**
bestätigt. Diese Länge gilt für den Entwurf. Die 10-cm-Auswahl im Bestellbild
ist dafür nicht maßgeblich; eine zusätzliche Kabelablage ist nicht vorgesehen.

Der N-Durchgang des ursprünglichen Gehäuse-STEP hat Ø16 mm. R6 verwendet einen
Ø16,2-mm-Durchgang mit 13,7-mm-Abflachungen gegen Verdrehen. Die frühere
6,6-mm-Bohrung war dafür falsch. Der Anschluss sitzt mit seinem großen Flansch
innen; außen sind Dichtung und eine gekennzeichnete N-Mutter-Platzhülle vorgesehen.
Die tatsächliche Mutter und Kabeldurchführung mit `coupons/N_panel_trial.stl`
vor dem Hauptgehäuse prüfen. Die kleine Probe besitzt dieselbe Druckrichtung
wie die obere Gehäusewand.

Um dem N-Flansch innen Platz zu geben, lautet die obere Schräge jetzt
Y + 1,4 Z = 126 (35,5°). Die Gehäusetiefe bleibt 50 mm; keine Außenhaube.
Das Quarzglas und die LTR-Normale sind an diese Schräge angepasst.

RAK liegt bei X≈-50,94/Y=16 mm. Die reale LoRa-Buchse aus dem STEP liegt bei
X=-44,5/Y≈31,92/Z=10,4 mm. Die niedrige MHF4-Winkelsteckerhülle zeigt in die
freie Ecke des Moduls und weiter nach +Y zur Antenne. Das Kabel wird nicht über
die Metallabschirmung gezogen. Die geringe Höhendifferenz wird durch einen
sanften Übergang mit achsparallelen Endtangenten ausgeglichen. Der Ø3-mm-Korridor
ist die Freiraumprüfung; die dünnere Leitung ist nur eine sichtbare Referenz.

Der modellierte Kabelweg beträgt rund 37,3 mm. Mit 5 mm Steckerzugabe bleiben
rund 7,7 mm Reserve innerhalb der bestätigten 50 mm. Kabeldurchmesser und
Steckerhöhe sind weiterhin nicht maßhaltig bestimmt. Vor Enddruck die
Anschlussfreiheit am realen Pigtail prüfen; nicht unter Zug einbauen.
Der MHF4-Winkelstecker und die N-Mutter sind ausdrücklich Platzhüllen.

Die Original-Antennenreferenzen besitzen eine nominale Gewindeüberdeckung bereits
im Liefermodell. Diese Paarung wird gesondert protokolliert. Gehäusekollisionen
werden nicht als Gewindekontakt ausgenommen.

## Frischluft und Siebe

SPS30, SCD41, BME688 und SGP41 teilen einen offenen unteren Raum. **Kein Kanal
führt zwischen Sieb und SPS30.** Die zwei nach unten gerichteten Sieböffnungen
sind die einzigen Außenöffnungen dieses Bereichs. Keine zusätzlichen Schlitze.
Eine gleichmäßige Durchmischung/Ansprechzeit ist noch am realen Aufbau zu prüfen.

Die Ø20-Siebe werden ohne innere Schraubtürme gehalten. Je eine separat gedruckte
TPU-Fassung rastet mit einem inneren Flansch im Gehäuseloch ein und hält den
Siebumfang in einer Nut. Zum Reinigen oder Wechseln Fassung elastisch lösen.
Ihre Nut schließt mit einer 45°-Innenfläche; keine breite waagerechte Druckbrücke.
Die äußere Fassung steht unten 2,8 mm vor, die freie innere Luftöffnung ist Ø17 mm.

SHT41, Mikrofon, LTR, RAK, INA226 und Bus liegen im nicht belüfteten Bereich.
Die beiden Kabelsepten der Trennwand bleiben getrennte TPU-Dichtteile.

## Lochrasterplatine und Silikatkissen

`ref_BUS` zeigt eine schematische **40 × 20-mm-Lochrasterplatine** mit zwei
Steckleisten. Ein eigener Clipträger hält die PCB an den Kanten. Kein sinnloser
massiver Kasten. Oberhalb sind insgesamt 20 mm Anschluss-/Kabelraum reserviert.
Die angenommene PCB-Dicke ist 1,6 mm; an der echten Platine prüfen.

Für das lose Silikatkissen sind 50 × 18 × 24 mm oberhalb der RAK-Platine freigehalten, ohne Käfig.
Planungsvolumen `reserve_*.step` sind keine Bauteile und fehlen in `assembly.step`.
Die Ansicht blendet sie standardmäßig aus. Die echte Bus-Referenz bleibt sichtbar.

## Drucken und prüfen

Die STLs sind bereits auf Z=0 ausgerichtet:

- `tray_*.stl`: PETG, Grundfläche auf dem Druckbett; keine Träger in Einbaulage
  schräg oder senkrecht zusammen mit dem Gehäuse drucken.
- `carrier_clip_*.stl`: separate kleine TPU-Steckclips. Keine geklebten
  PETG-Sicherungsrahmen mehr.
- `mesh_bezel_*.stl`: separate TPU-Siebfassungen.
- `flat_gasket_tpu.stl`, Glasfassung, Mikrofonring, Antennenflanschdichtung,
  Kabelsepten und Schraubkopfringe: separate TPU-Dichtteile.

**Zuerst Passproben:** `coupons/tray_SHT41.stl` oder den gewünschten realen
Sensorträger mit der PCB testen. Die Federarme nur so weit spreizen, wie zum
Freigeben nötig. `mount_socket.stl`, `mount_plate.stl` und `mount_clip.stl` prüfen
zusätzlich Steck-/Lösekraft der Trägerbefestigung. Vor dem großen Hauptkörper
SPS30- und Mikrofon-Passprobe durchführen.

Die Schichtprüfung betrachtet 0,2-mm-Schichten. Kleine 0,6-mm-Hakenkanten und
lokale Freistellungen sind bewusst höchstens zwei Extrusionsbreiten breit;
sie werden separat als Mikroüberhänge protokolliert. Dies ist keine Aussage über
reale Ermüdungsfestigkeit. Die Federkräfte, Drucktoleranzen und das TPU-Material
müssen mit den Passproben geprüft werden. Hauptgehäuse lokal im Slicer auf
Stützbedarf prüfen. Keine reale Kraft-, Akustik- oder Wetterprüfung behauptet.

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python build.py --references /pfad/references --out generated
.venv/bin/python validate.py generated
.venv/bin/python preview.py generated
```

`validation.json` dokumentiert geschlossene Drucknetze, STEP-Rückimport,
Kollisionen, PCB- und Träger-Rückhaltung, Ausbauwege, kurze Deckelaufnahmen,
3,6-mm-Bohrungen, offene Schraubenwege, UV-Richtung, Antennen-Längenreserve,
Sieb-/Fassungsrückhaltung und ausschließlich zwei Luftöffnungen.
