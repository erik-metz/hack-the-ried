# Bildquellen für das Ried: Kandidatenprüfung am 10.10.2026

> Überholt durch das [vollständige regionale Inventar mit Bild- und Streamprüfungen](ried-webcam-vollinventar-2026-10-10.md). Die frühere Golfpark-Priorisierung gilt nicht mehr.

## Empfehlung

**Pilotkandidat: Golfpark Biblis-Wattenheim, alternativ Kiawah Golfpark Riedstadt.** Beide Betreiberseiten verlinken öffentlich erreichbare JPEG-Endpunkte. Ein Streamdecoder ist für diese Bildadressen voraussichtlich nicht erforderlich. Gernsheim bietet einen dritten Standort über denselben Anbieter, sodass nach einem erfolgreichen Pilotprojekt eine Erweiterung naheliegt.

Für keine geprüfte Quelle wurde eine ausdrückliche Freigabe für unseren automatisierten Abruf mit dauerhafter Speicherung und späterer Auswertung gefunden. Der nächste konkrete Schritt ist deshalb die Klärung mit dem Betreiber, parallel kann der Collector mit eigenen Testbildern vorbereitet werden. Es wurde niemand angeschrieben und kein produktiver Bildabruf eingerichtet.

## Geprüfte Kandidaten

HTTP-Messungen stammen aus kurzen Einzelprüfungen am 10.10.2026. `image/jpeg` ist die Serverdeklaration; Bildkörper wurden nicht heruntergeladen, dekodiert oder archiviert. Bildinhalt, Auflösung, genaue Blickrichtung, erkennbare Personen und tatsächlicher Aufnahmezeitpunkt sind damit **noch nicht geprüft**. Eine `.jpg`-Adresse oder HTTP 200 allein beweist keine funktionsfähige aktuelle Kamera. [Messprotokoll](evidence/ried-webcams-2026-10-10/http-checks.json)

