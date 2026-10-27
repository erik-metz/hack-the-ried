# Gesamtprüfung der Ried-Veranstaltungsquellen, 09.10.2026

## Ergebnis und Prüfumfang

Geprüft wurden alle 26 aktiv konfigurierten Social-Quellen anhand des aktuellen
öffentlichen Abrufstatus, der veröffentlichten Veranstaltungs- und Angebotsdaten,
der Worker-Protokolle der letzten acht Stunden sowie der Import-Implementierungen
und Konfiguration. Zusätzlich wurden die offiziellen Seiten der SG Hüttenfeld und
für langfristige Termine Groß-Rohrheim im Internet gelesen.
Der Statusabruf weist bei allen 26 Quellen einen erfolgreichen letzten Abruf aus.
Alle Intervalle betragen sechs Stunden; die letzten erfolgreichen Verarbeitungen
liegen zwischen 15:14 und 16:32 Uhr deutscher Ortszeit und waren bei der Prüfung
gegen 19:05 Uhr noch innerhalb dieses Intervalls.

Die API enthält in dieser Momentaufnahme 348 Veranstaltungen und 17 regelmäßige
Angebote. Veranstaltungszuordnungen erfolgen ausschließlich zu Bürstadt,
Lampertheim, Biblis und Groß-Rohrheim. Keine doppelten veröffentlichten IDs.
Quellenbeiträge werden über `source_events` gezählt, damit zusammengeführte
Einträge nicht fälschlich als fehlend gelten. Vergangene Veranstaltungen können
außerhalb dieser API-Auswahl liegen: Die akzeptierte Importanzahl aus dem Log ist
nicht unmittelbar mit der sichtbaren Anzahl gleichzusetzen.

Dies ist eine Abdeckungsprüfung, kein Nachweis, dass jeder veröffentlichte Termin
jeder Vereinsseite bereits übernommen wird. Genau diese Einschränkung zeigen die
nachfolgenden Befunde. Es wurden keine Produktionsdaten geändert.

## Alle Quellen

Alle folgenden Quellen: letzter Status erfolgreich, HTTP 200. Uhrzeiten: Europe/Berlin.
„Termine“ zählt Beiträge zur aktuellen Veranstaltungsantwort, „Angebote“ die
regelmäßigen Angebote. Null Beiträge allein beweisen keinen Fehler.

