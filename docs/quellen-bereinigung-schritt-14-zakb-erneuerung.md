# Schritt 14: ZAKB-Kalender rechtzeitig erneuern

## Ursache

Die bisherige Reihenfolge bevorzugte alphabetisch sortierte Straßen. Bei begrenzten Laufzeiten konnten ältere Nachweise am Ende wiederholt warten. Außerdem wurde die bewährte Ersatzhausnummer nach Ablauf ihres Checkpoints nicht mehr bevorzugt. Der tägliche reguläre Prüfrhythmus und die 24-Stunden-Cachefrist waren an denselben Parameter gekoppelt.

Vor dem Deployment hat sich der alte Worker bereits wieder auf 793 bestätigte von 844 Straßenproben erholt. Diese Erholung ist kein Ergebnis der neuen Änderung. Sie zeigt, dass die bestehenden Teilläufe weiterarbeiten; die Änderung soll vor allem die Wiederholung von Aktualisierungslücken verhindern.

## Änderung

- Stündlicher regulärer Prüfrhythmus, unabhängig von der unveränderten 24-Stunden-Frischegrenze gespeicherter Kalender.
- Erneuerung beginnt ab zwölf Stunden Alter.
- Bereits bestätigte Hausnummern bleiben auch nach Ablauf der erste Kandidat. Tatsächliche Inventaralternativen bleiben begrenzt auf insgesamt drei Proben.
- Alle noch frischen Kalender werden vor neuen Anbieteranfragen geladen und veröffentlicht.
- Überfällige bekannte Nachweise und anschließend frühzeitig fällige Erneuerungen werden nach ihrem tatsächlichen Abrufzeitpunkt abgearbeitet. Erfolgreiche Erneuerungen erhalten einen neuen Zeitpunkt; der nächste Lauf arbeitet dadurch an den verbliebenen ältesten Nachweisen weiter.
- Ein Erneuerungsfehler entfernt keinen noch frischen Kalender. Diese Fehler und die noch ausstehenden Erneuerungen werden getrennt in der Coverage veröffentlicht.
- Die bestehenden Wiederholungsfristen, Anbieterabstände, Quellensperre und der strenge Adressvertrag bleiben erhalten. Abgelaufene Nachweise werden nicht künstlich verlängert.

Deutsche-Bahn-Quellen bleiben übersprungen.

## Prüfung

34 relevante lokale PostgreSQL-, Formular-, Scheduling- und Vertragstests erfolgreich. Die neuen Prüfungen belegen die Wiederverwendung einer bewährten Ersatzhausnummer nach Ablauf, älteste Erneuerung vor alphabetischer Reihenfolge, Fortschritt im nächsten Lauf und den Erhalt eines frischen Kalenders bei fehlgeschlagener Erneuerung. Ruff für die eigenen geänderten Python-Dateien und `git diff --check` erfolgreich.

Commit `1a1f3a8fe09e1cfcdac1e585fa00983abdcb4d57` ist auf `main` gepusht. [FastAPI & Docker CI/CD](https://github.com/erik-metz/hack-the-ried/actions/runs/37891836185) ist für exakt diesen Commit vollständig erfolgreich abgeschlossen: alle 15 Prüfjobs und alle 17 vorgesehenen GHCR-Builds einschließlich Veröffentlichung.

Registry-Image für das gezielte Deployment: `ghcr.io/erik-metz/hack-the-ried-registry-sync-worker@sha256:10863e3dbc2e8db4be7ee59a6e37a80bcb22c8ad9ce2948fa14d780f7f49684f`. Code-SHA-256 der neuen `zakb.py`: `8968e61c373d721a073e45b46496c470c3973749204b0d24ea4077ec706c54a4`.

## Deployment und produktive Prüfung

Am 9. Oktober 2026 ist der SSH-Zugriff wieder verfügbar. Der vorherige Verbindungs-Timeout ist damit kein aktueller Deployment-Blocker mehr.

Vor dem Wechsel wurden die aktiven Compose-Dateien und die Laufzeitdateien verglichen. Zwischen dem laufenden Image und dem vorbereiteten Image unterschieden sich nur `/app/zakb.py` und `/app/sources.json`. Die aktive Compose-Kombination `/root/docker-compose.yml`, `/root/docker-compose.override.yml` und `/root/docker-compose.invekos.yml` wurde beibehalten. Nur das Registry-Image wurde aktualisiert; der bisherige Pin ist in `/root/docker-compose.zakb-pre-renewal.yml` gesichert.

Der reguläre Registry-Worker läuft mit dem oben dokumentierten Image. Die Code-Prüfsumme stimmt exakt mit `8968e61c373d721a073e45b46496c470c3973749204b0d24ea4077ec706c54a4` überein. Die geladenen Einstellungen sind 3.600 Sekunden regulärer Prüfrhythmus, 86.400 Sekunden Cache-Frische und 43.200 Sekunden Erneuerungsschwelle.

Ein begrenzter tatsächlicher ZAKB-Prüflauf mit 120 Sekunden Netzwerkbudget bestätigt:

- Zwölf gespeicherte Kalender wurden tatsächlich neu abgerufen. Ihre vorherigen Zeitpunkte lagen am 8. Oktober zwischen 16:01 und 16:04 UTC, die neuen Zeitpunkte am 9. Oktober zwischen 07:14 und 07:15 UTC. Die neuen Zeitpunkte stammen aus den tatsächlichen Provider-Abrufen.
- 793 von 844 Straßenproben bleiben bestätigt; 14.348 Kalenderereignisse sind veröffentlicht. Die Erneuerung hat noch frische Kalender nicht entfernt.
- 130 bekannte Kalender sind noch zur Erneuerung vorgemerkt. Der reguläre Worker ist wieder gestartet und setzt diese Arbeit mit der neuen Reihenfolge fort.
- Am Ende des begrenzten Budgets entstand ein Erneuerungs-Timeout für die Bahnhofstraße in Groß-Rohrheim. Ihr noch frischer bestätigter Kalender blieb veröffentlicht; der Fehler steht getrennt unter `refresh_failed_streets`.
- Die gesamte Quelle bleibt korrekt `partial`: 51 Straßen haben weiterhin keine gültige veröffentlichte Probe. Diese Anbieter- und Adressfälle sind von den noch ausstehenden Erneuerungen zu unterscheiden.

Die öffentlichen Coverage- und Kalender-Endpunkte wurden unabhängig abgefragt: Adressvertrag `zakb-address-v2`, Frischegrenze 86.400 Sekunden, Erneuerungsschwelle 43.200 Sekunden, zwölf Erneuerungen, 793 bestätigte Straßen und 14.348 Ereignisse. Der erste Live-Prüfversuch wurde noch korrekt mit `already_running` abgewiesen, solange der alte Worker stoppte; für die Erfolgsmeldung wurde ausschließlich der danach abgeschlossene echte Lauf verwendet.

Deutsche-Bahn-Quellen bleiben übersprungen. Das Deployment und die produktive Verifikation dieses Schritts sind abgeschlossen. Dieser reine Dokumentationscommit benötigt wegen der Workflow-Pfadfilter keinen zusätzlichen CI-/GHCR-Lauf; der nachgewiesene erfolgreiche Lauf für die implementierte Änderung bleibt der oben verlinkte exakte Code-Commit.
