# HCV Bürstadt: sechs bestätigte Termine der Kampagne 2026/2027

Originalquelle: [HCV Bürstadt](https://hcv-buerstadt.de/), am 09.10.2026
frisch abgerufen und zusätzlich im Browser mit ausgeklappter Terminliste
geprüft. Vor dem Import enthält die öffentliche API keine dieser sechs
HCV-/Prunksitzungs-/Frauensitzungstermine.

| Termin | Beginn | Veranstaltung | Veranstaltungsort |
| --- | --- | --- | --- |
| 07.11.2026 | 18:00 | HCV Schlachtfest | Die Lächner 9, Bürstadt |
| 08.01.2027 | 19:31 | 1. Prunksitzung | Bürgerhaus Bürstadt, Rathausstraße 2 |
| 09.01.2027 | 19:11 | 2. Prunksitzung | Bürgerhaus Bürstadt, Rathausstraße 2 |
| 15.01.2027 | 19:31 | 3. Prunksitzung | Bürgerhaus Bürstadt, Rathausstraße 2 |
| 16.01.2027 | 19:11 | 4. Prunksitzung | Bürgerhaus Bürstadt, Rathausstraße 2 |
| 05.02.2027 | unbekannt | HCV Frauensitzung | Bürgerhaus Bürstadt, Rathausstraße 2 |

Keine Endzeiten oder Eintrittspreise veröffentlicht. Kein freier Eintritt
zugesagt; Teilnahmebedingungen, Anmeldung und verfügbare Karten beim
Verein prüfen. Für die Frauensitzung gelten ausschließlich technische
Tagesgrenzen mit explizitem Hinweis auf den unbekannten Beginn.

Familienabend und Kampagnenabschluss bleiben wegen unklarer öffentlicher
bzw. vereinsinterner Teilnahme zurückgestellt. Inthronisation ohne
veröffentlichten Ort, vergangene Weinfest-/Kerwetermine sowie die noch
nicht ausreichend geklärten MGV-Feste werden nicht neu importiert.

## Umsetzung und Prüfung

Quelle `hcv-buerstadt-campaign`, Adapter `verified-hcv-campaign`, Abruf alle
sechs Stunden. Die Original-HTML-Seite verweist auf ein JavaScript-Modul.
Der Import folgt nur genau einem passenden Modulpfad auf derselben
HCV-Domain und führt keinen fremden JavaScript-Code aus. Beide Originale
werden vor Verarbeitung archiviert. Der vollständige geprüfte Abschnitt
mit Terminliste und Bürgerhaus-Zuordnung ist durch SHA-256 gebunden;
Änderungen an Datum, Zeit, Titel oder Ort stoppen die Veröffentlichung.
Unabhängige Änderungen am übrigen Website-Code beeinflussen die Prüfung
nicht. Zusätzlich wird die Auswahl gegen die sechs verifizierten
Originaldatensätze abgeglichen. Kein jährliches Fortschreiben.

Die bestehende Ereignisspeicherung und Dublettenzusammenführung werden
weiterverwendet; die Veröffentlichung referenziert ein zusätzlich
archiviertes Bündel mit den Hashes beider Originale und der Zuordnung.
Wiederholte Importe erzeugen keine neuen Veranstaltungs-IDs. Geänderte
Belege ersetzen nicht die letzte erfolgreiche Veröffentlichung.

Live-Parserprüfung der aktuellen HTML- und JavaScript-Datei bestätigt
alle sechs Termine einschließlich der unterschiedlichen Startzeiten.

Lokale vollständige Worker-Suite mit separater TimescaleDB: 413 Tests
erfolgreich (einschließlich 14 neuer HCV-Prüfungen und parallel vorhandener
ZAKB-Testergänzungen, die nicht Bestandteil dieses Commits sind).
Ruff und `git diff --check` erfolgreich.

## Veröffentlichung und produktiver Nachweis

Implementierung `840c889434dbf3868101002c0016b222dabf7c5c` auf main
committet und gepusht. Der [zugehörige CI-Lauf](https://github.com/erik-metz/hack-the-ried/actions/runs/37899334478)
ist für genau diesen Commit vollständig erfolgreich abgeschlossen,
einschließlich aller 17 Container-Builds und GHCR-Veröffentlichungen.
Keine Frontenddatei geändert; kein Frontend-CI-Lauf vorgesehen.

Während der vorbereiteten VPS-Prüfung wurde der reguläre Worker durch
den parallelen ZAKB-Auftrag bereits auf ein neueres Image aktualisiert.
Der eigene Aktivierungslauf brach vor einer Konfigurationsänderung ab,
weil der vorherige Container gerade beendet wurde. Deshalb kein
Zurücksetzen auf das ältere HCV-Image und keine erneute Änderung der
parallel aktualisierten Compose-Konfiguration.

Tatsächlich laufendes und konfiguriertes Image:
`sha256:899042b67f575ac23755a04332b5eafb3062104d36f7b28a4b9037f7713be06c`.
Der reguläre Worker läuft seit 09.10.2026 07:39:04 UTC mit RestartCount=0.
Direkt im laufenden Container stimmen HCV-Parser-Hash und HCV-
Quellkonfiguration exakt mit der geprüften Implementierung überein.
Alle aktuellen 56 Quell-IDs sind enthalten.

Produktiver HCV-Abruf 07:39:08 UTC: success, HTTP 200. Die öffentliche
API enthält genau die sechs oben angegebenen HCV-Termine. Gesamtstand
341 Ereignisse; weitere zwischenzeitliche Aktualisierungen anderer
Quellen sind darin enthalten. Alle vier Lampertheimer Festquellen und
alle 17 regelmäßigen Angebote bleiben erhalten.

Im produktiven Browserkalender wurde die Listenansicht auf Bürstadt
und HCV gefiltert: alle sechs Termine erscheinen genau einmal mit den
oben genannten Tagen, Anfangszeiten und Veranstaltungsorten. Die
Frauensitzung zeigt „Ganztägig / Uhrzeit siehe Quelle“ sowie ausdrücklich
„Beginn unbekannt“. Damit sind Speicherung, regulärer Worker und
Anzeige geprüft. Dieser Abschluss ändert ausschließlich Dokumentation;
dafür ist nach Workflow-Pfadfiltern kein neuer CI-Lauf vorgesehen.
