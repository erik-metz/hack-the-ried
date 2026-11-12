# KAMÜ Sensorgehäuse R5 — Prüfentwurf

R5 ersetzt R4. Die Revisionen nicht mischen. Die STEP-/STL-Pakete werden außerhalb
des Repositories erzeugt. R4 bleibt als nachvollziehbarer alter Stand erhalten.

## Konkrete Änderungen

- Alle sechs M3-Deckelaufnahmen sind über 6 mm breite, gerundete Stege durchgehend
  von Z=2,4 bis Z=50 mm mit der Seitenwand verbunden. Die langen freistehenden
  Türme entfallen. Bohrung Ø3,6 mm, Einlauffase 0,3 mm; angenommene Mutternlänge 5 mm.
- Keine hohe Bus-/Silikat-Tasche. Die Lochrasterplatine erhält eine niedrige
  Klebefläche 42 × 22 mm im trockenen Bereich. Für das lose Silikatkissen sind
  50 × 18 × 24 mm freigehalten. Die Busreserve beträgt 40 × 20 × 20 mm.
- Reservierte Volumen sind **keine Bauteile** und fehlen in `assembly.step`.
  Die Einzeldateien `reserve_*.step` dienen ausschließlich der Platzkontrolle.
- Der innere LTR-Sockel ist ausgehöhlt und besitzt breite gerundete Wangen und
  Endauflagen anstelle eines massiven Quaders. Kein Sockel reicht ins Freie.
- Originalantenne und Buchse aus Fusion ergänzt, Antenne nach oben; eine separate
  TPU-Flachdichtung unter dem Flansch dichtet den Wanddurchgang ab. RAK liegt
  jetzt bei X=-33/Y=54 statt Y=16. Der Kabelweg zur LoRa-Buchse misst 50 mm,
  mit ungefähr 6,2 mm kleinstem modellierten Biegeradius.
- Alle Platinenhalter bestehen aus PETG-Auflage und PETG-Sicherungsrahmen.
  Keine TPU-Umrandungen und keine elastischen Trägerniete. Der SPS30 erhält eine
  PETG-Wiege und zwei PETG-Sicherungsbügel, ebenfalls ohne TPU-Haltebänder.
- Mikrofonöffnung jetzt Ø3 mm statt Ø2 mm; innere Dichtungsbohrung Ø3,4 mm.
  Die Bohrung geht durch 2,4 mm Wand und einen 2 mm langen Dichtring zur Platine.
  Das Mikrofon bleibt vollständig innen, die Membran außen bündig.

## Wie die PETG-Halter befestigt werden

**Ein normaler Platinenhalter hat zwei separat gedruckte PETG-Teile.**

1. Die breite Auflage auf ihre Gehäusefläche setzen. Kurze, im Gehäuse integrierte
   Ø3-mm-Zapfen positionieren die Auflage. Kleine Klebepunkte zwischen den
   PETG-Auflageflächen verhindern das Abheben. Beim LTR wird die breite geneigte
   Auflagefläche geklebt; hier gibt es keine Zapfen, die den seitlichen Ausbau blockieren.
2. Platine einlegen. Die umlaufende niedrige Sitzkante unterstützt ihre Ränder.
   Vorhandene CAD-Montagelöcher erhalten kurze Führungszapfen: INA226 Ø2,6,
   SHT41/SGP41 Ø2,6 und BME688 Ø1,6 mm. RAK, SCD41 und LTR werden an den Rändern
   geführt; die kleinen RAK-Bohrungen werden nicht durch zerbrechliche Zapfen ersetzt.
3. Sicherungsrahmen aufsetzen. Zwei kurze Ø2,4-mm-Zapfen greifen in Ø2,6-mm-Sitze.
   Der Rahmen übergreift die freien Platinenränder um etwa 0,6 mm. Die Steckerzone
   bleibt ausgespart. Kleine Klebepunkte an den PETG-Zapfensitzen sichern den Rahmen.

Die kurzen Zapfen positionieren, sie sind **keine Rastnasen**. Bei dieser bewusst
starren Ausführung ist die Klebesicherung erforderlich. Die Platine selbst wird
nicht verklebt. Für die Demontage die kleinen PETG-Klebepunkte lösen/aufschneiden;
Rahmen und gegebenenfalls Auflage lassen sich neu drucken. Es gibt keine behauptete
werkzeuglose Schnappverbindung und keine aus CAD abgeleitete Klebe- oder Haltekraft.

Beim runden Mikrofon gilt dasselbe Prinzip. Zwei zusätzliche breite Laschen der
Auflage sitzen auf kurzen, abgestützten Wandaufnahmen. Die Befestigungszapfen
zeigen ins Gehäuse; keine Befestigungsbohrung führt nach außen. Die zwei Zapfen
am Sicherungsring verbinden Ring und Auflage. Die Platinenöffnung bleibt frei.

