# RAK2287 / Raspberry Pi 4: erster Gateway-Grundaufbau

Stand: 29.10.2026. Dieser Stand bereitet einen zugänglichen **Pilotbetrieb** vor.
Vorhandene Basics Station wird weiterverwendet; kein eigener Funk-Forwarder,
kein Application-Decoder und keine Installation auf einem Pi durch diesen Commit.

## Enthalten und noch offen

Enthalten: ARM64-Image auf gepinnter Upstream-Basis, überprüfte
Hardware-/LNS-Konfiguration, TTN-Schlüssel als lokale Datei, begrenzte Logs und
Watchtower für automatische Updates ausschließlich dieses Gateways.

Noch **nicht** implementiert oder abgenommen: persistentes Store-and-forward,
Offline-Kaltstart mit Kanalplan, Funk-/LNS-Funktionsprüfung und automatischer
Rollback. Der HEALTHCHECK zeigt nur Prozess-/Konfigurations-Liveness.
`restart: unless-stopped` startet einen beendeten Prozess neu; `unhealthy`
löst allein weder Neustart noch Rücksprung aus. Vor Dachmontage müssen die
Abnahmekriterien im [Implementierungsplan](../docs/gateway/implementierungsplan.md)
erfüllt werden. Im Grundaufbau können bei Internetausfall Uplinks verloren gehen.

## Image und Updatepfad

GitHub Actions baut bei Änderungen an `gateway/**` oder am Gateway-Workflow
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

## Vorbereitung auf dem Pi (später ausführen)

Voraussetzungen: Pi 4 mit 64-Bit-Linux (`uname -m`: `aarch64`), Docker Engine und
Compose v2, aktives SPI mit `/dev/spidev0.0`, Internet, korrekte Uhrzeit und DNS.
RAK2287 muss EU868/SPI sein. RAK-/PoE+-HAT mechanisch und elektrisch zuerst
prüfen. `RESET_GPIO=17` und `gpiochip0` sind die zu verifizierenden Profilwerte.
Kein zweiter Forwarder darf auf den Konzentrator zugreifen.

1. Repository auschecken und in `gateway/` wechseln. `.env.example` nach `.env`
   kopieren. Eindeutige, dauerhaft zugeordnete Gateway-EUI eintragen; keine
   Beispiel-EUI verwenden. Über `.env` werden ausschließlich nicht geheime
   Parameter gesetzt.
2. Gateway in TTN im passenden Cluster registrieren. EU868-Kanalplan sowie
   Standort, Montagehöhe und Antennengewinn eintragen. Der Default-Endpunkt hier
   ist `wss://eu1.cloud.thethings.network:8887`.
3. Einen gatewaybezogenen API-Key für „Link as Gateway to a Gateway Server for
   traffic exchange“ erzeugen. Keinen Application-Key und keinen persönlichen
   Account-Schlüssel verwenden. Auf dem Pi vorbereiten:

   ```bash
   mkdir -p secrets
   chmod 700 secrets
   install -m 600 /dev/null secrets/ttn-lns.key
   nano secrets/ttn-lns.key
   ```

   Nur den rohen einzeiligen `NNSXS.…`-Key eintragen. Keine Schlüssel ins Chat,
   Image oder Git kopieren. `secrets/` ist ignoriert. Compose bindet die Datei
   als `/run/secrets/tc.key` ein. Generierte Zugangsdaten liegen in einem
   flüchtigen, auf root beschränkten Konfigurationsverzeichnis; bei jedem Start
   werden sie aus der lokalen Secret-Datei neu erzeugt. Der Puffer ist hierdurch
   nicht implementiert. `ANTENNA_GAIN_DBI=3` berücksichtigt konservativ den
   Bruttogewinn; genaue Leitungsverluste und zulässige Leistung vor Funkbetrieb prüfen.
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
verwenden. Schlüsselrotation: Secret-Datei ändern, danach
`docker compose up -d --force-recreate basicstation`; eine normale
Konfigurationsprüfung oder ein Registry-Poll allein rotiert keinen Schlüssel.

## Lokale Prüfung ohne Funkhardware

```bash
GATEWAY_EUI=0102030405060708 docker compose --env-file .env.example -f compose.yml config --format json > /tmp/gateway-compose.json
GATEWAY_COMPOSE_JSON=/tmp/gateway-compose.json python3 -m unittest discover -s tests -v
bash -n scripts/gateway-start scripts/gateway-healthcheck
```

CI baut und startet zusätzlich das ARM64-Binary ohne Hardware und prüft die
Konfiguration mit ausschließlich synthetischen Zugangsdaten. Das ersetzt keine
Prüfung von SPI, GPIO, PoE, HAT-Kühlung oder TTN auf unserem Pi.
