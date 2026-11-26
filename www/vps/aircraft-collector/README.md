# Ried aircraft collector (ADS-B + OGN)

`adsb.lol → aircraft-collector → PostgreSQL/TimescaleDB → movements/latest + SSE → Next.js/Leaflet`

The collector queries a 30 nautical mile circle around 49.725/8.475 every 15 seconds
and accepts airborne observations in the buffered Ried rectangle 49.50–49.95 / 8.25–8.70.
This covers local flying and through flights, rather than inferring traffic from airport schedules.
The boundary is a configurable-code MVP region, not a precise administrative Ried polygon.
No origin/destination, airport ownership or complete aircraft coverage is inferred.

`AIRCRAFT_POLL_SECONDS` supports 10–300 seconds;
slower polling can produce intervals without visible aircraft because positions always
expire 60 seconds after the actual observation, independent of fetch time.
Without a key adsb.lol allows 500 requests per day and IP, reset at 00:00 UTC. The
collector reads `x-ratelimit-remaining`/`x-ratelimit-reset` and spreads the remaining
quota evenly until the reset (about one request every three minutes), instead of
exhausting it within two hours and showing no ADS-B aircraft for the rest of the day.
An optional free key in `ADSBLOL_API_KEY` (sent as `x-api-key`, obtainable at
https://www.adsb.lol/mmb) raises the quota; a feeder key (7,200/day) allows the
default 15-second interval. Retry-After, quota reset, exponential backoff and jitter
handle 429 and transient failures.
Failed requests are recorded in collection_attempts and never generate synthetic aircraft.
Health checks track successful acquisition from either source, not whether aircraft were present.

Only ICAO-addressed ADS-B/ADS-R/TIS-B/MLAT positions with fresh timestamps and an
indication of airborne altitude are accepted. Ground reports, anonymous non-ICAO
addresses, unknown airborne status, invalid coordinates and stale positions are rejected.
The position timestamp is the snapshot epoch minus seen_pos, normalized to milliseconds.
Duplicate observation timestamps do not create extra history or refresh expiry;
late accepted reports enter history but cannot overwrite a newer live observation.

Normalized accepted observations (not complete provider snapshots) are retained as
hash-addressed evidence in collected_payloads. movement_positions and movement_latest
reuse the existing movement pipeline. Latitude/longitude, ground speed, course,
pressure/geometric altitude and barometric vertical rate also use the canonical
measurement writer for telemetry and existing archive/export operations.
Pressure height uses 1013.25 hPa; geometric height uses WGS84. Neither is height
above ground. Knots/feet/feet per minute are converted to km/h/metres/metres per second.
Missing optional fields remain absent. MLAT is explicitly labelled as multilateration.

The Flugverkehr layer shows direction, source/age and a short trace of received
points (at most 12 points / two minutes). Traces break after reception gaps or large
position jumps. Animation interpolates received coordinates only, stops at its target,
respects reduced motion and does not run for stationary vehicles or hidden tabs.
Each reported OGN category has an original SVG silhouette, color and German label.
ADS-B emitter categories (A0–B7) are preserved as `emitter_category` in descriptive
metadata; the existing writer and API need no schema change. Only reported categories
select icons: model codes are not guessed into categories. ADS-B size groups do not
imply piston/jet engines, and its combined ultralight or lighter-than-air groups remain
combined. Missing/reserved categories use a generic fallback. Map popups, selection
names and the expandable legend share the same category labels. Directional silhouettes
point north before course rotation; balloons, parachutes and multirotor symbols stay
upright. Category changes refresh existing markers and accessible titles.

Positions expire in the browser even during stream failure. The shared stream already
reconnects and supplies full snapshots; polling is retained as fallback.

## Data rights and scope

Source attribution and an ODbL link are visible on the map and retained with each
observation. Keep adsb.lol attribution and ODbL obligations when publishing derived
databases/exports. Aircraft history stays in the existing common archive/retention
pipeline; this change does not silently introduce a seven-day deletion policy.
Monitor storage growth and configure the existing archive deployment accordingly.

## OGN / FLARM

A concurrent, read-only APRS connection to `aprs.glidernet.org:14580` subscribes to
`r/49.725/8.475/40` (40 km), with a second local bounding-box check. ADS-B failures
and OGN failures back off independently. Server acknowledgements/comments establish
connection status; an empty region is not an error. Keepalives are sent every 30 seconds.

The official HTTPS DDB is refreshed at startup and every 15 minutes. Permissions
expire after 30 minutes: missing, unknown, untracked or unidentified devices are
excluded. This conservative version requires both TRACKED=Y and IDENTIFIED=Y;
it does not publish anonymous tracks. Stealth/no-tracking packet flags are rejected
and immediately delete previous observations for that device. DDB revocations delete
positions transactionally. ICAO, FLARM and OGN tracker addresses have distinct namespaces;
only explicit ICAO addresses can suppress a duplicate already present in ADS-B.

OGN uses dedicated `ogn_permissions` and `ogn_positions` tables. Accepted observations
are deduplicated by device/time. The API joins current permissions and always excludes
positions older than 24 hours, even when the collector stops. Cleanup runs every
30 seconds while connected, at DDB refresh and on failures. No OGN packets, identities
or readings enter permanent collected_payloads, movement_positions, entities or
canonical readings, so the common backfill, raw-payload and archive/export pipeline
cannot redistribute them. The dedicated telemetry endpoint is also permission-checked,
limited to 24 hours, and marked no-store. Mobility snapshots are no-store too.
OGN positions expire live after 60 seconds. Browser traces remain limited to two minutes.

APRS coordinates, precision extensions, nearest-day UTC times, category/address/privacy
bits and reception error counts are validated. Ground/static categories and stationary
reports below five knots are suppressed; APRS has no reliable airborne flag, so a moving
aircraft on the ground can still appear. Height and climb are labelled as OGN reports,
without claiming a pressure/WGS84 reference or height above ground. Raw packets are
never logged. The map exposes OGN and ADS-B connection status independently and attributes
both ODbL sources. Coverage, including gliders, remains incomplete.

References:
- https://api.adsb.lol/docs
- https://github.com/adsblol/api (dynamic rate limits)
- https://github.com/adsblol/website/blob/main/content/en/docs/open-data/api.md (ODbL)
- https://www.glidernet.org/ogn-data-usage/ (OGN restrictions)

## Deploy

Publish API, collector and frontend from this release. New Compose services are not
created by Watchtower. For an existing aircraft deployment, apply only the additive
`api/v1/migrations/20261006_ogn.sql` in one transaction before updating the collector.
This creates isolated tables and does not rewrite existing mobility history.
For a fresh installation, in the VPS Compose directory with updated images:

```sh
docker compose pull backend-api aircraft-collector
docker compose run --rm --no-deps backend-api python migrate.py
docker compose run --rm --no-deps backend-api python measurement_migration.py install
docker compose up -d --no-deps backend-api aircraft-collector
docker compose logs --tail=50 aircraft-collector
```

Both migrations are required: the first enables aircraft history and registers the
source; the second installs the canonical writer with aircraft support. Reinstallation
preserves existing ship/aircraft rows. These steps do not enable shadow writes, backfill
history or switch measurement reader modes. Deploy the frontend too.

Verify Docker health, adsblol-ried and ogn-ried in collection status, aircraft_source
and ogn_source in movements,
fresh kind=aircraft entries (when received), repeated SSE batches and the Flugverkehr
layer. An empty valid feed is successful acquisition, not evidence of an empty sky.
A bounded acquisition test is available via `python collector.py --seconds 180`.
Disable collection with `docker compose stop aircraft-collector`; live positions expire.
Preserve additive schema/history on rollback.

## Tests

```sh
PYTHONPATH=www/vps/aircraft-collector:www/vps/api/v1:www/vps/tests \
  python -m unittest discover -s www/vps/aircraft-collector/tests
```

COLLECTOR_TEST_DATABASE_URL must point to a disposable database; the harness creates
and removes an isolated schema. Set COLLECTOR_TEST_TIMESCALE=1 for TimescaleDB.
CI checks OGN tracking revocations, flag rejection, DDB expiry, 24-hour reads and
isolation from permanent archives, plus ADS-B normalization, deduplication, late reports, repeated installation with
existing aircraft, canonical telemetry, both API reader modes and expiry before
building/publishing the aircraft image along with the other main-branch images.
