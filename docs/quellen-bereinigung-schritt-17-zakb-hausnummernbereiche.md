# Schritt 17: Zwei ZAKB-Straßen mit Hausnummernbereichen

## Ausgangspunkt und fachliche Prüfung

Nach Schritt 16 sind 819 von 844 repräsentativen Straßenproben bestätigt. Für Georg-Tyczka-Straße und Habichtsweg in Lampertheim liefert ZAKB statt einer einzelnen Hausnummer einen Bereich im Bestätigungsfeld `Lageadresse`.

Die Prüfung verwendet ausschließlich tatsächlich vorhandene Inventarhausnummern. Die Straße Georg-Tyczka-Straße ist zusätzlich durch den [städtischen Umbenennungsbeschluss vom 20. Mai 2009](https://rim.ekom21.de/lampertheim/sdnetrim/UGhVM0hpd2NXNFdFcExjZQGKgXsSXJSzDIB2bafgbK4JEXmNYGdaXRYfsVeggDpaP8u3Qtse7inXT5ml1rbvWg/Gesamtes_Sitzungspaket.pdf) belegt. Das [städtische Vereinsverzeichnis](https://www.lampertheim.de/de/vereinsverzeichnis/?pageIdc93e5fe2=6) führt Habichtsweg 6.

| Straße | Angefragte echte Hausnummern | ZAKB-Bestätigung | Kalender |
| --- | --- | --- | --- |
| Georg-Tyczka-Straße | 4 | 2–4 | 20 Termine |
| Georg-Tyczka-Straße | 5 | Keine akzeptierte Adresse | Kein Download |
| Habichtsweg | 1, 4, 6, 13 | 1–13 | 1 und 13: je 17 Termine; 4 und 6: je 26 Termine |
| Habichtsweg | 15, 19 | 15–19 | Je 23 Termine |

Die verschiedenen Terminanzahlen innerhalb von 1–13 zeigen: Ein bestätigter Bereich rechtfertigt keine Übertragung eines Kalenders auf alle enthaltenen Hausnummern. Auch bei gleicher Terminanzahl wird keine Gleichheit der Kalender unterstellt. Jeder Download und Checkpoint bleibt deshalb an der tatsächlich angefragten Einzeladresse mit deren ursprünglichen Koordinaten gebunden. Für gerade Hausnummern im Bereich 1–13 liegen explizite erfolgreiche Provider-Antworten für 4 und 6 vor; eine Beschränkung auf ungerade Zahlen wäre hier falsch.

## Eng begrenzte Erweiterung

Die Erweiterung akzeptiert ausschließlich die folgenden geprüften Kombinationen aus Provider-Gemeinde, exakter Provider-Straße und numerischen Grenzen:

- Lampertheim / Georg-Tyczka-Straße / 2–4;
- Lampertheim / Habichtsweg / 1–13 oder 15–19.

Die tatsächlich angefragte Inventarhausnummer muss eine eindeutige positive Ganzzahl innerhalb des zurückbestätigten Bereichs sein. Unbekannte oder umgekehrte Bereiche, falsche Straße oder Gemeinde, Zusätze wie 6a, mehrdeutige Schreibweisen wie 06 und Hausnummern außerhalb der Grenzen werden abgelehnt. Bestehende exakte Einzelhausnummernbestätigungen funktionieren unverändert. Andere Straßen erhalten keine allgemeine Bereichserkennung.

Die zwei betroffenen Straßen verwenden den gesonderten Checkpoint-Vertrag `zakb-reviewed-ranges-v1`; alle übrigen Adressen behalten `zakb-address-v2`. Die bisherigen 819 geprüften Kalender werden dadurch nicht ungültig. Das Abdeckungsmanifest nennt beide Verträge (`validation_contract` und `reviewed_range_contract`). Die Hausnummer bleibt Teil jedes Checkpoint-Schlüssels. Der veröffentlichte Kalender enthält weiterhin ausschließlich die konkrete repräsentative Einzeladresse, keine vervielfältigten Bereichsadressen.

## Validierung

73 relevante lokale Formular-, Adressvertrags-, Wiederaufnahme- und Datenbankprüfungen erfolgreich. Die 20 neuen Prüfungen umfassen Bereichsgrenzen, falsche Gemeinde/Straße, unbekannte Bereiche, Hausnummernzusätze, unterschiedliche Checkpoints pro Einzelhausnummer und den gesperrten Download bei einer Hausnummer außerhalb des bestätigten Bereichs. Ruff für die eigenen Python-Dateien und `git diff --check` erfolgreich. Der [CI-Lauf für Code-Commit `7475808b88e66c9fa0ed05fbb3c99672bee9e46b`](https://github.com/erik-metz/hack-the-ried/actions/runs/37931352099) ist vollständig erfolgreich: alle 15 Prüfjobs und alle 17 Container-Builds einschließlich GHCR-Veröffentlichung.

Deutsche-Bahn-Quellen bleiben übersprungen.

## Live-Veröffentlichung am 9. Oktober 2026

Der Registry-Worker wurde gezielt auf das geprüfte Image `sha256:c147cd0628c44cdf9cad207850e6b78dc5738a6f5d68d32988f1f13fb0c63514` aktualisiert. Bei der Abschlussprüfung läuft nach einer parallelen Veranstaltungsaktualisierung das neuere Image `sha256:ec6619c7ec4c6bc50ef53751feb19a6917cf11126ff0839951f24a4b6de44361`. Es enthält denselben geprüften ZAKB-Code: Der laufende Code-Hash `eeba043b820aca80d6cfc8b1099886c2eba1e3cf167e1e378601d577631b07b8` stimmt mit der eigenen geprüften Datei überein. Dieses neuere Image wurde erhalten. Die bestehenden Compose-Einstellungen anderer Dienste blieben erhalten. Der reguläre Worker läuft wieder.

Ein gezielter Lauf unter der ZAKB-Sperre hat Georg-Tyczka-Straße 4 und Habichtsweg 6 erfolgreich neu abgerufen. Die vorherige Wiederholungsfrist wurde für diese beiden Adressen aufgrund des neuen Prüfvertrags und des unmittelbar zuvor erbrachten Provider-Nachweises nicht als Ausschluss verwendet. Die normale Wiederholungssteuerung bleibt erhalten. Anschließend wurden ausschließlich frische validierte Checkpoints atomar veröffentlicht, ohne weitere Provider-Abfragen.

Die öffentliche API bestätigt zum Snapshot **2026-10-09T12:48:19Z**:

| Straße in Lampertheim | Tatsächlich angefragte Inventarhausnummer | Veröffentlichte Termine | Inventarkoordinaten |
| --- | --- | --- | --- |
| Georg-Tyczka-Straße | 4 | 20 | 49.6205727 / 8.4315091 |
| Habichtsweg | 6 | 26 | 49.5933677 / 8.4864993 |

Damit stieg die Abdeckung von **819 auf 821 von 844 Straßenproben** und die Terminanzahl von **14.761 auf 14.807**. Die Menge der offenen Straßen verringerte sich ausschließlich um diese beiden Straßen: Keine zuvor bestätigte Straße ging verloren. Es bleiben **23 offene Straßenproben**. Der Status bleibt korrekt `partial`, die Abdeckung weiterhin repräsentativ statt vollständig für jede Hausnummer. Das Manifest nennt `zakb-address-v2` und zusätzlich `zakb-reviewed-ranges-v1`.

Die verbleibenden Fälle bestehen aus den 20 in Schritt 16 einzeln aufgeführten Namen ohne sichere Auswahlzuordnung sowie An den Rebenäckern und Bei den Münchäckern (Biblis) und Am Sportplatz (Bürstadt), für die bislang keine Hausnummer bestätigt ist. Als nächster begrenzter Schritt bietet sich die Prüfung dieser drei Hausnummernfälle an.
