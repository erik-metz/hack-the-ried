# Schritt 12: Offene ZAKB-Straßenproben

## Ausgangslage

Am Beginn dieser Prüfung zeigte der laufende Collector 705 bestätigte von 844 Straßenproben. Die Fehler zu den bisher ausgewählten Adressen verteilten sich auf 87 generische `ValueError`, 39 `MissingStreet`, acht `AddressMismatch`, drei Verbindungsabbrüche und zwei mehrdeutige Ortsteilzuordnungen. Fehler zu einer einzelnen Hausnummer dürfen nicht mit einer vollständigen Nichtverfügbarkeit der Straße gleichgesetzt werden.

Live-Prüfungen zeigen: Weidenweg 1 und 2 sowie Industriestraße 1 und 3 werden abgelehnt; Kornstraße 1 wird ebenfalls abgelehnt, Kornstraße 3 liefert dagegen 18 Termine. Alle geprüften Hausnummern stammen aus dem tatsächlich gespeicherten OSM-Inventar.

## Reparatur

- Statt ausschließlich der kleinsten Hausnummer werden bei einer abgelehnten oder abweichend bestätigten Adresse höchstens drei echte Inventaradressen derselben Straße geprüft. Jede Alternative behält ihre eigenen Koordinaten.
- Ein vorhandener frischer, nach der Adressregel validierter Checkpoint hat Vorrang. Damit bleibt die belegte Ersatzprobe auch im nächsten Lauf erhalten.
- Straßen-, Ortsteil- und Hausnummernbestätigung bleiben verpflichtend. Fehlende oder mehrdeutige Straßen lösen keine Hausnummern-Ratesuche aus.
- Die bisher generische Ablehnung wird als `AddressNotAccepted` ausgewiesen.
- Ein konservativer Vergleich mit Unicode-NFKC, Casefold und vereinheitlichten Leerzeichen erkennt reine Schreibweisenunterschiede. Der Collector sendet den tatsächlichen ZAKB-Auswahlwert und verlangt dessen genaue Bestätigung. Kein unscharfer Namensvergleich.

Die aktuelle ZAKB-Auswahlliste bestätigt diese sieben Schreibweisenpaare:

| Inventar | ZAKB-Auswahl |
| --- | --- |
| In den Elf Morgen | In den elf Morgen |
| Theodor-Heuss-Straße | Theodor-Heuß-Straße |
| Oberschultheiß-Schremser-Straße | Oberschultheiss-Schremser-Straße |
| RWE-Siedlung | Rwe-Siedlung |
| Martinstraße | Martinstrasse |
| Am Alten Friedhof | Am alten Friedhof |
| Am Meßplatz | Am Messplatz |

## Prüfung

27 lokale Formular-, Pipeline- und PostgreSQL-Tests erfolgreich. Neue Tests prüfen die belegte Ersatzhausnummer mit eigenen Koordinaten, Wiederverwendung beim nächsten Lauf, die Obergrenze von drei Proben, die Nichtveröffentlichung abgelehnter Adressen und das Senden des tatsächlichen Provider-Auswahlwerts bei Schreibweisenunterschieden. Ruff und `git diff --check` erfolgreich.

