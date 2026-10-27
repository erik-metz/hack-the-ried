# Hofheim und Hüttenfeld: Weihnachtsmärkte 2026

## Umsetzung

Die neue Quelle `lampertheim-district-christmas-markets` liest die [offizielle Stadtmarketing-Seite](https://www.stadtmarketing-lampertheim.de/stadtmarketing/events/Weihnachtsmaerkte.php) alle sechs Stunden. Der Adapter `verified_christmas_markets.py` übernimmt ausschließlich die zwei im Rechercheschritt bestätigten Ortsteil-Märkte:

| Veranstaltung | Öffnungstag und Ortszeit | Ort |
| --- | --- | --- |
| Howwemer Weihnachtsmarkt | 05.12.2026, 16–21 Uhr | Rund ums Bürgerhaus Hofheim, Lampertheim-Hofheim |
| Howwemer Weihnachtsmarkt | 06.12.2026, 15–19 Uhr | Rund ums Bürgerhaus Hofheim, Lampertheim-Hofheim |
| Hüttenfelder Weihnachtsmarkt | 12.12.2026, 15–21 Uhr | Rund ums Bürgerhaus Hüttenfeld, Lampertheim-Hüttenfeld |

Die zwei Märkte ergeben drei tägliche Kalendereinträge. Damit zeigt der Kalender keine durchgehende Öffnung über Nacht. Stabile Kennungen verhindern zusätzliche Einträge bei wiederholtem Import. Die Originalquelle wird archiviert. Unbekannte Eintrittspreise werden ausdrücklich als unbekannt beschrieben; eine kostenlose Teilnahme wird nicht behauptet.

Die normalisierten Textabschnitte einschließlich Veranstaltungsbereich, Jahreszahl und Öffnungszeiten sind mit SHA-256 an die am 09.10.2026 überprüften Originalangaben gebunden. Fehlende oder doppelte Abschnitte sowie geänderte Angaben brechen den Import ab; die letzte erfolgreiche Veröffentlichung bleibt erhalten. Änderungen an anderen Märkten lösen keine automatische Übernahme zusätzlicher Veranstaltungen aus. Es gibt keine jährliche Fortschreibung.

Die bereits vorhandenen Hauptmarkt-Einträge und der Schlosshofzauber bleiben Gegenstand des gesonderten Korrekturschritts aus [der Adventsrecherche](ried-events-advent-weihnachten-2026-10-09.md).

## Prüfung

Die neue Testsuite prüft die drei unterschiedlichen täglichen Zeitfenster, Ortszuordnung, stabile Kennungen, unbekannte Preise, Jahres-/Datums-/Zeit-/Ortsänderungen, fehlende und doppelte Abschnitte sowie den wiederholten Datenbankimport und den Erhalt der letzten erfolgreichen Veröffentlichung bei Quellenänderungen. Der Parser wurde zusätzlich gegen den frisch abgerufenen vollständigen Original-HTML-Inhalt geprüft.

Der vollständige Worker-Testlauf mit temporärer TimescaleDB war erfolgreich: **431 Tests bestanden** (88,32 Sekunden), einschließlich der neun neuen Adapter- und Datenbanktests. Die Lint-Prüfung der geänderten Python-Dateien sowie `git diff --check` waren erfolgreich. Veröffentlichung und produktive Prüfung werden nach Abschluss ergänzt.

## Veröffentlichung und produktiver Nachweis

- Implementierung: Commit `2c3a399f7f326a6493e4a70fb4884993473c6314`, auf `main` gepusht.
- [FastAPI & Docker CI/CD, Lauf 37928126033](https://github.com/erik-metz/hack-the-ried/actions/runs/37928126033): für genau diesen Commit vollständig erfolgreich; Job „Build & Push Docker Image to GHCR“ und alle 17 vorgesehenen Container-Veröffentlichungen erfolgreich. Kein Frontend-Lauf erforderlich.
- Produktives Worker-Image: `sha256:6901e952d488a01ede3aa8eef6bb780dd3706dcc40d558e5f12e3e318139eac3`. Vor Aktivierung wurden der neue Adapter und seine Quellkonfiguration anhand ihrer Inhalte sowie sämtliche bisherigen Quellkonfigurationen auf unveränderte Übernahme geprüft.
- Compose-Sicherung: `/root/docker-compose.invekos.yml.before-christmas-20261009`. Ausschließlich der Registry-Sync-Worker wurde neu gestartet.
- Worker-Start: 09.10.2026, 12:18:32 UTC; anschließend `running`, keine Neustarts.
- Neue Quelle: erfolgreiche Erfassung mit HTTP 200 um 12:18:34 UTC, Verarbeitung erfolgreich abgeschlossen.
- Öffentliche API: genau die drei oben dokumentierten Tagesfenster mit korrekten Orten und Ortszeiten; Gesamtdatensatz beim Abschluss 345 Ereignisse. Die Gesamtzahl kann sich durch parallel laufende Quellen ändern.
- Öffentlicher Kalender im Browser: Lampertheim, Listenansicht, Suche „Weihnachtsmarkt“ zeigt beide Howwemer Öffnungstage und den Hüttenfelder Weihnachtsmarkt mit den richtigen täglichen Zeiten und Veranstaltungsorten.

Die abschließende Nachweisdokumentation betrifft ausschließlich `docs/`; hierfür sehen die CI-Pfadfilter keinen weiteren Lauf vor.
