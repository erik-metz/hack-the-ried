# Bildsichtung und Auswertungskategorien

Sichtung: 10.10.2026. Grundlage ist die bereits gespeicherte lokale Kontaktübersicht
`/tmp/ried-webcam-selection/views.jpg` mit sechs Ansichten aus der technischen
Prüfung gegen 19:54 Uhr MESZ. Die zugehörigen Abrufzeiten, Originalauflösungen
und Original-SHA-256 stehen in [selection-probes-2026-10-10.json](selection-probes-2026-10-10.json).

**Dies ist eine Sichtung von sechs Nachtproben, keine Auswertung einer
gesammelten Produktionszeitreihe.** Lokal sind nur die verkleinerten Ansichten
der Übersicht verfügbar, keine sechs archivierten Originaldateien.
Die vier ausgewählten Snapshot-Quellen sind im Laufzeitmanifest weiterhin
deaktiviert. Die am Sichtungszeitpunkt abgefragte öffentliche
[Quellenstatus-API](https://api.hack-the-ried.de/api/v1/collection/status)
führt die Autobahn-Webcam-Metadatenabfragen A5/A6/A67, aber keine der vier
regionalen Snapshot-Quellen. Das belegt keinen vollständigen VPS-Dateibestand:
ein direkter Blick in das VPS-Volume und die Snapshot-Tabellen erfolgte nicht.

Die Sichtung begründet mögliche Kategorien. Sie bestätigt noch keine
automatische Erkennungsgenauigkeit, Verkehrsmenge, Nutzungshäufigkeit oder
Entwicklung über die Zeit.

## Was die einzelnen Bilder zeigen

| Ansicht | In der Probe sichtbar | Sinnvolle Bildbereiche | Daraus ableitbare Aufgaben |
| --- | --- | --- | --- |
| Griesheim / Tower | Weite offene Vordergrundfläche, dunkler Baum-/Vegetationssaum, Bergsilhouette, hoher Himmelsanteil; einzelne helle Punkte. Keine zuverlässig klassifizierbaren Fahrzeuge oder Flugzeuge in dieser verkleinerten Nachtprobe. | Vordergrundfläche; Vegetations-/Horizontband; Himmel; Einblendungen separat. | Flächenzustand und saisonale Veränderung bei geeigneten Tagbildern; Horizont-/Sichtzustand; Helligkeitsverlauf. Kleine bewegte Objekte erst am Original und mit Tagbildern prüfen. |
| Melibokus | Weites Siedlungspanorama mit zahlreichen Lichtpunkten und dunklen Zwischenflächen; Horizont-/Himmelsband, starkes nächtliches Rauschen. Einzelne Straßen und Fahrzeuge lassen sich in der Übersicht nicht sicher zuordnen. | Siedlungsbereiche; dunkle Landschaftsbereiche; Horizont; Himmel. | Räumliche Beleuchtungsmuster, größere Veränderungen im Landschafts-/Siedlungsbild und Sichtentwicklung. Einzelne Fahrzeuge oder Lampen zunächst nicht zählen. |
| Heppenheim 1 – Reserve | Große, unscharfe Strukturen unmittelbar vor der Kamera verdecken weite Teile des Bildes; ein Teil eines Fahrzeugs/Gegenstands ist unten sichtbar. Die Ursache der Verdeckung lässt sich nicht sicher bestimmen. | Verdeckte Bereiche; kleiner verbleibender Sichtbereich; Zeit-/Textzeile. | Zunächst Verdeckung und Verwendbarkeit klassifizieren. Für Flächen- oder Aktivitätsauswertung in dieser Probe ungeeignet. |
| Heppenheim 2 – ausgewählt | Dunkle offene Fläche, fernes Horizontband und helle Lichtquelle; rechts ein heller, kastenförmiger Anhänger mit erkennbaren Rädern. Kein belastbar erkennbarer laufender Flugbetrieb. | Offene Fläche; rechter Abstellbereich; Horizont/Himmel; Textzeile. | Sichtbare Fahrzeuge/Anhänger und Belegung des lokalen Abstellbereichs; Objektwechsel; Flächenzustand. Flugzeuge und Bewegungsereignisse sind Prüfkandidaten für Tagesoriginale. |
| Heppenheim 3 – Reserve | Gebäudekante bzw. Dach links, Freifläche/Vorfeld, Vegetation rechts; ungleichmäßige Aufhellung und helle Strukturen auf der Fläche. Diese lassen sich nicht sicher als Schnee, Nässe oder Material bestimmen. | Gebäude-/Vorfeldbereich; Vegetationsrand; Textzeile. | Vorfeldbelegung, Änderungen an Gebäuden und Fläche, Vegetationsentwicklung. Kann für lokale Nutzung aussagekräftiger als eine reine Horizontkamera sein; Reserveentscheidung fachlich erneut prüfen. |
| Oppenheim | Ein weißes Fahrzeug im Vordergrund, weitere kleine nicht sicher bestimmbare Gegenstände, offene Fläche, Baumsaum und Himmel; starkes Farbrauschen. | Fahrzeug-/Abstellbereich; offene Fläche; Baum-/Horizontband; Himmel; eingeblendete Uhrzeit. | Sichtbare Fahrzeugbelegung, Objektwechsel und lokale Bodenaktivität; Vegetations- und Flächenänderungen; Helligkeit/Sicht. Keine Straßenverkehrszählung aus diesem Blickwinkel ableiten. |

Die zwei Heppenheimer Reserveansichten wurden mitgesichtet, gehören aber nicht
zum aktivierbaren Vierer-Satz. Es wurden keine Quellen aktiviert, keine neuen
Bilder heruntergeladen und keine Produktionsbilder verändert.

## Kategorien für die weitere Auswertung

Die Kategorien gelten je Bildbereich und Kamera. „Nicht sichtbar“ bzw.
„nicht beurteilbar“ muss ein eigener Zustand sein; eine fehlende Erkennung
ist kein bestätigter Nullwert.

| Kennung / Kategorie | Konkrete Merkmale | Geeignete Ansichten nach dieser Sichtung | Benötigte Grundlage und Grenzen |
| --- | --- | --- | --- |
| `scene_structure` – Aufbau der Szene | Himmel, Horizont, offene Bodenfläche, Vegetation, Gebäude/Vorfeld, Abstellbereich, Siedlung; verdeckte Bereiche und Einblendungen. | Alle; Heppenheim 1 insbesondere für Verdeckung. | Zuerst manuell geprüfte Bildbereiche definieren. Aus dem Kameranamen keine Straße, Startbahn oder Fläche als sichtbar voraussetzen. |
| `objects_occupancy` – Objekte und Belegung | Fahrzeug, Anhänger, Flugzeug, sonstiger Gegenstand; Anzahl sichtbarer Objekte und belegter Bereich. | Heppenheim 2 und Oppenheim; Heppenheim 3 als Reserve. | Anhänger bzw. Fahrzeug sind bereits sichtbar. Flugzeuge sind hier nur ein Prüfkandidat. Zählung erst mit Originalen und geprüften Beispielen. Keine Identität oder Kennzeichenerkennung erforderlich. |
| `activity_change` – Aktivität und Objektwechsel | Neu hinzugekommenes/verschwundenes Objekt, Positionsänderung, Wechsel der Vorfeld-/Abstellbelegung; bei ausreichender Sicht Flugplatzaktivität. | Heppenheim 2/3 und Oppenheim; Griesheim erst nach Tagprüfung. | Mindestens zwei zeitlich zugeordnete Bilder und stabile Bildgeometrie. Bei 60–300 s Abstand können komplette Bewegungen zwischen Bildern fehlen. Deshalb Belegungsänderungen statt vollständiger Fahrzeug-/Flugbewegungszahlen ausgeben. |
| `surface_state` – Boden und Flächenzustand | Verteilung heller/dunkler Bereiche, möglicher Schnee, stehendes Wasser, veränderte Befahrbarkeit/Vegetationsbedeckung, Nutzung offener Flächen. | Griesheim, Heppenheim 2/3, Oppenheim. | Tagbilder und Referenzzustände nötig. Nachtaufhellung nicht als Schnee oder Wasser beschriften. Landwirtschaftliche Tätigkeit nur bei tatsächlich sichtbarer Fläche und Aktivität. |
| `vegetation_season` – Vegetation und Jahreslauf | Belaubung, Farbänderung, Wachstum, Mahd-/Schnittmuster, Verschattung, Sichtachsen. | Griesheim, Heppenheim 3, Oppenheim; Melibokus für großräumige Muster erst nach Tagprüfung. | Tageslichtvergleich über Wochen/Monate; gleiche Bildbereiche und vergleichbare Beleuchtung. Keine Artenbestimmung aus dieser Übersicht. |
| `built_environment_change` – Gebäude und Infrastruktur | Neue/entfernte größere Strukturen, Veränderungen an Dach/Vorfeld, länger abgestellte Gegenstände, mögliche Baustellen. | Heppenheim 3; Heppenheim 2/Oppenheim lokal; Melibokus großräumig nur bei ausreichender Originalauflösung. | Referenzbilder über längere Zeit. Kameraversatz und saisonale Verdeckung als Alternativen ausschließen. Keine bestätigte Baustelle in den Nachtproben. |
| `lighting_patterns` – Beleuchtung und Nachtaktivität | Helligkeit pro Bereich, beleuchtete Flächen, neue/verschwundene Lichtgruppen, zeitliche Beleuchtungsmuster. | Besonders Melibokus; außerdem Heppenheim und Oppenheim. | Belichtung, Rauschen, Mondlicht und Dämmerung berücksichtigen. Relative Bildhelligkeit ist kein Energieverbrauch und keine kalibrierte Lichtverschmutzungsmessung. |
| `atmosphere_visibility` – Wetter und Sicht | Sichtbarkeit fester Horizontmerkmale, Wolken-/Himmelszustand, Helligkeit, mögliche Niederschlags-/Nebelhinweise. | Griesheim, Melibokus, Heppenheim 2, Oppenheim. | Eine Kategorie neben den anderen. Referenzmarken und validierte Beispiele nötig; keine zuverlässige Sichtweite in Metern oder Niederschlagsmenge aus den Proben. |
| `visual_anomaly` – Auffällige Veränderungen | Unerwartete große Veränderungen, ungewöhnliche Licht-/Rauch-/Wasserbereiche oder neue Hindernisse. | Kameras mit geeignetem, freiem Sichtfeld. | Zunächst allgemeines „auffällige Veränderung, prüfen“. Rauch, Feuer, Überflutung oder Unfall sind in den Proben nicht bestätigt und dürfen nicht allein aus einem allgemeinen Bildunterschied gemeldet werden. |
| `image_observability` – Technische Beurteilbarkeit | Tag/Nacht, Unschärfe, Verdeckung, Blendung, Rauschen, Kameraversatz, identische Bilder, wechselnde Zeitstempel. | Alle; besonders Heppenheim 1 und nächtliches Oppenheim. | Muss die Verlässlichkeit jeder anderen Kategorie begleiten. Der bereits implementierte SHA-Stillstandsverdacht ist nur ein Teil davon. |

Straßenverkehr, Gewässer-/Pegelzustand, Tieraktivität und Besucherzahlen wären
bei entsprechendem Sichtfeld eigene Anwendungen. Diese sechs Proben liefern
dafür keine belastbare Grundlage. Sie werden deshalb nicht als bereits
erschlossene Datenquellen geführt.

## Wie aus diesen Kategorien brauchbare Daten werden

1. **Szenenbeschreibung vor Modellwahl:** Für jede Kamera sichtbare Bereiche,
   Objektgrößen, Einblendungen, Verdeckung und fachliche Aufgaben dokumentieren.
   Die vorstehende Tabelle ist die erste Nacht-Sichtung, keine abgeschlossene
   Tages-/Saisoneignungsprüfung.
2. **Repräsentative Beispiele prüfen:** Originalbilder bei Tageslicht,
   Dämmerung und Nacht sowie verschiedene Tage vergleichen. Für Objektwechsel
   zusammenhängende Bildfolgen verwenden. Die Quellennutzung bleibt separat
   zu klären; die Sichtung aktiviert keinen Dauerabruf.
3. **Pro Kamera nur belegte Kategorien freischalten:** Melibokus vor allem
   Panorama, Beleuchtung und große Veränderungen; Heppenheim/Oppenheim vor
   allem lokale Belegung und Aktivität; Griesheim offene Fläche und Horizont.
   Heppenheim 3 als zusätzliche Aktivitätskamera neu bewerten.
4. **Mit beobachtbaren Größen beginnen:** Manuell geprüfte Bildbereiche,
   Belegung/Objektwechsel, Beleuchtungsverlauf und längerfristige
   Flächenveränderungen. Automatische Fachklassifikation erst gegen
   beschriftete Beispiele prüfen.
5. **Jede Ableitung nachvollziehbar speichern:** Quellenkennung,
   Beobachtungs-ID, Bild-SHA, Kategorie, Bildbereich/Region-Version,
   Methode/Modell-Version, Ergebnis, Konfidenz oder `not_assessable`,
   Qualitätsgründe und gegebenenfalls menschliche Bestätigung.
   Abrufzeit bleibt vom unbekannten Aufnahmezeitpunkt getrennt.

Die nächste Implementierung sollte damit einen allgemeinen Rahmen für
Szenen, Bildbereiche und kategorisierte Beobachtungen schaffen. Wetter ist
eine Anwendung dieses Rahmens; ebenso wichtig sind lokale Belegung,
Aktivitätswechsel, Beleuchtung und Veränderungen der sichtbaren Flächen.
