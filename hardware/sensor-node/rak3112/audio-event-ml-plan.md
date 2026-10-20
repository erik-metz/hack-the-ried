# Open-Ried-Sens: Audioereignisse mit RAK3112

## Ziel und Grenzen

Die RAK-Sensoren sollen wiederkehrende Geräuschereignisse des öffentlichen Außenraums in möglichst vielen Stadtteilen erfassen. Zusammen mit Temperatur, Wetter, Luft-/Gasindikatoren, Licht und Standort sollen die Daten später räumliche und zeitliche Muster für Open-Ried-Sens und Hackathons ermöglichen. Das Ergebnis ist eine statistische Beschreibung von Geräuschereignissen, keine Aufnahme, Transkription oder Identifikation von Personen.

Im Regelbetrieb werden keine Roh-Audios, Sprachinhalte, Stimmenmerkmale, Personen- oder Fahrzeugidentitäten übertragen oder dauerhaft gespeichert. „Sprache“ bedeutet ausschließlich erkannte Sprachaktivität. Eine Aussage wie „Postauto“ ist aus dem Geräusch allein meist nicht belegbar; klassifiziert werden darf höchstens ein akustisch erkennbarer Fahrzeugtyp bzw. ein Fahrgeräusch. Privatgrundstücke, Nachbarbereiche und mögliche Rückschlüsse auf Einzelpersonen sind bei Geräteplatzierung, Testaufnahmen und Veröffentlichung besonders zu berücksichtigen. Vor dem Sammeln gelabelter Rohaufnahmen und vor einem breiten Rollout sind Zweck, Einwilligung/Information, Zugriff, Aufbewahrung und lokale rechtliche Anforderungen gesondert zu prüfen.

## Derzeitiger technischer Vertrag (Firmware v11)

- ICS-43434: kontinuierliches I²S, 16 kHz; der aktive Mikrofonkanal wird aus zwei Slots ausgewählt. Inferenz ist noch nicht implementiert.
- Erfasste Audioverarbeitung: 256 Frames (16 ms) pro Block; fünfminütige Fenster und Format-5-LoRaWAN-Uplink auf FPort 10.
- Gesendet wird `sound_level` in unkalibriertem dBFS mit Min/Mean/Max und Sample Count. Es ist weder dB SPL noch dB(A).
- Protokollcodes 40 (`sound_dominant_frequency`) und 41 (`sound_event_class`) sind im gemeinsamen Decoder reserviert, aber v11 emittiert sie nicht. Die bisherige Beschreibung der Werte 0–3 für Code 41 ist nur ein veralteter Vorschlag und kein aktiver ML-Vertrag.
- Der TTN-Webhook schreibt kanonisch nach `entities`, `measurement_definitions` und `readings` via `write_measurement`; er spiegelt Messwert-Mittel zusätzlich nach `sensor_data` für alte Leser. Neue Fenster liegen autoritativ in `readings`; die alten Fenster-Tabellen sind nur Lesefallback für historische Datensätze.

## Ereignistaxonomie (Entwurf, versioniert)

Die Taxonomie soll bewusst mehr als zehn Klassen bieten. Ein mehrstufiges Vokabular ermöglicht grobe stabile Auswertungen und detailliertere Hackathon-Fragestellungen. Ein Modell darf mehrere Klassen gleichzeitig ausgeben. Elternklassen werden aus Unterklassen abgeleitet und nicht als zusätzliche unabhängige Erkennung gezählt.

### Verkehr und Mobilität

- Straßenverkehr allgemein, entfernter Verkehrsteppich / Autobahnrauschen
- Pkw, Transporter, Lieferwagen, Bus, Reisebus, schwerer Lkw
- Motorrad, Moped, Fahrrad, E-Bike, E-Scooter
- Motor im Leerlauf, Anfahren/Beschleunigen, Vorbeifahrt, Reifen-/Straßenrauschen
- Bremsen, Hupen, Rückfahrwarner, Einsatzfahrzeugsirene
- Müllabfuhr / kommunales Nutzfahrzeug (als Tätigkeit nur bei ausreichendem akustischem Muster; sonst Fahrzeug- und Arbeitsgeräusche getrennt)
- Zug, Straßenbahn
- Flugzeug, Hubschrauber, Drohne

