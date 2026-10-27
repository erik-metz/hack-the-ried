# Schritt 11: ZAKB-Ortsteilzuordnung und Adressprüfung

## Änderung

- Orts- und Straßenoptionen werden aus dem ZAKB-Formular gelesen. Eine Straße wird nur bei genau einer passenden Ortsauswahl übernommen; Biblis-Nordheim und Biblis-Wattenheim werden berücksichtigt. Fehlende oder mehrdeutige Zuordnungen werden ausdrücklich abgelehnt.
- Vor dem iCalendar-Download muss das HTML-Element `Lageadresse` genau die angefragte Straße, Hausnummer und ausgewählte ZAKB-Ortsbezeichnung bestätigen. Ersatzadressen dürfen keinen Download auslösen.
- Checkpoints verwenden `zakb-address-v2`. Alte Checkpoints sind damit keine automatische Freigabe. Kalender und daraus berechnete Touren der alten Veröffentlichung werden vor der erneuten Prüfung zurückgezogen; Archive bleiben erhalten.
- Der Abdeckungsbericht enthält den Validierungsvertrag und unterscheidet unter anderem `MissingStreet`, `AmbiguousStreet`, `AddressMismatch` und Transportfehler.

## Tests und Veröffentlichung

24 lokale Formular-, Pipeline- und PostgreSQL-Tests erfolgreich. Sie prüfen insbesondere Ortsteilzuordnung, abweichende Bestätigung, Mehrdeutigkeit, Wiederverwendung validierter Checkpoints und Rücknahme ungeprüfter Kalender. Ruff und `git diff --check` erfolgreich.

