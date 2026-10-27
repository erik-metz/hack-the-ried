# Schritt 7: Geplante Umweltabrufe wieder ausführen

## Ursache

Die Archivierungsumstellung im Environment-Collector holt die Kernquellen in
`poll_cycle` ab und übergibt deren archivierten Payload als `raw` an den inneren
Zyklus. Dieser verwendete `raw is not None` zugleich als Kennzeichen einer
expliziten Eingabedatei. Dadurch wurde bei jedem regulären Live-Zyklus der
Netzwerkabruf von Boden, Pollen, GBIF, Abfluss und den drei ENTSO-E-Produkten
übersprungen. Fehlende Teil-Payloads führten zur Ausgabe `not_due`, auch wenn der
letzte erfolgreiche Abruf längst veraltet war.

Die Datenbank- und Containerzeit waren korrekt. Auf dem VPS stammten am
8. Oktober 2026 die letzten Boden- und Pollenimporte noch vom 7. Oktober
07:32:45 bzw. 06:30:52 UTC. Der globale Healthcheck lieferte deshalb zu Recht 1.

## Änderung

Der innere Zyklus erhält ein separates `replay`-Kennzeichen, das ausschließlich
von einer expliziten Eingabe des Aufrufers abgeleitet wird. Im Live-Betrieb werden
die aktivierten Teilquellen wieder über ihre bestehenden Abrufintervalle
abgefragt. Bei einer Eingabedatei bleiben sie im Replay-Modus; es erfolgen keine
zusätzlichen Netzwerkabrufe. Provider-URLs, Abrufintervalle, Prognosemodelle,
Datenvalidierung und Healthcheck-Grenzen werden nicht verändert.

Zwei Regressionstests prüfen den tatsächlichen Live-Einstieg mit vorheriger
Archivierung und alle fünf Teiladapter (drei ENTSO-E-Produkte), sowie den
Netzwerkverzicht bei explizitem Replay. Bestehende Adapter- und Datenbanktests
prüfen die Speicherseite.

Produktionsnachweis und CI-Ergebnis stehen im abschließenden Abschnitt.

## Zusätzlicher Befund im ersten produktiven Zyklus

Der erste Live-Zyklus mit korrigierter Steuerung schrieb tatsächlich 8.064 neue
Bodenwerte und 2.880 Pollenwerte; auch GBIF und Abfluss wurden aktualisiert.
Die bisherige globale Laufzeitgrenze von 50 Sekunden brach danach die laufenden
ENTSO-E-Schreibtransaktionen ab. Deshalb wird ausschließlich beim
Environment-Collector ein konfigurierbares, begrenztes Zyklusbudget von 180
Sekunden verwendet (`ENVIRONMENT_CYCLE_TIMEOUT_SECONDS`, positive Zahl bis
3600). Abrufintervalle und Healthcheck-Aktualitätsgrenzen bleiben unverändert.
Die Grenze wird weiterhin durch `asyncio.timeout` erzwungen; Timeout-Tests
prüfen, dass ein abgebrochener Lauf keinen falschen Gesundheitsstatus erzeugt.

Die bereits erfolgreich heruntergeladenen ENTSO-E-Antworten werden aus den
archivierten HTTP-200-Belegen mit den bestehenden Validierungs- und
Idempotenzregeln fertig verarbeitet, statt erneut Daten abzurufen oder
historische Zeitstempel zu verändern.

## Abschließender Produktionsnachweis

Auf `main` veröffentlicht:

- `0cbe1e9684bcaa2234c8966dcfc63caa7365916c`: Live-Abrufsteuerung.
- `5cf04dea80585d12d5fb0f8809637cc9a5a25b22`: begrenztes vollständiges Zyklusbudget.

73 Collector-Tests mit PostgreSQL und neun Subtests erfolgreich, keine
übersprungenen Tests. Ruff und Diff-Prüfung erfolgreich. Beide eigenen
[CI-Läufe zur Abrufsteuerung](https://github.com/erik-metz/hack-the-ried/actions/runs/37742028045)
und [zum finalen Zyklusbudget](https://github.com/erik-metz/hack-the-ried/actions/runs/37767467989)
sind erfolgreich, jeweils einschließlich aller 17 GHCR-Builds samt
Veröffentlichung. Kein Frontend-Pfad wurde verändert; Frontend CI ist für diesen
Schritt durch seine Pfadfilter nicht vorgesehen.

Das finale Environment-Image läuft auf dem VPS festgelegt auf
`sha256:3785a57b17de9b5487508f1987014af40e93d40de01492234f6ccd325049d0ae`.
Der Digest wird in der bestehenden `/root/docker-compose.xweather.yml`
aktualisiert; Xweather-Zugangsdaten und die übrigen Compose-Dateien werden dabei
beibehalten. `main.py`, `config.py` und `runtime.py` wurden per SHA-256 mit den
veröffentlichten Dateien abgeglichen; das produktive Zyklusbudget beträgt 180
Sekunden.

Am **8. Oktober 2026 um 13:11 Uhr Europe/Berlin** bestätigen Datenbank und
öffentliche Quellenstatus-API die aktualisierten Boden- und Pollenimporte:

- Boden: erfolgreicher Abruf um 12:57:59 Uhr, Verarbeitung abgeschlossen um
  12:58:10 Uhr, **8.064 neue gespeicherte Prognosewerte**.
- Pollen: erfolgreicher Abruf um 12:58:10 Uhr, Verarbeitung abgeschlossen um
  12:58:13 Uhr, **2.880 neue gespeicherte Prognosewerte**.
- GBIF und Abfluss aktualisiert; alle drei ENTSO-E-Produkte sind erfolgreich
  verarbeitet. Die unterbrochene Erzeugungsantwort wurde aus Beleg 223899
  validiert fertig verarbeitet: 2.330 Messwerte, ohne erneuten Download.
- Xweather bleibt erfolgreich, letzter Abruf um 13:11:00 Uhr.

Der danach abgeschlossene reguläre Zyklus meldet `healthy`, null Laufabbrüche
und letzten Erfolg um 13:11:01 Uhr. Der CLI-Healthcheck liefert **0**, Docker
meldet **healthy**. `not_due` ist jetzt mit frischen, tatsächlich verarbeiteten
Importen begründet. Der zuvor dokumentierte globale Healthcheck-Befund aus
Schritt 4 und Schritt 6 ist damit behoben.