Beim SPS30 sitzt der Quader in der breiten U-Wiege. Zwei flach gedruckte Querbügel
liegen über dem Sensor und stecken mit kurzen Zapfen in vier massiven Auflagen.
Die Auflagen reichen bis zur breiten Grundplatte; keine frei auskragenden Haken.
Klebepunkte an den PETG-Zapfen sichern die Bügel, nicht am Sensorgehäuse.

Die `cap_*.stl` und `sps_cap_*.stl` liegen bereits mit ihrer großen Vorderfläche auf
Z=0, Zapfen nach oben. `tray_*.stl` liegen mit der Grundplatte auf Z=0. Die geneigte
LTR-Aufnahme und seitliche Mikrofonaufnahme werden separat flach gedruckt und
anschließend eingesetzt. Es ist kein gemeinsamer PETG-/TPU-Druck vorgesehen.

## Wofür TPU noch verwendet wird

TPU bleibt nur für funktionale Dichtteile: große Flachdichtung, Schraubkopfringe,
Antennenflanschdichtung (frei 0,8/montiert 0,6 mm), Quarzglasfassung, Mikrofon-Dichtring, SPS-Auslassdichtung und Kabelsepten in der
Trennwand. Diese werden separat gedruckt und mechanisch eingelegt/eingedrückt.
Sie sind keine Platinenhalter. Die äußere Gore-Membran ist ein gekauftes
selbstklebendes Akustikvent, kein gedruckter TPU-Ersatz.

## Luftweg und Siebe

SPS30, BME688, SGP41 und SCD41 teilen die gesamte untere Messkammer. SHT41,
Mikrofon, LTR, RAK und INA226 liegen im nicht belüfteten Bereich.

Die beiden einzigen Außenöffnungen der Messkammer zeigen nach unten:

- Rechtes Sieb → gemeinsame Messkammer → beide SPS30-Einlässe.
- SPS30-Auslass → kurzer linker Adapter → linkes Sieb → außen.

Seine TPU-Stirndichtung ist frei 0,8 mm dick und montiert 0,7 mm, bis zur
zurückgesetzten Metallfront des SPS30 (nicht nur zu den vorstehenden Kunststoffdetails).
Der Adapter liegt am **Auslass**, nicht an den Einlässen. Er verhindert eine direkte
Rückführung ausgeblasener Luft in die SPS30-Einlässe. Er sperrt die anderen
Sensoren nicht in ein eigenes Gehäuse. Sensirion empfiehlt eine Trennung von
Einlass und Auslass und die Vermeidung von Rezirkulation. Die tatsächliche
Luftwechselrate und eine gleichmäßige Durchströmung aller Kammerzonen sind damit
noch nicht nachgewiesen; dafür sind Luftweg-/Ansprechzeitversuche nötig.

Die beiden Ø20-Siebe liegen in flachen Sitzen über den Ø18-Öffnungen. Je ein
separater Ring hält das Sieb mit zwei M3-Schrauben; Klebstoff ist für die Siebe
nicht nötig. Außer diesen Öffnungen gibt es keine offenen Lüftungsschlitze.