| Quelle | Importformat | Termine | Angebote | Letzte Verarbeitung |
| --- | --- | ---: | ---: | --- |
| [lampertheim-district-christmas-markets](https://www.stadtmarketing-lampertheim.de/stadtmarketing/events/Weihnachtsmaerkte.php) | verified-christmas-markets | 9 | 0 | 15:14 |
| [hcv-buerstadt-campaign](https://hcv-buerstadt.de/) | verified-hcv-campaign | 6 | 0 | 15:14 |
| [lampertheim-wanderung-festival-notice](https://www.lampertheim.de/de/lampertheim/rund-um-spargel/spargelwanderung.php) | municipal-festival-notice | 1 | 0 | 15:14 |
| [lampertheim-spargelfest-festival-notice](https://www.lampertheim.de/de/freizeit-kultur/veranstaltungen/spargelfest.php) | municipal-festival-notice | 1 | 0 | 15:14 |
| [lampertheim-howwemer-festival-notice](https://www.lampertheim.de/de/freizeit-kultur/veranstaltungen/howwemer-kerb.php) | municipal-festival-notice | 1 | 0 | 15:14 |
| [lampertheim-kerwe-festival-notice](https://www.lampertheim.de/de/freizeit-kultur/veranstaltungen/lambada-kerwe.php) | municipal-festival-notice | 1 | 0 | 15:14 |
| [tvl-triathlon-regular-offers](https://www.tv-lampertheim.de/pages/trainingszeiten-tvl-triathlon) | tvl-triathlon-offers | 0 | 3 | 16:32 |
| [tv-gross-rohrheim-gymnastik](https://tv-grossrohrheim.de/angebot/turnen-und-gymnastik/gymnastikgruppen/) | tv-gymnastik | 0 | 4 | 15:14 |
| [rompin-stompin-regular-offers](https://www.rompinstompin.de/unserkursangebot) | rompin-stompin-offers | 0 | 8 | 15:14 |
| [tv-buerstadt-lauftreff](https://www.xn--tvbrstadt-s9a.de/abteilungen-des-tv-1891-buerstadt/lauftreff/trainingszeiten-lauftreff/) | buerstadt-lauftreff | 0 | 1 | 15:14 |
| [tv-gross-rohrheim-lauftreff](https://tv-grossrohrheim.de/angebot/lauftreff/) | tv-lauftreff | 0 | 1 | 15:14 |
| [cross7-buerstadt](https://api.cross-7.de/public/calendar/667/events) | cross7 | 49 | 0 | 15:15 |
| [cross7-gross-rohrheim](https://api.cross-7.de/public/calendar/1106/events) | cross7 | 30 | 0 | 15:15 |
| [lampertheim-events](https://www.lampertheim.de/de/veranstaltungen/?navid=370285370285) | lampertheim-events | 139 | 0 | 15:18 |
| [buergerstiftung-biblis-events](https://www.buergerstiftung-biblis.de/wp-json/tribe/events/v1/events) | biblis-events | 75 | 0 | 15:16 |
| [tv-buerstadt-events](https://www.xn--tvbrstadt-s9a.de/798-2/) | club-events | 1 | 0 | 15:17 |
| [kkm-buerstadt-events](https://www.kkm-buerstadt.de/kalender-2/) | club-events | 2 | 0 | 15:17 |
| [sg-huettenfeld-events](https://www.sg-huettenfeld.de/) | club-events | 4 | 0 | 15:17 |
| [dlrg-lampertheim-events](https://lampertheim.dlrg.de/aktuelle-termine/) | club-events | 17 | 0 | 15:17 |
| [tv-hofheim-events](https://tv1896hofheim.de/termine/) | club-events | 4 | 0 | 15:17 |
| [hofheimer-volkslauf](https://tv1896hofheim.de/hofheimer-volkslauf/) | club-events | 0 | 0 | 15:17 |
| [neuschloss-events](https://neuschloss.net/wp-json/tribe/events/v1/events) | tribe-events | 2 | 0 | 15:17 |
| [musikkiste-gross-rohrheim-events](https://www.musikkiste.net/wp-json/tribe/events/v1/events) | tribe-events | 2 | 0 | 15:17 |
| [gross-rohrheim-community-notice-events](https://gross-rohrheim.orts.app/-arbeitsgruppen-bei-der-gemeinde-gross-rohrheim_LN6I/nHDc) | municipal-notice-events | 2 | 0 | 15:17 |
| [gross-rohrheim-long-term-events](https://www.gross-rohrheim.de/freizeit-kultur/veranstaltungen/veranstaltungskalender/langfristige-termine) | long-term-events | 2 | 0 | 15:17 |
| [tc74-saisonabschluss-2026](https://gross-rohrheim.orts.app/-saisonabschluss-11-10-2026-beim-tc_15XI) | verified-club-notice | 1 | 0 | 15:17 |

## Priorisierte Befunde und nächste Umsetzungsschritte

1. **Neue Veranstaltungsseiten automatisch entdecken.** Der SGH-Import liest nur
   acht fest konfigurierte `event_pages`. Die aktuell sichtbaren acht Links im
   Events-Menü stimmen damit überein; eine neu hinzugefügte neunte Seite würde
   aber nicht automatisch berücksichtigt. Die Gemeindemitteilung zu
   Arbeitsgruppen und der TC74-Saisonabschluss lesen ebenfalls jeweils eine feste
   Nachricht statt eines Nachrichtenverzeichnisses. Nächster sinnvoller Schritt:
   SGH-Events-Menü als dynamischen Einstieg auslesen, interne Detailseiten sammeln
   und verarbeiten; neue Links, entfernte Links und Dubletten testen.
2. **Jahres- und Inhaltsfreigaben durch echte Datumsparser ersetzen.** Vier
   Lampertheimer Festquellen übernehmen konfigurierte Daten für 2027 und prüfen
   Text-Hashes. Die Weihnachtsmarktquelle enthält feste Tageszeiten für 2026,
   die HCV-Quelle eine freigegebene Terminliste und einen Hash für 2026/2027.
   Groß-Rohrheims langfristige Termine akzeptieren nur `years: [2027]`, obwohl
   die Webseite mehrere Jahre nennt. Der Hofheimer Volkslauf verwirft einen neuen
   Jahrgang ohne neue Ortsfreigabe. Diese Importe laufen regelmäßig, sind aber
   noch keine vollständige dynamische Übernahme neuer Termine. Bei Umstellung
   Angaben aus der Quelle parsen, bewegliches Zeitfenster verwenden und
   widersprüchliche konkurrierende Quellen weiterhin gezielt behandeln.
3. **Verworfene Einträge nach Gründen sichtbar machen und häufige Ortsnamen
   wiederverwenden.** Die Logs zeigen beim TV Bürstadt u.a. „Bürgersaal“, „BuSC“,
   „BSC – großer Seminarraum“ sowie leere Orte; bei KKM fehlen u.a. Ortsangaben für
   Schüler-Lehrer-Konzert und Jubilarenehrung. SGH verwirft Oktoberfest und Summer
   Night wegen unvollständiger Datumsangaben. Einträge mit Lorsch oder Marburg
   bleiben korrekt ausgeschlossen. Orts-Aliase anhand tatsächlicher
   Veranstaltungsorte belegen und allgemein nutzen; fehlende Jahre nicht erfinden.
4. **Datumswidersprüche aus Kalendern untersuchen.** Lampertheim protokolliert
   mehrere umgekehrte Datumsbereiche, darunter „Echt Jetzt ?!
   Magisch-Unterhaltsam-Interaktiv“ mit 29.12.2026 / 27.05.2026. Die Bürgerstiftung
   Biblis meldet ebenfalls ungültige Daten. Detailangaben und Quellfelder abgleichen,
   bevor entschieden wird, ob die Quelle fehlerhaft ist oder der Parser eine
   andere Datumsangabe fälschlich als Enddatum liest. Keine automatische
   Vertauschung oder Ergänzung ungeprüfter Termine.
5. **Regelmäßige Angebote ebenfalls dynamisch lesen.** Rompin Stompin,
   Gymnastikgruppen und TVL-Triathlon arbeiten mit freigegebenen Kursen oder
   Text-/Zeilen-Hashes. Neue Kurskarten können dadurch unberücksichtigt bleiben;
   geänderte Texte können den Import stoppen. Wiederkehrende Angebote gehören
   weiterhin in den Angebotsdatensatz und nicht als erfundene Einzeltermine in
   den Veranstaltungskalender.
6. **Abrufstabilität und Diagnose verbessern.** TVL-Triathlon hatte im geprüften
   Log mehrfach HTTP 429, ist inzwischen aber wieder erfolgreich und veröffentlicht
   drei Angebote. Kein aktueller Totalausfall. Wiederholungen und Warteverhalten
   bei 429 prüfen. Der Status meldet für viele Event-Quellen `item_count: null`
   und `published_dataset_count: 0`, obwohl deren Beiträge im gemeinsamen
   Datensatz enthalten sind. Deshalb künftig pro Quelle gelesene, akzeptierte und
   verworfene Einträge mit Gründen ausweisen; die Aggregat-Veröffentlichung ist
   kein zuverlässiger Zähler der einzelnen Quelle.

## Bereits vorhandene vollständige Traversierung

Cross7 durchläuft Seiten bis zur letzten unvollständigen Seite und erkennt
wiederholte Seiten sowie das Seitenlimit. Lampertheim verfolgt Folgeseiten mit
Zyklusprüfung. Die Tribe-Feeds der Bürgerstiftung Biblis, Neuschloß und Musikkiste
prüfen die Pagination. DLRG liest die eingebettete Seminarliste und zugehörige
Kalenderexporte; der Hofheimer Kalender wird serverseitig gerendert eingelesen.
TV Bürstadt und KKM lesen sämtliche Tabellenzeilen. Diese Mechanismen sind im
Code vorhanden; die aktuellen letzten Läufe sind erfolgreich. Eine unabhängig
neu gezählte Volltraversierung sämtlicher Live-Detailseiten wurde in diesem
Prüfschritt nicht durchgeführt.

Das Zeitfenster für die dynamischen Vereins- und Tribe-Importe umfasst das laufende
und folgende Kalenderjahr und verschiebt sich jährlich. Explizit spätere Termine
werden damit noch nicht angezeigt. Diese Grenze bei einer Erweiterung bewusst
festlegen; nicht mit einer festen Jahresfreigabe verwechseln.

## Quellen und Validierung

- [Öffentlicher Abrufstatus](https://api.hack-the-ried.de/api/v1/collection/status)
- [Veranstaltungsdaten](https://api.hack-the-ried.de/api/v1/collected/social/events)
- [Regelmäßige Angebote](https://api.hack-the-ried.de/api/v1/collected/social/regular-offers)
- [SG Hüttenfeld: Events-Menü](https://www.sg-huettenfeld.de/)
- [Groß-Rohrheim: langfristige Termine](https://www.gross-rohrheim.de/freizeit-kultur/veranstaltungen/veranstaltungskalender/langfristige-termine)

Status, Quellenzahl, Gebietsgrenze und eindeutige veröffentlichte IDs wurden per
lokaler Auswertung der API-Antworten geprüft. Reine Dokumentationsänderung;
`git diff --check`, kein Anwendungsbuild erforderlich. Die Pfadfilter sehen
für diese Dokumentation weder Frontend-CI noch VPS-CI vor.
