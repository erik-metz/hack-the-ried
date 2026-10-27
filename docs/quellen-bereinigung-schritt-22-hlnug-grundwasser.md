# Schritt 22: HLNUG-Grundwasser

Am 10. Oktober 2026 wurde der Gesamtstatus erneut geprüft. Außer den bekannten fachlichen Teilständen für ZAKB und den Bibliser Haushalt fiel die aktive Quelle `hlnug-groundwater` mit `UndefinedFunction` auf. Ein zwischenzeitlicher Verbindungsfehler beim HCV hatte zuvor bereits erfolgreiche Abrufe; Deutsche-Bahn-Quellen bleiben zurückgestellt.

## Reparatur

1. Koordinaten werden beim Aufruf der PostgreSQL-Funktion `write_measurement` ausdrücklich nach `numeric` konvertiert. Ohne diesen Cast sendet psycopg Python-Fließkommazahlen als `double precision`, für die keine passende Funktion existiert.
2. Die Kompatibilitätstabelle erhält die vorgeschriebene Gemeinde sowie die originale HLNUG-Stationsnummer. Ein echter Datenbanktest deckte nach der ersten Korrektur die zuvor verdeckte `NOT NULL`-Verletzung auf. Bei Aktualisierungen werden diese Angaben und der Aktualisierungszeitpunkt ebenfalls übernommen.
3. Die bisherige landesweite ArcGIS-Abfrage lieferte nur 1.000 Treffer mit `exceededTransferLimit=true`. Der Abruf filtert jetzt serverseitig nach den vier Gemeinden Bürstadt, Lampertheim, Biblis und Groß-Rohrheim. Die reale Antwort enthält 120 Stationen ohne Abschneidehinweis. Der bestehende regionale Bounding-Box-Filter bleibt zusätzlich wirksam.
4. Fehlerantworten, fehlende Featurelisten und abgeschnittene Antworten werden ausdrücklich abgelehnt. Ein unvollständiges Ergebnis darf nicht als leerer Erfolg eine bisher gültige Veröffentlichung ersetzen.

Die Quelle liefert ein Stationsinventar mit Koordinaten, keine aktuellen Grundwasserstände oder Nitratmessungen. Solche Werte werden nicht erfunden.

## Prüfung

Echte PostgreSQL-Integration prüft Speicherung der Fließkomma-Koordinaten in der Messwertstruktur, Pflichtgemeinde, Stationsnummer, beide veröffentlichten Datensätze und erfolgreichen Abschlussbeleg. Eine abgeschnittene Folgeantwort erhält den vorherigen Bestand. Parser- und Quellenvertragstests ergänzen die Prüfung.

15 relevante Tests und vier Subtests erfolgreich; Ruff für alle geänderten Python-Dateien und gezielte Diff-Prüfung erfolgreich. Eine bereits laufende lokale PostgreSQL-Testinstanz wurde verwendet und für andere Aufgaben nicht beendet.

## Veröffentlichung und produktiver Nachweis

- Implementierungscommit `a511977ecb5fee5bd13037e3ac06b8c0fb064186` nach `main` gepusht. [FastAPI & Docker CI/CD für genau diesen Commit](https://github.com/erik-metz/hack-the-ried/actions/runs/38031222598) vollständig erfolgreich: alle 15 Prüfjobs und alle 17 Container-Builds samt GHCR-Veröffentlichungen.
- Registry-Image `sha256:7184c18e66323aa0e16b5cf62fab03d7363334c835bf7fd17c8ab59db12db904`; vor dem Einsatz wurden die Datei-Hashes im heruntergeladenen Image geprüft. `groundwater.py`: `cf864411ebda70a284cb38bfd3e8cbee4dede82e43dddf2035d9dda21a29e762`; `sources.json`: `edab2553be1ce27faa516540e2996710e582dbd6f2e6d53f0893412981658959`.
- Vorheriges Compose-Pin gesichert, ausschließlich Registry-Worker-Pin aktualisiert und regulären Worker neu gestartet. Der gezielte Lauf nutzt den bestehenden Collector samt Advisory-Lock; Ergebnis `success`.
- Frischer produktiver Abruf am **10.10.2026 um 08:42 Uhr MESZ**, HTTP 200, erfolgreicher Verarbeitungsabschluss, kein Fehler, zwei veröffentlichte Datensätze.
- Originalantwort: 120 Stationen aus den vier Gemeinden, kein Abschneidehinweis. Nach bestehendem Kartenausschnittfilter: **119 Stationen** – **34 Bürstadt, 41 Lampertheim, 29 Biblis, 15 Groß-Rohrheim**. Ein Stationspunkt außerhalb des vereinbarten Ausschnitts wird weiterhin ausgeschlossen.
- Datenbanknachweis: alle 119 Stationsnummern, Gemeinden und Positionen stimmen in der Kompatibilitätstabelle; alle **238 Koordinatenwerte** stimmen in der Messwertstruktur. Beide veröffentlichten Datensätze enthalten dieselben 119 Standorte.
- Öffentliche Nachprüfung: [Stationsinventar](https://api.hack-the-ried.de/api/v1/collected/environment/groundwater), [Kartenebene](https://api.hack-the-ried.de/api/v1/collected/map/layers/groundwater), Umwelt-API und [Quellenstatus](https://api.hack-the-ried.de/api/v1/collection/status) erfolgreich abgeglichen. Während paralleler Container-Aktualisierungen lieferte die öffentliche API vorübergehend 502; nach beendetem API-Start waren alle Abgleiche erfolgreich. Keine API- oder Nginx-Konfiguration wurde dafür verändert.
- Archivierter Originalpayload SHA-256: `1cd17528f8fc2070c4cb9872d92ac2742f5db453941dab53996014e8d398f241`; Hash unabhängig nachgerechnet.

## Weitere Schritte

Die externe Klärung der 18 unbestätigten ZAKB-Straßen sowie der widersprüchlichen Bibliser Haushaltsangaben bleibt offen. Der zunächst beobachtete HCV-Verbindungsfehler war bei der erneuten Statusprüfung bereits wieder erfolgreich; keine unbelegte Reparatur hierfür behauptet. Als nächster eigenständiger Schritt können die nicht konfigurierten Quellen auf fehlende Zugänge, belegbare öffentliche Alternativen und korrekte Kennzeichnung untersucht werden. Deutsche-Bahn-Quellen bleiben ausgenommen.
