# Quellenbereinigung – Schritt 3: Veranstaltungsquellen

Abschlussprüfung: 7. Oktober 2026, 19:42 Uhr Europe/Berlin.

## Ergebnis

Alle elf in dieser Prüfung betrachteten aktiven Veranstaltungsquellen melden
`success`, `completion_recorded=true`, einen Verarbeitungsabschluss und keinen
Fehler. Ihre jüngsten Abrufe liegen innerhalb des konfigurierten Sechsstunden-
Intervalls. Die zuvor beobachteten Fremdschlüssel- und Verarbeitungsfehler sind
inzwischen durch die bereits veröffentlichten Vereinsimport-Korrekturen behoben.
Für diesen Schritt war keine weitere Änderung am Collector erforderlich.

Die Prüfung erfolgte per SSH auf dem VPS `169.58.102.132` über die öffentlichen
HTTPS-Endpunkte. Der frühere Host-Port `127.0.0.1:8080` ist aktuell nicht
veröffentlicht; die Backend-API läuft intern als gesunder Container. Die
fehlende Host-Portfreigabe wurde nicht als Anbieterausfall gewertet.

Nachweise:

- [Quellenstatus](https://api.hack-the-ried.de/api/v1/collection/status)
- [Veröffentlichte Veranstaltungen einschließlich Archiv](https://api.hack-the-ried.de/api/v1/collected/social/events?include_past=true)
- [Bereits umgesetzte Vereinsimport-Reparatur](ried-events-plan.md#ergänzung-produktiven-vereinsimport-reparieren)

## Veröffentlichter Bestand

Die Veröffentlichung enthält **1.481 Veranstaltungen mit eindeutigen IDs**.
Alle haben eine Gemeinde im vereinbarten Gebiet Bürstadt, Lampertheim, Biblis
oder Groß-Rohrheim. Jede der elf Quellen ist im Bestand vertreten.

| Quelle | Primär zugeordnete Veranstaltungen | Quellenbelege in `source_events` |
| --- | ---: | ---: |
| Kommunaler Kalender Lampertheim | 507 | 507 |
| Cross7 Bürstadt | 476 | 479 |
| Bürgerstiftung Biblis | 301 | 302 |
| Cross7 Groß-Rohrheim | 110 | 110 |
| TV Bürstadt | 25 | 25 |
| DLRG Lampertheim | 19 | 21 |
| Neuschloß | 14 | 14 |
| KKM Bürstadt | 13 | 13 |
| SG Hüttenfeld | 11 | 11 |
| TV Hofheim | 4 | 4 |
| Hofheimer Volkslauf | 1 | 1 |

Bei zusammengeführten Dubletten kann eine Veranstaltung mehrere Quellenbelege
haben. Deshalb unterscheiden sich einzelne Spalten; Quellenbelege sind keine
zusätzlichen Veranstaltungen. Die Mengen stammen aus dem veröffentlichten
Bestand einschließlich Archiv und sind nicht die Menge des letzten Abrufs.
Die Statusmeldungen dieser Quellen melden derzeit keine Importmenge
(`item_count=null`); die Quellenseite zeigt diese weiterhin als unbekannt.

## Durchgeführte Prüfungen und Grenzen

Der Abgleich prüft für jede der elf Quellen Aktivierung, erfolgreichen Status,
fehlende Fehlermeldung, bestätigten Abschluss, Aktualität und Vertretung im
veröffentlichten Bestand. Außerdem wurden eindeutige Veröffentlichungs-IDs,
das Gemeindegebiet und die Zuordnungen zu den einzelnen Quellen geprüft.
Alle Prüfungen bestanden. Es wurden keine produktiven Datensätze verändert
und kein zusätzlicher Import ausgelöst.

Ein erfolgreicher Import belegt nicht die Vollständigkeit aller Veranstaltungen
im Gemeindegebiet. Die bislang nicht angebundenen Groß-Rohrheimer PDF-
Jahreskalender bleiben ein gesonderter offener Punkt. Die hierfür bereits
recherchierten Alternativen stehen in
[Groß-Rohrheim: Alternativen](ried-events-gross-rohrheim-alternativen.md).
Parallel laufende Arbeiten an zusätzlichen Eventquellen gehören nicht zu
diesem Abschlussnachweis.

## Verbleibende aktive Quellenfehler

Der aktuelle Status meldet außerhalb der Veranstaltungsquellen:

| Quelle | Status / Phase | Meldung |
| --- | --- | --- |
| DWD RADOLAN | teilweise / Verarbeitung | Keine verwertbaren regionalen Werte |
| DWD MOSMIX | teilweise / Verarbeitung | Keine verwertbaren regionalen Werte |
| Blitzortung | Fehler / Abruf | HTTP 401 |
| DB OpenStation SIRI-FM | Fehler / Verarbeitung | ValueError |
| INVEKOS Landwirtschaft | Fehler / Speicherung | UndefinedFunction |
| Bibliser Haushaltsplan | teilweise / Phase nicht gemeldet | Haushaltssummen stimmen rechnerisch nicht überein |

Als nächster separat zu bestätigender Schritt bietet sich die Reparatur von
RADOLAN und MOSMIX an. Blitzortung benötigt eine eigene Prüfung der
Zugangsberechtigung. Die anderen Fehler werden anschließend einzeln behandelt.

Dieser Abschluss ändert ausschließlich Dokumentation. Die Pfadfilter sehen
hierfür weder Frontend CI noch FastAPI & Docker CI/CD vor; eine neue
Containerveröffentlichung ist nicht erforderlich.
