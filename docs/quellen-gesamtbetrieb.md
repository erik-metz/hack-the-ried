# Betriebsabnahme der API-Evangelist-Erweiterungen

Prüfung am 9. Oktober 2026 (00:11 Uhr Europe/Berlin). [Datenbank- und HTTP-Evidenz](evidence/2026-10-09-source-operations-audit.json). Die Momentaufnahme ist keine dauerhafte Verfügbarkeitszusage.

| Quelle | Letzter erfolgreicher Abruf (UTC, 8. Oktober) | Ergebnis | Einmalig gespeicherte Payloads |
|---|---|---|---|
| ECOSTRESS-Katalog | 22:00:37 | 20 Szenen im öffentlichen Standardausschnitt | 52, 47.132.627 Bytes |
| ECOSTRESS-Raster | 22:00:45 | 17 erfolgreich gespeicherte Ausschnitte | 17, 1.051.434 Bytes |
| FIRMS | 22:00:53 | Erfolgreich, null Anomalien; kein Fehler | 1, 122 Bytes |
| iNaturalist | 22:01:32 | 1.726 zulässige Meldungen, Download standardmäßig 1.679 nach GBIF-Abgleich | 3 reine Abrufbelege, 3.237 Bytes |
| SolarEdge/Energie | Kein Erfolg | Kein Betreiberzugang, deaktiviert | Keine |

ECOSTRESS hatte bei der Einrichtung zwei Katalogfehler und sieben Rasterfehler; alle jüngsten geprüften Abrufe sind erfolgreich. Frühere `not_configured`-Belege bleiben nachvollziehbar. FIRMS und iNaturalist haben in dieser Momentaufnahme keine Fehler. Der Anlagenzugang für SolarEdge fehlt weiterhin; dieser Teil des Plans ist ausdrücklich offen.

## Aktualität, Zeitbezug und Laufzeit

FIRMS sammelt stündlich die letzten drei UTC-Kalendertage, wird nach zwei Stunden als veraltet gekennzeichnet und liefert im Download dieselbe Auswahl. Null Treffer sind ein erfolgreicher leerer Abruf, kein Beweis für die Abwesenheit von Bränden. FRP wird in MW geführt.

ECOSTRESS wird täglich geprüft; die Katalogpublikation hat 48 Stunden Gültigkeit. Erwerbszeit des Satellitenrasters und Katalogabruf sind getrennte Angaben. Es gibt keine tägliche Überfluggarantie. Die Rasterwerte sind Oberflächentemperaturen in °C, mit Qualitäts-/Wolken-/Wasserfilter, keine Lufttemperatur. Der letzte Katalogbeleg wurde rund 16 Sekunden nach Empfang fertig verarbeitet; dieser Wert enthält nicht die gesamte vorgelagerte Netzlaufzeit.

iNaturalist wird täglich vollständig überprüft, mit 36 Stunden Veröffentlichungsgültigkeit. Ein Beobachtungstag ist keine präzise Uhrzeit; der Kernwert ist `occurrence_presence=1`, Einheit `count`. Die aktuellen 1.727 API-Treffer benötigen neun Seiten. Der Abstand von gespeicherter Abrufstartzeit zur aktuellen Publikation beträgt rund 152 Sekunden; das ist eine Momentaufnahme, keine Laufzeitgarantie. `processed_at - received_at` allein unterschätzt den gesamten Import, weil der Auditbeleg erst nach dem Seitenabruf entsteht.

## Aufbewahrung und Speicher

Die vorhandene Repository-Vorgabe behält historische öffentliche Quelldaten unbegrenzt; diese Abnahme führt keine automatischen Löschungen ein. ECOSTRESS speichert maximal zwei neue oder revidierte Ausschnitte pro Lauf und stoppt neue Raster bei 500 MiB Quellenbudget. FIRMS stoppt neue Rohpayloads bei 50 MiB. Identische Inhalte werden durch SHA-256 dedupliziert. Katalogmetadaten und Abrufbelege haben keine automatische Löschfrist. Bei Budgetüberschreitung muss Speicher erweitert oder eine referenzsichere Aufbewahrungsänderung beschlossen werden; verknüpfte Archive dürfen nicht einfach gelöscht werden.

