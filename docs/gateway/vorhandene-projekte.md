# Vorhandene Gateway-Container und Projekte

Recherche vom 28.10.2026 für Pi 4, RAK2287 EU868 über SPI und TTN.
Keine Installation, kein Image-Pull, kein Hardwaretest. Recherche umfasst
Projekt-/Herstellerdokumentation, Registry-Anzeige und beim DTN-Projekt zusätzlich
lesende Prüfung des nach `/tmp` geklonten Quellcodes.

## Ergebnis und Empfehlung

Für den regulären Gatewaybetrieb keinen eigenen Forwarder entwickeln:
`xoseperez/basicstation` ist ein vorhandenes ARM64-Image mit dokumentierter
RAK2287-/Pi-4- und TTN-Unterstützung. Zunächst unverändert als Vergleichsbasis
auf dem zugänglichen Pi testen. RAKWireless/basicstation ist ein Fork desselben
Projektstamms und verweist auf dieses Image; das sind keine zwei unabhängig
entwickelten Lösungen.

Persistentes Store-and-forward einschließlich Nachlieferung bis zur TTN-Application
ist in den geprüften Standard-Container-Dokumentationen nicht nachgewiesen.
Ein konkretes DTN-Forschungsprojekt existiert, ist aber keine fertig geprüfte
Gesamtlösung für unseren Dachbetrieb. Die Anforderung bleibt bestehen.

Auch den Update-Dienst nicht vorzeitig selbst entwickeln: balenaOS/balenaCloud
als vorhandene Betriebsplattform gegen Raspberry Pi OS mit eigenem Deployment
abwägen. Containerwahl, Updateverwaltung und Funkpuffer sind drei getrennte
Entscheidungen. Ein vorhandener Container allein lädt neue Versionen nicht
selbstständig herunter.

## Vergleich

| Kandidat | Passung | Fernupdates | Persistentes Store-and-forward | Einordnung |
| --- | --- | --- | --- | --- |
| xoseperez/basicstation-docker; Image `xoseperez/basicstation` | Pi 4/ARM64, RAK2287 SPI, TTN v3 und ChirpStack dokumentiert | Über zusätzliche Betriebsplattform | Nicht als dauerhafte Offline-Queue dokumentiert | Erste Wahl für den unveränderten Funk-/TTN-Basistest |
| RAKWireless/basicstation | Fork des obigen Projekts, gleiche Hardwarefamilie | Wie oben | Kein gesonderter Nachweis gefunden | Herstellerreferenz; nicht als zweite unabhängige Lösung zählen |
| RAKWireless/udp-packet-forwarder | Pi und RAK2287; Docker und TTN dokumentiert | Externe Verwaltung nötig | Im geprüften README nicht nachgewiesen | Referenz für DTN-Versuch; Legacy-UDP für Neubau nachrangig |
| mpous/basicstation, früher balenalabs/basicstation | Historisches Pi-/RAK2287-Projekt | balena | Kein belastbarer Nachweis gefunden | README bezeichnet es ausdrücklich als deprecated |
| scapingerman/uD3TN-LoRaWAN-Integration | Pi 3, RAK2287 und TTN beschrieben | Nicht als vollständiger Update-Stack eingerichtet | Store-and-forward als Projektziel; unsere Persistenz-/Zustelltests nicht nachgewiesen | Forschungs-/Integrationsvorlage, nicht unverändert produktionsreif für unsere Anforderungen |
| ChirpStack Gateway OS | Fertiges Gateway-Betriebssystem; Base-/Full-Variante | Eigenes OS-Betriebskonzept | Unser Anforderungsumfang nicht nachgewiesen | Für ChirpStack-Ausbau prüfen; kein Docker-Drop-in |
| pe1mew/Balena-ChirpStack-Gateway-OS | Concentratord und weitere Komponenten als Container; Pi 4/RAK2287 in Hardwaretabelle | balena | Kein Nachweis unseres vollständigen Offlineumfangs gefunden | Alternative für späteren modularen ChirpStack-Aufbau; TTN-Adapter gesondert prüfen |

