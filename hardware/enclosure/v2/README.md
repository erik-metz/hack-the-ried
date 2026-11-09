# KAMÜ Gehäuse V2, Überarbeitung R2

R2 ersetzt den ersten V0.1-Entwurf. Die bisherigen Druckdateien nicht mit R2
mischen. Das Gehäuse wird neu erzeugt; aus Fusion werden ausschließlich die
benannten Komponentenreferenzen verwendet, weder das alte Gehäuse noch dessen
Dichtung. Stand: 09.11.2026.

## Was gegenüber V0.1 behoben wurde

- Ein gemeinsamer Außenluft-Messraum für SPS30, SHT41, SCD41, SGP41 und BME688.
  Der SPS30 bekommt keine große eigene Kammer. Eine kurze lokale Anschlussführung
  direkt vor seiner Luftseite trennt nur Ansaug- und Ausblasweg.
- Keine losen Halter auf unbefestigten Trägerplatten. Die Halter der normalen
  Platinen und des SPS30 sind in den Gehäusekörper integriert.
- Rückhaltende obere Nasen, hintere Auflagen, Seiten- und Endanschläge. Die
  Anschlüsse dienen nicht als Klemmflächen. Beim BME688 berücksichtigt der
  Endanschlag die schmale Platinenzunge; seine Seitenclips sitzen am breiten Teil.
- Die Platinenmaße stammen von den ebenen PCB-Flächen des vorhandenen CAD-Modells,
  nicht von dessen Hüllmaßen einschließlich Stecker. Beispielsweise liegt die
  SCD41-Platine im Modell nach Ausrichtung bei 13,7 × 21,5, die LTR-Platine bei
  14 × 18,9. Diese Maße sind CAD-Referenzen, keine nachgemessenen Realteile.
- Eingesetztes Mikrofon mit vier Klemmnasen, hinteren Auflagen, abnehmbarer
  Frontplatte, Membran und akustischer Dichtung; keine bloße leere Hülse.
- Eingesetzter LTR direkt hinter dem Glas auf einem geführten, von vorn
  entnehmbaren Käfig. Glas, Sitz, Dichtungen und Haltering sind separate Teile.
- Breite einteilige **TPU-Flachdichtung**, keine schmale Schnur in einer Nut:
  6 mm breite Außenauflage und 6 mm breiter Steg zwischen den beiden Räumen.
- Normale Wände und Rückwand **2,4 mm**. Nur Dichtauflagen, Halter und Mutternsitze
  sind lokal verstärkt. Die Dichtauflage ist keine 6 mm dicke durchgehende Wand.

## Räume, Einbaulage und Befestigung

X zeigt nach rechts, Y nach oben zur Antenne, Z von der Rückseite zum Deckel.
Der Hauptkörper misst 168 × 168 × 50. Außenliegende Schraubohren, Montageplatte,
Glaseinsatz, Kabelverschraubung, Antenne und Regendach kommen hinzu. Die Außenohren
sind bewusst außerhalb der Dichtkontur angeordnet. Außenmaß und Teilegewichte
sind aus dem konkreten Export zu prüfen; dies ist keine optimierte Minimalgröße.

Der obere Raum enthält RAK3112/RAK3212, INA226, die 40 × 20 × 20-Busverteilung,
Silicagelkissen und Versorgung. Bus und Kissen sitzen in integrierten Taschen mit
abnehmbaren Rastbrücken. Das Kissen wird nicht in den Messluftbereich gelegt.

Der untere Messraum ist hinter dem kurzen SPS30-Luftanschluss gemeinsam offen.
SCD41 und Klimasensoren liegen außerhalb des unmittelbaren Lüfterstrahls. Die
Ports des SPS30 zeigen nach unten; beide äußeren Sieböffnungen liegen auf derselben
Unterseite. Das ist ein Konstruktionsansatz gegen Rückströmung und ungleiche
Windbeaufschlagung, kein Strömungsnachweis. Messluft darf nicht durch Silicagel
oder durch die große Elektronikkammer geführt werden.

Wandplatte und die separaten Mastvarianten Ø40/50 werden als Alternativen
exportiert. In der Standardbaugruppe ist nur die Wandplatte eingebaut. Zwei
Auflageprofile sind jeweils fest mit der Mastplatte verbunden; zwei Bandpaare
sind vorgesehen. Bandbreite, reale Wandbefestigung und Windlast der Antenne sind
noch mit der tatsächlichen Hardware zu prüfen.

