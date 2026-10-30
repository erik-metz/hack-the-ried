# RAK2287 / Raspberry Pi 4: erster Gateway-Grundaufbau

Stand: 29.10.2026. Dieser Stand bereitet einen zugänglichen **Pilotbetrieb** vor.
Vorhandene Basics Station wird weiterverwendet; kein eigener Funk-Forwarder,
kein Application-Decoder. Installation und Hardwareabnahme werden im
[Betriebsnachweis](../../docs/gateway/betriebsnachweis.md) getrennt dokumentiert.

Die [Host-Härtung](../../docs/gateway/host-sicherheit.md) beschreibt den
Connect-Zugang, die IPv4-/IPv6-Firewall, deaktivierte Dienste, Systemupdates
und die zeitgesteuerte Rücknahme zum Schutz vor Aussperren.

## Enthalten und noch offen

Enthalten: ARM64-Image auf gepinnter Upstream-Basis, überprüfte
Hardware-/LNS-Konfiguration, TTN-Schlüssel in der lokalen `.env`, begrenzte Logs und
Watchtower für automatische Updates ausschließlich dieses Gateways.

Zusätzlich implementiert: ein lokaler LNS-Zwischenprozess mit SQLite/WAL-Journal
für Uplinks, gespeichertem Kanalplan für Offline-Neustarts und einem hostseitigen
Rollback-Dienst. Die Funksoftware bleibt die vorhandene Basics Station.

Der Healthcheck prüft Bridge-Lebenszeichen, die Station-Verbindung und den
nachgewiesenen Konzentratorstart. Ein LNS-/Internetausfall allein löst keine
Neustartschleife aus. Empfangsaktivität und LNS-Status stehen getrennt in
`state/health.json`. Diese Informationen enthalten keine Application-Payloads.

Die lokale Sicherung ist von der TTN-Annahme zu unterscheiden: Das LNS-Protokoll
quittiert Uplinks nicht bis zur Application. Nach Sendeversuchen bleiben Frames
als `acceptance_unknown` erhalten; sie werden bei Wiederverbindung höchstens
bis zu drei Mal versucht. Frame-Counter-Schutz, andere Gateways und Sessionwechsel
können die nachträgliche TTN-Verarbeitung verhindern. Keine Garantie einer
verlustfreien TTN-Application-Zustellung oder eines nachgeholten Joins/Downlinks.
Ein vollständiger 72-Stunden-/Stromausfalltest bleibt separate Dachabnahme.

