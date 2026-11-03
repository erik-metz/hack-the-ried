# Gateway-Betriebstelemetrie

Stand: 2026-11-03. Host-Collector, private FastAPI-Aufnahme und Adminseite
`/admin/gateways`. Der Collector steuert oder startet weder Funksoftware noch
TTN-Verbindungen. Alle numerischen Daten liegen ausschließlich im Messdatenkern.

## Daten und Zeitbezug

Alle 10 Sekunden werden Zustände geprüft; alle 60 Sekunden entsteht ein
minutengenauer Datensatz. CPU-/SoC-Temperatur ist keine Gehäusetemperatur.
SHT41 ist optional (`sht41_device: "/dev/i2c-1"`, Adresse 0x44); CRC wird geprüft.
Ohne angeschlossenen Sensor bleibt die Konfiguration null. I2C-Aktivierung und
Verdrahtung werden nicht automatisch verändert.

Systemwerte: CPU-Temperatur/-Auslastung, verfügbarer RAM, freier Root-Speicher,
Laufzeit, Firmware-Versorgungs-/Drosselungsflags. Gatewaywerte: Funkbereitschaft,
Station/LNS verbunden, Statusalter, letzter Empfang, Journalgröße und Rückstau.
`acceptance_unknown` ist kein Nachweis einer fehlgeschlagenen TTN-Annahme;
`expired` umfasst auch regulär abgelaufene bereits gesendete Journaleinträge.
Zustandsdauern zählen nur Zeit zwischen zwei bekannten übereinstimmenden Proben.
Unbeobachtete Zeit bleibt unbekannt; Zustandswechsel haben maximal die
Prüfauflösung, keine erfundene sekundengenaue Ausfalldauer.

Die Bridge zählt nur neue Funkempfänge (einschließlich Join Requests), nie Replay.
Sie hält 120 abgeschlossene Minuten ohne Application-Payloads im Healthstatus.
Der Collector übernimmt die letzte abgeschlossene Minute; ein gestoppter Collector
kann frühere Funk-Minuten nicht nachträglich rekonstruieren. Solche Zeiten bleiben
Lücken. Radio-Minutenstatistiken werden am Intervallanfang gespeichert, der
Uploaddatensatz trägt das Ende dieses Intervalls. Systemwerte sind Momentaufnahmen.

## Pi-Installation

1. `telemetry/config.example.json` nach `/etc/kamue-gateway-telemetry.json`
   übernehmen, Gateway-ID und dediziertes zufälliges Token (mindestens 32 Zeichen)
   eintragen. Datei root:root 0600, niemals in Git oder Logs ablegen.
2. Das passende veröffentlichte Gateway-Image mit der RadioStats-Bridge deployen.
   Containeroptionen und bestehende TTN-Schlüssel beibehalten; Guardian prüfen.
3. `sudo bash hardware/gateway/scripts/install-telemetry` ausführen.
4. `systemctl status kamue-gateway-telemetry` und `journalctl -u
   kamue-gateway-telemetry` prüfen. Erfolg erfordert frische Daten auf der VPS,
   nicht nur einen laufenden Prozess.

Der rootseitige Hostdienst liest die vorhandene rootgeschützte Statusdatei.
Er verwendet keinen Docker-Socket. systemd begrenzt Schreibzugriffe auf sein
StateDirectory. Die Outbox nutzt SQLite/WAL und bestätigt erst nach DB-Commit.
Aktuelle Messungen werden vor dem historischen Rückstau versendet; Timeouts und
Backoff laufen unabhängig von der Erfassung. Keine HTTP-Redirects mit Token.
Logische Outbox maximal 30 Tage, 43.200 Datensätze oder 96 MiB JSON plus
SQLite-/WAL-Overhead. Bei Überlauf steigt der persistente Verlustzähler.

## VPS-Installation

Explizite additive Migration, kein DDL als Nebeneffekt des API-Starts:

```sh
docker exec backend_api python /app/gateway_maintenance.py --install
# Tokenfile temporär geschützt in den Container übertragen; nie im CLI-Argument.
docker exec backend_api python /app/gateway_maintenance.py \
  --provision kamue-lora-pi --token-file /run/gateway-token
```

