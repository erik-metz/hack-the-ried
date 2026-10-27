# Schritt 6: Vaisala Xweather als Blitzdatenquelle

Xweather wird separat als `environment-xweather` ausgewiesen. Aktivierung über
`ENABLE_XWEATHER`, `XWEATHER_CLIENT_ID` und `XWEATHER_CLIENT_SECRET`; Zugangsdaten
gehören ausschließlich in die geschützte VPS-Konfiguration. Für den bisherigen
Blitzortung-Zugang wird `ENABLE_BLITZORTUNG=false` gesetzt.

Der Collector fragt ein explizites UTC-Fünf-Minuten-Fenster im bestehenden
25-km-Radius um 49.6425/8.4552 ab. Eine bestätigte leere Antwort erzeugt eine
Nullmessung und einen erfolgreichen Verarbeitungsnachweis. API-Fehler, unbekannte
Warnungen, ungültige Ereignisse und Antworten am 1000-Einträge-Limit werden
abgewiesen, damit unvollständige Daten nicht als vollständige Zählung erscheinen.
Es werden Blitzimpulse (Wolken- und Erdblitze) gezählt, nicht eindeutig getrennte
Blitzentladungen. Stromstärken werden von Ampere in kA umgerechnet. Quellen-ID,
Anbieter und tatsächlicher Fünf-Minuten-Zeitraum werden im Messkern gespeichert.

Die HTTP-URL im öffentlichen Quellenstatus enthält keine Zugangsdaten.
HTTPX-Request-Logging wird beim authentifizierten Abruf unterdrückt; eventuell
vom Anbieter zurückgespiegelte Zugangsdaten werden vor der Archivierung entfernt.
Keine Zugangsdaten sind Bestandteil dieses Repositories.

Lokaler Testzugang: HTTP 200, success=true, warn_no_data für einen gültigen
regionalen Abruf. Das belegt Zugang, aber noch keine produktive Speicherung.
Produktionsnachweis und CI-Ergebnis stehen im folgenden Abschnitt.

## Veröffentlichung und Produktionsnachweis

Code-Commit: `cdeb40a33be38b9bc23e6fe6faa483d9798ed904`, auf `main` gepusht.
68 Collector-Tests (mit PostgreSQL, keine übersprungenen Tests) und vier
Subtests sowie neun Quellen-Frontend-Tests erfolgreich. Ruff, ESLint,
Diff-Prüfung und Frontend-Build erfolgreich. Auch ein realer Abruf mit dem
neuen Adapter und absoluten Zeitgrenzen war erfolgreich.

- [Frontend CI](https://github.com/erik-metz/hack-the-ried/actions/runs/37740359247): erfolgreich.
- [FastAPI & Docker CI/CD](https://github.com/erik-metz/hack-the-ried/actions/runs/37740359986): erfolgreich, einschließlich aller 17 GHCR-Builds samt Veröffentlichung.
- Vercel bestätigt das erfolgreiche Frontend-Deployment für denselben Commit.

Der Umweltcollector läuft über `/root/docker-compose.xweather.yml` zusätzlich
zu den bestehenden Compose-Dateien. Der geprüfte Image-Digest lautet
`sha256:bd7d7279e14004ddeef23b3ed92f6a3eece730283067a73719b9c82630ed0516`.
Die sechs produktiven Adapterdateien stimmen per SHA-256 mit dem Code-Commit
überein. Die `.env` und die zusätzliche Compose-Datei haben Modus 0600.
Ein späteres Update muss diese Image-Fixierung bewusst berücksichtigen.

Am 8. Oktober 2026, **09:04:22 Uhr Europe/Berlin**, bestätigen Datenbank und
öffentliche Quellenstatus-API `environment-xweather`: aktiviert, HTTP 200,
`success`, eine verarbeitete regionale Beobachtung, kein Fehler und bestätigter
Verarbeitungsabschluss. Gespeichert wurden **0 Blitzimpulse** mit folgendem UTC-Nachweis:
`period_end=2026-10-08T07:04:21Z`, `period_start=2026-10-08T06:59:21Z`,
Dauer genau 300 Sekunden (lokal **08:59:21 bis 09:04:21 Uhr**).
Der alte `environment-blitzortung`-Eintrag ist deaktiviert; sein historischer
HTTP-401-Fehler bleibt als Nachweis erhalten. Die veröffentlichte Quellen-Seite
enthält Xweather samt neuem Anbieternamen und Fünf-Minuten-Bezeichnung.

## Getrennter bestehender Healthcheck-Befund

Der neue Blitzimport funktioniert. Der globale Collector-Healthcheck liefert
weiterhin Rückgabecode 1 trotz Statusdatei `healthy` und null Laufabbrüchen.
Boden und Pollen melden `not_due` mit letztem Erfolg vom 7. Oktober, obwohl die
Aktualitätsgrenzen überschritten sind; auch ENTSO-E verweist auf alte erfolgreiche
Importe. Dieser bereits bestehende Aktualitätsbefund wird nicht als behoben
bewertet und benötigt einen separaten Bereinigungsschritt.