## Mechanische Halter und Montage

Die normalen Platinen werden bei geöffnetem Deckel von vorne auf die hinteren
Auflagen gedrückt. Die seitlichen Nasen müssen dabei ausweichen können und danach
über den Platinenrand zurückfedern. Stecker und Kabel vorher auf Freigang prüfen.
Die längeren freien Federarme sind absichtlich nicht nur kurze starre Vorsprünge.
Keine Klebestelle wird als Ersatz für eine fehlende Rückhaltung vorausgesetzt.

Der SPS30 sitzt auf vier rückseitigen Auflagen. Vier seitliche Federarme greifen
oben über seine Kontur. Ein hinterer Endanschlag und die vordere lokale Luftführung
begrenzen die Bewegung in Y. Die Luftführung wird mit einer eigenen TPU-Flachdichtung
an die Sensorseite gekoppelt. Sie ist kein zweites großes Sensorgehäuse.
Zum Entnehmen die Nasen kontrolliert lösen und das Kabel freigeben; nicht am Kabel
ziehen. Der vorhandene Hersteller-CAD-Körper ist eingebaut und wird für die
Kollisionsprüfung verwendet.

**CAD-Rückhalteprüfung:** `validate.py` versucht pro Sensor starre Verschiebungen
von jeweils 1 mm in ±X, ±Y und ±Z. In jeder Richtung muss der Körper seinen
zugehörigen Anschlag schneiden. Die zugehörige Prüfgeometrie wird aus dem
wirklich vorhandenen Gehäusematerial ausgeschnitten; weggefräste Nasen dürfen
nicht nur als separate Prüfphantome weiter existieren. Die Ergebnisse stehen
in `validation.json`. Unter `coupons/` werden zusammenhängende ausgeschnittene
Haltermuster für Passproben ausgegeben. Sie behalten die Druckorientierung
des Gehäuses; vor dem Slicen Bedarf an Stützen prüfen.

Dieser Test ist kein Federkraft-, Rotations-, Fall-, Kriech- oder Vibrationsnachweis.
Federarme müssen sich zum Einsetzen elastisch öffnen lassen. Erst Passproben mit
realen Platinen, dem vorgesehenen Material, Druckorientierung und Drucker zeigen,
ob die Rückhaltung ausreichend und die Platine unbeschädigt ist. Die symbolischen
Steckverbinder im vorhandenen CAD ersetzen kein vollständig vermessenes Kabelmodell.

## Glas und LTR: vollständiger Wechselweg

Glas und LTR stehen gemeinsam **45° zur Horizontalen**. Das sorgt für eine deutlich
abfallende Glasfläche und einen kurzen optischen Weg. Es verändert zugleich die
Messrichtung. Diese Variante ist eine gerichtete Licht-/UV-Messung; sie darf nicht
ohne Prüfung als normgerecht horizontale UV-Index-Messung interpretiert werden.
Ein einzelner Fensterkorrekturfaktor behebt keine geänderte Winkelantwort.

Schichten von innen nach außen:

1. Fester, in das Gehäuse integrierter optischer Schacht.
2. Geführter Käfig mit seitlich geklemmter LTR-Platine; keine PCB-Schrauben.
3. Herausnehmbarer Glassitz. Er hält den Käfig zusammen mit dem hinteren Anschlag
   axial fest. Die alte nicht ausführbare Entnahme von hinten wurde verworfen.
4. Untere TPU-Dichtung, Quarzglas Ø20 × 2 aus der bisherigen Referenz,
   oberes TPU-Druckpolster.
5. Haltering mit drei M3-Schrauben. Dessen Schraubpunkte liegen außerhalb der
   optischen Dichtfläche; Anschläge begrenzen den Kompressionsweg.

**Nur Glas wechseln:** Drei M3-Schrauben lösen, Haltering und oberes Polster
abheben, Glas und untere Dichtung entnehmen. Der LTR bleibt geklemmt im Träger.
Nach Reinigung/Begutachtung die Lagen wieder einsetzen. Kein Klebstoff muss
abgeschnitten werden.