Implementierung `2c3358f`, korrigierte Abwesenheitsabfrage im zusätzlichen Test `39df76ce43192ca763260b1b0a7dbc407aa412b7`, beide auf `main` gepusht. [CI für den korrigierten Commit](https://github.com/erik-metz/hack-the-ried/actions/runs/37772978446) vollständig erfolgreich, einschließlich TimescaleDB-Verträgen und aller 17 Container-Builds samt GHCR-Veröffentlichung.

Registry-Worker auf dem VPS mit `ghcr.io/erik-metz/hack-the-ried-registry-sync-worker@sha256:9a8ef4dd9d98b933eeedb17ee6ac40ccc2aee6ab0b6c7afdd2ba998666b8d709`. Die vorhandene Image-Pin-Datei `/root/docker-compose.invekos.yml` wurde gezielt aktualisiert; vorherige Fassung als `/root/docker-compose.invekos.pre-zakb.yml` erhalten. SHA-256 von `zakb.py` stimmt mit geprüftem Code überein.

## Erneute Validierung

Der reguläre ZAKB-Lauf begann nach dem Deployment selbstständig. Ein zusätzlicher Start meldete `already_running`; kein paralleler vollständiger Crawl gestartet. Die alten ungeprüften Kalender wurden aus der aktuellen Veröffentlichung entfernt. Erste neue Adressen wurden bestätigt; eine Ersatzadresse wurde ausdrücklich abgelehnt.

Für geeignete vorhandene Kalender werden archivierte Antworten zusätzlich überprüft: Der zum Checkpoint gehörende erfolgreiche Kalender-Empfang muss weniger als eine Sekunde vor der gespeicherten Abrufzeit liegen; unmittelbar davor muss innerhalb von 120 Sekunden eine erfolgreiche Formularantwort mit exakt passender bestätigter Adresse vorliegen. Zusätzlich muss die aktuelle ZAKB-Straßenauswahl genau eine passende Ortszuordnung erlauben. iCalendar-Inhalt wird erneut geparst. Nur frische, vollständig belegte Checkpoints werden mit unveränderter ursprünglicher Abrufzeit übernommen; keine künstliche Aktualisierung des Datenalters.

Die Vorprüfung bestätigte 665 Kalender; 38 weitere waren nicht eindeutig belegbar, 141 hatten kein geeignetes frisches Archiv. Diese offenen Fälle werden nicht durch die Archivmigration freigegeben.

## Abschlussprüfung

Eine zusätzliche Live-Prüfung zeigte einen Sitzungseffekt: Nach dem Lesen mehrerer Ortsteillisten war serverseitig noch der zuletzt abgefragte Ortsteil ausgewählt. Die passende Auswahl wird daher vor dem Weitergehen erneut bestätigt. Regressionstest berücksichtigt diese serverseitige Sitzung. Korrektur `dba6013120ec823c16fdbb638b24d23a08b35b5f` gepusht; erneut 24 lokale Tests erfolgreich. [CI für genau diesen letzten Code-Commit](https://github.com/erik-metz/hack-the-ried/actions/runs/37806977709) vollständig erfolgreich, einschließlich aller 17 GHCR-Builds und Veröffentlichungen.

Finale produktive Registry-Version: `ghcr.io/erik-metz/hack-the-ried-registry-sync-worker@sha256:8f63542ddea2f7f5b88c7625340caba11b95f373ea92891a2ff656a661b62699`. SHA-256 von `zakb.py`: `3b6eabb2b7c549bfa96f2a719d56dffbcd5637ac20743d363e903b1f4e01fcdb`.

Die Archivmigration hat 665 Checkpoints eindeutig nachvalidiert, mit unveränderter ursprünglicher Abrufzeit. Vollständiger Nachweis in `collected_payloads`, SHA-256 `b3d32c4f151633748e2845eedf0fcb950bb3a5924f3c0a5384639ade328f267b`; enthält Checkpoint-Schlüssel sowie Empfangs- und Adressbestätigungsbelege. Drei Fehlermarkierungen zu diesen bewiesenen Checkpoints wurden gelöscht. Nicht belegbare Antworten wurden nicht übernommen.

Zur Abschlussprüfung wurde der laufende Registry-Worker regulär gestoppt und ein isolierter ZAKB-Durchgang mit der finalen Version ausgeführt. Nur dieser Prüfdurchgang hatte ein Budget von 60 Sekunden; die normale Konfiguration blieb unverändert. Anschließend wurde der reguläre Worker wieder gestartet.

Snapshot vom 8. Oktober 2026, 16:24:08 UTC, Verarbeitung abgeschlossen 16:25:09 UTC:

| Gemeinde | Bestätigte Straßenproben | Vorgesehene Proben |
| --- | ---: | ---: |
| Biblis | 127 | 173 |
| Bürstadt | 213 | 243 |
| Lampertheim | 295 | 354 |
| Groß-Rohrheim | 64 | 74 |
| Gesamt | 699 | 844 |

12.776 Termine sind veröffentlicht. 145 Proben waren im Snapshot nicht bestätigt: neun Fehler in diesem Lauf und 136 zurückgestellte beziehungsweise noch nicht abgefragte Proben. Die öffentliche API bestätigt `validation_contract=zakb-address-v2`, zwei veröffentlichte Datensätze und den sachlich korrekten Teilstatus. Ein leerer HTTP-Status oder Zähler im zusammenfassenden Abschlussbeleg wird nicht als null erfolgreiche Abrufe interpretiert; die nachgewiesene Kalenderabdeckung steht im veröffentlichten Coverage-Datensatz.

Ein gezielter frischer Abruf mit der finalen Version bestätigt Domstiftstraße 1 als Biblis-Nordheim: 18 Termine vom 12. Oktober bis 21. Dezember 2026, empfangen 16:26:38 UTC. Hier wurde ausschließlich für die Stichprobe ein Ein-Sekunden-Cachealter verwendet, um einen echten neuen Abruf nachzuweisen; die globale tägliche Abrufkadenz blieb unverändert. Luisenstraße 1 ist ebenfalls mit 18 Terminen validiert.

Die Reparatur verhindert falsche Adresszuordnungen; sie macht unbekannte oder beim Anbieter fehlende Straßen nicht künstlich gültig. Der reguläre Collector bearbeitet die offenen Fälle weiter. Straßenproben bleiben keine vollständige Hausnummernabdeckung. Deutsche-Bahn-Quellen bleiben übersprungen. Keine Frontend-Änderung für diesen Schritt.