Die Einstufung „nicht nachgewiesen“ bedeutet nicht, dass jede Form von
RAM-Pufferung fehlt. Entscheidend sind Plattenpersistenz, Offline-Kaltstart,
Wiederanlauf und tatsächliche Annahme verspäteter Uplinks durch TTN.

## 1. Direkt nutzbarer Basics-Station-Container

- [Quellprojekt](https://github.com/xoseperez/basicstation-docker)
- [Registry und Architekturen](https://hub.docker.com/r/xoseperez/basicstation/tags)
- [RAK-Fork](https://github.com/RAKWireless/basicstation)
- [Changelog](https://github.com/xoseperez/basicstation-docker/blob/master/CHANGELOG.md)

Die Registry-Anzeige führt `v2.8.6` mit `linux/amd64`, `linux/arm/v7` und
`linux/arm64`. Das Changelog datiert 2.8.6 auf 28.10.2025 und nennt libgpiod
als Standard. Das belegt einen veröffentlichten Stand, keine aktuelle
Sicherheitsprüfung oder getestete Kompatibilität mit unserem Host.
Vor Verwendung Tag und vollständigen Digest direkt an der Registry verifizieren.
Produktiv den getesteten Digest pinnen.

Unser Konfigurationsprofil wäre RAK2287, SPI, explizites SPI-Gerät, feste
Gateway-EUI und gatewaybezogene LNS-Zugangsdaten. GPIO-Belegung bleibt am
konkreten HAT zu verifizieren. Keine Decoder oder Application-Schlüssel nötig.

TTN empfiehlt Basics Station und führt Semtech UDP nur als Legacy-Unterstützung
mit angekündigter künftiger Entfernung auf:
[The Things Stack: Packet Forwarders](https://www.thethingsindustries.com/docs/hardware/gateways/concepts/packet-forwarder/).
Das spricht für Basics Station als Ausgangspunkt, ohne die Pufferanforderung
als bereits gelöst auszugeben.

## 2. Fernupdates wiederverwenden

[balena Deployment](https://docs.balena.io/learn/deploy/deployment) dokumentiert
Releases aus Container-Images und deren automatischen Download auf Geräte.
[Release Policy](https://docs.balena.io/learn/deploy/release-strategy/release-policy)
erlaubt feste Releases pro Gerät/Fleet und kontrollierten Versionswechsel.
[Update Strategies](https://docs.balena.io/learn/deploy/release-strategy/update-strategies)
beschreibt zunächst vollständigen Image-Download vor dem Beenden alter Dienste.

Damit ist ein wesentlicher Teil unseres Fernupdatewunsches bereits abgedeckt.
Ein automatischer lokaler Rücksprung aufgrund ausgefallener Funkhardware ist
hierdurch noch nicht belegt. Diesen separat testen, ebenso Erhalt alter Images
und Wiederherstellung ohne Cloudverbindung. Eine fernausgelöste Rückkehr zu
einem Release ist nicht gleichbedeutend mit autonomem Offline-Rollback.
Balena wäre eine Alternative zum bisherigen Host-/Updater-Vorschlag; keine
bereits getroffene Entscheidung oder eingerichtete Cloudverbindung.

Alte Anleitungen nicht ungeprüft übernehmen:
[mpous/basicstation](https://github.com/mpous/basicstation) ist deprecated;
das aktuelle Docker-Projekt und eine passende Betriebsplattform getrennt wählen.

## 3. Konkreter Store-and-forward-Vorläufer

- [Projekt](https://github.com/scapingerman/uD3TN-LoRaWAN-Integration)
- [D3TN-Projektbericht vom 19.12.2024](https://d3tn.com/blog/posts/2024-12-19-lora-dtn/)

Lesend geprüft: Commit `95628f27adcbc6bfe128f6f7ce2fd90fed0ecf27` vom 16.12.2024.
Das Projekt verbindet einen Docker-UDP-Forwarder mit uD3TN-Knoten und Python-
Adaptern. Empfangene Gateway-UDP-Pakete werden in DTN-Bundles transportiert;
die Application-Payload wird dabei nicht sensorspezifisch interpretiert.

Konkrete Befunde am geprüften Stand:

- `docker/docker-compose.yml` startet nur `rakwireless/udp-packet-forwarder`;
  uD3TN und Adapter bilden keinen vollständigen Compose-Stack.
- `docs/setup_instruction.md` beschreibt manuelles Bauen und Starten von vier
  DTN-Knoten sowie Python-Skripten. Ein datenträgergestützter, über Neustarts
  getesteter 72-Stunden-Puffer ist dort nicht nachgewiesen.
- `scripts/aap2_to_ttn.py` sendet `RESPONSE_STATUS_SUCCESS` an uD3TN, bevor der
  TTN-Weiterleitungsschritt stattfindet. Der anschließende UDP-`sendto` wartet
  nicht auf einen TTN-Annahmenachweis. Die Erfolgsmeldung des Skripts ist deshalb
  kein Beleg für Speicherung oder Verarbeitung bei TTN.
- Der Bericht nennt realitätsnahe Tests bei unterbrochener Verbindung als weitere
  Arbeit. Die gezeigten Join-/Uplink-/Downlink-Erfolge belegen nicht automatisch
  Nachlieferung nach langen Ausfällen, Sessionwechseln oder Stromausfall.
- Ein vollständig containerisierter Wiederanlauf, definierte Queue-Grenzen und
  die Mehrgateway-/Frame-Counter-Fälle aus unserem Plan bleiben zu prüfen.

Daher zuerst als gezielten Machbarkeitsversuch bewerten, nicht unverändert auf
dem Dach einsetzen. Der Bericht ist ein konkreter Ansatz für Wiederverwendung,
aber kein Grund, unsere Abnahmekriterien zu streichen.

## 4. Alternativen für den späteren Ausbau

- [ChirpStack Gateway OS](https://www.chirpstack.io/docs/chirpstack-gateway-os/index.html):
  OpenWrt-basierte Gateway-Distribution, Base ohne und Full mit Network Server.
- [Balena-ChirpStack-Gateway-OS](https://github.com/pe1mew/Balena-ChirpStack-Gateway-OS):
  modularer Container-Aufbau um Concentratord; Hardwareprofile nicht ungeprüft
  von Helium-Hotspots auf unser HAT übertragen.
- [ChirpStack MQTT Forwarder](https://www.chirpstack.io/docs/chirpstack-mqtt-forwarder/configuration.html):
  MQTT-QoS und persistente Broker-Sitzung allein sind noch kein Nachweis einer
  lokalen, rebootfesten Offline-Uplink-Queue. Auch spricht die ChirpStack-
  Gateway-MQTT-Schnittstelle nicht automatisch das TTN-Gateway-Protokoll.

## Nächster Umsetzungsschritt

1. Getesteten vorhandenen Basics-Station-Container auf dem zugänglichen Pi als
   Referenz in Betrieb nehmen; noch keine eigene Funksoftware oder Queue bauen.
2. Zuerst Messversuche zu Offlineempfang und verspäteter TTN-Annahme durchführen;
   den DTN-Ansatz als zweite Referenz mit identischen Abnahmekriterien vergleichen.
3. Balena-Fernverwaltung gegen bisherigen OS-/Updater-Vorschlag bewerten.
4. Nur die nachgewiesenen Lücken gezielt ergänzen. Store-and-forward bleibt
   Abnahmevoraussetzung vor Dachbetrieb, auch wenn der unveränderte Basistest gelingt.
