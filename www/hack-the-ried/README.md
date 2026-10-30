# HackTheRied – Digitales Umweltsensornetzwerk Bürstadt & Lampertheim

**HackTheRied** ist eine private Initiative zur Digitalisierung der Städte **Bürstadt** und **Lampertheim** sowie der umliegenden Region des Hessischen Rieds. Das Projekt wird von engagierten Bürgerinnen und Bürgern in Kooperation mit dem [Kulturzentrum KAMÜ](https://kamue.me) in Bürstadt getragen.

---

## 📌 Projektkontext & aktueller Umfang

HackTheRied verbindet eigene Sensoren mit öffentlichen und kommunalen
Datenquellen für Bürstadt, Lampertheim und das Hessische Ried. Das Portal ist
damit mehr als ein Dashboard für eine geplante Gruppe von fünf Stationen: Es
zeigt Umwelt-, Mobilitäts- und Regionaldaten verschiedener Anbieter und
Sensorarten. Die verfügbaren Werte unterscheiden sich je nach Station und
Datenquelle.

Eine Read-only-Abfrage der produktiven Datenbank am 21.10.2026 fand 1.217
sichtbare Sensoren mit mindestens einem Eintrag in `sensor_latest`, 74
verschiedene Messgrößen und 2.857 Sensor-/Messgröße-/Einheit-Kombinationen mit
einem zuletzt gespeicherten Wert. Das ist eine veränderliche Momentaufnahme,
kein Freshness-Nachweis oder feste Projektkapazität.

Die Datenbereiche umfassen unter anderem Temperatur, Luftfeuchtigkeit,
Niederschlag, Feinstaub, Luftqualität, UV und Licht, Tankstellenpreise,
Fahrradverfügbarkeit, Verkehr, Wetter, Luftgütestationen, LoRaWAN-Gateways
und Bewegungsdaten. Ein einzelner Sensor liefert jeweils nur die Messgrößen,
die für seine Quelle erfasst werden.

---

## 🛠️ Technischer Stack und Betrieb

Die Web-Anwendung dient als zentrales Dashboard und Dokumentationsportal für das Netzwerk:

- **Framework**: Next.js 16 (App Router, React 19)
- **Styling**: Tailwind CSS v4
- **Icons**: Lucide React
- **Kartendarstellung**: Leaflet & OpenStreetMap (Bürstadt / Lampertheim / Ried Region)
- **Backend**: FastAPI und TimescaleDB auf dem VPS; Nginx veröffentlicht die API über HTTPS.
- **Datenquellen**: eigene LoRaWAN-Sensoren über [The Things Network (TTN)](https://www.thethingsindustries.com) und eigenständige Sammler für externe Quellen.
- **Hosting**: Frontend auf Vercel; API, Datenbank und Sammler als Docker-Compose-Stack auf dem VPS.
- **Deployment**: GitHub Actions validiert und veröffentlicht Container-Images in GHCR. Watchtower läuft auf dem VPS im Monitor-only-Modus; der Server wird kontrolliert aktualisiert und nicht automatisch bei jedem GHCR-Push.

Das Produktivsystem wird per SSH erreicht:

```bash
ssh -i ~/.ssh/id_ed25519 root@169.58.102.132
```

Weitere Betriebsinformationen, darunter die tatsächlichen Compose-Dienste und
die Deployment-Reihenfolge, stehen in [`www/vps/README.md`](../vps/README.md)
und [`www/vps/DEPLOYMENT.md`](../vps/DEPLOYMENT.md).

---

## 🚀 Entwicklung & Start

```bash
# Abhängigkeiten installieren
npm install

# Entwicklungs-Server starten
npm run dev

# Production Build erstellen
npm run build
```

Öffne [http://localhost:3000](http://localhost:3000) im Browser.
# Security configuration

Copy `.env.example` and configure `ADMIN_PASSWORD`, `BACKEND_API_URL`,
`BACKEND_ADMIN_API_KEY`, and `ADMIN_SESSION_SECRET`. Generate the session secret
with `openssl rand -hex 32`; it must be 64 hexadecimal characters and independent
of the password. Use separate credentials/secrets for development and production.
All environments require the correct password to log in. Changing the session
secret signs out every administrator; existing password-signed cookies are no
longer accepted after this upgrade. Keep the session secret consistent across
instances of the same deployment, separately from the Server Actions encryption key.

Use the HTTPS backend URL for a remote VPS. Its Docker services no longer publish
the database or plaintext API ports. Set the VPS `ADMIN_API_KEY` to match
`BACKEND_ADMIN_API_KEY`; it must differ from the ingestion `API_KEY`.

Run security regression checks with `npm run test:security`.

## Vercel resource usage

The home page and map are prerendered. Sensor snapshots, shared map layers,
base/rain tiles, civic map overlays and live movement/satellite streams are
loaded directly from the public VPS API. The browser uses the same station
normalization as the server. `next.config.ts` derives the public API origin
from `BACKEND_API_URL` at build time and permits only the required public
namespaces in the Content Security Policy; credentials are not bundled.
The VPS must remain reachable over HTTPS and allow browser CORS requests.

All public page shells are prerendered, including the atlas, forecasts, source
status and archive catalogue. Their existing tables and filters load public VPS
publications in the browser. Collected publications get a fresh request and a
display deadline bounded by the upstream Cache-Control TTL (available through
CORS even when custom expiry headers are hidden). Expired batches are removed
before another batch is displayed; failed sources remain unavailable.

Telemetry charts poll only while the chart intersects the viewport and the tab
is visible. Current values refresh every 30 seconds (10 seconds for movement
entities); ordinary full histories refresh every five minutes. Current-only
telemetry calls skip history queries. Public successful telemetry responses can
be shared in the Vercel CDN for ten seconds. Fuel, sky, Autobahn inventories and
archived satellite imagery are also loaded directly from the VPS. Warning
normalization remains in its validated API route, but hidden tabs do not poll it.
Archived raster scenes refresh every 15 minutes, FIRMS every five minutes.

Hidden tabs release live streams and pause sensor refreshes. Existing same-origin
map API routes and rewrites remain available for compatibility, but the current
map does not send its bulk payloads through Vercel. This reduces Vercel compute,
transfer and CDN requests; it shifts delivery to the existing VPS rather than
reducing the underlying dataset. Changes affect new usage, not totals already
accumulated in the billing period. Functions Storage also includes retained
deployments across projects and should be inspected by project before cleanup.

# Sensor map

The dashboard uses clustered Leaflet markers without permanent sensor IDs.
Theme buttons support multiple selections and persist them in local storage.
Clicking a theme from the initial "Alle" selection isolates that theme; subsequent
clicks add/remove themes. "Zurücksetzen" restores all themes and category colours.
The map and station selector use the same filtered inventory. Multi-theme stations
are counted once on the map, so category totals can overlap.

The initial viewport stays around Bürstadt/Lampertheim. "Alle Standorte" fits the
selected inventory, including regional stations. Cluster rings show theme
composition; clicking expands a cluster, and colocated markers spread apart at
maximum zoom. Names appear on hover, measurements in popups, and short values at
zoom 16+. Technical IDs and source descriptions are under "Stationsdetails".

"Temperatur · °C" uses five labelled temperature bins for current Celsius
readings; it excludes stations without a compatible temperature measurement.
Icons still distinguish themes, including soil versus weather. Old/missing values
are muted and dashed; in temperature mode they are gray. Temperature clusters
remain neutral count bubbles rather than implying an averaged temperature.

Freshness describes the observation, never device connectivity: seismic readings
are current for 2 minutes, general weather/water readings for 2 hours, air-quality
index for 3 hours, and explicit soil metrics for 6 hours. Parking is an event-driven
last-reported state and is not labelled online/offline. Every popup includes its
source timestamp. These are display heuristics, not provider uptime guarantees.

The server and `/api/map-sensors` proxy read `/api/v1/map/sensors` once per refresh
(60 seconds). The backend reads its `sensor_latest` table, maintained by a database
trigger for inserts, corrections and deletes. Deploy the updated API/schema before
the frontend. First migration backfills existing history once and may take time on
large databases; subsequent restarts do not repeat the backfill. A 404 from an older
API falls back to metadata-only markers with an explicit message that readings are
unavailable; it does not invent status or fetch measurements separately per station.

Validation: `npm run test:map`, `npm run test:security`, `npm run build`.
# Marketing-QR-Codes

Marketing-QR-Codes verwenden `/qr/<id>`, getrennt von den Sensorseiten unter
`/q/<id>`. Die Zuordnung der IDs zu Zielseiten steht in
`lib/marketingQr.ts`. Dort beispielsweise `sommerfest:
"https://hack-the-ried.de/termine"` ergänzen und anschließend den QR-Code
`https://hack-the-ried.de/qr/sommerfest` drucken.

Query-Parameter am QR-Code werden an das Ziel angehängt. Damit funktionieren
zum Beispiel Kampagnenlinks wie `/qr/sommerfest?utm_source=flyer`. Unbekannte
IDs liefern eine 404-Seite. Die Ziele werden bewusst im Quellcode festgelegt;
ein frei übergebener `url`-Parameter kann keine Weiterleitung bestimmen.