Commits: `2e00052` (belegte Hausnummernalternativen) und `1939b1c3828f062108e8fc5db6834e30beb8257d` (Schreibweisenvergleich), beide auf `main` gepusht. Der exakte Commit `1939b1c3828f062108e8fc5db6834e30beb8257d` hat [FastAPI & Docker CI/CD](https://github.com/erik-metz/hack-the-ried/actions/runs/37846717261) vollständig erfolgreich abgeschlossen, einschließlich aller 17 vorgesehenen GHCR-Builds und Veröffentlichungen.

Der einmalige ZAKB-Prüflauf nutzt das daraus veröffentlichte Registry-Image `sha256:53964b9824f3d12dadc58b79ac12a85b4e520050b0e5dd4939f48fd0795895a7` mit 900 Sekunden Abrufbudget. Der reguläre Worker wurde währenddessen wieder gestartet; die bestehende Quellensperre verhindert doppelte ZAKB-Abrufe. Ein inzwischen parallel veröffentlichtes neueres Registry-Image wurde beibehalten. Der geprüfte ZAKB-Code ist auch dort unverändert enthalten: SHA-256 `9cf5e7f5e88e27c40e48970486c4393350f5bf49fc8bd7b9f71b2f37a202c3d9`.

Der erste Prüflauf veröffentlichte 745 bestätigte von 844 Straßenproben und 13.577 Kalenderereignisse. Das sind 40 zusätzliche bestätigte Straßen gegenüber dem Ausgangsstand. 32 Straßen wurden im Lauf abgelehnt; 67 waren noch zurückgestellt oder wegen des Zeitbudgets nicht abschließend geprüft. Deshalb folgt ein weiterer begrenzter Lauf mit 600 Sekunden Budget, ohne parallelen ZAKB-Abruf. Die abschließende Restliste folgt unten.

Deutsche-Bahn-Quellen bleiben übersprungen. Unbekannte Straßen und mehrdeutige Ortsteile werden nicht künstlich als erfolgreich markiert.

## Abschließende Live-Prüfung

Am 9. Oktober 2026 kurz nach Mitternacht (Europe/Berlin) bestätigt die öffentliche API 759 von 844 Straßenproben und 13.818 Kalenderereignisse. Gegenüber 705 bestätigten Proben zu Beginn ist das eine Nettoverbesserung um 54 Straßen. Die 24-Stunden-Frischegrenze für gespeicherte Kalender bleibt erhalten; während der Prüfung abgelaufene Checkpoints müssen erneut abgerufen werden. Erfolgreiche Einzelabrufe sind deshalb nicht automatisch zusätzliche Straßen gegenüber dem Ausgangsstand.

| Gemeinde | Bestätigt | Inventarproben | Offen |
| --- | ---: | ---: | ---: |
| Biblis | 154 | 173 | 19 |
| Bürstadt | 221 | 243 | 22 |
| Lampertheim | 312 | 354 | 42 |
| Groß-Rohrheim | 72 | 74 | 2 |

85 Straßen haben im abschließenden veröffentlichten Kalender keine gültige Probe. Der letzte Lauf meldet 40 Fehler und 45 übrige Straßen; davon wurden sieben wegen der Wiederholungsfrist zurückgestellt und 38 wegen des Zeitbudgets nicht abschließend geprüft. `partial` bleibt damit korrekt. Dies ist weiterhin eine repräsentative Straßenprobe und keine vollständige Hausnummernabdeckung.

Die Kalender- und Coverage-Endpunkte wurden unabhängig abgefragt: `zakb-address-v2`, 759 bestätigte Straßen, 13.818 Ereignisse. Kornstraße 3 in Groß-Rohrheim ist mit ihren eigenen Inventarkoordinaten 49.7166029 / 8.4715922 veröffentlicht. Auch die Schreibweisenfälle Am Meßplatz 2, Martinstraße 2 und Oberschultheiß-Schremser-Straße 3 in Bürstadt sind veröffentlicht.

Der reguläre Registry-Worker läuft mit dem geprüften ZAKB-Code. Das zwischenzeitlich parallel aktualisierte Registry-Image wurde beibehalten; fremde Änderungen wurden nicht zurückgesetzt. Der erste Prüflauf hatte seinen Teilstatus und die Kalender veröffentlicht, obwohl seine SSH-Verbindung anschließend hängen blieb; nur diese abgeschlossene Verbindung wurde beendet. Der zweite Prüflauf beendete sich regulär mit `partial`.

## Verbleibende Straßen

Die folgende Liste gleicht das Inventar mit tatsächlich veröffentlichten Kalendern ab. Bereits bestätigte Straßen werden auch dann nicht aufgeführt, wenn noch alte Fehler zu einer anderen Hausnummer existieren. Bei Straßen ohne Fehler des letzten Laufs steht der zuletzt gespeicherte Fehler; ein alter generischer `ValueError` ist keine aktuelle eindeutige Diagnose. Die Hausnummernspalte nennt die maximal drei kleinsten realen Inventarkandidaten, nicht die Zusicherung, dass alle im letzten Lauf geprüft wurden.

| Gemeinde | Straße | Inventarkandidaten | Letzter Fehler / Stand |
| --- | --- | --- | --- |
| Biblis | Am Tambourinsee | 1 | MissingStreet |
| Biblis | Am Wadowski See | 1, 5, 6 | MissingStreet |
| Biblis | An den Rebenäckern | 2, 29, 48 | AddressNotAccepted |
| Biblis | An der Schleuse | 1 | MissingStreet |
| Biblis | Außerhalb | 4, 6, 7 | MissingStreet |
| Biblis | Außerhalb (Nordheim) | 2, 3, 8 | MissingStreet |
| Biblis | Außerhalb (Wattenheim) | 3, 7, 8 | MissingStreet |
| Biblis | Bachgasse | 1, 2, 3 | AmbiguousStreet |
| Biblis | Bei den Münchäckern | 60 | AddressNotAccepted |
| Biblis | Dungauer Weg | 3, 16, 17 | MissingStreet |
| Biblis | Eichenweg | 16, 17 | MissingStreet |
| Biblis | Enggasse | 1, 2, 4 | AmbiguousStreet |
| Biblis | Friedensstraße | 1, 2, 3 | MissingStreet |
| Biblis | Geranienweg | 1, 5 | AddressNotAccepted |
| Biblis | Im Rohrbusch | 1, 2, 3 | AddressNotAccepted |
| Biblis | In den Kesselwiesen | 1 | MissingStreet |
| Biblis | Josef-Seib-Straße | 1, 3, 5 | AddressMismatch |
| Biblis | Neben dem Dungauer Deich | 3, 4, 5 | AddressNotAccepted |
| Biblis | Neuländer Pfad | 1, 2, 3 | MissingStreet |
| Bürstadt | Am Fischweiher | 3 | MissingStreet |
| Bürstadt | Am Sportplatz | 11 | ValueError |
| Bürstadt | Außerhalb | 2, 3, 13 | MissingStreet |
| Bürstadt | Friedrich-Ebert-Straße | 1, 2, 3 | RemoteProtocolError |
| Bürstadt | Gartenstraße | 1, 2, 3 | AddressNotAccepted |
| Bürstadt | Hermann-Löns-Straße | 1, 2, 3 | MissingStreet |
| Bürstadt | Kirchgasse | 1, 2, 3 | MissingStreet |
| Bürstadt | Kleine Gewerbestraße | 4 | MissingStreet |
| Bürstadt | Lilienthalstraße | 2, 4, 6 | AddressNotAccepted |
| Bürstadt | Sofienstraße | 1, 2, 3 | MissingStreet |
| Bürstadt | Spessartstraße | 1, 2, 3 | TimeoutError |
| Bürstadt | Sputnikweg | 1, 3, 5 | nicht versucht |
| Bürstadt | St.-Gallus-Straße | 1, 2, 3 | nicht versucht |
| Bürstadt | St.-Hubertus-Weg | 1, 2, 3 | ValueError |
| Bürstadt | Theodor-Heuss-Straße | 1, 2, 3 | MissingStreet |
| Bürstadt | Vinzenzstraße | 2, 4, 6 | MissingStreet |
| Bürstadt | Waldgartenstraße | 4, 8, 9 | ValueError |
| Bürstadt | Wasserwerkstraße | 1, 2, 4 | AddressMismatch |
| Bürstadt | Weidenweg | 1, 2, 4 | ValueError |
| Bürstadt | Wolfstraße | 1, 2, 3 | ValueError |
| Bürstadt | Zeppelinstraße | 2, 3, 5 | MissingStreet |
| Bürstadt | Zur Biogasanlage | 1, 2, 3 | ValueError |
| Groß-Rohrheim | Carl-Benz-Straße | 4, 7, 15 | AddressNotAccepted |
| Groß-Rohrheim | Römerweg | 1, 2, 3 | AddressNotAccepted |
| Lampertheim | Albert-Schweitzer-Straße | 4, 5, 6 | MissingStreet |
| Lampertheim | Alte Wormser Straße | 1, 3, 5 | MissingStreet |
| Lampertheim | Am Küblinger Damm | 5 | MissingStreet |
| Lampertheim | Ausserhalb Brunnengewännchen | 1 | MissingStreet |
| Lampertheim | Außerhalb | 1, 2, 3 | AddressNotAccepted |
| Lampertheim | Außerhalb Ost | 24, 41 | MissingStreet |
| Lampertheim | Außerhalb-Brunnengewännchen | 3 | MissingStreet |
| Lampertheim | Außerhalb-Große Lache | 1, 2 | MissingStreet |
| Lampertheim | Außerhalb-In der Bildgewann | 1 | MissingStreet |
| Lampertheim | Bahnhaus | 6 | MissingStreet |
| Lampertheim | Finkenstraße | 1, 3, 5 | AddressNotAccepted |
| Lampertheim | Georg-Tyczka-Straße | 4, 5 | AddressMismatch |
| Lampertheim | Habichtsweg | 1, 3, 4 | AddressMismatch |
| Lampertheim | Johann-Stelz-Straße | 1, 2, 4 | RemoteProtocolError |
| Lampertheim | Klärwerkstraße | 2, 4, 7 | AddressNotAccepted |
| Lampertheim | Kurpfalzstraße | 1, 2, 3 | nicht versucht |
| Lampertheim | Kurt-Schumacher-Straße | 1, 2, 3 | ValueError |
| Lampertheim | Küblinger Weg | 2, 4, 6 | ValueError |
| Lampertheim | Lorscher Straße | 1, 2, 4 | ValueError |
| Lampertheim | Ludwigstraße | 1, 2, 3 | ValueError |
| Lampertheim | Maldegemstraße | 2, 4, 5 | AddressMismatch |
| Lampertheim | Mannheimer Straße | 1, 3, 5 | ValueError |
| Lampertheim | Moltkestraße | 1, 2, 3 | ValueError |
| Lampertheim | Neugasse | 1, 2, 3 | ValueError |
| Lampertheim | Nibelungenstraße | 1, 2, 3 | ValueError |
| Lampertheim | Otto-Hahn-Straße | 2, 3, 4 | ValueError |
| Lampertheim | Peter-Bieber-Straße | 3, 5, 7 | ValueError |
| Lampertheim | Pfaffenwiese | 2, 3, 4 | ValueError |
| Lampertheim | Poststraße | 2, 3, 5 | ValueError |
| Lampertheim | RWE-Siedlung | 1, 2, 3 | MissingStreet |
| Lampertheim | Reisstraße | 1, 2, 3 | ValueError |
| Lampertheim | Ringstraße | 1, 3, 4 | ValueError |
| Lampertheim | Rosenaustraße | 10, 12, 15 | ValueError |
| Lampertheim | Schifferstraße | 1, 2, 3 | ValueError |
| Lampertheim | Schillerstraße | 1, 2, 4 | ValueError |
| Lampertheim | Schwimmbadstraße | 1, 3, 4 | ValueError |
| Lampertheim | Seebuckel | 1 | MissingStreet |
| Lampertheim | Seehof | 5 | MissingStreet |
| Lampertheim | Ulmenweg | 1, 2, 3 | AddressMismatch |
| Lampertheim | Wierdenstraße | 1, 3, 5 | ValueError |
| Lampertheim | Wildbahn | 1, 2, 3 | MissingStreet |
| Lampertheim | Wilhelm-von-Ketteler-Straße | 1, 3, 4 | MissingStreet |

## Nächster Schritt

Die 38 im letzten Lauf wegen des Budgets nicht abschließend geprüften Straßen gezielt prüfen, statt erneut alle Kalender zu durchlaufen. Danach fehlende Auswahlwerte anhand offizieller ZAKB-Adressangaben klären und die zwei mehrdeutigen Bibliser Ortsteilzuordnungen mit belastbarer Ortsangabe auflösen. Ablehnungen und abweichende Bestätigungen bleiben bis zur Klärung ausgeschlossen. Deutsche-Bahn-Quellen bleiben übersprungen.

Diese Dokumentation ändert keine Laufzeitdateien. Für ihren eigenen Dokumentationscommit ist wegen der Workflow-Pfadfilter kein zusätzlicher CI-/GHCR-Lauf vorgesehen.