iNaturalist ist wegen veränderlicher Freigaben eine bereits vereinbarte Ausnahme: nur die aktuelle Positionspublikation und eine Dataset-Version; historische Auditbelege enthalten ausschließlich Summen, Query und Hashes. Die aktuelle JSON-Publikation belegt rund 1,26 MB. Erfolgreiche Aktualisierungen ersetzen die eigenen Kernwerte und entfernen verschwundene, verdeckte oder nicht mehr zulässig lizenzierte Meldungen. Fehlgeschlagene Überprüfungen sperren und entfernen die bisherige Publikation. Ablauf nach 36 Stunden liefert keine Positionen mehr. Monatsarchive enthalten keine iNaturalist-Kernwerte.

Die gesamte gemeinsam genutzte Datenbank belegt rund 14,18 GB; `collected_payloads` einschließlich Indizes/TOAST rund 6,19 GB und Abrufbelege rund 69,9 MB. Auf dem gemeinsamen Dateisystem sind bei der Prüfung rund 62,98 GB frei (39 % belegt). Diese Gesamtwerte gehören überwiegend anderen Quellen. Sie sind weder Backupgröße noch freier Plattenplatz. Die Energiequelle hat 9.916 kleine `not_configured`-Belege: der allgemeine Scheduler dokumentiert auch deaktivierte Quellen. Keine fremden Belege wurden gelöscht. Neuveröffentlichungen und Worker-Neustarts können zusätzliche Abrufe auslösen; daraus ist keine verlässliche tägliche Wachstumsrate ableitbar.

## Datenschutz, Herkunft und Export

Nur offene und passend lizenzierte iNaturalist-Meldungen werden veröffentlicht. Quellenlinks, CC0/CC-BY/CC-BY-SA und bei erforderlicher Namensnennung der öffentliche Login werden mitgeliefert. Private Profile, Bilder und ursprüngliche API-Antworten werden nicht dauerhaft archiviert. Ein praktischer Widerruf wird durch simulierten Wegfall einer vorher vorhandenen Meldung in einer echten Testdatenbank geprüft; eine fremde produktive Beobachtung wurde dafür nicht verändert. Fehler-, Ablauf- und Sichtbarkeitstests bestehen.

Bei der Betriebsprüfung wurde eine Umgehung über allgemeine Messwert-/ZIP-Endpunkte gefunden. iNaturalist wird dort nun vollständig ausgeschlossen, auch aus Stichproben und verknüpften Definitionen/Entitäten. Der eigene aktuelle JSON-Download bleibt verfügbar und prüft Ablauf sowie letzten Abruffehler ohne HTTP-Cache. Der neue Regressionstest prüft diese Sperre mit echten SQL-Abfragen und erhält normale Quellen im Export.

62 Collectorprüfungen (ECOSTRESS, FIRMS, iNaturalist), elf API-Exporttests mit vier Subtests und Ruff bestehen lokal. Produktive HTTP-Antworten und Downloadstatus wurden geprüft. Die bisherige Darstellung wurde bereits bei den einzelnen Quellenschritten abgenommen; diese Änderung betrifft keine Frontenddateien. SolarEdge-Widerruf und Vergleich mit einer Betreiberanzeige bleiben mangels freigegebener Anlage unprüfbar.

## Veröffentlichung und produktive Nachprüfung

Implementierungscommit `f14668c11a69bc236fbeee413c1e0bbe3e7c9542` ist auf `main` gepusht. [FastAPI & Docker CI/CD](https://github.com/erik-metz/hack-the-ried/actions/runs/37852178584) ist erfolgreich: alle 16 Jobs und alle 17 vorgesehenen Build-/Push-Schritte auf GHCR. Keine Frontendänderung, daher kein Frontend-CI-Lauf vorgesehen.

Das veröffentlichte API-Image wurde vor und nach dem Start über die SHA-256-Hashes beider geänderten Dateien geprüft. Die vorhandenen drei Compose-Dateien wurden beibehalten; nur die API wurde aktualisiert. Der eigene iNaturalist-Download liefert produktiv weiter 1.679 Meldungen, die allgemeine Messwertabfrage derselben öffentlichen Beobachtung keine. Die öffentliche ZIP-Stichprobe enthält 298 Entitäten und keine iNaturalist-Entität. FIRMS-Abfrage und Download stimmen überein. Ein echter ECOSTRESS-Crop-Download stimmt mit dem archivierten Hash überein und führt die Einheit `degC`; sein vollständig maskierter Ausschnitt hat keinen Temperaturmittelwert.

Schritt 6 ist für die vorhandenen Quellen abgeschlossen. Schritt 5 bleibt offen: Ohne teilnehmenden SolarEdge-Betreiber sind Freigabe, Zugriff und Widerruf einer Anlage nicht prüfbar.