**LTR warten:** Zusätzlich den Glassitz herausheben und den vollständigen Käfig
nach vorne durch den geöffneten Schacht ziehen. Zum vollständigen Herausnehmen
vorher die Leitungen freigeben/abstecken. Die freie Öffnung ist größer als die
Diagonale des Referenz-PCBs. Hinter dem Stecker ist ein gerader Durchlass in
den Elektronikraum vorgesehen; die Leitungen müssen nicht in einem zu kurzen
Abstand zum Anschluss seitlich abgeknickt werden. Der Bewegungsweg wird zusätzlich geometrisch geprüft: Ein den gesamten
Träger samt Platine umfassender Hüllzylinder muss während des vollständigen
30-mm-Ausziehwegs gegenüber den verbleibenden Bauteilen frei sein. Es werden
nicht nur einzelne Zwischenpositionen getestet.

Zwischen vorderer Ebene des vorhandenen LTR-Modells und innerer Glasfläche liegen
3,8 mm. Der vorhandene Körper enthält keinen verlässlich vermessenen optischen
Die-Mittelpunkt. Zentrierung und tatsächlicher Die-Abstand sind deshalb am realen
Modul zu prüfen. Auch Quarzglassorte, Transmission, freier Sichtwinkel und die
Anschattung durch Gehäuse/Umgebung sind am vollständigen Aufbau zu bewerten.

Der Haltering hat eine flache Entwässerungsentlastung. Glas bleibt von außen
wischbar. 45° Neigung und freier Ablauf vermindern stehendes Wasser; sie garantieren
weder trockene Scheiben noch Schneefreiheit. Nasser Schnee, Eis oder Belag können
auch dort liegen bleiben. Eine aktive Heizung ist nicht vorgesehen und wurde
nicht als vermeintlich kostenlose Lösung hinzugefügt.

## Mikrofon: Halter und Servicezugang

Die vorhandene runde Mikrofonplatine ist im Modell eingesetzt, ihr Anschlussblock
hat Platz hinter der PCB. Vier längere Federarme mit oberen Lippen und separate
hintere Auflagen halten die Platine. Entlastungstaschen lassen die Arme nach außen
ausweichen. Der akustische Ring koppelt die vordere PCB-Ebene an die Membran.

Der Zugang liegt unten: Zwei M3-Schrauben der Frontplatte lösen, Platte samt
aufgeklebter Gore-Membran sowie die Dichtungen abnehmen. Die Platine kann von
vorne eingesetzt bzw. nach Lösen der Nasen entnommen werden. Sie muss nicht durch
feste hintere Auflagen hindurchgedrückt werden. Ein Frontdeckel verschließt die
Montageöffnung und lässt nur den kleinen akustischen Kanal offen.

Hinten schließen eine verrastete Kappe, Flachdichtung und flanschgeführte
TPU-Kabeldurchführung den Pod gegen den Messraum ab. Die Membran schützt den
Schallport; sie darf nicht eine offene rückseitige Kapsel abdichten sollen.
Tatsächlicher Mikrofon-Portmittelpunkt, Membran-Abmessungen und -Typ sind noch
zu bestätigen. Der vereinfachte Referenzkörper beweist die akustische Zentrierung
nicht. Danach Frequenzgang, Wind- und Lüftergeräusche prüfen.

## Dichtungen, Einschmelzmuttern und Druckdaten

Der Deckel hat acht M3-Punkte. Die breite Flachdichtung liegt plan auf; die
äußeren Aufnahmen begrenzen den Abstand auf 1,0 mm. Die freie Hauptdichtung ist
1,2 mm dick. Das ist ein vorgesehener Kompressionsweg, keine bereits gemessene
Anpresskraft. Kein IP-Schutz wird behauptet.

Die STEP-Baugruppe enthält die Dichtungen im komprimierten Einbauzustand. Die
TPU-STLs enthalten die jeweils vorgesehene freie Form. Bei der Hauptdichtung
liegt die freie STL am Ursprung; andere Teile bleiben in Konstruktionskoordinaten.
STLs vor dem Slicen einzeln ausrichten. STEP-Dichtungen nicht versehentlich statt
der freien STL-Form drucken. Klemmkraft, Rückstellung, Wasseraufnahme und
Kriechverhalten des tatsächlichen TPU sind zu prüfen.