| Priorität | Standort und Originalseite | Technischer Befund | Relevanz und offene Punkte |
| --- | --- | --- | --- |
| 1 | [Golfpark Biblis-Wattenheim](https://www.golf-absolute.de/biblis-wattenheim/) | Ein direktes JPEG, HTTP 200, zunächst 59.389 Byte; `Last-Modified` und ETag vorhanden | Standort im zentralen Untersuchungsgebiet. Möglicher Wetter-/Bodenbild-Pilot; tatsächlicher Bildausschnitt und Speicherfreigabe offen |
| 2 | [Kiawah Golfpark Riedstadt](https://www.golf-absolute.de/riedstadt/) | Ein direktes JPEG, HTTP 200, rund 70 kB. Zwischen zwei HEAD-Prüfungen nach rund 27 Sekunden änderten sich Dateigröße, ETag und `Last-Modified` | Nördliches Ried. Beste erste Änderungsindikation; noch keine gemessene Bildänderungsrate |
| 3 | [Golfresort Gernsheim](https://www.golf-absolute.de/gernsheim/) | Ein direktes JPEG, HTTP 200, zunächst 38.615 Byte; `Last-Modified` und ETag vorhanden | Ergänzender Standort in Gernsheim-Allmendfeld, **keine Rhein-/Hafenkamera**; Freigabe und Bildausschnitt offen |
| 4 | [Flugplatz Heppenheim / Aero-Club](https://aeroclub-heppenheim.de/webcam/) | Drei direkt verlinkte JPEG-Dateien, HTTP 200, rund 153/476/748 kB. Header zwischen den ersten beiden Prüfungen unverändert; Serveränderungszeit damals rund vier bis fünf Minuten alt | Östlicher Rand des regionalen Ausschnitts. Möglicher Sicht-/Wettervergleich; drei Ansichten, genaue Richtungen noch unbekannt. Nutzungsbeschränkungen im Impressum |
| 5 | [Melibokus, über Wetterseite Flugplatz Worms](https://www.flugplatz-worms.de/fuer-piloten/wetterinfos) | Der auf der Seite eingebundene Proxy meldet HTTP 200 und `image/jpeg`, ohne ETag/Last-Modified. Seite nennt neue Bilder alle fünf Minuten. Direkte Betreiber-HTTPS-Seite scheitert an abgelaufenem Zertifikat | Panoramablick Richtung Bensheim/Lorsch, daher potenziell für großräumige Wetterentwicklung. Kein Pilot über einen fremden Proxy; direkte Quelle, Betreiberzuständigkeit und Freigabe klären |
| 6 | [Flugplatz Worms](https://www.flugplatz-worms.de/fuer-piloten/wetterinfos) | Direkt eingebundenes Snapshot-JPEG, HTTP 200, gemeldete Länge 65.536 Byte. Ein einzelner aktueller Header belegt keine Bildfrische | Westliches Vergleichsgebiet, außerhalb des Hessischen Rieds. Betreiber verlangt Genehmigung zur Weiterverwendung; daher nachrangig |

Die Golfpark-Standorte sind durch die Betreiberseiten und Impressen belegt. Kamerakoordinaten werden daraus nicht erfunden: Anlagenadresse ist keine genaue Kameraposition. Golfkameras ersetzen keine Verkehrs-/Autobahnkameras und liefern keine validierte Straßenbelegung.

### Direkte Bildreferenzen

Diese URLs wurden aus den öffentlichen Betreiberseiten gelesen, nicht durch Scannen oder Raten ermittelt:

- Biblis-Wattenheim: <https://webcams.golf-absolute.de/golfcam_biblis.jpg>
- Riedstadt: <https://webcams.golf-absolute.de/kiawah.jpg>
- Gernsheim: <https://webcams.golf-absolute.de/golfcam_gernsheim.jpg>
- Heppenheim: <https://aeroclub-heppenheim.de/wp-content/uploads/webcam/webcam_latest_1.jpg>, entsprechend `webcam_latest_2.jpg` und `webcam_latest_3.jpg`.
- Worms: Snapshot-Pfad und Melibokus-Proxy sind im Messprotokoll enthalten. Den Proxy nicht als eigene Betreiberfreigabe interpretieren.

## Aktualisierung und Abrufrate

Eine abschließende HEAD-Prüfung gegen 12:25:55 UTC zeigte bei allen drei Golfkameras gegenüber der vorherigen Prüfung geänderte ETags und Dateigrößen. Auch Biblis und Gernsheim haben damit eine dokumentierte Änderungsindikation.

Geänderte Header sind eine erste Änderungsindikation, kein Nachweis geänderter Bildpixel. Für die drei Golfbilder gibt es noch kein vom Betreiber bestätigtes Intervall. Bei Heppenheim beweisen zwei unveränderte Antworten weder einen Ausfall noch eine feste Fünf-Minuten-Rate. Die Melibokus-Angabe von fünf Minuten stammt von der einbindenden Flugplatzseite, nicht aus einer eigenen Langzeitmessung.

Nach Freigabe: zunächst eine begrenzte Bildprobe mit einem Abruf pro Minute, Hashvergleich und Prüfung eingeblendeter Zeiten. Danach das Intervall an echte Bildwechsel und Betreiberlimits anpassen. Wenn die Quelle nur alle fünf Minuten aktualisiert, reicht dieser Abstand. Ein Zehn-Sekunden-Intervall ist derzeit für keinen Kandidaten belegt.

Planungsrechnung auf Grundlage der Größen aus den HEAD-Antworten, **keine gemessene Tagesmenge**: ein Biblis-Bild mit rund 60 kB jede Minute ergibt vor Deduplizierung etwa 86 MB pro Tag bzw. 2,6 GB für 30 Tage. Alle drei Golfbilder zusammen bei ihren beobachteten Größen und Minutenabruf etwa 243 MB pro Tag bzw. 7,3 GB für 30 Tage. Headergrößen können sich ändern; Aufbewahrung und Speicherlimit sind weiterhin erforderlich.

## Nutzungshinweise und erreichbare Ansprechpartner

- **Golfanlagen Weiland GmbH:** Auf den geprüften Webcam-Seiten und Impressen keine ausdrückliche Archiv-/API-Lizenz gefunden. Das ist keine Freigabe und auch keine Aussage, dass alle möglichen Vertragsbedingungen geprüft wurden. Ansprechpartner laut Impressen: [Biblis](https://www.golf-absolute.de/biblis-wattenheim/impressum/) `biblis@golf-absolute.de`, [Riedstadt](https://www.golf-absolute.de/riedstadt/impressum/) `kiawah@golf-absolute.de`, [Gernsheim](https://www.golf-absolute.de/gernsheim/impressum/) `gernsheim@golf-absolute.de`.
- **Aero-Club Heppenheim:** Das [Impressum](https://aeroclub-heppenheim.de/impressum/) beschränkt Downloads/Kopien auf privaten, nicht kommerziellen Gebrauch und nennt schriftliche Zustimmung für weitergehende Verwertung. Unser Projektarchiv ist davon nicht ausdrücklich gedeckt. Kontakt `info@aeroclub-heppenheim.de`.
- **Flugplatz Worms:** Die [Wetterseite](https://www.flugplatz-worms.de/fuer-piloten/wetterinfos) macht Kopieren und anderweitige Verwendung von Genehmigung abhängig. Den Melibokus-Ursprung nicht mit dem einbindenden Flugplatz gleichsetzen.

Dies ist eine Quellenprüfung der veröffentlichten Hinweise, keine abschließende rechtliche Bewertung. Für die Pilotplanung sollte eine schriftliche Zusage Abrufintervall, Aufbewahrung, interne Auswertung, etwaige öffentliche Darstellung, erforderliche Namensnennung und zuständigen Rechteinhaber ausdrücklich abdecken. Technische Erreichbarkeit erteilt keine Nutzungslizenz.

## Nicht als bestätigt übernommen

- Verzeichniseintrag „Biblis“ bei Wetterdach nennt selbst „Worms 10 km“. Das ist keine zuverlässige Bestätigung einer Kamera in Biblis. Der bestätigte Golfpark ist eine davon unabhängig auf der Betreiberseite belegte Quelle.
- Lorsch Altes Rathaus und Bensheimer Stadt-/Marktplatzkameras werden in Verzeichnissen genannt. In den begrenzt geprüften kommunalen/örtlichen Seiten wurde kein ausreichend belegter aktueller direkter Bildendpunkt samt Betreiberfreigabe identifiziert. Nicht als nicht existent deklarieren; derzeit unbestätigte Reservekandidaten.
- Für Gernsheimer Rheinufer/Hafen wurde keine bestätigte Bildquelle gefunden. Eine kommunale Fotoseite ist keine Webcam.
- Aggregatoren mit Seiten für jeden Ortsnamen liefern teils weit entfernte Nachbarkameras. Keine automatische Übernahme von Ortsnamen, Aktualisierungsangaben oder Bildrechten.

## Vorschlag für die Betreiberanfrage – nicht versandt

Betreff: Webcam-Bilder für regionales Wetterdatenprojekt HackTheRied

Wir möchten die öffentlich bereitgestellte Webcam am Golfpark Biblis-Wattenheim für ein regionales Datenprojekt nutzen: zunächst höchstens ein Bild pro Minute, Speicherung auf unserem VPS für einen Pilotzeitraum von 30 Tagen und interne Auswertung von Wetter-/Sichtveränderungen. Eine öffentliche Bilddarstellung würden wir gesondert abstimmen. Können Sie diese Nutzung erlauben und uns das tatsächliche Aktualisierungsintervall, zulässige Abruflimits, Anforderungen an Quellenangaben und die Zuständigkeit für die Bildrechte bestätigen? Falls ein anderer Bildausschnitt oder ein bereitgestellter Zugang besser geeignet ist, richten wir uns danach.

## Umfang dieses Schritts

Recherche und kurze Metadatenprüfungen abgeschlossen. Dokumentation und HTTP-Evidenz werden versioniert. Keine Bilder gespeichert, kein Collector/VPS geändert, keine Betreiber angeschrieben. Für reine Dokumentationspfade sehen die aktuellen Frontend-/VPS-Workflowfilter keinen CI-Lauf vor; geprüft werden Datenstruktur und Dokumentationsdiff.
