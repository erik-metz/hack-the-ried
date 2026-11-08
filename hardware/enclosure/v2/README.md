# KAMÜ Sensorgehäuse V2 – neuer CAD-Vorentwurf

Stand: 08.11.2026. **Bauraum- und Schnittstellenprototyp, keine fertige Druckfreigabe.**
Die Geometrie ist vollständig neu und verwendet keine Flächen des bisherigen
Gehäuses. Der Quellcode bleibt parametrisch; STEP überträgt die fertigen Körper,
nicht die Parametrik. Alle Maße in Millimetern.

## Festgelegte Anforderungen

- Ganzjähriger Außeneinsatz; Antenne oben; Mast Ø40/50 oder Hauswand.
- M3-Deckelschrauben, Einschmelzmuttern mit Ø3,6-Aufnahme und kleiner Fase.
- Separate TPU-Dichtung und abgedichtete Trennung der Mess-/Elektronikräume.
- Schraubenfreie, lösbare Komponentenhalter; kein Klebstoff als Standardbefestigung.
- Versorgung über Kabelverschraubung; USB nur innen für Service zugänglich.
- Lochraster-I²C-Verteilung: mindestens 40 × 20 × 20 freier Bauraum.
- Austauschbares Silicagelkissen ausschließlich im Elektronikraum.
- Vorhandene Sensor-/Platinenmodelle dienen als Maßreferenz. Rechteckige Ansätze
  stellen Stecker dar und sind keine Klemmflächen. Tatsächliche PCB-Ränder,
  Unterseiten, Stecker und Einbaurichtungen müssen vor passgenauen Haltern
  nochmals geprüft werden.

## Gewählte Anordnung

X ist rechts, Y oben (Antenne), Z zeigt von der Rückwand zum Service-Deckel.
Der erste, bewusst großzügige Bauraum beträgt **180 × 180 × 69** ohne
Montageabstand, Antenne, Dach und außenliegende Anschlüsse. Dies ist ein
Konstruktionsansatz, kein nachgewiesenes Größenminimum. Nutzbare Freiräume sind
kleiner als diese Außenmaße.

1. Oberer Elektronikraum: RAK3112/RAK3212, INA226, Busverteilung, Trockenmittel,
   Versorgung und Wartungszugang. Die Busplatine erhält 42 × 22 Innenfläche;
   20 Höhe sind für Bestückung und Verdrahtung zu reservieren. Der Beutelplatz
   hält ungefähr 50 × 25 × 18 frei; tatsächliche Beutelgröße ist noch offen.
2. Untere linke Klimakammer: SHT41, SCD41, BME688, SGP41. Außenluftzugang über
   geschützte Unterseitenöffnungen; keine Verbindung zum Trockenmittel. SHT41
   muss gegen Wärme von MOX-Sensoren, Sonne und Elektronik entkoppelt werden.
   SCD41 liegt außerhalb des direkten SPS30-Luftstroms. Die große Elektronikkammer
   darf nicht zum zusätzlichen Totvolumen der Klimasensoren werden.
3. Untere rechte SPS30-Kammer: eigene Halteschale, kurze Luftwege, Einlass/Auslass
   auf derselben nach unten gerichteten Außenfläche. Sensor-Adapter muss die
   **beiden Sensoreinlässe und den einen Auslass** korrekt und dicht getrennt mit
   den zwei Gehäuseöffnungen verbinden. Dies ist im Modell noch NICHT ausgeführt.
   Zwei Löcher in einer gemeinsamen Kammer erfüllen diese Anforderung nicht.
4. Mikrofon in eigener geschlossener Kapsel mit nach unten gerichtetem Schallport;
   Elektronik bleibt hinter der Membran. Versorgung/Signal der Kapsel und die
   Durchführung durch die Kammerwand sind separat abzudichten.
