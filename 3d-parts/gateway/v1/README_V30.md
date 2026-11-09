# Gateway V3.0 – Antenne direkt nach oben, PG9 nach unten

Diese Version ist für die direkte Montage der CDEBYTE TX915-BLG-26 vorgesehen. Das Gehäuse wird gegenüber V2.4 um 90° in seiner Rückwandebene gedreht und liegt am Mast **quer**. Die bisherige seitliche Antennenwand ist jetzt oben, die gegenüberliegende Wand unten. Der interne Platinenaufbau und alle bereits getesteten Steck-/Klebehalter bleiben unverändert.

Das Querformat erhält den kurzen 5-cm-Pigtail-Weg. Eine Anordnung mit der schmalen Gehäuseseite oben würde eine andere interne Antennen-/Platinenanordnung erfordern. Querformat wird hier wegen der erhaltenen Passungen gewählt; daraus folgt kein nachgewiesener Vorteil hinsichtlich Wind- oder Schneelast.

## Was geändert wurde

| Datei | Änderung |
|---|---|
| `01_gehaeuse` | Alte LAN-Öffnung geschlossen; PG9 auf gegenüberliegender Wand zur Antenne. Antennenauflage innen auf 5,5 mm verstärkt. |
| `08_mastsattel_40mm` | Für Quer-Montage neu angeordnet: Mastkrümmung und Bandführung laufen passend zur neuen Vertikalen. |
| `08_mastsattel_50mm` | Gleiche Änderung für 50-mm-Mast. |
| `09_passprobe_N_buchse` | Jetzt 5,5 mm statt 3,5 mm dick, um den neuen Buchseneinbau inklusive Mutter/Gewindeüberstand vorab zu prüfen. |

Alle übrigen STL-Druckteile sind identisch zu V2.4. **Deckel, TPU-Dichtung, 04/05/06, Sensorhalter und andere Passproben können weiterverwendet werden.** Beide Mastsättel müssen aus V3.0 stammen; alte Sättel nicht für diese Montage verwenden.

Die M2-/M3-Aufnahmen bleiben gemäß letzter Entscheidung Ø3,2 / Ø3,8 mm. Es wurde keine Anpassung auf die kleinsten Probenlöcher vorgenommen. Die beschrifteten Einsatzproben aus V2.4 bleiben erhalten.

## Einbaulage erkennen

Die Ausgangs-CAD-Koordinaten und die bewährte Druckausrichtung bleiben erhalten. In diesen Dateien ist die Antennenseite die bisherige +X-Wand; sie muss bei der Montage **nach oben** zeigen. Die neue PG9 an der -X-Wand zeigt nach unten. Die LAN-Buchse des Pi zeigt nun innerhalb des Gehäuses zur Seite in den großen Anschlussraum.

- `00_baugruppe.step`: Baugruppe in den bisherigen Konstruktionskoordinaten, mit vereinfachten Antennen-/Kabelreferenzen.
- `00b_einbaukontrolle_mit_referenzen.step`: Zusätzlich originale Pi- und RAK2287-STEP-Modelle sowie ausdrücklich vereinfachte HAT-Platinenhüllen.
- **`00c_montageposition_antenne_oben.step`: Zum Anschauen der tatsächlichen Montage öffnen. Hier ist Z nach oben; Antenne oben, PG9 unten, Mast hinter der Rückwand.**

Die Antenne ist als einfache 260 × 20-mm-Hülle dargestellt. Sie und der geplante Kabelweg sind Referenzen, keine Druckteile. Nur die einzeln nummerierten STL-Dateien drucken.

## Antenne und verstärkte Auflage

Das ausgewählte Modell TX915-BLG-26 hat laut Hersteller 260 mm Gesamtlänge, Ø20 mm und 120 g ±5 g Masse. Es wird mit N-Male-Anschluss angegeben. Das erzeugt bei Wind einen Hebel an der Buchse. Daher hat die obere Gehäusewand im Bereich der Buchse jetzt eine innenliegende Verstärkung mit Ø34 mm und **5,5 mm Gesamtdicke**. Die äußere Mutterauflage bleibt an derselben Position mit Ø24 mm Freiraum für die 22-mm-Mutter. Der innere Verstärkungsansatz besitzt eine 45°-Druckschräge am unteren Rand.

Die N-Buchse kommt weiterhin von innen durch die Wand: Metallflansch und rote Dichtung innen, Zahnscheibe und Mutter außen. Der Pigtail-Kabelausgang rückt durch die Verstärkung etwas weiter nach innen und damit näher zum RAK-Anschluss. Die Buchsenachse bleibt ansonsten gleich; der kurze Funk-Kabelweg wird nicht zur anderen Gehäuseseite verlegt.

