# Gateway-Pilot: Betriebsnachweis

Stand: 29.10.2026. Dieser Nachweis trennt Implementierung, Simulation und reale
Hardwaretests. Die Dachfreigabe ist noch nicht erteilt.

## Implementiert und geprüft

- Raspberry Pi 4, Debian 13 Trixie, ARM64; Docker Engine 26.1.5, Compose 2.26.1.
- RAK2287 EU868 über SPI, Reset auf GPIO25; feste Gateway-EUI, LNS-Key nur in
  lokaler `.env` mit Modus 600, keine Application-Decoder im Gateway.
- Image auf gepinnter Basics-Station-Basis; TLS-LNS zu TTN EU1, lokales
  SQLite/WAL-Journal mit Wiederanlauf und zwischengespeichertem Kanalplan.
- Zehn automatisierte Tests bestehen: Konfiguration/Secrets, Compose-Vertrag,
  dauerhafte Reihenfolge/Retention, Offline-Kaltstart, Replay vor Liveverkehr,
  Discovery-Zielbindung, veraltete Class-A-Downlinks, Erhalt des Keys beim Pinning.
- ARM64-CI testet zusätzlich die tatsächlich im Image installierte Python-/
  WebSocket-Version und veröffentlicht dasselbe geprüfte Image auf GHCR.
- CI für `574ae61` erfolgreich: [Gateway-Lauf 40888484855](https://github.com/erik-metz/hack-the-ried/actions/runs/40888484855).

## Reale Beobachtungen

Der Grundaufbau verband sich mit TTN. In der TTN-Gateway-Konsole wurde am
29.10.2026 um 13:43:30 UTC ein echter Uplink mit FCnt 1938, SF7/BW125,
RSSI −39 dBm und SNR 13,5 dB angezeigt. Das belegt Empfang/Weiterleitung mit
dem Grundaufbau, noch keine Nachlieferung aus dem Journal.

Beim Bridge-Hardwaretest wurden eine fehlende Pfadangabe in der lokalen
Discovery-Antwort und zurückbleibende native PID-Dateien korrigiert.
`/var/tmp` ist deshalb zusätzlich als flüchtiges Dateisystem eingebunden.
Die Bridge erreicht TTN und empfängt den Kanalplan. Der SX1250-Startfehler
trat auch mit dem zuvor funktionierenden Image auf.
Mit GPIO25 statt GPIO17 meldet der Chip wieder Version 0x10 und der
Konzentrator startet erfolgreich. Diese HAT-Variante beschreibt
[RAK selbst](https://forum.rakwireless.com/t/using-helium-rak-hotspot-as-reguillar-gateway/11187).

Ein vollständiger Pi-Neustart wurde ausgelöst; Raspberry Pi Connect ist
anschließend wieder erreichbar. Die lokale sudo-Authentifizierung wurde erneuert.
Der Offline-Kaltstart der
Bridge wurde mit vollständig getrenntem Docker-Netz ausgeführt: Funkstart und
lokale Station-Verbindung bleiben aktiv, LNS wird korrekt als getrennt gemeldet.

Am 29.10.2026 um 14:03:30 UTC wurde bei komplett getrenntem Container-Netz
ein Uplink gespeichert (633 Byte, `pending=1`). Ein weiterer Offline-Neustart
behielt den Datensatz. Um 14:05:08 UTC wurde das Netz wieder verbunden.
Um 14:05:29 UTC zeigte die TTN-Application `my-gps-tracker-2026` für
`rak3112-002` ein „Forward uplink data message“ mit dekodiertem Payload,
RSSI −40 dBm und SNR 13,25 dB. Das Journal meldete danach `pending=0`,
`acceptance_unknown=1`, `send_attempted=1`. Damit ist für diesen Versuch die
verspätete Verarbeitung bis in die Application belegt; die allgemeine
LoRaWAN-Einschränkung bei Frame-Countern/Sessionwechseln bleibt bestehen.

Der Guardian wurde als Host-systemd-Dienst installiert und behielt das
gesunde Image lokal. Ein daraus abgeleitetes Testimage mit `CMD exit 1`
startete absichtlich nicht. Der identische Guardian-Code wurde für diesen
Test mit einem verkürzten Fenster von 5 statt 180 Sekunden ausgeführt.
Er stellte das gesicherte Image ohne Registry-Pull wieder her, setzte
`paused=true` und pinte die `.env` auf den lokalen Rücksprungtag. Danach
waren Docker-Healthcheck, Funkbereitschaft und LNS-Verbindung wieder gesund.
Die Testpause wurde nach Prüfung aufgehoben; der reguläre Dienst verwendet
wieder das Standardfenster von 180/360 Sekunden.

Die `.env` ist nach einem rootseitigen Rücksprung Eigentum von root und hat
Modus 600; danach für Änderungen/Compose `sudo` verwenden. Es entsteht keine
zweite Datei mit LNS-Zugangsdaten. Die Guardian-Sicherungen enthalten nur
Image-IDs und Zeit-/Statusinformationen.

Watchtower führte danach einen echten GHCR-Updateversuch aus: ein Container
geprüft, einer aktualisiert, null Fehler. Am 29.10.2026 um 14:11:19 UTC wurde
der neue Container gestartet; sein OCI-Revisionslabel ist
`574ae61b749a3e6e1f31a6015849830d5690b122`. Danach meldeten Docker-Healthcheck,
Funkbereitschaft und LNS-Verbindung einen gesunden Zustand. Watchtower läuft
wieder regulär mit 300 Sekunden Pollintervall; der Guardian ist aktiviert.

## Noch nachzuweisen

- Langzeitstabilität und erneuter vollständiger Host-Neustart mit der finalen
  GPIO25-Konfiguration (Container-Neustarts wurden mehrfach geprüft).
- Langzeittest 72 Stunden, Stromausfälle, Speichergrenzen und thermischer
  Betrieb im wetterfesten PoE-Gehäuse.

Der Pi läuft im zugänglichen Pilotbetrieb. Eine Montage auf dem Dach setzt
die ausstehenden Belastungs- und Installationsprüfungen voraus.