### Menschen und Alltag

- Sprachaktivität, mehrere Stimmen / Menschenmenge, einzelne Stimme
- Kinder spielen, Lachen, Rufen/Schreien, Pfeifen, Klatschen
- Schritte, Rennen, Rollgeräusch von Koffer/Wagen
- Sport/Spiel, Ballprellen, Skateboard
- Musik im Außenraum, verstärkte Musik

Sprachklassen enthalten weder Transkript noch Sprechererkennung, Alter- oder Geschlechtsklassifikation. „Einzelne Stimme“ und „Menge“ sind nur akustische Szenenlabels und keine Personenzählung.

### Tiere

- Vogelaktivität, Vogelgesang, Krähen/Rufe, Wassergeflügel, Huhn/Hahn
- Hundebellen, Winseln, Knurren; Katze
- Nutztiere / Pferd
- Insekten allgemein, Bienen, Grillen/Zikaden
- Frösche / Amphibien

### Wetter und Natur

- Regen allgemein, Nieselregen, Starkregen, Hagel
- Donner
- Wind, Wind am Mikrofon, Blätterrauschen, Äste
- Fließendes Wasser, Tropfen / Dachrinne

### Gebäude, Geräte und Arbeiten

- Baustelle allgemein, Hämmern, Sägen, Elektrowerkzeug
- Rasenmäher, Laubbläser, Gartengerät
- Lüftung/Klimaanlage, Generator, sonstige Maschine
- Tor/Tür, Rolltor, Mülltonnen-/Containerbewegung

### Signale, Störungen und Hintergrund

- Alarm, Klingel/Glocke, Martinshorn (auch Verkehrs-Unterklasse), Feuerwerk
- Knall/Schlag, Glasbruch
- Mikrofonwind, Handling-/Kontaktgeräusch, Clipping/Übersteuerung
- ruhige Umgebung / kein Ereignis, unbekannt / mehrdeutig

Das sind Kandidaten, keine Zusage, dass ein Modell alle zuverlässig trennt. Ähnliche oder semantisch nicht akustisch unterscheidbare Klassen bleiben zusammengefasst. Insbesondere sind Post-/Paketdienst, Marke, Fahrzeughalter, konkrete Person und die Quelle eines entfernten Dauerrauschens nicht aus dem Audio allein zuverlässig ableitbar.

Für ein Taxonomie-Release werden stabile Slugs/IDs vergeben, Elternbeziehungen, Definitionen, positive und negative Beispiele, Verwechslungsregeln sowie Änderungsregeln dokumentiert. `unknown` ist obligatorisch. Modell-Scores sind zunächst unkalibrierte Scores, keine Wahrscheinlichkeitsgarantie.

## Modellansatz und Entscheidung

### Vortrainierte Modelle geprüft

- **YAMNet** ist ein sinnvoller akustischer Lehrer und Offline-Baseline: das offizielle Modell klassifiziert 521 AudioSet-Klassen, nimmt 16-kHz-Mono an, verwendet 0,96-s-Fenster, hat 3,7 Mio. Gewichte und benötigt ca. 69,2 Mio. Multiplikationen pro Fenster. Damit deckt es viele Alltagsgeräusche ab, liefert aber keine Garantie für lokale Ried-Geräusche und wurde auf AudioSet-/YouTube-Material trainiert.
- **TFLite Micro `micro_speech`** ist kein passendes fertiges Modell: das Espressif-Beispiel erkennt nur zwei Sprachbefehle plus `unknown`/`silence`.
- **Edge Impulse Audio Classification** exportiert einen vollständigen DSP-und-Modell-C++-Pfad für eingebettete Ziele und ist für einen selbst gelabelten, quantisierten RAK-Prototyp geeignet. Es bringt aber kein fertiges Modell mit dieser gewünschten lokalen Stadtgeräusch-Taxonomie mit; dafür brauchen wir eigene passende Trainings- und Testdaten.

### Urbane Referenzdaten

