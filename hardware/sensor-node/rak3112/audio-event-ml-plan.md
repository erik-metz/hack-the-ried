# HackTheRied: Audioereignisse mit RAK3112

## Ziel und Grenzen

Die RAK-Sensoren sollen wiederkehrende Geräuschereignisse des öffentlichen Außenraums in möglichst vielen Stadtteilen erfassen. Zusammen mit Temperatur, Wetter, Luft-/Gasindikatoren, Licht und Standort sollen die Daten später räumliche und zeitliche Muster für HackTheRied und Hackathons ermöglichen. Das Ergebnis ist eine statistische Beschreibung von Geräuschereignissen, keine Aufnahme, Transkription oder Identifikation von Personen.

Im Regelbetrieb werden keine Roh-Audios, Sprachinhalte, Stimmenmerkmale, Personen- oder Fahrzeugidentitäten übertragen oder dauerhaft gespeichert. „Sprache“ bedeutet ausschließlich erkannte Sprachaktivität. Eine Aussage wie „Postauto“ ist aus dem Geräusch allein meist nicht belegbar; klassifiziert werden darf höchstens ein akustisch erkennbarer Fahrzeugtyp bzw. ein Fahrgeräusch. Privatgrundstücke, Nachbarbereiche und mögliche Rückschlüsse auf Einzelpersonen sind bei Geräteplatzierung, Testaufnahmen und Veröffentlichung besonders zu berücksichtigen. Vor dem Sammeln gelabelter Rohaufnahmen und vor einem breiten Rollout sind Zweck, Einwilligung/Information, Zugriff, Aufbewahrung und lokale rechtliche Anforderungen gesondert zu prüfen.

## Derzeitiger technischer Vertrag (Firmware v11/v12-Prototyp)

- ICS-43434: Firmware v11 verarbeitet kontinuierliches I²S mit 16 kHz und wählt den aktiven Mikrofonkanal aus zwei Slots; dort gibt es noch keine Inferenz. Der v12-Prototyp ergänzt die lokale Klassifikation (siehe unten).
- Erfasste Audioverarbeitung: 256 Frames (16 ms) pro Block; fünfminütige Fenster und Format-5-LoRaWAN-Uplink auf FPort 10.
- Gesendet wird `sound_level` in unkalibriertem dBFS mit Min/Mean/Max und Sample Count. Es ist weder dB SPL noch dB(A).
- Protokollcodes 40 (`sound_dominant_frequency`) und 41 (`sound_event_class`) sind im gemeinsamen Decoder reserviert, aber v11 emittiert sie nicht. Die bisherige Beschreibung der Werte 0–3 für Code 41 ist nur ein veralteter Vorschlag und kein aktiver ML-Vertrag.
- Firmware v12 führt einen experimentellen lokalen ESC-50-Klassifikator aus und gibt Top-3-Diagnosewerte ausschließlich über USB-Serial aus. Das TTN-Uplink bleibt Format 5 ohne Klassifikation; es gibt daher noch keine ML-Schreibvorgänge in `entities`, `measurement_definitions` oder `readings`.
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

- **YAMNet** ist ein sinnvoller akustischer Lehrer und Offline-Baseline: das offizielle Modell klassifiziert 521 AudioSet-Klassen, nimmt 16-kHz-Mono an, verwendet 0,96-s-Fenster, hat 3,7 Mio. Gewichte und benötigt ca. 69,2 Mio. Multiplikationen pro Fenster. Damit deckt es viele Alltagsgeräusche ab, liefert aber keine Garantie für lokale Ried-Geräusche und wurde auf AudioSet-/YouTube-Material trainiert. Der TensorFlow-Modellcode ist Apache-2.0-lizenziert; vor einer Weitergabe oder Firmware-Einbettung müssen die Bedingungen des konkreten vortrainierten Checkpoints separat im Modellangebot geprüft werden.
- **TFLite Micro `micro_speech`** ist kein passendes fertiges Modell: das Espressif-Beispiel erkennt nur zwei Sprachbefehle plus `unknown`/`silence`.
- **Edge Impulse Audio Classification** exportiert einen vollständigen DSP-und-Modell-C++-Pfad für eingebettete Ziele und ist für einen selbst gelabelten, quantisierten RAK-Prototyp geeignet. Es bringt aber kein fertiges Modell mit dieser gewünschten lokalen Stadtgeräusch-Taxonomie mit; dafür brauchen wir eigene passende Trainings- und Testdaten.