5. Quarzglas oben, vor dem Dachrand, als austauschbarer Einsatz. Die Konstruktion
   berücksichtigt eine 20 × 2 Scheibe als bisherige CAD-Referenz, noch ohne
   Bestätigung des realen Teils.

## Optik: Wasserablauf und Reinigung

Der Entwurf verwendet **10° Glasneigung als zu prüfenden Ausgangspunkt**. Die
LTR-Platine soll waagerecht bleiben: Eine schräg gestellte Sensorplatine würde
zugleich die Messrichtung ändern. Das Glas erhält keine schmutzsammelnde hohe
Fassung am tieferen Rand. Die endgültige Fassung soll mit weicher umlaufender
Dichtung und mechanischem Halter auskommen; Glas von außen wischbar und nach
Öffnen des Deckels austauschbar. Keine Dichtmasse im optischen Feld.

Das Parameterfeld `optical_center_gap_target = 4` bezeichnet den **noch nicht
mechanisch umgesetzten Zielabstand von Sensoroberfläche bis innerer Glasmitte**,
nicht PCB bis Glas. Bei geneigtem Glas variiert der Abstand über die Fläche.
Die lokale Position des echten LTR-Chips, der Halter, Dachöffnung und freier
Blickwinkel müssen zusammen dimensioniert werden. Waagerechte Platine allein
beweist weder eine korrekte Winkelantwort noch einen normgerechten UV-Index.
Fenstertransmission und Winkelabhängigkeit des vollständigen Aufbaus prüfen;
ein einzelner Korrekturfaktor beseitigt keine geometrische Abschattung.

Regen ist kein zuverlässiges Reinigungssystem. Fenster regelmäßig auf Belag,
Tropfen und Verschmutzung prüfen und schonend reinigen. Keine zusätzliche
transparente Kunststoffhaube vor dem Quarzglas vorsehen.

## Akustik und Luftwege

- Mikrofonöffnung unten, kurzer gerader Kanal, kleine Frontkammer, geschützte
  Klebefläche für eine tatsächlich geeignete Akustikmembran. Der 2-mm-Port im
  Vorentwurf ist eine **Annahme**, keine Vorgabe für eine unbekannte Membran.
  Deren Klebering und aktiver Durchmesser müssen vor dem Detailentwurf vorliegen.
- Mikrofon und SCD41 möglichst von SPS30-Körperschall und Vibration entkoppeln.
  TPU-Auflagen sind eine zu messende Option, kein bereits belegter Schallschutz.
- Beide SPS30-Außenöffnungen unten, nahe beieinander unter vergleichbarem
  Windschutz; keine gegenüberliegenden Wind-/Leeseiten und kein langer
  verwinkelter Kanal. Dicht bis zum Sensor reichende interne Trennung nötig.
- Austauschbare Siebe, keine zusätzliche Feinstaubfiltermembran vor dem SPS30.
  20-mm-Sieb ist hier nur die bisherige CAD-Referenz. Maschenweite, Drahtstärke,
  offener Querschnitt und Partikelverluste müssen für das reale Sieb geprüft werden.
- Regen-/Spritzwasser kann auch in Unterseitenöffnungen eindringen. Außenseitige
  Schutzränder, freier Ablauf im Messbereich und Versuche mit Wind/Sprühregen
  sind nötig. Unterseitenöffnungen sind kein Dichtheitsnachweis.

## Trockenmittel und Dichtung

Ein herausnehmbarer Korb hält das Kissen von Platinen und Lötstellen fern. Ein
intakter, staubarmer Beutel ist vorgesehen, keine losen Körner. Kennzeichnung
für Einsetz-/Wechseldatum; keine behauptete Lebensdauer ohne Feuchtebilanz.
Silicagel ersetzt keine Dichtung und muss nach Sättigung gewechselt bzw. nach
Beutelherstellerangaben regeneriert werden. Es darf keine Messluft trocknen.

