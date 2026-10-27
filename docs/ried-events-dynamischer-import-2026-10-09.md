# Dynamischer Vereinsimport statt einzelner Termine

Die KKM-Quelle ist aktiv und wird alle sechs Stunden vollständig neu gelesen.
Der Import verwendet die veröffentlichten Datumsangaben; das Zeitfenster umfasst
das laufende und folgende Kalenderjahr und verschiebt sich automatisch.
Neue Zeilen benötigen keine Freigabe einzelner Veranstaltungstitel.

## Umgesetzter Schritt

Eine wiederverwendbare Ortszuordnung für den Titelabschluss „St. Michael“ ergänzt
den bisherigen Vereinsimport. Dadurch wird das Weihnachtskonzert am 13.12.2026
in Bürstadt übernommen, ebenso neue Veranstaltungen mit anderen Titeln und
Datumsangaben an diesem Ort. Es wurde kein fester Konzerttermin programmiert.
Eine ausdrücklich vorhandene Ortsspalte hat Vorrang. Termine außerhalb des Ried
und Termine ohne zuordenbaren Veranstaltungsort bleiben ausgeschlossen.
Unbekannte Uhrzeiten und Preise werden weiterhin ausdrücklich als unbekannt
beschrieben; Tagesgrenzen dienen nur der Kalenderdarstellung.

## Nächster Schritt für die Abdeckung

Die angebundenen Quellen insgesamt auf Aktualisierung, vollständig gelesene
Kalenderseiten und verworfene Orts-/Datumsangaben prüfen. Daraus die häufigsten
Lücken je Quellenformat beheben und zusätzliche öffentliche Ried-Kalender
anbinden. Schwerpunkt sind vollständige Quellen, keine Listen einzelner Termine.
Bereits vorhandene jahresgebundene Sonderimporte separat auf eine Umstellung auf
dynamische Kalender oder Veranstalterfeeds prüfen.

## Prüfung

40 Tests des Vereinsimports erfolgreich; Ruff für die geänderten Python-Dateien
und `git diff --check` erfolgreich. Ein neuer Test prüft insbesondere einen neu
ergänzten Veranstaltungstitel im Folgejahr sowie den Ausschluss von Lorsch und
Terminen ohne Ortsangabe.

## Veröffentlichung

Implementierung: `a41b59d6eda2f7b0f99cbd6b42ab3f8a27478c1d`, auf `main` gepusht.
[FastAPI & Docker CI/CD](https://github.com/erik-metz/hack-the-ried/actions/runs/37934210585)
für genau diesen Commit vollständig erfolgreich, einschließlich aller 17
Container-Builds und Veröffentlichungen auf GHCR.
Der VPS-Importdienst wurde auf das geprüfte Image
`sha256:88a87fe627e4e4e95021d8d9046be3982ca794faccd43a556d0c02ea3728bd36`
aktualisiert. Alle übrigen bestehenden Quellkonfigurationen wurden vor dem
Update auf unveränderte Übernahme geprüft.

Der anschließend ausgelöste KKM-Abruf lieferte HTTP 200 und 14 übernommene Termine.
Die öffentliche API enthält danach 349 Veranstaltungen, darunter genau einen
KKM-Weihnachtskonzert-Eintrag am 13.12.2026 (deutsche Ortszeit), mit Pfarrkirche
St. Michael in Bürstadt und dem ausdrücklichen Hinweis auf fehlende Uhrzeiten.

Ein ergänzender Statusabruf zeigt 26 aktive Social-Quellen. Die Quelle
`tvl-triathlon-regular-offers` meldet einen Fehler und gehört auf die Prüfliste
für den nächsten Schritt; sie wurde in diesem Schritt nicht verändert.
