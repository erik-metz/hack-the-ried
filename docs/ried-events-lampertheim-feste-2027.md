# Vier veröffentlichte Lampertheimer Festtermine 2027

Umsetzung am 09.10.2026 auf ausdrücklichen Weiterauftrag nach der
[Fundliste](ried-events-weitere-feste-laeufe-2026-10-09.md).

| Veranstaltung | Bestätigte Tage | Veröffentlichter Veranstaltungsbereich | Originalquelle |
| --- | --- | --- | --- |
| Spargelwanderung | 25.04.2027 | Gemarkungen Lampertheim und Bürstadt; konkreter Verlauf noch offen | [Stadt Lampertheim](https://www.lampertheim.de/de/lampertheim/rund-um-spargel/spargelwanderung.php) |
| Spargelfest Lampertheim | 11.–13.06.2027 | Innenstadt Lampertheim | [Stadt Lampertheim](https://www.lampertheim.de/de/freizeit-kultur/veranstaltungen/spargelfest.php) |
| Howwemer Kerb | 10.–14.09.2027 | Festmeile am Alten Rathaus bis Feuerwehrgerätehaus und Gartenstraße, Hofheim | [Stadt Lampertheim](https://www.lampertheim.de/de/freizeit-kultur/veranstaltungen/howwemer-kerb.php) |
| Lampertheimer Kerwe | 11.–13.09.2027 | Römerstraße und Kaiserstraße, Lampertheim | [Stadt Lampertheim](https://www.lampertheim.de/de/freizeit-kultur/veranstaltungen/lambada-kerwe.php) |

Vor Umsetzung wurde die öffentliche Ereignis-API geprüft: 330 Ereignisse,
keiner der vier neuen Termine für 2027 enthalten. Die Prüfung zählt nicht
nur gleiche Titel, sondern gleicht auch Jahr und Veranstaltungsbereich ab.
Die Spargelwanderung erhält eine einzige Veranstaltung mit beiden Städten
im Ortsnamen; keine doppelte Veranstaltung für jeden beteiligten Ort und
keine erfundene genaue Routenführung oder Startadresse.

## Import und Belegprüfung

Vier unabhängige Quellen mit Adapter `municipal-festival-notice`:
`lampertheim-wanderung-festival-notice`,
`lampertheim-spargelfest-festival-notice`,
`lampertheim-howwemer-festival-notice`,
`lampertheim-kerwe-festival-notice`.
Jede Quelle wird alle sechs Stunden abgerufen; maximale Gültigkeit der
Veröffentlichung zwei Tage. Originalantworten werden vor Verarbeitung
archiviert. Veröffentlichung nutzt die bestehende gemeinsame Ereignis-
Speicherung und Dublettenrichtlinie mit erhaltenen Originalquellen.

Der neue Parser ist auf die vier individuell geprüften Ankündigungen
beschränkt. Er prüft die genaue Hauptüberschrift und normalisierte
Text-Hashes der Absätze mit Datum, Ort und gegebenenfalls Programmaussage.
Geänderte, fehlende oder doppelte Belege stoppen vor Veröffentlichung.
Verifizierte Tage sind ausschließlich 2027, verifizierte Veranstaltungs-
bereiche liegen in Lampertheim beziehungsweise bei der Spargelwanderung
in Lampertheim und Bürstadt. Andere kommunale und Vereinsquellen bleiben
unabhängig erhalten. Bei gescheiterter Aktualisierung wird der zuletzt
veröffentlichte Datensatz nicht durch eine erfundene Ersatzangabe ersetzt.

Die veröffentlichten Tage werden mit den bestehenden Tagesgrenzen
00:00–23:59:59 in Europe/Berlin dargestellt. Der Beschreibungstext erklärt
explizit, dass dies Kalendergrenzen und keine Öffnungszeiten sind.
Eintrittspreise und konkretes Programm 2027 sind unbekannt; kein freier
Eintritt zugesagt. Allgemeine traditionelle Eröffnungen um 15:30 bzw.
17:00 Uhr werden nicht zum bestätigten Tagesprogramm 2027 erklärt.
Keine Öffnungszeiten aus 2026 auf die Spargelwanderung 2027 übertragen.

Live-Abruf mit tatsächlichem Collector-User-Agent: alle vier Seiten HTTP
200; Parser bestätigt genau die oben angegebenen vier Datumsspannen.
Keine Frontendänderung erforderlich.

## Lokale Prüfung

383 Worker-Tests mit separater TimescaleDB erfolgreich, darunter 24 neue
Tests zu Datumsspannen, veränderten Belegen, Archivierung, wiederholtem
Import und Zusammenführung identischer Veranstaltungen verschiedener Quellen.
Ruff und `git diff --check` erfolgreich.

## Veröffentlichung und konkrete Live-Blockade

Implementierung `9c1fde2596f4c4b2d675c6ad16c07bb88eb9177e` auf `main`
committet und gepusht. Der [zugehörige Backend-CI-Lauf](https://github.com/erik-metz/hack-the-ried/actions/runs/37892965299)
ist für genau diesen Commit vollständig erfolgreich abgeschlossen,
einschließlich aller 17 vorgesehenen Container-Builds und GHCR-Veröffentlichungen.
Keine Frontenddatei geändert; kein Frontend-CI-Lauf vorgesehen.

Die produktive Aktivierung ist noch offen: drei unabhängige SSH-Versuche
zum bekannten Server `169.58.102.132:22` mit dem vorhandenen Zugang
endeten jeweils mit `Operation timed out`. Die aktuelle DNS-Auflösung
bestätigt diese Serveradresse; die öffentliche HTTPS-API ist erreichbar.
Es wurde keine produktive Compose-Konfiguration geändert und kein
produktiver Container neu gestartet.

Abschließender öffentlicher API-Abruf am 09.10.2026: weiterhin 330
Ereignisse, keine der vier neuen `festival-notice`-Quellen enthalten.
Daher noch kein Nachweis der Anzeige im produktiven Kalender.
Sobald SSH wieder erreichbar ist, muss das veröffentlichte Worker-Image
mit Parser-Hash, vier Quellkonfigurationen und vollständigem Erhalt aller
bestehenden Quellen geprüft, gezielt aktiviert und anschließend in API
und Kalender verifiziert werden. Erst dann ist dieser Schritt live abgeschlossen.

## VPS wieder erreichbar: Veröffentlichung nachgeholt

Am 09.10.2026 ist SSH wieder erreichbar. Das abgerufene Image
`sha256:3800f3e87b024affccc2b979a0ad58569db4f87eb3627182436b9bac4bea5a89`
wurde vor Aktivierung anhand des Parser-Hashes und aller vier
Quellkonfigurationen geprüft; sämtliche vorherigen Quellen waren enthalten.
Die vorherige Konfiguration wurde unter
`/root/docker-compose.invekos.yml.before-lampertheim-festivals-9c1fde2`
gesichert. Alle vier Originalseiten wurden um 07:12 UTC mit HTTP 200
erfolgreich verarbeitet. Nach gezieltem Einzelabruf der Howwemer Kerb
enthält die öffentliche API alle vier Veranstaltungen, insgesamt 334
Ereignisse. Alle 17 regelmäßigen Angebote bleiben erhalten.

Der produktive Kalender wurde im Browser geprüft: 334 Ereignisse und
alle vier neuen Titel vorhanden. Die API-Datumsspannen stimmen nach
Umrechnung in Europe/Berlin mit den bestätigten Tagen überein.

Die dauerhafte Aktivierung bleibt wegen einer parallelen VPS-Änderung
offen: der aktivierte Worker wurde anschließend mit Exitcode 137
beendet (Docker meldet OOMKilled=false), während ein anderer
Worker-Einzelauftrag mit Image
`sha256:10863e3dbc2e8db4be7ee59a6e37a80bcb22c8ad9ce2948fa14d780f7f49684f`
läuft. Gleichzeitig wurde die Compose-Image-Konfiguration auf dieses
Image geändert; eine direkte Prüfung bestätigt, dass es keine der vier
Festquellen enthält. Diese fremde laufende Änderung wurde nicht überschrieben.
Der abschließende Howwemer-Einzelabruf verwendete deshalb ausschließlich
eine temporäre Image-Übersteuerung mit dem geprüften Image; die temporäre
Datei und der eigene Einzelcontainer wurden danach entfernt.

Der Nutzer wurde um Abstimmung zur anschließenden Wiederaktivierung
des geprüften regulären Workers gebeten. Veröffentlichung und Anzeige
sind belegt; fortlaufender automatischer Abruf ist noch nicht abgesichert.

## Regulärer Worker wieder aktiviert

Auf ausdrücklichen Nutzerauftrag wurde nach Abschluss des parallelen
Einzelauftrags das geprüfte Image
`sha256:3800f3e87b024affccc2b979a0ad58569db4f87eb3627182436b9bac4bea5a89`
wieder für den regulären Worker aktiviert. Vorher wurden nicht nur die
Quell-IDs, sondern sämtliche bisherigen Quellkonfigurationen gegen das
neue Image verglichen: alle sind unverändert enthalten. Parser-Hash
und alle vier Festquellen stimmen mit der geprüften Implementierung überein.
Die vorherige Konfiguration ist zusätzlich unter
`/root/docker-compose.invekos.yml.before-lampertheim-festivals-reactivation-9c1fde2`
gesichert; nur der registry-sync-worker wurde gezielt aktualisiert.

Containerprüfung: running, Start 09.10.2026 um 07:20:25 UTC,
RestartCount=0, Image entspricht dem obigen Digest. Alle vier Festquellen
wurden danach erneut erfolgreich mit HTTP 200 verarbeitet:
Spargelfest 07:20:29 UTC, Spargelwanderung und Howwemer Kerb 07:20:30 UTC,
Lampertheimer Kerwe 07:20:32 UTC. Die öffentliche API enthält weiterhin
334 Ereignisse mit genau vier neuen Festterminen sowie alle 17
regelmäßigen Angebote. Damit ist die zuvor offene Wiederaktivierung
abgeschlossen; die vier Quellen laufen wieder im regulären
Sechs-Stunden-Abruf des Workers.

Keine neue Backend-Implementierung in diesem Abschlussschritt. Die
383 erfolgreichen Tests und der vollständig erfolgreiche CI-/GHCR-Lauf
für Implementierung 9c1fde2 bleiben die zugehörigen Prüfbelege.
Der Abschlusscommit ändert ausschließlich diese Dokumentation; die
Workflow-Pfadfilter sehen dafür keinen neuen CI-Lauf vor.