Beim vorhandenen HAT ist `RESET_GPIO=25` erforderlich und am realen
Konzentratorstart bestätigt. GPIO17 führte nach Neustarts zum SX1250-Fehler.
RAK beschreibt diese Belegung für bestimmte ehemalige Helium-HATs im
[Herstellerforum](https://forum.rakwireless.com/t/using-helium-rak-hotspot-as-reguillar-gateway/11187).
Die Herkunft unseres HATs wird daraus nicht als gesichert abgeleitet.

## Image und Updatepfad

GitHub Actions baut bei Änderungen an `hardware/gateway/**` oder am Gateway-Workflow
auf einem ARM64-Runner, prüft Konfiguration und Container und veröffentlicht
exakt das getestete Image:

- `ghcr.io/erik-metz/hack-the-ried-gateway:sha-<vollständiger-commit>`: feste Version.
- `ghcr.io/erik-metz/hack-the-ried-gateway:pilot`: folgt erfolgreich geprüften
  `main`-Commits. Nur für einen zugänglichen Testaufbau verwenden.

Der Workflow veröffentlicht keinen Dach-/Produktionskanal. Ein Registry-Push
belegt keine Aktualisierung oder Funkfunktion auf dem Pi. PRs prüfen und bauen,
veröffentlichen aber keine Images. Änderungen an Compose oder `.env` müssen
separat auf den Host übertragen werden: Watchtower übernimmt die vorhandenen
Containeroptionen, synchronisiert aber keine Repository-Dateien.

Basis: [xoseperez/basicstation-docker](https://github.com/xoseperez/basicstation-docker),
Image `v2.8.6`, Multiarch-Digest
`sha256:cb67945c657012c67145dccdd756baf9a16ba095142cd458db2a5ef9ba97ca10`.
Der kleine Startwrapper erzeugt Hardware-/LNS-Konfiguration und ruft anschließend
den vorhandenen Upstream-Startprozess auf. Keine Änderung des Funkprotokolls.

Der archivierte `containrrr/watchtower` wird auf dem Pi durch den
[gepflegten Fork](https://github.com/nicholas-fedor/watchtower) ersetzt:
`nickfedor/watchtower:1.23.2`, per Digest fixiert. Der Updater aktualisiert sich
nicht selbst. Keine Änderung an der bestehenden VPS-Watchtower-Konfiguration.

Watchtower prüft alle 300 Sekunden, ist auf Scope `kamue-gateway` und explizit
freigegebene Container beschränkt. Alte Images bleiben für manuellen Rücksprung
vorhanden; Speicherplatz überwachen und nicht unbegrenzt wachsen lassen.
Der Docker-Socket ist ausschließlich dem Updater zugänglich. Keine eingehenden
Ports oder öffentlich erreichbare Docker-API nötig. Ein Docker-Socket-Mount gibt
dem Updater weitgehende Hostrechte; keine fremden Images damit betreiben.

## Vorbereitung auf dem Pi

Voraussetzungen: Pi 4 mit 64-Bit-Linux (`uname -m`: `aarch64`), Docker Engine und
Compose v2, aktives SPI mit `/dev/spidev0.0`, Internet, korrekte Uhrzeit und DNS.
RAK2287 muss EU868/SPI sein. RAK-/PoE+-HAT mechanisch und elektrisch zuerst
prüfen. `RESET_GPIO=17` und `gpiochip0` sind die zu verifizierenden Profilwerte.
Kein zweiter Forwarder darf auf den Konzentrator zugreifen.

1. Repository auschecken und in `hardware/gateway/` wechseln. `.env.example` nach `.env`
   kopieren. Eindeutige, dauerhaft zugeordnete Gateway-EUI eintragen; keine
   Beispiel-EUI verwenden. `.env` enthält auch den LNS-Key und bleibt lokal:

   ```bash
   cp .env.example .env
   chmod 600 .env
   nano .env
   ```

   Eine vorhandene `.env` bearbeiten, nicht durch das Beispiel überschreiben.
2. Gateway in TTN im passenden Cluster registrieren. EU868-Kanalplan sowie
   Standort, Montagehöhe und Antennengewinn eintragen. Der Default-Endpunkt hier
   ist `wss://eu1.cloud.thethings.network:8887`.
3. Einen gatewaybezogenen API-Key für „Link as Gateway to a Gateway Server for
   traffic exchange“ erzeugen. Keinen Application-Key und keinen persönlichen
   Account-Schlüssel verwenden. Den rohen einzeiligen Key in `.env` eintragen:

   ```dotenv
   TC_KEY=NNSXS.…vollständiger-Gateway-LNS-Key…
   ```

   Kein `Authorization: Bearer` voranstellen. Eine zusätzliche LNS-Schlüsseldatei
   ist nicht erforderlich. `.env` ist von Git und Docker-Builds ausgeschlossen.
   Compose übergibt den Key nur an Basics Station, nicht an Watchtower. Unser
   Startskript erzeugt daraus die temporäre LNS-Konfiguration bei jedem Start
   neu. Keine echten Schlüssel in Chat, Image oder Git kopieren.

   Der Key ist damit in Container-Metadaten (`docker inspect`) und in ungekürzten
   Ausgaben von `docker compose config` sichtbar. Zur normalen Prüfung deshalb
   `docker compose config --quiet` verwenden und keine solchen Ausgaben teilen.
   `ANTENNA_GAIN_DBI=3` berücksichtigt konservativ den Bruttogewinn; genaue
   Leitungsverluste und zulässige Leistung vor Funkbetrieb prüfen.
4. Für ein öffentlich lesbares GHCR-Paket:

   ```bash
   docker compose config --quiet
   docker compose pull
   docker compose up -d basicstation
   docker compose logs --tail 100 basicstation
   docker compose ps
   ```

   Erst nach geprüftem Join/Uplink mit einer unabhängigen TTN-Test-Application
   die automatischen Pilotupdates aktivieren:

   ```bash
   docker compose up -d watchtower
   ```

   Die Gateway-EUI bleibt unabhängig von Docker-Netzwerkadressen. Keine
   Payload-Formatter oder Zugänge zum Sensor-Backend werden benötigt.

## Umstieg von der separaten LNS-Datei

Vor einem laufenden Pilotupdate zuerst Watchtower stoppen. Den bisherigen Key
als `TC_KEY` in `.env` übernehmen, `chmod 600 .env` setzen und die neue
`compose.yml` auf den Pi übertragen. Danach Basics Station mit
`docker compose up -d --force-recreate basicstation` neu erstellen und prüfen.
Erst anschließend Watchtower wieder starten. Der neue Container erwartet
`TC_KEY`; ein Austausch nur des Images migriert die alte Secret-Konfiguration nicht.

## Private GHCR-Pakete

Neu erstellte GHCR-Pakete sind nicht zwingend öffentlich. Entweder gewünschte
Paket-Sichtbarkeit bei GitHub festlegen oder einen reinen Lesezugang verwenden.
Für eine private Registry auf dem Pi eine gesonderte Docker-Anmeldung erzeugen:

```bash
mkdir -p secrets/registry
chmod 700 secrets/registry
docker --config ./secrets/registry login ghcr.io
chmod 600 secrets/registry/config.json
docker --config ./secrets/registry compose -f compose.yml -f compose.registry-auth.yml pull
docker --config ./secrets/registry compose -f compose.yml -f compose.registry-auth.yml up -d basicstation
# Nach erfolgreicher Funkprüfung:
docker --config ./secrets/registry compose -f compose.yml -f compose.registry-auth.yml up -d watchtower
```

Benötigt wird ein für das Paket berechtigter Zugang mit `read:packages`.
Der Updater erhält nur diese eigene Konfiguration. Sie muss die tatsächliche
Registry-Anmeldung enthalten; eine Referenz auf einen nicht im Container
verfügbaren Desktop-Credential-Helper genügt nicht. Die gleichen Compose-Dateien
bei jedem weiteren Befehl verwenden. Keine persönlichen Schreibzugänge mounten.

## Manueller Rücksprung / Updatepause

1. Mit denselben Compose-Dateien zuerst `docker compose stop watchtower` ausführen.
2. In `.env` `GATEWAY_IMAGE` auf den bekannten `:sha-<commit>`-Stand setzen.
3. `docker compose pull basicstation` und
   `docker compose up -d --no-deps basicstation` ausführen, Funkfunktion prüfen.
4. Auf festem SHA-Tag bleibt die Station eingefroren. Den `pilot`-Tag erst nach
   Fehlerbehebung wieder setzen und Watchtower anschließend starten.

Bei privater Registry jeweils den obigen `--config`-Pfad und beide `-f`-Dateien
verwenden. Schlüsselrotation: `TC_KEY` in `.env` ändern, danach
`docker compose up -d --force-recreate basicstation`; eine normale
Konfigurationsprüfung oder ein Registry-Poll allein rotiert keinen Schlüssel.

## Lokale Prüfung ohne Funkhardware

```bash
GATEWAY_EUI=0102030405060708 TC_KEY=NNSXS.synthetic-local-test docker compose --env-file .env.example -f compose.yml config --format json > /tmp/gateway-compose.json
GATEWAY_COMPOSE_JSON=/tmp/gateway-compose.json python3 -m unittest discover -s tests -v
bash -n scripts/gateway-start scripts/gateway-healthcheck
```

CI baut und startet zusätzlich das ARM64-Binary ohne Hardware und prüft die
Konfiguration mit ausschließlich synthetischen Zugangsdaten. Das ersetzt keine
Prüfung von SPI, GPIO, PoE, HAT-Kühlung oder TTN auf unserem Pi.

## Persistentes Empfangsjournal und Offlinebetrieb

`./state` ist dauerhaft in `/var/lib/kamue-gateway` eingebunden. SQLite läuft
mit WAL und `synchronous=FULL`; keine Löschung bei Imagewechsel. Das Profil ist
an LNS-URL und Gateway-EUI gebunden. Beim Wechsel werden alte Datensätze nicht
ungeprüft an ein neues Netz gesendet. Originale Funkdaten und Zeitkontexte bleiben
unverändert. Empfang während eines ausgeschalteten Pi ist nicht möglich.

Standardgrenzen: 72 Stunden Aufbewahrung, 100.000 Datensätze, 256 MiB Nutzdaten
zuzüglich SQLite-/WAL-Overhead. Älteste Datensätze werden bei Überlauf gezählt
verworfen. Speicherverbrauch und die Zähler `overflow_dropped`, `expired`,
`pending` und `acceptance_unknown` beobachten. Gesendete Datensätze bleiben bis
zur Alters-/Platzgrenze erhalten; ein erfolgreicher Socket-Schreibvorgang wird
nicht als TTN-Annahmenachweis ausgegeben. Der Replay ist auf 50 Frames/s begrenzt.

Ohne Internet startet die Funkstation mit dem letzten vom konfigurierten LNS
empfangenen Kanalplan. Vor dem allerersten erfolgreichen Onlinebetrieb gibt es
keinen solchen Plan; es wird kein erfundener Frequenzplan gesendet. Veraltete
Class-A-Downlinks werden verworfen. Joins werden nur live weitergegeben.

## Automatischen Rücksprung installieren

Nach erfolgreichem Start der neuen Bridge-Version auf dem Pi:

```bash
sudo bash scripts/install-guardian
sudo systemctl status kamue-gateway-guardian --no-pager
```

Der Dienst läuft auf dem Host und bleibt daher bei defekten Gateway-Images
handlungsfähig. Er merkt sich den ersten Docker-gesunden Stand mit aktiver
LNS-Verbindung. Neue Images werden erst nach 180 Sekunden durchgehend gesundem
Betrieb übernommen. Nach insgesamt 360 Sekunden ohne ausreichenden Nachweis
wird auf das lokal vorgehaltene gute Image zurückgeschaltet. Die Prüfung gilt
lokaler Funkbereitschaft, nicht der Verfügbarkeit von TTN.

Beim Rücksprung wird Watchtower gestoppt und `GATEWAY_IMAGE` in derselben `.env`
auf einen lokalen Rücksprungtag festgesetzt. Zugangsdaten werden nicht in eine
zweite Konfigurationsdatei kopiert. Fehlerhafte Versionen werden nicht endlos
wieder installiert. Nach Reparatur neue Pilotversion bewusst einspielen,
Guardian-Zustand prüfen und den Dienst kurz stoppen. Nach geprüftem Funkstart
die Zustandsdatei sichern und darin ausschließlich `paused`, `reason`,
`rollback_at` und `candidate` entfernen; `good` erhalten. Danach den Guardian
und erst anschließend Watchtower starten. Alte Images nicht
bereinigen, solange sie als Rücksprungstand benötigt werden.
