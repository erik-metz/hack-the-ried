# RAK2287: vollwertiges Mehrkanal-LoRaWAN-Gateway

Stand: 29.10.2026. Raspberry Pi 4 und RAK2287 EU868 bilden ein vollwertiges
**8-Kanal-LoRaWAN-Gateway** für den regulären EU868-Betrieb. Der bisherige
Heltec-Testaufbau war eine Single-Channel-/Single-Data-Rate-Implementierung.
Die Einstufung als Mehrkanal-Gateway beschreibt die Funkfähigkeiten; sie ersetzt
keine Freigabe für den unbeaufsichtigten Dachbetrieb.

## Unterschied zum Heltec-Testgateway

| Eigenschaft | Bisheriger Heltec-Testaufbau | Raspberry Pi 4 + RAK2287 |
| --- | --- | --- |
| Funkhardware | Einzelner SX1262-Transceiver | SX1302-Konzentrator mit zwei SX1250-Funkchips |
| Normale LoRa-Empfangskanäle | Ein eingestellter Kanal | Acht Kanäle gleichzeitig |
| Spreading Factors | Ein eingestellter SF, standardmäßig SF7 | Gleichzeitiger Empfang unterschiedlicher SF; im normalen EU868-Betrieb SF7 bis SF12 |
| Paralleler Paketempfang | Kein Mehrkanal-Konzentrator | Laut Hersteller bis zu 16 gleichzeitig demodulierbare LoRa-Pakete, abhängig von der Kombination |
| Netzverbindung | Semtech UDP, ohne Gateway-Authentifizierung | LoRa Basics Station über authentifiziertes TLS-LNS zu TTN |
| Joins und Downlinks | Auf die Testkonfiguration und deren Zeit-/Funkparameter begrenzt | Reguläre Class-A-Join-Accepts und Downlinks über TTN/Basics Station vorgesehen |
| Einsatz | Inbetriebnahme und gezielte Tests | Regulärer LoRaWAN-Gatewaybetrieb; derzeit zugänglicher Pilot |

Der Heltec-Vergleich bezieht sich auf unseren konkreten Sketch und seine
[Beispielkonfiguration](../../hardware/dev-gateway/v1/secrets.h.example),
nicht auf sämtliche Heltec-Produkte. Dort sind standardmäßig 868,1 MHz,
SF7 und 125 kHz eingestellt. Sensoren mit anderen Kanal-/SF-Kombinationen
werden von dieser Testimplementierung nicht gleichzeitig abgedeckt.

## Acht Kanäle, zehn Empfangspfade und viele Sensoren

Die acht normalen LoRa-Empfangskanäle können gleichzeitig Pakete mit
unterschiedlichen Spreading Factors erkennen. Zusätzlich gibt es einen
separaten LoRa-Demodulationspfad und einen (G)FSK-Pfad. Deshalb beschreibt RAK
das Modul auch mit zehn Kanälen beziehungsweise Empfangspfaden. Das bedeutet
keine zehn gleichartigen Multi-SF-LoRa-Kanäle.

Aufbau und maximale Demodulationskapazität sind in der
[RAK-Produktspezifikation](https://www.rakwireless.com/en-us/products/lpwan-gateways-and-concentrators/rak2287-sx1302)
beschrieben. Die Hardware unterstützt darüber hinaus SF5/SF6; deren Verfügbarkeit
in der Hardware erweitert nicht automatisch die Datenraten des gewählten
LoRaWAN-Frequenzplans.

**Acht Kanäle sind keine Begrenzung auf acht Sensoren.** Viele Endgeräte teilen
sich die Kanäle. Die praktische Kapazität hängt von Sendehäufigkeit, Paketlänge,
Spreading Factor, Funkstörungen und Downlinkbedarf ab. Auch ein Konzentrator
verhindert keine beliebigen Paketkollisionen. Die Herstellerangabe von bis zu
16 Paketen ist kein Lasttest unseres Aufbaus.

Mehrkanal-Empfang bedeutet außerdem keinen Full-Duplex-Betrieb: Unser Aufbau
arbeitet im Halbduplexbetrieb. Während einer Gateway-Sendung steht der normale
Empfang nicht gleichzeitig zur Verfügung.

## Tatsächlich eingerichtet und nachgewiesen

- Das RAK2287 läuft über SPI mit Basics Station; beim Hardwarestart wurden
  die acht LoRa-Empfangskanäle des TTN-EU868-Kanalplans konfiguriert.
- Der Kanalplan kommt vom LNS und wird für Offline-Neustarts lokal gespeichert.
  Die Station ist nicht auf einen einzelnen Testkanal festgelegt.
- Reale Sensor-Uplinks, Offline-Empfang, Speicherung über Container-Neustart,
  verspätete Verarbeitung in der TTN-Application sowie Update und Rollback
  wurden im [Betriebsnachweis](betriebsnachweis.md) dokumentiert.
- Ein gleichzeitiger Achtkanal-Lasttest und ein neuer vollständiger
  OTAA-Join-/Downlink-Test sind damit noch nicht nachgewiesen.
- GPS-Zeitsynchronisation ist im Startprofil deaktiviert (`HAS_GPS=0`).
  Class-B-Beacons sind nicht eingerichtet. Für den üblichen Class-A-Sensorbetrieb
  ist GPS am Gateway nicht erforderlich.

Das Gateway gehört keiner einzelnen Application. Passende Funkpakete anderer
TTN-Endgeräte können ebenfalls weitergeleitet werden. Application-Zugangsdaten
und Payload-Formatter gehören weiterhin zur jeweiligen Application.

## Bestehende Test-Sensoren umstellen

Ein Mehrkanal-Gateway hebt Einschränkungen der Sensor-Firmware nicht selbst auf.
Beispielsweise legt die vorhandene
[RAK3112-Firmware v15](../../hardware/sensor-node/rak3112/v15/v15.ino)
weiterhin ein `singleChannelEU868`-Profil an, deaktiviert zwei Standardkanäle
und setzt initial DR5 (SF7/BW125).

Für die vollständige Nutzung des normalen Kanalwechsels müssen Sensorprofil,
Firmware und TTN-Geräteeinstellungen zusammen geprüft und auf den regulären
EU868-Betrieb umgestellt werden. Diese Dokumentationsänderung verändert weder
Sensor-Firmware noch TTN-Einstellungen.

Betrieb und verbleibende Dachabnahme: [Implementierungsplan](implementierungsplan.md)
und [Betriebsnachweis](betriebsnachweis.md).