### Urbane Referenzdaten

- **SONYC-UST v2.3** ist der passendste erste externe Vergleichsdatensatz: die versionsgebundene Zenodo-Beschreibung nennt 18.515 mehrlabelige 10-Sekunden-Aufnahmen aus einem urbanen Sensornetz, 23 Klassen und 1.380 fachlich verifizierte Aufnahmen. Die NYU-Übersichtsseite nennt abweichend 1.385; für reproduzierbare Arbeit gilt die konkrete Datenversion samt Manifest. Das Dataset eignet sich für einen Urban-Sound-Baseline-Lauf, deckt aber nur einen Teil unserer feineren Taxonomie ab. Die Aufnahmen stammen aus New York und ersetzen keine Ried-/Außenstandort-Validierung. Vor einem Trainingslauf werden Nutzungsbedingungen und konkrete Audio-Datei-Lizenzen geprüft; zunächst reichen Annotationen und ein kleiner, gezielter Testsatz. [NYU SONYC-Ressourcen](https://wp.nyu.edu/sonyc/resources/), [SONYC-UST v2.3 auf Zenodo](https://zenodo.org/records/3966543).
- **YAMNet** bleibt davon getrennt die allgemeine AudioSet-Referenz mit 521 Ausgabeklassen. Seine Scores und Labels sind Vorschläge für Taxonomie-Zuordnungen, keine lokalen Ground-Truth-Labels.
- Erste Evaluation: SONYC-verifizierte Clips für passende Klassen (z. B. Motoren, Maschinen- und Nichtmaschinen-Impulse, Sägen, Warnsignale, Musik, menschliche Stimme und Hunde) verwenden; dazu eine explizite Zuordnung SONYC → HackTheRied → YAMNet. Mehrdeutige Quellelabels bleiben auf einer gröberen Ebene oder `unmapped`, statt als feinere Klasse ausgegeben zu werden. Die offiziellen train/validation-Splits sind sensorgetrennt; der Testsplit ist zeitlich nachgelagert, kann aber dieselben Sensoren enthalten. Sie sind deshalb eine brauchbare Benchmark-Aufteilung, jedoch kein Beleg für Generalisierung auf deutsche Standorte. Für eigene Daten sind Aufnahmeort und -zeit strikt zu gruppieren.
- Eine lokale Prüfung nur der v2.3-Annotationen (ohne Audio- oder Ortsdaten zu behalten) ergab 1.380 Ground-Truth-Clips. Die Klassen sind stark unausgewogen: `engine` ist in 732 Clips markiert, `human-voice` in 619; einzelne feine Klassen wie `car-alarm`, `large-crowd` und `ice-cream-truck` haben jeweils nur einen positiven Ground-Truth-Clip. Daher taugt dieser Stand als Baseline/Taxonomie-Mapping, aber nicht zum Training sämtlicher Feinklassen ohne zusätzliche Daten oder vorsichtiges Zusammenlegen seltener Klassen.

### Lokale YAMNet-Baseline (PC-Prototyp)

Ein erster Offline-Auswerter liegt in [`tools/yamnet_baseline.py`](tools/yamnet_baseline.py). Er akzeptiert nur mono 16-kHz-WAV, liest Audio in den Arbeitsspeicher, meldet die über Modellframes gemittelten YAMNet-Scores und speichert keine Audiodaten oder Ergebnisdatei. Die Scores sind unkalibriert und werden nicht automatisch in HackTheRied-Klassen umetikettiert. Nutzung in einer isolierten Umgebung:

```sh
python3 -m venv /tmp/hack-the-ried-audio-venv
/tmp/hack-the-ried-audio-venv/bin/pip install -r hardware/sensor-node/rak3112/tools/audio-baseline-requirements.txt
/tmp/hack-the-ried-audio-venv/bin/python hardware/sensor-node/rak3112/tools/yamnet_baseline.py --top-k 20 /pfad/zu/freigegebenem-testclip.wav
```

Der Lauf lädt das vortrainierte Modell von TensorFlow Hub; nur Modellartefakte werden abgerufen, der WAV-Inhalt wird nicht hochgeladen. Für belastbare Auswertungen sollen Modell-URL, Paketversionen, Clip-ID/Hash statt personenbezogener Dateipfade und Testsplit protokolliert werden. Dieser PC-Prototyp ist noch kein RAK-Echtzeitbenchmark.

Für einen echten, aber absichtlich kleinen Vergleich gibt es [`tools/evaluate_sonyc_yamnet.py`](tools/evaluate_sonyc_yamnet.py). Der Lauf nutzt nur `annotator_id=0` aus dem offiziellen Testsplit, wertet WAV-Dateien aus einem oder mehreren lokalen Tar-Archiven direkt aus dem Arbeitsspeicher aus und gibt ausschließlich aggregierte ROC-AUC-Werte aus. Die eingebauten Quellklassen-zu-YAMNet-Zuordnungen sind grob und ausdrücklich noch nicht als finale Taxonomie bestätigt.

### Vorgeschlagene Architektur

1. YAMNet zuerst auf dem Entwicklungs-PC als **Teacher/Baseline** auf freigegebenen Testclips ausführen. Das hilft, die Taxonomie an reale Vorhersagen und Verwechslungen anzupassen, ohne Audio über TTN zu senden.
2. Aufnahmen standort- und zeitlich getrennt labeln und testen; zufällige Clip-Aufteilung allein würde ähnliche Aufnahmen in Train und Test mischen.
3. Auf dem RAK einen quantisierten, kleinen **Studenten** mit SONYC-UST als öffentlicher Startbasis und anschließend eigenem HackTheRied-Datensatz evaluieren. Edge Impulse/C++-Export und TFLite Micro/ESP-NN sind Kandidaten; Auswahl nach Messung von Modellgröße, RAM, Laufzeit, Energie, Genauigkeit und Lizenz-/Datenverarbeitungsanforderungen.
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
3. **Taxonomie v1:** Slugs/IDs, Definitionen und Prioritäten aus dem Entwurf in [`audio-event-taxonomy-v1.json`](audio-event-taxonomy-v1.json) finalisieren; die dortigen IDs bleiben Entwurf. Der aktuelle ESC-50-Klassenindex ist ein separater Benchmark-Ausgaberaum und darf nicht als HackTheRied-ID behandelt werden.
4. **Offline-Auswertung:** YAMNet-Modellversion und Lizenz dokumentieren, Datenfreigabe/-löschung festlegen, lokale Testaufnahmen kontrolliert auswerten. Standort- und Zeitgruppen als Testsplit verwenden.
5. **Kandidatbenchmark:** Ein quantisiertes TFLite-Micro-Modell ist als v12-Prototyp auf dem RAK ausgeführt und gemessen (Ergebnisse unten). YAMNet bleibt PC-Teacher/Referenz; der RAK-Prototyp ist wegen der erzwungenen Single-Label-Ausgabe und beobachteter Fehlklassifikationen noch kein produktionsreifes Modell.
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
- Der lokale YAMNet-Prototyp läuft mit TensorFlow 2.21 auf einem synthetischen
  440-Hz-Ton. YAMNet stufte diesen Ton vor allem als `Telephone`, `Busy signal`
  und `Alarm` ein; der Modellaufruf dauerte auf diesem Entwicklungs-PC 128 ms.
  Das ist ein technischer Smoke-Test, kein akustischer
  Genauigkeitsnachweis; es zeigt konkret, warum Scores nicht direkt als
  Stadtklassen gespeichert werden dürfen. Der WAV-Testton wurde danach gelöscht.
- Ein lokaler Stichprobentest gegen 21 fachlich verifizierte Testclips aus
  SONYC-UST `audio-18.tar.gz` (Archiv-MD5 `c6b2ef4d0d5b7269d465c469cdbbdc4b`)
  ergab ROC-AUC 0,53 für Motoren (12 positiv/9 negativ), 0,62 für
  Nichtmaschinen-Impulse (8/13) und 0,97 für Sprache (11/10). Die übrigen
  abgebildeten Klassen hatten jeweils nur ein bis vier positive Clips; deren
  AUC-Werte sind nicht belastbar. Das ist ein einzelner Shard und eine
  vorläufige grobe Zuordnung, kein repräsentativer Modellvergleich. Archiv und
  Annotationen wurden danach gelöscht.
- Noch offen: SONYC-UST-Mapping und Lizenz-/Datenprüfung, Taxonomie-IDs
  einfrieren, YAMNet gegen annotierte Urban-Clips evaluieren, Modellkandidaten
  weiter evaluieren und Format 6 implementieren. Es wurden keine
  Umgebungsaufnahmen erstellt.

### Firmware v12: erster RAK-Audioklassifikator (20.10.2026)

- Die getrennte Firmware `v12/` verwendet ACDNet20 ESC-50 Fold 4, INT8
  (50 Klassen), TFLite Micro und die im ESP32 Arduino Core enthaltene
  Espressif-Implementierung. Die verwendete TFLite-Datei ist 156.288 Byte;
  ihre SHA-256-Prüfsumme und Modellherkunft stehen in [`v12/README.md`](v12/README.md).
- Der RAK3112 mit `rak3112_002` läuft mit v12. Boot meldete ESP32-S3 bei
  240 MHz, 16 MB Flash und 8 MB OPI-PSRAM. Die vorhandene LoRaWAN-Sitzung
  wurde wiederhergestellt (`joined=yes`); ein gewöhnlicher Format-5-Uplink
  wurde danach beobachtet.
- Build: 678.138 Byte Programmcode von maximal 1.310.720 Byte App-Partition
  (51 %), 28.788 Byte statische globale Variablen. Tensor-Arena: 373.276 Byte
  tatsächlich genutzt, aus einer 768-KiB-PSRAM-Reservierung. Freier interner
  Heap sank von 336.468 Byte beim Start auf rund 293.308 Byte im Betrieb;
  freier PSRAM nach Setup/Inferenz lag bei rund 7.483.316 Byte.
- Für nicht überlappende Audiofenster von 1,51 s maß das Board 20–21 ms
  Vorverarbeitung und 264–266 ms TFLite-Inferenz. Die I²S-Task lieferte
  weiterhin etwa 63 Blöcke/s; in ungefähr 70 Sekunden Beobachtung wurden
  keine Samples verworfen. Der Inferenz-Task hatte noch 13.692 Byte Stack-
  High-Water-Mark bei einem 16-KiB-Stack.
- Vorverarbeitung plus Inferenz beanspruchten in dieser Messung etwa 19 % der
  Fensterzeit eines Prozessorkerns. Es wurde kein Strommessgerät verwendet;
  elektrische Leistungsaufnahme und Joule pro Klassifikation sind offen.
- Im ruhigen Raum klassifizierte das Modell wiederholt `mouse_click` und
  `fireworks`, obwohl keine solchen Ereignisse beabsichtigt erzeugt wurden.
  Das zeigt die Schwäche des ESC-50-Modells für den aktuellen Standort und
  das Fehlen einer `unknown`-/Stille-Klasse. Diese Werte sind nur
  Diagnostikwerte: weder uploaden noch als bestätigte Ereignisse speichern.
- ESC-50 ist CC BY-NC 3.0; ACDNet-Code ist MIT. Die Modellverwendung ist für
  den nicht-kommerziellen Prototyp dokumentiert. Vor einem kommerziellen
  Einsatz oder einer weitergehenden Modellweitergabe sind Rechte zu klären.
- Es findet kein Online-Lernen auf dem Gerät statt. Für „on the go lernen“
  sammeln wir künftig nur separat freigegebene Labels/Fehlklassifikationen
  oder kontrollierte Trainingsclips, trainieren/validieren neue Versionen
  außerhalb des Sensors und verteilen ein versioniertes Modell. Roh-Audio
  wird im aktuellen v12 nur in flüchtigen PSRAM-Puffern gehalten.

### Modellbewertung und Ausblick

- **Rolle von ACDNet20 / ESC-50:**
  Diente erfolgreich als hardwarenaher Machbarkeitsnachweis (Bring-up/Baseline) für TFLite Micro, Resampling, PSRAM-Verwaltung und INT8-Inferenz auf dem ESP32-S3. Für den produktiven Außenraumeinsatz ist es jedoch unzureichend: ESC-50 erzwingt eine Single-Label-Entscheidung aus 50 isolierten Soundeffekten (oft Haushaltsgeräusche) ohne native Stille-, Umgebungsrausch- oder Multi-Label-Unterstützung.
- **Zielmodell (Micro-Student):**
  Für spätere Versionen soll ein schlankes, direkt mit 16 kHz trainiertes Modell (ohne Resampling-Overhead) eingesetzt werden. Trainingsgrundlage sind urbane Datensätze (z. B. SONYC-UST, UrbanSound8K oder gezielte AudioSet-Auszüge via YAMNet-Teacher) mit expliziten Klassen für `silence` und `ambient_noise`.
- **Audio-Initialisierung und Kalibrierung (Audio Initializer Konzept):**
  Um den `silent_threshold` dynamisch und standortgerecht zu bestimmen, soll ein Kalibrierungsmodus dokumentiert und vorbereitet werden:
  - *Trigger:* Einmalig beim ersten Kaltstart nach dem Booten oder periodisch einmal täglich in der Nacht (z. B. zwischen 02:00 und 04:00 Uhr, wenn minimale Umweltaktivität herrscht).
  - *Ablauf:* Der Sensor misst über mehrere Fenster (z. B. 30–60 Sekunden) das Grundrauschen des ICS-43434-Mikrofons und ermittelt den Rauschflur (Noise Floor RMS in dBFS).
  - *Funktion:* Der Stille-Schwellwert (`silent_threshold`) wird auf `noise_floor + Offset` (z. B. +6 dB) gesetzt. Fenster unterhalb dieses Werts überspringen die Vorverarbeitung und Inferenz komplett.
- **Datenpfad & Frontend-Fokus:**
  Eine Frontend-Visualisierung in der Kartenansicht entfällt für diese Phase; die aggregierten Geräuschereignisse werden autoritativ im Drei-Tabellen-Schema (`readings`) abgelegt und stehen dort direkt für Hackathons, Exporte und Auswertungen bereit.

### Abnahme für die erste produktive Audio-ML-Version

- bestehende Sensorwerte und Format-5-Uplinks bleiben kompatibel;
- Modell läuft ohne Netzwerkzugriff auf Roh-Audio;
- mehrere Soundklassen können pro Fenster vorkommen; unsichere Eingaben bleiben als solche gekennzeichnet;
- Klassen- und Modellversion sind für jedes gespeicherte Ergebnis rekonstruierbar;
- Counts/Scores landen korrekt und idempotent im Drei-Tabellen-Schema;
- Worst-Case-Uplink, CPU/RAM/Flash und Energie sind am RAK gemessen;
- Testgüte wird nach Klassen und Aufnahmebedingungen berichtet, nicht nur als globale Accuracy.

### Live-Integrationsaudit (21.10.2026)

- Der angeschlossene Knoten sendet bereits Firmware v12 und Payload-Format 6.
  TTN empfängt Uplinks von `rak3112-002` auf FPort 10 (zuletzt im Live-Stream
  um 15:46 Uhr MESZ), kann sie mit dem aktuell in der TTN-Konsole gespeicherten
  Formatter aber nicht dekodieren: `Unsupported payload version: 6`. Der dort
  aktive Formatter akzeptiert nur Versionen 3, 4 und 5.
- TTN protokolliert nach diesen Decode-Fehlern `Fail to send webhook`; ein
  zugehöriger Webhook-Aufruf an die VPS endet außerdem mit HTTP 422. Das ist
  eine Folge des fehlenden `decoded_payload`, kein Hinweis auf einen Fehler in
  der Funkverbindung. Der Webhookpfad ist damit nicht kompatibel mit der im
  Repository implementierten Format-6-Version.
- Die VPS-Datenbank enthält für `rak3112-002` 427 angenommene Uplink-Receipts;
  der letzte gespeicherte Empfang ist **20.10.2026 22:21:39 MESZ**. In den
  gespeicherten Altwerten gibt es `sound_level`, aber keine
  `sound_event_count`-Messwerte; in der kanonischen Tabelle `readings` stehen
  177 `sound_level`-Werte und ebenfalls kein `sound_event_count`. Die aktuellen,
  fehlgeschlagenen TTN-Uplinks erreichen die Datenbank folglich nicht. Die
  API-Leseendpunkte antworten weiterhin 200, liefern für diesen Sensor aber
  nur den alten Datenstand.
- Im Repository enthält [`v1/payload-formatter.js`](v1/payload-formatter.js)
  den geprüften Format-6-Decoder; VPS-Webhook und kanonischer `readings`-
  Schreibpfad unterstützen `sound_events`. Am 21.10.2026 wurde der veraltete
  Formatter in der TTN-Anwendung `my-gps-tracker-2026` auf den vollständigen
  Codebuch-/Format-6-Vertrag aktualisiert. Der nächste reale Uplink wurde als
  Format 6, Firmware 12 und 300-Sekunden-Fenster dekodiert; TTN zeigte
  `sound_events: []`. Der VPS-WebHook antwortete auf genau diesen Uplink mit
  HTTP 200. Die Receipt-Zahl stieg auf 428; `readings` erhielt die neuen
  Fensterwerte (für `sound_level` jetzt 180 Werte, letzter Wert −36,7 dBFS).
  Die aktuellen API-Abfragen für `latest/metrics`, `latest/window` und
  `aggregates` antworten weiterhin mit HTTP 200. Damit ist der Format-6-
  Telemetriepfad bis in die vom Frontend verwendeten API-Lesepfade wieder aktiv.
- In diesem Uplink war `sound_events` leer; deshalb wurde korrekt kein
  `sound_event_count` geschrieben. Der positive Klassifikationspfad ist durch
  Decoder- und VPS-Writer-Tests im Repository abgedeckt, aber noch nicht durch
  ein reales Ereignis im Produktivgerät belegt. Das bleibt die nächste
  fachliche Abnahme. Der bestehende Plan sieht derzeit keine eigene
  ML-Kartenvisualisierung vor; die Werte sind für API, Exporte und Auswertung
  verfügbar.
- Kein erneutes Flashen war für diese Diagnose erforderlich: das Board sendet
  Format 6 bereits. Ein Flash würde den TTN-Formatter-Fehler nicht beheben.
  Die serielle Schnittstelle `/dev/cu.usbmodem1101` war vorhanden, lieferte
  während des kurzen Monitor-Aufrufs aber keine neue Ausgabe; die Funk-/TTN-
  Evidenz bestätigt den laufenden Knoten unabhängig davon.

**Status:** Der Ausfall durch den veralteten TTN-Formatter ist behoben; ein
Format-6-Sensorfenster hat TTN → VPS-Webhook → Receipt/`readings` → API-Leseweg
erfolgreich durchlaufen. Ein echtes ML-Ereignis mit `sound_event_count`, die
darauf folgende Produktivpersistenz sowie Klassifikationsgüte am RAK bleiben
offen. Der ESC-50-Prototyp bleibt bis zu dieser fachlichen Abnahme
experimentell.

## Technische Referenzen

- [Google AudioSet event ontology](https://research.google.com/audioset/ontology/)
- [SONYC-UST v2.3 urban audio dataset](https://wp.nyu.edu/sonyc/resources/)
- [SONYC-UST v2.3 Zenodo record](https://zenodo.org/records/3966543)
- [TensorFlow YAMNet model and class map](https://github.com/tensorflow/models/tree/master/research/audioset/yamnet)
- [TensorFlow Lite Micro `micro_speech` example](https://github.com/tensorflow/tflite-micro/tree/main/tensorflow/lite/micro/examples/micro_speech)
- [Edge Impulse audio classification and embedded deployment](https://docs.edgeimpulse.com/docs/tutorials/end-to-end-tutorials/audio/audio-classification)
