# Schritt 19: Echte Hausnummernzusätze bei ZAKB

## Änderung

Der OSM-Import übernimmt einzelne Hausnummern mit einem Buchstaben, etwa `8A`, `9 c` oder `18C`, einschließlich ihrer eigenen Knoten- bzw. Gebäudegeometrie. Bereiche und zusammengesetzte Hausnummern bleiben ausgeschlossen. Inventarversion 2 erzwingt einen echten erneuten Download, wenn nur das bisherige numerische Inventar gespeichert ist.

ZAKB erhält Zahl und Buchstaben getrennt über `aos[Hausnummer]` und `aos[Hausnummerzusatz]`. Die bestätigte Adresse muss weiterhin exakt Straße, Ort, Zahl und Zusatz entsprechen; Groß-/Kleinschreibung und Leerraum vor einem Buchstaben sind gleichwertig. Eine alternative Hausnummer aus einer Vorschlagsliste wird nicht automatisch übernommen.

Neue Nachweise verwenden `zakb-house-suffix-v1`; bestehende numerische Nachweise sowie die zwei ausdrücklich geprüften Zahlenbereiche behalten ihre bisherigen Schlüssel. Jeder veröffentlichte Kalender gehört weiterhin nur zur tatsächlich angefragten repräsentativen Adresse, nicht automatisch zur gesamten Straße.

## Prüfung

Gezielte Tests prüfen Formularfelder, abweichende Adressbestätigungen, getrennte Schlüssel, tatsächliche Geometrie, Wiederaufnahme und die Erneuerung alter Inventare. 97 gezielte Tests einschließlich PostgreSQL-Verträgen erfolgreich; Ruff für alle geänderten Python-Dateien und `git diff --check` erfolgreich.

## Unverändert offene Fälle

`Bei den Münchäckern 60` und `Am Sportplatz 11` werden durch Buchstabenunterstützung nicht korrigiert. Weder wird eine andere Adresse erfunden noch eine vorhandene Geometrie auf einen anderen Standort übertragen.

## Veröffentlichung und VPS-Nachweis (9. Oktober 2026)

- Implementierung: Commit `6f6413947c989433de662346c10b2c62c1900bb3`, auf `main` gepusht.
- [FastAPI & Docker CI/CD, Lauf 37934320361](https://github.com/erik-metz/hack-the-ried/actions/runs/37934320361): vollständig erfolgreich, alle 15 Prüfjobs und alle 17 Container-Builds mit GHCR-Veröffentlichung erfolgreich.
- Laufendes Registry-Image: `sha256:88a87fe627e4e4e95021d8d9046be3982ca794faccd43a556d0c02ea3728bd36`. Laufzeit-Hashes von `zakb.py` und `osm_addresses.py` entsprechen den geprüften Dateien.
- Echter erneuter OSM-Import, Inventarversion 2: abgeschlossen am 09.10.2026 um 15:25 Uhr MESZ. Die SSH-Verbindung wurde während des langen Imports unterbrochen; der erfolgreiche Abschluss wurde anschließend anhand gespeicherter Daten und öffentlicher API nachgewiesen.
- `An den Rebenäckern 8A`, Biblis: OSM-Way `1106765386`; eigener Gebäude-Mittelpunkt **49.68200135, 8.4340795**. ZAKB-Nachweis vom 09.10.2026 um 15:25 Uhr MESZ mit **15 Terminen**, öffentlich abrufbar. Die Veröffentlichung bleibt auf diese tatsächlich bestätigte Adresse begrenzt.
- OSM-Elternextrakt SHA-256: `95b332774925967f06938a3168e3912a704af02fe4770ca0339c68c76faf9550`. Kalender SHA-256: `2d2292a999ebfbc5e152e8fdb023baf101ff4244472b9875bf01fa950ead7a7e`; gespeicherter Inhalt gegen Hash geprüft.

## Tatsächliche Abdeckung nach dem Import

Vorher **821 von 844 Straßen**, 14.807 Termine. Nachher **822 von 845 Straßen**, 14.822 Termine. Der zusätzliche Inventareintrag ist `Berliner Weg`, Biblis, mit realen Buchstaben-Hausnummern. Dieser Straßenname wird derzeit bei ZAKB nicht angeboten.

Damit bleiben **23 Straßen ohne validierten Kalendernachweis**: 21 Straßen mit `MissingStreet` und die beiden oben genannten Adressen mit `AddressNotAccepted`. Das sind Inventar-/Adresszuordnungsprobleme, kein Beleg für einen vollständigen Ausfall des ZAKB-Datenabrufs. `remaining_streets` in der Laufstatistik zählt nur unbearbeitete bzw. zurückgestellte Straßen; für die Gesamtzahl offener Straßen wurden Inventar und tatsächlich veröffentlichte Kalender abgeglichen.

Öffentliche Nachweise: [Abdeckung](https://api.hack-the-ried.de/api/v1/collected/waste/coverage), [Kalender](https://api.hack-the-ried.de/api/v1/collected/waste/calendar), [Quellenstatus](https://api.hack-the-ried.de/api/v1/collection/status). OSM meldet `success`, ZAKB bleibt aufgrund der offenen Straßen korrekt `partial`.

Als nächster begrenzter Schritt bietet sich die Prüfung der fehlenden Straßennamen einschließlich `Berliner Weg` auf belegbare Anbieter-Schreibweisen und Ortsteilzuordnungen an. Deutsche-Bahn-Quellen bleiben gemäß Nutzerwunsch übersprungen.
