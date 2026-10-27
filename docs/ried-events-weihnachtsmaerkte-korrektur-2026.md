# Lampertheimer Weihnachtsmärkte: gezielte Korrektur 2026

## Belegter Stand vom 09.10.2026

Die [Stadtmarketing-Seite](https://www.stadtmarketing-lampertheim.de/stadtmarketing/events/Weihnachtsmaerkte.php) nennt ausdrücklich die Öffnungszeiten 2026. Für den Hauptmarkt bestätigt die [städtische Sonderseite](https://www.lampertheim.de/de/freizeit-kultur/veranstaltungen/weihnachtsmarkt.php) den 03.–06.12.2026 auf dem Schillerplatz. Die allgemeine Kalenderquelle enthält abweichende Datums- und Ortsfelder.

| Veranstaltung | Tag 2026 | Öffnungszeiten Europe/Berlin | Ort |
| --- | --- | --- | --- |
| Lampertheimer Weihnachtsmarkt | 03.12. | 17–22 Uhr | Schillerplatz und Kaiserstraße ab Hausnummer 21 |
| Lampertheimer Weihnachtsmarkt | 04.12. | 17–22 Uhr | Schillerplatz und Kaiserstraße ab Hausnummer 21 |
| Lampertheimer Weihnachtsmarkt | 05.12. | 14–22 Uhr | Schillerplatz und Kaiserstraße ab Hausnummer 21 |
| Lampertheimer Weihnachtsmarkt | 06.12. | 14–20 Uhr | Schillerplatz und Kaiserstraße ab Hausnummer 21 |
| Schlosshofzauber / Neuschlosser Weihnachtsmarkt | 28.11. | 15–22 Uhr | Schloßhof Neuschloß |
| Schlosshofzauber / Neuschlosser Weihnachtsmarkt | 29.11. | 13–19 Uhr | Schloßhof Neuschloß |

Die [kommunale Schlosshofzauber-Seite](https://www.lampertheim.de/de/veranstaltungen/termine/extern/schlosshofzauber_1786955182.php) bestätigt Veranstaltungsname und Veranstalter Ortsbeirat Neuschloss / Die Meute e.V.; ihr Gesamtzeitraum endet abweichend am Sonntag um 22 Uhr. Maßgeblich für die täglichen Öffnungszeiten ist die ausdrücklich mit 2026 bezeichnete Stadtmarketing-Veröffentlichung.

## Umsetzung

Der bestehende Adapter `verified_christmas_markets.py` und seine Quelle `lampertheim-district-christmas-markets` werden um die vier Hauptmarkt-Tage und zwei Schlosshofzauber-Tage erweitert. Die drei bereits bestätigten Öffnungstage für Hofheim und Hüttenfeld behalten ihre Kennungen, Uhrzeiten und Orte. Insgesamt liefert die Quelle nun neun tägliche Öffnungsfenster für vier Märkte. Nachtpausen werden nicht als Öffnungszeit ausgegeben. Unbekannte Eintrittspreise bleiben ausdrücklich unbekannt.

Die vier normalisierten Originalabschnitte sind mit ihren geprüften SHA-256-Werten gebunden. Die Jahreszahl, Datumsangaben, täglichen Zeiten und Veranstaltungsbereiche müssen unverändert vorliegen; fehlende, doppelte oder geänderte Abschnitte brechen die Verarbeitung ab. Footer-Änderungen sind hiervon unabhängig. Keine jährliche Fortschreibung.

`event_replacements.py` grenzt die Ersetzung auf die Quelle `lampertheim-events`, das Veranstaltungsjahr 2026 in Europe/Berlin und genau drei Original-URLs ein:

- `weihnachtsmarkt_1768206666.php` (27.–29.11., Domplatz).
- `weihnachtsmarkt-lampertheim_1768206725.php` (04.–06.12., Domplatz).
- `schlosshofzauber_1786955182.php` (28.–29.11., bisher Sonntag bis 22 Uhr).

Der allgemeine kommunale Import übernimmt diese drei Vorkommen nicht erneut. Nach erfolgreicher Validierung der Stadtmarketing-Quelle werden bereits gespeicherte Originale ausschließlich innerhalb dieses Quellen-/URL-/Jahresbereichs entfernt und die bestätigten Tagesfenster in derselben Datenbanktransaktion veröffentlicht. Die archivierten Rohquellen bleiben erhalten. Andere Jahre, Quellen und Veranstaltungen sind nicht Teil der Ersetzung.

## Prüfung

Die Tests prüfen die exakten sechs neuen Tagesfenster und Veranstaltungsorte, die unveränderten drei bisherigen Kennungen, Änderungen an Jahr/Datum/Zeit/Ort, doppelte und fehlende Abschnitte sowie die Unabhängigkeit vom Footer. Datenbanktests prüfen die gezielte Ersetzung, Wiederholungsimporte und den Erhalt anderer Quellen, Jahre und Veranstaltungen. Ein erneuter kommunaler Import wird zweimal geprüft und darf die ersetzten Vorkommen nicht erneut veröffentlichen.

Vollständiger Worker-Testlauf mit temporärer TimescaleDB: **459 Tests bestanden** (61,50 Sekunden). Die Lint-Prüfung aller geänderten Python-Dateien und `git diff --check` waren erfolgreich. Der Parser wurde zusätzlich gegen die frisch abgerufene vollständige Stadtmarketing-Seite geprüft. CI, GHCR und produktiver Nachweis werden nach Abschluss ergänzt.

## Veröffentlichung und produktiver Nachweis

- Implementierungscommit `1975a78c34c4df37068c571e1a0e30903830fe8a` auf `main` gepusht.
- [FastAPI & Docker CI/CD, Lauf 37931491568](https://github.com/erik-metz/hack-the-ried/actions/runs/37931491568) für genau diesen Commit vollständig erfolgreich. Job „Build & Push Docker Image to GHCR“ sowie alle 17 vorgesehenen Container-Builds und Veröffentlichungen erfolgreich. Kein Frontend-Workflow erforderlich.
- Produktives Worker-Image: `sha256:ec6619c7ec4c6bc50ef53751feb19a6917cf11126ff0839951f24a4b6de44361`. Inhalte aller drei geänderten Module und der eigenen Quellkonfiguration vor Aktivierung exakt abgeglichen; übrige Quellkonfigurationen unverändert übernommen.
- Compose-Sicherung: `/root/docker-compose.invekos.yml.before-christmas-correction-20261009`. Ausschließlich Registry-Sync-Worker neu gestartet.
- Worker-Start: 09.10.2026, 12:49:18 UTC. Anschließend `running`, Neustartzähler 0.
- Weihnachtsmarkt-Quelle um 12:49:21 UTC erfolgreich mit HTTP 200 erfasst und verarbeitet.
- Öffentliche API nach Aktivierung: neun bestätigte Tagesfenster, keine der drei ersetzten kommunalen Vorkommen; Gesamtdatensatz zu diesem Zeitpunkt 348 Ereignisse. API-Zeitangaben nach Europe/Berlin umgerechnet und mit der Tabelle abgeglichen.
- Öffentlicher Kalender im Browser: Lampertheim, Listenansicht, Suche „Weihnachtsmarkt“. Hauptmarkt an allen vier Tagen mit Schillerplatz/Kaiserstraße und korrekten Uhrzeiten sichtbar; Schlosshofzauber an beiden Tagen mit Schloßhof Neuschloß und Sonntagsschluss 19 Uhr sichtbar. Hofheim und Hüttenfeld weiterhin mit ihren bestätigten täglichen Zeiten sichtbar.
- Zusätzlicher produktiver Kontrollimport: `python /app/main.py --job lampertheim-events` im laufenden Worker, erfolgreich abgeschlossen um 12:54:05 UTC mit HTTP 200. Öffentliche API anschließend erneut geprüft: weiterhin neun bestätigte Markt-Tagesfenster und kein einziges der drei ersetzten Originale; Gesamtdatensatz weiterhin 348 Ereignisse. Damit ist der Schutz gegen Wiederimport auch produktiv nachgewiesen.

Die abschließende Nachweisdokumentation betrifft ausschließlich `docs/`; hierfür sehen die CI-Pfadfilter keinen weiteren Lauf vor.