- **SONYC-UST v2.3** ist der passendste erste externe Vergleichsdatensatz: 18.515 mehrlabelige Aufnahmen aus einem urbanen Sensornetz, 23 Klassen und ein fachlich verifiziertes Teilset von 1.385 Aufnahmen. Er eignet sich für einen Urban-Sound-Baseline-Lauf, deckt aber nur einen Teil unserer feineren Taxonomie ab. Die Aufnahmen stammen aus New York und ersetzen keine Ried-/Außenstandort-Validierung. Vor einem Trainingslauf werden Nutzungsbedingungen und konkrete Audio-Datei-Lizenzen geprüft; zunächst reichen Taxonomie-/Annotationsexport und ein kleiner, gezielter Testsatz. [NYU SONYC-Ressourcen](https://wp.nyu.edu/sonyc/resources/), [Datensatz auf Zenodo](https://zenodo.org/records/3966543).
- **YAMNet** bleibt davon getrennt die allgemeine AudioSet-Referenz mit 521 Ausgabeklassen. Seine Scores und Labels sind Vorschläge für Taxonomie-Zuordnungen, keine lokalen Ground-Truth-Labels.
- Erste Evaluation: SONYC-verifizierte Clips für passende Klassen (z. B. Verkehr, Bau, Maschinen, Alarm, Menschen) verwenden; dazu eine explizite Zuordnung SONYC → Open-Ried-Sens → YAMNet. Nicht abgedeckte Klassen bleiben `unmapped`, statt aus verwandten Labels künstlich abgeleitet zu werden. Splits müssen Aufnahmeort/-zeit gruppieren, damit dieselbe Szene nicht in Training und Test landet.

### Vorgeschlagene Architektur

1. YAMNet zuerst auf dem Entwicklungs-PC als **Teacher/Baseline** auf freigegebenen Testclips ausführen. Das hilft, die Taxonomie an reale Vorhersagen und Verwechslungen anzupassen, ohne Audio über TTN zu senden.
2. Aufnahmen standort- und zeitlich getrennt labeln und testen; zufällige Clip-Aufteilung allein würde ähnliche Aufnahmen in Train und Test mischen.
3. Auf dem RAK einen quantisierten, kleinen **Studenten** mit SONYC-UST als öffentlicher Startbasis und anschließend eigenem Open-Ried-Sens-Datensatz evaluieren. Edge Impulse/C++-Export und TFLite Micro/ESP-NN sind Kandidaten; Auswahl nach Messung von Modellgröße, RAM, Laufzeit, Energie, Genauigkeit und Lizenz-/Datenverarbeitungsanforderungen.
4. Optional YAMNet direkt auf dem RAK benchmarken, bevor es ausgeschlossen wird: RAK3112 ist für den Build mit ESP32-S3 und OPI-PSRAM konfiguriert. Die nominelle RAM-/Flash-Möglichkeit allein belegt jedoch weder Echtzeitfähigkeit noch tragbare Leistungsaufnahme. 0,96-s-Inferenz mit 69,2 MMAC muss auf dem konkreten Board gemessen werden.
5. Produktionsgerät bleibt offline/inferenzfähig. Cloud- oder VPS-Inferenz von Roh-Audio ist kein Standardpfad. Falls für spätere Forschung Rohdaten erhoben werden, nur in einem expliziten, begrenzten und kontrollierten Aufnahmemodus mit separater Freigabe und Löschfrist.

**Vorläufige Empfehlung:** YAMNet als vorhandenes Multi-Label-Referenzmodell und Teacher nutzen, nicht ungeprüft als Produktionsmodell auf den RAK kopieren. Für den Regelbetrieb einen kompakten quantisierten Student auf dem Gerät benchmarken. Edge Impulse ist ein schneller Export-/Training-Prototyp, TFLite Micro bietet mehr lokale Build-Kontrolle. Die Entscheidung fällt nach einem Messprototyp und Daten-/Lizenzprüfung. So nutzen wir ein bestehendes Audio-ML, ohne dessen Klassenumfang mit lokaler Genauigkeit zu verwechseln.

## Geplanter Daten- und Uplink-Vertrag (noch nicht implementiert)

Die einzelne numerische `sound_event_class` ist für eine breite Multi-Label-Taxonomie ungeeignet. Vor dem ersten ML-Uplink wird deshalb ein neues, rückwärtskompatibles Payload-Format (voraussichtlich Format 6) mit separat typisierten kompakten Ereignisrecords spezifiziert. Jeder Record soll Taxonomie-ID, Fensterereigniszahl bzw. belegte Dauer und Score/Peak-Score enthalten; mehrere Klassen pro Fünf-Minuten-Fenster müssen möglich sein. Formate 3/4/5 bleiben unverändert dekodierbar. Es werden keine Audioframes, Embeddings oder Sprachinhalte per LoRaWAN übertragen.

In der kanonischen Datenbank sind Kandidaten:

- `sound_event_count` (`count`): Ereigniszahl je Klasse und Zeitfenster;
- `sound_event_score` (`1`): klar als Modellscore dokumentierter Scorewert;
- Klasse und Taxonomieversion als Dimensionen, Modellversion und Erfassungsmodus in Provenienz.

Die endgültige Kodierung muss die tatsächliche maximale LoRaWAN-Payloadgröße bei DR5, Uplink-Frequenz/Regeln und die konkurrierenden Umweltsensorwerte berücksichtigen. Bei zu wenig Platz dürfen keine häufigen Klassen still verdrängt werden: entweder wird ein dokumentiertes Top-K-/Prioritätsverfahren mit `other_dropped_count`-Diagnostik genutzt oder der Audio-Report bekommt einen eigenen zeitlich begrenzten Uplink. Jede Variante muss mit realistischen Worst-Case-Payloads und TTN-Dekodierung getestet werden.

Die ML-Messwerte werden mittels `write_measurement` nach `entities`, `measurement_definitions` und `readings` geschrieben. Die Definitionen müssen Klasse und Taxonomieversion eindeutig führen; die Lesepfade müssen kategoriale Ereigniswerte anders behandeln als kontinuierliche Schallpegel.

## Schritte und Freigabepunkte

1. **Vertrag/Doku:** aktuellen v11-/API-Stand angleichen (mit diesem Dokumentationsschritt); alte Code-41-Bedeutung als nicht implementiert markieren.
2. **Board-Baseline:** Firmware-/Chip-/PSRAM-/Heap-/I²S-Zustand per USB lesen; keine Session- oder LoRaWAN-Nonce-Daten löschen. Audiopegel und Capture-Kontinuität mit bestehender v11-Firmware prüfen.
3. **Taxonomie v1:** Slugs/IDs, Definitionen und Prioritäten aus dem Entwurf in [`audio-event-taxonomy-v1.json`](audio-event-taxonomy-v1.json) finalisieren; YAMNet-Klassen auf lokale Open-Ried-Sens-Fragen abbilden. Die dortigen IDs und Modell-Labels sind ausdrücklich noch Entwurf und müssen gegen die tatsächlich verwendete YAMNet-Klassenliste geprüft werden.
4. **Offline-Auswertung:** YAMNet-Modellversion und Lizenz dokumentieren, Datenfreigabe/-löschung festlegen, lokale Testaufnahmen kontrolliert auswerten. Standort- und Zeitgruppen als Testsplit verwenden.
5. **Kandidatbenchmark:** YAMNet und SONYC-UST als Referenz sowie mindestens einen quantisierten Student/Edge-Impulse- oder TFLite-Micro-Prototyp auf dem angeschlossenen RAK messen. Flash/Reset erst nach Sicherung von Geräteidentität, aktueller Firmware und Wiederherstellungsweg.
6. **Format 6 und End-to-End:** Protokollbeschreibung, JS-Decoder/Testvektoren, Webhook-Validierung, idempotente Speicherung, Tests für die drei Kerntabellen, API-Fensterantwort und Frontend-/Exportsemantik gemeinsam spezifizieren und implementieren.
7. **Gestufter Betrieb:** erst Testgerät verborgen, dann kontrollierte Testphase; Modell-/Taxonomie-Version, Gerätegesundheit, Datenabdeckung, Fehlklassifikationen und Payloadverluste messen, ehe weitere Sensoren ausgerollt werden.

## Arbeitsstand (20.10.2026)

- README, Formatvertrag und TTN-Ingestion-Dokumentation sind auf den aktuellen
  v11-/Drei-Tabellen-Schreibpfad gebracht; die frühere Code-41-Klassenbelegung
  wurde als nicht aktiv gekennzeichnet.
- Decoder-Protokolltests: 11 bestanden. Firmware v11 kompiliert mit der
  installierten ESP32-Plattform; Ergebnis: 424,675 Byte Programm (32 % des
  konfigurierten Limits), 28,316 Byte globale Variablen (8 % des Limits).
- USB-Baseline: `/dev/cu.usbmodem1101` wird als ESP32-Gerät erkannt. Der
  laufende Knoten meldet LoRaWAN `joined=yes`, rund 63 Audioblöcke/s und
  wechselnde RMS-Werte von ungefähr −38 bis −57 dBFS. Es wurde nichts
  geflasht oder zurückgesetzt.
- Prüfpunkt vor Modellintegration: Das Log meldet den ausgewählten logischen
  I²S-Slot `L`, obwohl die README für den Mikrofonpin L/R=HIGH erwartet. Das
  kann an der Slotnummerierung des Treibers liegen; vor Trainingsdatenaufnahme
  muss ein gezielter Stille-/Klatsch-/Testtonvergleich beider Slots die
  Kanalwahl bestätigen.
- YAMNet-Klassennamen wurden gegen die offizielle CSV (521 Klassen) geprüft;
  nicht existente Aliase wurden aus den Taxonomieentwürfen entfernt.
  Vorhandene Aliasnamen bleiben Kandidaten-Mappings und müssen mit annotierten
  Clips evaluiert werden. Diese Prüfung lässt sich reproduzieren:
  `python3 hardware/sensor-node/rak3112/tools/validate_audio_taxonomy.py /pfad/zu/yamnet_class_map.csv`.
- Der kurze Live-Pegelcheck bestätigte ca. 63 I²S-Blöcke/s und Slot `L`, aber
  keinen eindeutig zuordenbaren Klatschimpuls (beobachtet etwa −46 bis −35
  dBFS). Die Slotwahl ist daher noch nicht durch einen gezielten Test belegt.
- Noch offen: SONYC-UST-Mapping und Lizenz-/Datenprüfung, Taxonomie-IDs
  einfrieren, Modellkandidaten auf Zielhardware benchmarken und Format 6
  implementieren. Es wurden keine Audioaufnahmen erstellt.

### Abnahme für die erste produktive Audio-ML-Version

- bestehende Sensorwerte und Format-5-Uplinks bleiben kompatibel;
- Modell läuft ohne Netzwerkzugriff auf Roh-Audio;
- mehrere Soundklassen können pro Fenster vorkommen; unsichere Eingaben bleiben als solche gekennzeichnet;
- Klassen- und Modellversion sind für jedes gespeicherte Ergebnis rekonstruierbar;
- Counts/Scores landen korrekt und idempotent im Drei-Tabellen-Schema;
- Worst-Case-Uplink, CPU/RAM/Flash und Energie sind am RAK gemessen;
- Testgüte wird nach Klassen und Aufnahmebedingungen berichtet, nicht nur als globale Accuracy.

## Technische Referenzen

- [Google AudioSet event ontology](https://research.google.com/audioset/ontology/)
- [SONYC-UST v2.3 urban audio dataset](https://wp.nyu.edu/sonyc/resources/)
- [SONYC-UST v2.3 Zenodo record](https://zenodo.org/records/3966543)
- [TensorFlow YAMNet model and class map](https://github.com/tensorflow/models/tree/master/research/audioset/yamnet)
- [TensorFlow Lite Micro `micro_speech` example](https://github.com/tensorflow/tflite-micro/tree/main/tensorflow/lite/micro/examples/micro_speech)
- [Edge Impulse audio classification and embedded deployment](https://docs.edgeimpulse.com/docs/tutorials/end-to-end-tutorials/audio/audio-classification)