**Neue Passprobe 09 zuerst drucken und die komplette Verbindung mit Dichtung, Mutter und Antenne montieren.** Prüfen, ob ausreichend Gewindeeingriff für Mutter und Antennenanschluss verbleibt und beide festgezogen werden können. Die vorherige 3,5-mm-Probe bestätigt das nicht für die neue 5,5-mm-Wand. Antennengehäuse nicht als Hebel zum übermäßigen Anziehen benutzen; Buchse gegenhalten. U.FL-Leitung spannungsfrei führen.

Die Verstärkung ist eine konstruktive Verbesserung, kein berechneter oder geprüfter Windlastnachweis. FDM-Material, Schichthaftung, Alterung, Dichtungen und Verschraubungen müssen am realen Aufbau geprüft werden. Herstellerangaben zur Windfestigkeit der Antenne sind nicht auf dieses gedruckte Gehäuse übertragbar.

Herstellerdaten: https://www.cdebyte.com/Uploadfiles/Files/2022-1-13/2022113118165761.pdf

## PG9 und LAN-Kabelweg

Die alte LAN-Öffnung in der Stirnwand ist vollständig geschlossen. Die neue glatte Ø15,5-mm-Bohrung liegt auf der gegenüberliegenden Wand zur Antenne und zeigt montiert nach unten. Es wird die vorhandene PG9 mit Dichtung und Gegenmutter verwendet, ohne gedrucktes Gewinde. Das Kabel vor dem Crimpen durchziehen, erst dann innen crimpen.

Vor der Stirnfläche der Pi-LAN-Buchse verbleiben wie zuvor rund 101 mm gerader Montagefreiraum. Die PG9 steht seitlich außerhalb dieser Einsteckachse. Das Kabel wird nach dem Stecker in einem Bogen zur unteren Durchführung geführt. Ein geplanter Ø8-mm-Kabelraum mit 35-mm-Biegeradius wurde kollisionsfrei gegen Wanne, Halter und Sensorhalter geprüft. Der gezeichnete Bogen beginnt etwa 35 mm vor der LAN-Stirnfläche.

Dieser Raum ersetzt nicht die Prüfung des tatsächlichen Kabels: Stecker/Knickschutz können länger ausfallen; der zulässige Biegeradius ist kabelabhängig. Keine scharfe Umlenkung und keinen Zug auf die LAN-Buchse erzeugen. Kabelbinderösen im Anschlussraum dienen bei Bedarf der Führung, ohne das Kabel abzuknicken. Bei der Trockenmontage Stecker-Rastnase erreichbar halten.

## Neue Mastsättel montieren

Es genügt nicht, nur den Bandkanal des alten Sattels zu drehen: Auch die Mastkrümmung muss zur neuen Mastachse ausgerichtet sein. V3.0 verbindet deshalb jeweils die beiden Gehäuselaschen an der **Antennenseite oben** mit einem Sattel und die beiden Laschen an der **PG9-Seite unten** mit dem zweiten.

1. Zwei identische Sättel für den tatsächlichen Mastdurchmesser wählen: 40 oder 50 mm. Neue Druckgröße jeweils 32 × 144 × 24 mm.
2. Pro Sattel zwei M3×5-Einsätze von der **ebenen Gehäuse-Anschlussseite** einsetzen. Die Aufnahme ist Ø3,8 mm und besitzt 6 mm zylindrische Tiefe. Dahinter liegt eine kegelförmige Druckspitze, damit die auf dem Bett liegende Blindbohrung ohne flache Lochdecke geschlossen wird; der Einsatz selbst bleibt im geraden Abschnitt.
3. Edelstahlband vor dem Anschrauben in den Kanal einlegen. Der Kanal besitzt ein 45°-Dach; vorgesehen ist ein Band bis etwa 12 mm Breite und 1,2 mm Dicke. Konkrete Bandabmessungen und Durchzug am Druck prüfen.
4. Oben den Sattel wie in der Montagebaugruppe einsetzen. **Den unteren identischen Sattel um 180° in seiner ebenen Anschlussfläche drehen**, damit der Bandkanal jeweils zur Gehäusemitte liegt. Nicht auf die Mastseite umdrehen. Die konkave Mastfläche zeigt bei beiden vom Gehäuse weg zum Mast.
5. Mit vier kurzen M3-Schrauben durch die vorhandenen 10-mm-Gehäuselaschen befestigen; beispielsweise M3×16 mit etwa 1-mm-Scheiben ergibt 5 mm Eingriff. Schrauben nicht im Blindloch aufsetzen lassen.
6. Beide Bänder um denselben Mast legen und maßvoll anziehen. Krümmung, Auflage, Gehäuselaschen und Standfestigkeit prüfen.

In den Ausgangskoordinaten liegen die Schrauben unverändert bei (-16/132, 45/165). Die beiden neuen Mastkrümmungen laufen beide entlang der bisherigen X-Richtung auf derselben Mastachse Y=105. Die Montagebaugruppe zeigt beide Sättel ausgerichtet.

## Weitere Teile und Mengen

