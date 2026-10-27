# Schritt 15: Verbleibende ZAKB-Adressen bereinigen

## Ausgangspunkt

793 von 844 Straßenproben sind bestätigt. Die 51 offenen Straßen verteilen sich laut gespeichertem letzten Fehler auf 32 `MissingStreet`, 14 `AddressNotAccepted`, zwei `AmbiguousStreet`, zwei `AddressMismatch` und einen `RemoteProtocolError`. Das sind Adressproben, keine 51 ausgefallenen Anbieter. Die Klassifikation wird mit der aktuellen ZAKB-Auswahlliste abgeglichen.

## Belegte Namens- und Ortsteilzuordnungen

- Endständiges `Str.` wird als übliche Abkürzung für `Straße` erkannt. Das betrifft unter den offenen Proben Hermann-Löns-Straße und Zeppelinstraße in Bürstadt sowie Albert-Schweitzer-Straße und Alte Wormser Straße in Lampertheim.
- Die [amtliche Bibliser Straßenliste, Anlagen 1–3](https://www.biblis.eu/rathaus/ortsrecht/satzungen/satzung-ueber-die-erhebung-von-wiederkehrenden-strassenbeitraegen.pdf?cid=lh) führt Bachgasse im Kernort und Enggasse in Nordheim. Diese Zuordnungen lösen die zwei doppelten ZAKB-Auswahlwerte auf. Die Liste führt außerdem Neuländerpfad in Wattenheim und Friedensstraße im Kernort; die aktuellen ZAKB-Werte heißen Neuländerpfad und Friedenstraße.
- Die [amtliche Bodenrichtwertkarte Bürstadt](https://www.buerstadt.de/fileadmin/Dateien/Dateien/Rathaus_und_Politik/bodenrichtwerte_karte_buerstadt.pdf) belegt die Schreibweisen Sophienstraße und Vincenzstraße. Das Inventar führt Sofienstraße und Vinzenzstraße.
- Die [städtische Lampertheimer Planung](https://rim.ekom21.de/lampertheim/sdnetrim/UGhVM0hpd2NXNFdFcExjZZ6YwhZMraU7WSixIIV92T-JOTa6U0M7f6ifZs6OycPm/Beschlussvorlage_2009-11.pdf) nennt Wilhelm-von-Ketteler-Straße. Der aktuelle ZAKB-Wert lautet Wilhelm-v.-Ketteler-Straße.

Diese historischen amtlichen Dokumente werden mit den aktuellen Provider-Auswahlwerten abgeglichen. Es gibt ausschließlich die oben einzeln geprüften gemeindespezifischen Zuordnungen. Eine direkte Übereinstimmung hat Vorrang vor einem Alias. Kein automatischer unscharfer Namensvergleich wird für die Adressauswahl verwendet. ZAKB muss anschließend den tatsächlich gesendeten Straßenwert, die echte Inventarhausnummer und den gewählten Ort genau bestätigen; andernfalls werden keine Kalender veröffentlicht.

## Fortschritt bei Hausnummernproben

Bisher waren auch spätere Läufe auf dieselben drei kleinsten Hausnummern beschränkt. Jetzt wird jede tatsächlich abgelehnte Adresse mit ihrer eigenen Fehlerklasse gespeichert. Noch nicht gescheiterte echte Inventaradressen haben Vorrang, danach die am längsten zurückliegenden Fehlversuche. Eine bewährte Hausnummer bleibt bevorzugt. Höchstens drei Adressen werden pro Straße und Lauf geprüft; jede behält ihre eigenen Koordinaten. Aktive Wiederholungsfristen bleiben berücksichtigt.

## Prüfung und Veröffentlichung

52 relevante lokale Datenbank-, Formular-, Vertrags- und Scheduling-Tests erfolgreich. Die Prüfungen belegen insbesondere den Fortschritt zur vierten realen Hausnummer im Folgelauf sowie den weiterhin gesperrten Download bei falscher Straßenbestätigung, auch nach Namens- oder Ortsteilzuordnung. Ruff für die eigenen Python-Dateien und `git diff --check` erfolgreich. Der [CI-Lauf für den Code-Commit `8e092e360a461585d141732b00e3b7a34110c2a7`](https://github.com/erik-metz/hack-the-ried/actions/runs/37899390138) ist vollständig erfolgreich: alle 15 Prüfjobs sowie alle 17 Container-Builds und GHCR-Veröffentlichungen. Der Registry-Worker wurde gezielt auf `sha256:899042b67f575ac23755a04332b5eafb3062104d36f7b28a4b9037f7713be06c` aktualisiert. Sein laufender Code entspricht der geprüften Datei (`d2b6df6478d7213f549efc22c7fede7dfa32f7c98d7e771a834c17c422f2bff1`). Andere Dienste und deren Compose-Einstellungen wurden nicht verändert. Der reguläre Worker läuft wieder; der gezielte Prüflauf hielt die ZAKB-Sperre gegen parallele Abrufe.

Deutsche-Bahn-Quellen bleiben übersprungen.

## Live-Ergebnis am 9. Oktober 2026

Der gezielte Lauf hat 51 Straßen berücksichtigt: 17 erfolgreich neu bestätigt, 33 mit konkretem Fehler geprüft und eine wegen aktiver Wiederholungsfrist zurückgestellt. Die öffentliche API bestätigt zum Snapshot `2026-10-09T07:45:35Z` **810 von 844 repräsentativen Straßenproben** und **14.646 Termine**. Zuvor waren es 793 bestätigte Straßen und 14.348 Termine. Dies ist weiterhin keine vollständige Abdeckung jeder Hausnummer. Die Restanzahl beträgt 34; der Status bleibt korrekt `partial`.

Der anschließende Veröffentlichungsdurchlauf nutzte ausschließlich frische, zuvor validierte Checkpoints (`run_budget_seconds=0`), ohne zusätzliche Provider-Abfragen. Seine Nullwerte für fehlgeschlagene Kalender beziehen sich auf diesen reinen Cache-Durchlauf; sie bedeuten nicht, dass die 34 offenen Straßen funktionieren. Weitere 49 bereits bestätigte Straßen sind zur proaktiven Erneuerung vorgesehen und im veröffentlichten Snapshot noch innerhalb der gültigen 24-Stunden-Frist.

### Neu bestätigte Straßen

| Gemeinde | Inventarstraße | Bestätigte reale Hausnummer | Termine |
| --- | --- | --- | --- |
| Biblis | Bachgasse | 4 | 18 |
| Biblis | Enggasse | 5 | 18 |
| Biblis | Friedensstraße | 4 | 18 |
| Biblis | Im Rohrbusch | 4 | 18 |
| Biblis | Josef-Seib-Straße | 10 | 18 |
| Biblis | Neuländer Pfad | 5 | 18 |
| Bürstadt | Gartenstraße | 4 | 18 |
| Bürstadt | Hermann-Löns-Straße | 4 | 18 |
| Bürstadt | Sofienstraße | 4 | 18 |
| Bürstadt | Vinzenzstraße | 10 | 18 |
| Bürstadt | Zeppelinstraße | 7 | 20 |
| Groß-Rohrheim | Carl-Benz-Straße | 18 | 21 |
| Lampertheim | Albert-Schweitzer-Straße | 7 | 17 |
| Lampertheim | Alte Wormser Straße | 7 | 18 |
| Lampertheim | Küblinger Weg | 8 | 17 |
| Lampertheim | Mannheimer Straße | 11 | 17 |
| Lampertheim | Wilhelm-von-Ketteler-Straße | 5 | 17 |

### Verbleibende Straßen

Die folgende Klassifikation verwendet das letzte tatsächliche Ergebnis dieses gezielten Laufs, nicht einen alten Fehlermarker der zuerst geprüften Hausnummer. 25 Straßen fehlen in der aktuellen Auswahl, sechs lehnen die geprüften Hausnummern ab, zwei bestätigen eine abweichende Adresse. Eine Straße wurde nicht erneut angefragt.

| Gemeinde | Straße | Tatsächlich geprüfte Hausnummern | Ergebnis |
| --- | --- | --- | --- |
| Biblis | Am Tambourinsee | 1 | Fehlt in der ZAKB-Auswahl |
| Biblis | Am Wadowski See | 7 | Fehlt in der ZAKB-Auswahl |
| Biblis | An den Rebenäckern | 50, 51, 52 | Hausnummern abgelehnt |
| Biblis | An der Schleuse | 1 | Fehlt in der ZAKB-Auswahl |
| Biblis | Außerhalb | 11 | Fehlt in der ZAKB-Auswahl |
| Biblis | Außerhalb (Nordheim) | 9 | Fehlt in der ZAKB-Auswahl |
| Biblis | Außerhalb (Wattenheim) | 14 | Fehlt in der ZAKB-Auswahl |
| Biblis | Bei den Münchäckern | – | Aktive Wiederholungsfrist; vorher RemoteProtocolError |
| Biblis | Dungauer Weg | 18 | Fehlt in der ZAKB-Auswahl |
| Biblis | Eichenweg | 17 | Fehlt in der ZAKB-Auswahl |
| Biblis | In den Kesselwiesen | 1 | Fehlt in der ZAKB-Auswahl |
| Biblis | Neben dem Dungauer Deich | 6, 7, 8 | Hausnummern abgelehnt |
| Bürstadt | Am Fischweiher | 3 | Fehlt in der ZAKB-Auswahl |
| Bürstadt | Am Sportplatz | 11 | Hausnummern abgelehnt |
| Bürstadt | Außerhalb | 14 | Fehlt in der ZAKB-Auswahl |
| Bürstadt | Kirchgasse | 4 | Fehlt in der ZAKB-Auswahl |
| Bürstadt | Kleine Gewerbestraße | 4 | Fehlt in der ZAKB-Auswahl |
| Groß-Rohrheim | Römerweg | 4, 5, 6 | Hausnummern abgelehnt |
| Lampertheim | Am Küblinger Damm | 5 | Fehlt in der ZAKB-Auswahl |
| Lampertheim | Ausserhalb Brunnengewännchen | 1 | Fehlt in der ZAKB-Auswahl |
| Lampertheim | Außerhalb | 9 | Fehlt in der ZAKB-Auswahl |
| Lampertheim | Außerhalb Ost | 41 | Fehlt in der ZAKB-Auswahl |
| Lampertheim | Außerhalb-Brunnengewännchen | 3 | Fehlt in der ZAKB-Auswahl |
| Lampertheim | Außerhalb-Große Lache | 2 | Fehlt in der ZAKB-Auswahl |
| Lampertheim | Außerhalb-In der Bildgewann | 1 | Fehlt in der ZAKB-Auswahl |
| Lampertheim | Bahnhaus | 6 | Fehlt in der ZAKB-Auswahl |
| Lampertheim | Finkenstraße | 6 | Fehlt in der ZAKB-Auswahl |
| Lampertheim | Georg-Tyczka-Straße | 5, 4 | Adressbestätigung weicht ab |
| Lampertheim | Habichtsweg | 5, 6, 7 | Adressbestätigung weicht ab |
| Lampertheim | Klärwerkstraße | 8, 10, 20 | Hausnummern abgelehnt |
| Lampertheim | Seebuckel | 1 | Fehlt in der ZAKB-Auswahl |
| Lampertheim | Seehof | 5 | Fehlt in der ZAKB-Auswahl |
| Lampertheim | Wierdenstraße | 7, 9, 11 | Hausnummern abgelehnt |
| Lampertheim | Wildbahn | 4 | Fehlt in der ZAKB-Auswahl |

ZAKB bestätigt Georg-Tyczka-Straße 4 als `2 -4` und Habichtsweg 5, 6 und 7 als `1 -13`. Diese Bereiche werden weiterhin nicht als exakt bestätigte Einzelhausnummer veröffentlicht. Josef-Seib-Straße 7 und 9 lieferten ebenfalls `7 - 9`; erst Hausnummer 10 wurde exakt bestätigt. Eine spätere Erweiterung für Hausnummernbereiche benötigt eine eigene fachliche Prüfung.

Als nächster eigenständiger Schritt bietet sich die Prüfung der 25 fehlenden Auswahlwerte anhand offizieller Ortsteil- und Außenbereichszuordnungen an. Ähnlich klingende Namen allein reichen nicht zur Übernahme. Die sechs Straßen mit abgelehnten Hausnummern können in Folgeläufen mit weiteren vorhandenen Inventaradressen fortschreiten. Bei den Münchäckern wird nach Ablauf der Wiederholungsfrist erneut geprüft.