Herstellerquelle: [Sensirion SPS30 Mechanical Design and Assembly Guidelines,
Abschnitte 2.1 und 2.2](https://sensirion.com/en/media/documents/7990F04A/616544B0/Sensirion_Particulate_Matter_AppNotes_SPS30_Mechanical_Design_and_As.pdf).

## Mikrofon, Quarzglas und Wartung

Eine große Membranfläche erfordert nicht automatisch eine ebenso große
Gehäusebohrung. TDK behandelt den Schallweg aus Gehäuseöffnung, Dichtungsvolumen
und PCB-Loch gemeinsam. Der 3-mm-Gehäusekanal ist eine Konstruktionsentscheidung,
keine Herstellerfreigabe für das konkrete Gore-Vent. Die aktive klebstofffreie
Ventfläche muss die Bohrung abdecken. Frequenzgang und Dämpfung sind mit der
realen Membran zu messen. Der 20-mm-Membrankörper ist weiterhin eine Maßannahme.

Quelle: [TDK/InvenSense AN-1003, Mounting and Connecting Bottom-Port MEMS
Microphones](https://invensense.tdk.com/wp-content/uploads/2015/02/Recommendations-for-Mounting-and-Connecting-InvenSense-MEMS-Microphones.pdf).

Das Ø20 × 2-mm-Quarzglas sitzt bündig in der durchgehenden 45°-Gehäuseschräge.
Die TPU-Frontlippe übergreift es um 0,5 mm. Zum Glaswechsel die flexible Lippe
vorsichtig mit einem Kunststoffwerkzeug zurücklegen und Glas entnehmen; die
Fassung kann bleiben. Für den vollständigen Fassungswechsel LTR-Aufnahme innen
nach Lösen der Klebepunkte 30 mm nach links verschieben; anschließend ist die
rückseitige Flanschlippe erreichbar. Die 45°-Neigung erleichtert Wasserablauf,
verhindert aber keine Schnee-/Eisbedeckung. Die äußere Glasfläche bleibt zugänglich.

Der LTR-CAD-Körper enthält die maßhaltige Platinenkontur und den symbolischen
Anschluss, **keinen separat modellierten UV-Chip und kein Montageloch**. Der
Chipversatz +7 mm stammt aus dem Foto und bleibt vorläufig. Die UV-Achse muss
bei der kleinen Passprobe an der realen Platine kontrolliert werden.

## Antenne und Versorgung

Die beiden Antennen-Kaufteilkörper stammen aus dem ursprünglichen STEP und werden
an ihrer Flanschfläche ausgerichtet. Nur der symbolische gerade Kabelstummel
wird durch den 50-mm-Kabelweg ersetzt. Der Kabelquerschnitt Ø1,13 mm ist eine
Annahme und am realen Pigtail zu kontrollieren; 50 mm sind als freie Kabellänge
zwischen Austritt und Stecker angesetzt. Der Stecker braucht zusätzlich seinen
realen Einbauraum. Die LoRa-Steckerposition wird aus den zylindrischen Flächen des
RAK-STEP bestimmt und anhand der Herstelleransicht orientiert.

[RAK3112 Quick Start Guide: LoRa-/Wi-Fi-MHF4-Anschlüsse](https://docs.rakwireless.com/product-categories/wisduo/rak3112-module/quickstart/).

Die ursprünglichen Antennenreferenzen haben am vereinfachten Gewinde eine bereits
im Original vorhandene Überdeckung von etwa 167 mm³. Diese wird separat berichtet
und ausschließlich innerhalb der äußeren Gewinde-Montagezone zugelassen.
Überdeckungen mit Gehäuse, Sensoren oder Kabel werden nicht ausgenommen.

Versorgung durch die rechte Seitenwand, Y=24/Z=24: geschlossene Ø12,2-mm-Bohrung
für eine angenommene M12-Kabelverschraubung. Mutter Ø19 und Werkzeugraum Ø28 sind
freigehalten. Das konkrete Verschraubungsmodell ist weiterhin auszuwählen.

## Grundgehäuse und Dichtung

168 × 168 × 50 mm, normale Wände/Rückwand 2,4 mm, Außenecken R4.
Obere durchgehende 45°-Schräge bei Y+Z=106; normale Schrägwanddicke etwa 4,24 mm,
für die breite obere Dichtauflage. Deckel 3 mm, normale Dichtspur 6 mm. Flachdichtung
frei 1,2 mm, montiert 1,0 mm; Schraubkopfdichtungen frei 0,8/montiert 0,6 mm.
Schräge, Dichtung und Deckel laufen an derselben Fläche aus, ohne vorstehende
waagerechte Wasserablage. Antenne nach oben. Montageplatten für Hauswand und
40-/50-mm-Mast sind Alternativen, keine gleichzeitig zu montierenden Teile.

## Erzeugen und prüfen

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python prepare_references.py /pfad/case_sensor_current.step /pfad/inventory.json --out references
.venv/bin/python build.py --references references --out generated
.venv/bin/python validate.py generated
.venv/bin/python preview.py generated
.venv/bin/python assembly_guide.py generated
```

`assembly.step` enthält die reale Baugruppe ohne Planungskörper. `parts/` enthält
STEP in Einbaulage und STLs in Drucklage. `coupons/` enthält die einzelnen realen
Halter und Rahmen als kleine Passproben. `review.html` zeigt die Baugruppe,
Drucklagen und Explosionsansicht; `assembly-guide.html` erklärt den Halter im
Schnitt anhand der tatsächlich erzeugten CAD-Körper.

Die Prüfung umfasst STEP-/STL-Gültigkeit, geschlossene Netze, Drucklage,
Geometrievergleich, PCB-Rückhaltung, freigehaltene Klebeflächen, Kollisionen,
Montagewege, drei Millimeter starke durchgehende Materialkerne zwischen jedem
Schraubpunkt und Seitenwand in fünf Höhen, Kabelweglänge/Biegung, trockene
Reservevolumen, Mikrofon-/UV-Durchgang, ausschließlich zwei gesiebte Luftöffnungen
und 0,2-mm-Schichtunterstützung aller separaten Halter.

Diese Prüfungen ersetzen keine realen Druck-, Klebe-/Haltekraft-, Akustik-,
Luftwechsel- oder Wetterversuche. Zuerst einen kleinen PCB-Halter und die
SPS30-Wiege mit den Sicherungsbügeln drucken. Das Hauptgehäuse kann lokal am
Luftkanal und an seitlichen Bohrungen Stützen benötigen. Eine IP-Schutzart wird
nicht behauptet.
