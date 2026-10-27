# Schritt 29: Verbleibende Quellenfehler erneut prüfen

Stand: 10. Oktober 2026, rund 19:15–19:18 MESZ. Deutsche-Bahn-Quellen ausgelassen.
Öffentliche Nachweise: `/api/v1/collection/status`,
`/api/v1/collected/waste/coverage` und
`/api/v1/collected/finance/budget-review/biblis` unter
https://api.hack-the-ried.de.

## Aktueller Status

87 Statuszeilen außerhalb `db-*`: 74 `success`, 10 `not_configured`,
2 `partial`, 1 `failed`. Statuszeilen sind nicht zwingend unterschiedliche
Anbieter. Es handelt sich um einen Statusabruf, nicht um 87 neue Einzeltests.
Unter den aktiven Einträgen: 74 `success`, 2 `partial`, kein `failed`.

Die einzige `failed`-Zeile ist `environment-blitzortung`: bereits deaktiviert,
alter HTTP-401-Fehler. Die Quellenansicht priorisiert `enabled: false` und
zeigt den Eintrag deaktiviert. Die alternative aktive Quelle
`environment-xweather` meldet HTTP 200, `success`, eine Beobachtung und
abgeschlossene Verarbeitung um 19:14:32 MESZ. Keine Aktivierung der alten Quelle.
Die zehn generischen Platzhalter bleiben deaktivierte geplante Anbindungen.

## Biblis: weiterhin inhaltlicher Widerspruch

Die aktuelle [amtliche Haushaltsseite](https://www.biblis.eu/rathaus/ortsrecht/haushaltsplan/)
verlinkt weiterhin den Haushaltsplan 2026 als neueste Jahresdatei.
Die Datei wurde frisch heruntergeladen und mit dem vorhandenen Anwendungsparser
geprüft. Die ausgelesenen Originalzahlen stimmen exakt mit dem gespeicherten
Prüfbericht überein; `ordinary_totals_do_not_reconcile` bleibt bestehen.

- Ordentliche Erträge: 24.166.774 EUR.
- Ordentliche Aufwendungen: 26.800.450 EUR.
- Daraus berechnet: −2.633.676 EUR.
- Gedrucktes ordentliches Ergebnis: −2.572.977 EUR.
- Differenz: 60.699 EUR.
- Beschluss laut Dokument: 11. Februar 2026; Zusammenfassung auf PDF-Seite 4.
- Dateigröße 45.257.365 Bytes;
  SHA-256 `5c761334f0dce3e12943bd512a2b45cb36b99f9dd4b51a23e42bb5b2761c21dc`.

Keine Korrektur erfinden und den Prüfstatus nicht auf Erfolg setzen.
Die Gemeinde verlinkt auch [ihren digitalen Haushalt](https://biblis.haushaltsdaten.de/2026);
dessen Existenz ist kein Nachweis einer korrigierten Haushaltssatzung.

## Nächster Reparaturkandidat: ZAKB

Der während der ersten Abfrage noch laufende Abruf war bei erneuter Prüfung
abgeschlossen und meldet `partial`. Öffentlicher Abdeckungsbericht,
`checked_at=2026-10-10T17:14:52.913989+00:00`:

| Kommune | Fehlerhafte Straßenprobe | Ursache |
| --- | --- | --- |
| Biblis | Am Wadowski See | MissingStreet |
| Biblis | Berliner Weg | MissingStreet |
| Biblis | Dungauer Weg | MissingStreet |
| Bürstadt | Außerhalb | MissingStreet |

845 Straßenproben insgesamt; 827 erfolgreiche Kalenderproben, 4 Fehler,
14 zurückgestellte Proben. Weitere Erneuerungsfehler: keine.
`complete_address_coverage=false`: Straßenproben belegen keine vollständige
Hausnummernabdeckung. Die beiden veröffentlichten Datensätze bedeuten daher
keine vollständige Bereinigung.

## Konkrete Blockade und Fortsetzung

SSH mit dem freigegebenen Schlüssel, BatchMode und 15 Sekunden ConnectTimeout
zu `root@169.58.102.132` scheiterte mit:
`connect to host 169.58.102.132 port 22: Operation timed out`.
Die öffentliche HTTPS-API ist erreichbar. Der SSH-Fehler ist kein Beleg für
einen vollständig ausgefallenen Server.

Ohne VPS-Zugriff sind die gespeicherten Adressbelege, gezielte Worker-Proben
und eine produktive Reparatur derzeit nicht ausführbar. Keine unbelegten
Straßenalias-Zuordnungen und keine Konfigurationsänderungen vorgenommen.
Nach wiederhergestelltem SSH: die vier konkreten Originaladressen gegen die
ZAKB-Auswahllisten prüfen, belegbare Zuordnungen implementieren/testen und
veröffentlichen; verbleibende Fälle ausdrücklich offen lassen. Die 14
zurückgestellten Proben gesondert verfolgen.

## Veröffentlichung

Nur dieser Prüfbericht geändert. Prüfung: öffentliche Status-/Abdeckungsdaten,
frischer amtlicher PDF-Abruf mit bestehendem Parser und Zahlenvergleich,
SSH-Verbindungsprobe. Kein Anwendungscode geändert; kein Build nötig.
Die Pfadfilter von Frontend CI und FastAPI & Docker CI/CD schließen reine
`docs/`-Änderungen aus. Keine VPS-Änderung und keine GHCR-Veröffentlichung.