Die Provisionierung speichert nur SHA-256 des hochentropischen Tokens. Das Gateway
bekommt keine bestehenden Admin-/TTN-/globalen Ingestion-Schlüssel. Entity
`gateway:kamue-lora-pi` ist verborgen; damit erscheinen Betriebsdaten nicht in
öffentlichen Karten oder Monatsarchiven. Eine bestehende TTN-Registry-Entity wird
nicht verborgen oder überschrieben. Zuordnung über die dokumentierte Gateway-ID.

`POST /api/v1/gateways/{id}/telemetry/batch`, Vertrag Version 1, höchstens
30 Samples/512 KB. Zulässiges Uploadalter 35 Tage, maximal zwei Minuten Zukunft.
UTC mit Zeitzone und ganze Minuten erforderlich. Ungültige Messgrößen/Einheiten,
NaN und unzulässige Dimensionen werden abgewiesen. Gleiche Sample-ID mit anderem
Inhalt oder eine zweite Identität für dieselbe Minute ergibt HTTP 409. Empfang
und frische Messung sind getrennt: historischer Replay macht keinen Pi online.

## Verdichtung und Retention

Die Unit-/Timerdateien in `www/vps/ops/systemd/kamue-gateway-maintenance.*` nach
`/etc/systemd/system/` installieren, `daemon-reload`, Timer aktivieren. Täglicher
Start 03:20 UTC mit bis zu fünf Minuten Zufallsverzögerung und Nachholen nach
VPS-Neustart. Manuell:

```sh
docker exec backend_api python /app/gateway_maintenance.py
# Erst nach Test/Abnahme die verifizierte Retention aktivieren:
docker exec backend_api python /app/gateway_maintenance.py --delete-expired
```

Pro Lauf werden höchstens 48 Stunden aggregiert und 48 Stunden bereinigt.
Advisory-Lock verhindert parallele Wartung. Uploads markieren Stunden erneut als
dirty. Min/Max/Summe/Anzahl liegen als Intervallstatistiken im Kern, Summen und
Paketanzahlen ermöglichen gewichtete weitere Verdichtung. Stundenaggregate werden
ersetzt, nicht addiert. Abfragen mischen fertige Stunden mit offenen Minuten ohne
Doppelzählung; über 90 Tage wird tageweise aus Stundenwerten zusammengefasst.

Minutenwerte bleiben 90 Tage; nur sauber abgeschlossene Gateway-Stunden dürfen
bereinigt werden. Kein globales `drop_chunks`, keine Änderung fremder Retention.
Stundenwerte bleiben dauerhaft, Ereignisse drei Jahre, Retry-Belege 40 Tage.
Die gemeinsame Timescale-Kompression bleibt erhalten; Löschvorgänge sind gezielt
und begrenzt. Fehler führen zu Wiederholung, nicht zum Löschen offener Stunden.

## Frontend und Prüfungen

Admin-Login bleibt erforderlich, ebenso am Next.js-Proxy und FastAPI-Leseendpunkt.
Kein Credential wird zum Browser geschickt. Polling alle 60 Sekunden bei sichtbarer
Seite, begrenzte Abfragen, Datum/Zeiten lokal angezeigt. Nach fünf Minuten ohne
frische Messung sind Livezustände unbekannt. Min/Max-Bänder und Datenlücken bleiben
sichtbar; Zustandsanteile zeigen auch Datenabdeckung. Ohne SHT41 erscheint ein
entsprechender Hinweis.

Prüfungen: Gateway-Unittests einschließlich Offline-WebSockets; API-Integration
mit isoliertem PostgreSQL (Retry, Auth, Korrektur, Retention, Historie), Frontend-
Charttests, ESLint und Production-Build. CI führt dieselben relevanten Tests aus.

Rollback: Collector stoppen/deaktivieren; vorhandenes Gateway-Image zurücksetzen
über den bestehenden Guardian-Pfad. API/Frontend können zurückgerollt werden;
additive Tabellen und bereits erfasste Werte erhalten. Keine historischen Werte
zurückdatieren oder zur Demonstration in die Produktion einfügen.