Die Elektronikkammer wird gegen Flüssigwasser abgedichtet, ist bei FDM/TPU aber
nicht als hermetisch nachgewiesen. Eine Akustikmembran kann Wasserdampf/Gase
durchlassen; Trockenmittel kann daher auch ohne sichtbare Leckage nachbeladen
werden. Ein zusätzlicher Druckausgleichsvent ist **nicht ungefragt ergänzt**.

Die einteilige TPU-Dichtung besitzt Außenkontur und zwei zusammenhängende
Trennstege. Nut 2,8 breit × 1,2 tief; Dichtung 2,2 breit × 1,6 hoch. Rechnerisch
0,4 Kompressionsweg (25 %), noch ohne nachgewiesene erforderliche Anpresskraft,
TPU-Härte oder Langzeit-Rückstellung. Deckel liegt auf Anschlägen/Flansch auf.
Acht Deckelschrauben liegen außerhalb der Dichtkontur. Druckcoupon, Kontaktbild,
Deckelverformung und Dichtheit prüfen, bevor Nut/Material endgültig festgelegt werden.

## Was die CAD-Dateien bereits enthalten

26 separat exportierte, geometrisch gültige Einzelkörper: neues Gehäuse mit
Trennwänden, Flansch/Nut und blinden M3-Aufnahmen; Deckel; TPU-Dichtungsnetz;
Trägerplatten; Randhalter für RAK, INA und die vier Klimasensoren; SPS30-Schale;
Busplatinenablage; Beutelkorb und Halteleiste; optischer Einsatz und Dichtungsring;
LTR-Halter; Mikrofonkapsel und Passring; Siebsitz und Ring; rückseitige Montageplatte;
Mastsättel 40/50; Dachhülle mit optischem Ausschnitt.

`layout.step` ist eine **gemischte Montage-/Auslegeansicht**: LTR-Halter,
Fensterdichtung, Mikrofon-Passring und Siebringe liegen zur Begutachtung neben dem
Gehäuse. Beide Mastsättel sind als Alternativen dargestellt, nicht als gemeinsame
40/50-mm-Montage. Die TPU-Dichtung ist unkomprimiert dargestellt und überschneidet
sich deshalb nominal um 0,4 mit dem geschlossenen Deckel. Diese Ansicht ist kein
Nachweis einer fertig abgestimmten Baugruppe.

## Offene Detailarbeiten vor Druckfreigabe

- SPS30-Portadapter, portgenaue Lufttrennung und weiche Anschlussdichtung fehlen.
- Optischer PCB-Halter ist als separates Muster exportiert; Abstand und Befestigung
  im Fenster-Einsatz fehlen. Fenster-/Mikrofon-Einsätze haben noch keine abgestimmte
  Halte- und Dichtverbindung zum Gehäuse. Hinterer Verschluss und Kabeldurchführung
  der Mikrofonkapsel fehlen.
- Dachbefestigung, Tropfkanten, verschmutzungsarme Ablaufgeometrie und
  Strahlungsschutz müssen aus der Dachhülle weiter ausgearbeitet werden.
- Trägerplatten und einzelne Komponentenhalter sind räumlich angeordnet, aber noch
  ohne formschlüssige Verbindung untereinander. Sie dürfen nicht lose eingebaut
  werden. Clipgeometrie/Platinenstärke sind durch Passproben zu prüfen.
- Elektronik-Durchführungen zur Messkammer sind Ø8-Platzhalter und müssen mit
  Kabelbündel und geteilter TPU-Durchführung dimensioniert werden. Keine offenen
  Durchführungslöcher im fertigen Gerät belassen.
- Einschmelzmutterlänge hier 5 angenommen, Kabelverschraubungsloch Ø12,2 angenommen,
  Antennenbohrung Ø6,6 angenommen. Tatsächliche Hardware einschließlich
  Klemm-/Dichtscheiben und Montageraum prüfen, keine Einkaufsempfehlung aus diesen
  Platzhaltern ableiten. Von hinten eingebrachte Muttern sitzen ebenfalls in
  blinden Aufnahmen; diese nicht versehentlich durchbohren.