Ø3,6 ist die Vorgabe für Einschmelzmuttern. Die zunächst angenommene Mutternlänge
bleibt 5 mm; Kabelverschraubungsbohrung Ø12,2 und Antennenbohrung Ø6,6 sind ebenfalls
Arbeitsannahmen. Diese Hardwaremaße sind keine bestätigte Bestellung oder Passung.
Anpassungen gehören vor die Druckfreigabe. Insbesondere keine blind vorgesehenen
Aufnahmen durchbohren.

## Geprüft und ungeprüft

Das Validierungsprogramm beendet sich bei Fehlern mit Exitcode ungleich null.
Es prüft STEP-Reimport und Volumen, gültige zusammenhängende Druckkörper,
geschlossene STL-Netze, Überschneidungen aller gleichzeitig eingebauten Teile sowie die genannten
54 Rückhalteversuche. Die Alternativ-Mastplatten werden nicht gleichzeitig mit
der Wandplatte auf Kollisionsfreiheit geprüft. Fuzzy STEP-Volumina werden mit
0,001 % relativer bzw. 0,01 mm³ absoluter Toleranz verglichen.

Nicht nachgewiesen sind elastische Montagekräfte, Spannungen, Alterung, vollständige
Kabelbewegungen, optische/akustische Messgüte, Sieb-Partikelverluste, Luftströmung,
Dichtheit, Winterverhalten und Mast-Windlast. Keine allgemeine Druckfreigabe.
Als nächstes sind reale Passproben der kritischen Halter und Dichtstellen nötig.
Silicagel ersetzt keine Dichtung und muss zugänglich zum Wechseln bleiben.

## Reproduzieren

CadQuery 2.8.0, geprüft mit Python 3.14/macOS ARM64. Der Quellcode erzeugt R2
reproduzierbar; einige Layoutmaße sind gekoppelt. Parameter nicht als beliebig
änderbaren Konfigurator behandeln. Referenzen bleiben im Datenpaket und werden
nicht automatisch aus einer offenen Fusion-Sitzung gelesen.

```sh
python3 -m venv .venv
.venv/bin/pip install -r hardware/enclosure/v2/requirements.txt
# Einmalig aus den gesicherten Originaldateien, falls references/ nicht vorliegt:
.venv/bin/python hardware/enclosure/v2/prepare_references.py original.step inventory.json --out /tmp/references
.venv/bin/python hardware/enclosure/v2/build.py --references /tmp/references --out /tmp/kamue-r2
.venv/bin/python hardware/enclosure/v2/validate.py /tmp/kamue-r2
.venv/bin/python hardware/enclosure/v2/preview.py /tmp/kamue-r2
```

`review.html` funktioniert offline mit WebGL und `DecompressionStream`. Die
Detailansichten zeigen die Referenzkörper und wirklichen Haltermaterialien. Die
großen Ansichtsnetze von SPS30 und RAK werden für den Viewer vereinfacht; alle
Prüfungen verwenden die vollständigen STEP-Körper und die unveränderten Drucknetze.
Die Firmware-CI ist für diese CAD-Pfade nicht zuständig.

## Herstellergrundlagen

- [SPS30: Ansaug-/Ausblasweg, Orientierung und Rückströmung](https://sensirion.com/media/documents/7990F04A/616544B0/Sensirion_Particulate_Matter_AppNotes_SPS30_Mechanical_Design_and_As.pdf)
- [SCD4x: Umgebungskopplung, Wärme, Vibration und Turbulenzen](https://sensirion.com/media/documents/0D0C9129/623B1183/Sensirion_CO2_Sensors_SCD4x_design-in_guide.pdf)
- [SHT: Umgebungskopplung und thermische Entkopplung](https://sensirion.com/resource/user_guide/sht/design_in/)
- [Gore: Membran, Front-/Rückkammer und akustische Dichtungen](https://www.gore.com/sites/default/files/resources/pdf/2025-08/gore-acoustic-design-guide-tech-en.pdf)
- [LTR390: optisches Fenster und Fensterkorrektur](https://optoelectronics.liteon.com/upload/download/DS86-2015-0004/LTR-390UV_Final_%20DS_V1%201.pdf)

Die genannten geometrischen Zahlen sind Auslegungswerte von R2, keine Freigabe
durch die Hersteller.