| Teil | Gesamtmenge |
|---|---:|
| 01 Gehäuse, 02 Deckel, 03 TPU-Dichtung | je 1 |
| 04 L / 04 R | je 2 |
| 05 L / 05 R | je 2 |
| 06 L / 06 R | je 2 |
| 07 Sensorhalter | 1 |
| 08 Mastsattel, passende Größe | 2 |

Der Sensorhalter sitzt unverändert auf dem runden Sockel. Sensor, Halter und Sockel werden mit kurzer M2-Schraube und Scheibe verbunden. Die beiden Brücken sind Kabelbinderösen. Sensoröffnung freilassen und Sensor erst nach vollständigem Aushärten/Auslüften etwaiger Klebeverbindungen einsetzen. Die Dachprofil-Platinenhalter bleiben Steck-/Klebeverbindungen; vor endgültiger Verklebung trocken prüfen.

## Druck- und Testreihenfolge ab jetzt

1. **Neue 09-Passprobe** für die dickere Antennenwand drucken, vollständig mit N-Buchse und Antenne testen.
2. Einen neuen 08-Mastsattel der passenden Größe drucken. Mastauflage, Bandkanal, Einsatz und Schrauben prüfen. Bei Erfolg zweites Exemplar drucken.
3. Neue 01-Wanne drucken und vorhandene Halter/Sensorhalter/Deckel zunächst trocken einsetzen. Kabelanschlüsse und Buchsen prüfen, Platinen nicht über Steckerkräfte belasten.
4. Leeres Gehäuse mit Durchführungen, Deckel und Dichtung in der neuen Einbaulage auf Dichtheit prüfen; erst danach Elektronik dauerhaft einbauen. Elektronik nicht für den Wassertest im Gehäuse lassen.
5. Mechanische Belastung, Dichtheit und Betrieb unter realen Temperaturbedingungen prüfen, bevor der Aufbau unbeaufsichtigt auf dem Dach bleibt.

STL-Drucklagen sind vorbereitet. Wanne weiterhin Rückwand aufs Bett, offen nach oben: 234 × 164 × 78 mm, passend zum MK3S. Horizontale Rundbohrungen können gezielte, entfernbare Stützen benötigen. Die neuen Sättel liegen auf ihrer ebenen Anschlussseite; Bandkanal und Blindlochspitzen sind für Druck ohne breite Brücken konstruiert. PrusaSlicer meldet bei diesen Sätteln geringe Betthaftung an den schmalen ersten Auflagebahnen; dafür einen 3–5-mm-Brim einplanen. Bei kleinen übrigen Haltern gegebenenfalls Brim verwenden. Material-/Slicerprofil wie bei den bestandenen Proben verwenden; für Außenhülle ASA wie bisher vorgesehen. Die gedruckte TPU-Dichtung bleibt 1,8 mm hoch für die 1,4-mm-Nut.

CAD-„geschlossen“ beweist keine Wasserdichtheit eines FDM-Drucks. Die durchgehende Dichtungslinie und deren Unterlage sind geometrisch geprüft; Druckporen, Verzug und reale Dichtflächen benötigen weiterhin praktische Tests. Das Querformat ist kein Nachweis einer bestimmten Wind-, Schnee- oder Schutzartklasse. Direkte Antennenmontage besonders auf Spiel/Risse untersuchen. Temperatur- und Kondensationstests bleiben erforderlich; das PoE+ HAT ist laut Hersteller für 0 bis +50 °C spezifiziert.

## Prüfungen und Quellen

`geometry_checks.json`: unveränderte Halterpassungen, Dichtungsnut/-unterlage, Mutterfreiraum, Mast-/Laschenzuordnung, Kabelweg, Innenfreiräume und Überschneidungen der Referenzmodelle. `mesh_checks.json`: geschlossene einteilige Drucknetze und MK3S-Bauraum. `compatibility_check.json`: geänderte Dateien gegenüber V2.4.

Die vollständige Bauteilbestückung von PoE+-HAT und RAK-Pi-HAT, das tatsächliche LAN-Kabel und die exakte Antennenkupplung sind nicht vollständig als CAD-Volumen vorhanden. Die Antenne ist eine Herstellermaß-Hülle, keine detailgetreue Kopie. Physische Prüfung bleibt nötig.

- Antenne TX915-BLG-26: https://www.cdebyte.com/Uploadfiles/Files/2022-1-13/2022113118165761.pdf
- PoE+ HAT: https://www.raspberrypi.com/products/poe-plus-hat/
- PG-Gewindemaße: https://products.lappgroup.com/fileadmin/catalog/en_T_pdf/T21_Thread_dimensions_for_cable_glands_int.pdf

Zum Nachbauen dienen `scripts/build_v30.py`, `scripts/insert_probe_geometry.py` und `scripts/config_v2.json` mit CadQuery/Python 3.12. Pfade zu den ursprünglichen Pi-/RAK-STEP-Dateien und zur verwendeten Schrift bei anderer Umgebung anpassen. Frühere Versionen bleiben separat erhalten.