- Montageplatte benötigt zur Wand/zu den Bandsätteln noch definierte Distanzstücke
  bzw. Verbindungselemente. Mastsättel sind Auflageprofile; Bandführung und
  formschlüssige Sicherung fehlen. Keine statische Freigabe für die lange Antenne.
- STL-Dateien sind in Konstruktionskoordinaten, nicht automatisch auf das Druckbett
  ausgerichtet. Druckorientierung, Stützfreiheit und Material/Schichthaftung prüfen.

Die Validierung prüft BRep-Gültigkeit, positive Volumina, jeweils einen
zusammenhängenden Körper, STEP-Reimport, Überschneidung von Gehäuse/Deckel und ausgewählte
Gehäusekollisionen mit Kapsel, optischem Einsatz und Trägerplatten.
Sie prüft **keine** vollständige Kollisionsfreiheit, realen Passungen,
Strömung, Sensorbeeinflussung, Akustik, UV-Messgenauigkeit, Windlast oder
Wetterdichtheit. Keine IP-Schutzart wird zugesagt.

## Reproduzieren

Python 3.14 auf macOS ARM64 wurde verwendet. Andere unterstützte CadQuery-
Plattformen sind möglich, wurden aber hier nicht geprüft.

```sh
python3 -m venv .venv
.venv/bin/pip install -r hardware/enclosure/v2/requirements.txt
.venv/bin/python hardware/enclosure/v2/build.py --out /tmp/kamue-enclosure-v2
.venv/bin/python hardware/enclosure/v2/preview.py /tmp/kamue-enclosure-v2
```

`review.html` ist die daraus generierte Offline-Ansicht mit drehbarer 3D-Geometrie
und Funktionsschema. WebGL und die Browser-API `DecompressionStream` werden für
die 3D-Ansicht benötigt; das Schema funktioniert auch ohne WebGL.

`parameters.json` enthält die Annahmen. W/H und das Bauteillayout sind in V0.1
noch gekoppelt: Außenmaße nicht ohne Layoutanpassung ändern. CAD-Build und
Einzelkörperexporte werden absichtlich nicht durch die Firmware-CI ausgeführt.

## Herstellerquellen und Referenzen

- [SPS30 Einbau und Orientierung](https://sensirion.com/media/documents/7990F04A/616544B0/Sensirion_Particulate_Matter_AppNotes_SPS30_Mechanical_Design_and_As.pdf)
- [SCD4x: Umgebungskopplung, Wärme, Vibration und Turbulenzen](https://sensirion.com/media/documents/0D0C9129/623B1183/Sensirion_CO2_Sensors_SCD4x_design-in_guide.pdf)
- [SHT: thermische Entkopplung und kleiner Messluftraum](https://sensirion.com/resource/user_guide/sht/design_in/)
- [Gore Akustik: Kanal, Membran und Wassereinfluss](https://www.gore.com/sites/default/files/resources/pdf/2025-08/gore-acoustic-design-guide-tech-en.pdf)
- [LTR390 Datenblatt: Fensterkorrektur](https://optoelectronics.liteon.com/upload/download/DS86-2015-0004/LTR-390UV_Final_%20DS_V1%201.pdf)
- [Gore: Feuchte und Trockenmittel](https://www.gore.com/sites/default/files/resources/pdf/2025-09/gore-ptv-116-condensation-in-security-cameras-whitepaper-us.pdf)
- [Vorhandene Module und Aufbau-Fotos](https://www.hack-the-ried.de/sensor-bauen)

Die geometrischen Zahlen dieser V2 sind Entwurfsentscheidungen, keine aus den
Herstellerleitfäden abgeleiteten oder von Herstellern bestätigten Freigabemaße.
