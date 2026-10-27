# Smart City snapshot collector

Polls the public Bürstadt/Lampertheim overview, main map, traffic map and
traffic overview every 60 seconds and stores
source-timestamped numeric observations in HackTheRied TimescaleDB. Runs as
an independent container alongside `shake-collector`; no source credentials or
browser are needed. This is snapshot polling, not a lossless real-time stream.

Source: [public dashboard](https://smartcity-system.de/buerstadt/dashboard_uebersicht)
and its [JSON response](https://dashboard-service.smartcity-system.de/dashboards/76a90123-ba53-4d77-be9f-f11ef90dd63a?includeContent=true).
The nested query configuration is fetched with every poll, so no separate
discovery job is needed. Only the configured dashboards is fetched; the collector
does not crawl the tenant's other dashboards.

## Supported measurements

| Source type/attribute | Local metric | Unit |
| --- | --- | --- |
| WeatherObserved.temperature | temperature | °C |
| WeatherObserved.relativeHumidity | relative_humidity | % |
| FloodMonitoring.currentLevelDelta | water_level_delta | m |
| GreenspaceRecord.soilTemperature | soil_temperature | °C |
| GreenspaceRecord.waterSurfaceDistance | water_surface_distance | cm |
| AirQualityObserved.airQualityIndex | air_quality_index | index |
| ParkingSpotSum.status_isFreeSum / ParkingGroup.availableSpotNumber | parking_free | count |
| ParkingSpotSum.status_isOccupiedSum / ParkingGroup.totalOccupied | parking_occupied | count |
| ParkingSpotSum.anzahlParkplaetze / ParkingGroup.totalSpotNumber | parking_capacity | count |

Dimensional units must match the query's property or widget configuration.
The overview explicitly labels temperature, humidity and water-level quantities.
Counts and the source's air-quality index are dimensionless. `temperature` retains
the source's meaning: some WeatherObserved entities represent soil temperature;
their source names are preserved. Parking may represent a location or group.
Water-level delta is not an absolute level.

Additional supported metrics (2026-09-14):

- SoilMeasurement: `soil_moisture_30cm`, `soil_moisture_60cm` (%),
  `soil_tension_30cm`, `soil_tension_60cm` (kPa), `soil_temperature` (°C),
  and `relative_humidity` (%) when supplied with a verified unit.
- SoilTension: `soil_tension` (kPa) and `soil_temperature` (°C).
- GreenspaceRecord: `soil_moisture_nfk` retains the dashboard's literal `% nFK`
  unit. It is deliberately distinct from volumetric soil moisture.
- TrafficFlowObservedSumHourly: `traffic_{kind}_hourly`, where kind is `total`,
  `cars`, `trucks`, `buses`, `bicycles`, `pedestrians`, `motorcycles`, or `other`.
- TrafficFlowObservedSumDaily / SumDailyCity: matching `_daily` / `_daily_city`
  metrics. These retain separate station identities and units `count`.
  The default sources expose 29 hourly counters and two city daily totals.
  Individual daily detail dashboards can be added by UUID if needed.
- WeatherObserved.precipitation is accepted only with an explicit mm unit.

Traffic is stored as timestamped **snapshots of source aggregates**, never as raw
vehicle detections. Exact source window boundaries are not provided; do not infer
them or sum consecutive reports. The UI displays source reports without further
averaging for parking/traffic. This does not backfill historical dashboard charts.

Some rainfall labels remain `ml/h` or absent and pollutant labels conflict (`ppm`
for particulate matter versus `mg/m³` on detail pages). These values remain
quarantined rather than guessed. Forecasts, alerts, categorical text and static
points of interest are outside numeric observation telemetry. The skip report
records unavailable timestamps, units and unsupported types explicitly.

The expanded 2026-09-14 captured-source dry run accepted 1,369 observations
(including repeated entities at distinct source timestamps) from 536 source entities.
This covers 29 hourly traffic counters, 2 city daily summaries, 3 water-level
sensors, 124 SoilTension stations, 10 SoilMeasurement stations, 4 climate boxes,
104 parking locations, 8 parking groups, 249 weather entities and 3 air-index stations.
This includes regional sources and Lampertheim, not just Bürstadt. Some records
are months old. These figures do not imply 366 currently transmitting devices.

## Identity, timestamps and transactions

- Stable IDs are `scs-<40-character hash of tenant and source URN>`. One entity
  can publish several metrics; duplicate widgets do not create extra sensors.
- Per-property `observedAt` takes precedence over NGSI metadata `dateObserved`
  and the entity's `dateObserved`. Timezone-less, missing or excessively future
  timestamps are rejected. Query update time and poll time are never substituted
  for observation time. Nulls/nonfinite values are skipped; valid zero is kept.
- The migration in `api/v1/schema.sql` adds source mappings, metric mappings,
  an observation ledger and a correction history. All writes to the ledger and
  `sensor_data` commit together under a collector-specific transaction lock.
  Replayed polls and concurrent workers insert each source observation once.
- Changed values at the same source timestamp update the existing telemetry row
  and retain the old value in `smartcity_revisions`. Older query revisions or
  older fetches cannot overwrite newer ones. Conflicting duplicate widgets in
  one response are skipped. The provider's query update time is the available
  revision signal; it is not a guarantee against all upstream cache anomalies.
- Unit/attribute mapping changes require an explicit migration. Existing sensor
  names, coordinates and visibility edited by admins are preserved on later polls.
  Updated source names remain available in `smartcity_sources`.
- Ledger, telemetry and correction history must be backed up/restored together.
  Do not independently delete ledger records. The existing admin purge operation
  deletes telemetry and cascades the associated collector records.

The existing public latest/raw/aggregate endpoints and monthly telemetry archives
work with the normalized readings. Sensor descriptions identify the source;
the latest APIs return observation timestamps. Detailed provenance lives in the
new tables; no new frontend view or provenance export is included in this version.
Corrections to old months can require regenerating those published archive months.
Temporal backfill and a supported streaming feed are future additions.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| SMARTCITY_TENANT | buerstadt | Identity namespace; changing it creates new IDs |
| SMARTCITY_DASHBOARD_ID | 76a90123-ba53-4d77-be9f-f11ef90dd63a | Overview dashboard UUID |
| SMARTCITY_ADDITIONAL_DASHBOARD_IDS | main map, traffic map, traffic overview UUIDs | Comma-separated additional dashboards, deduplicated with the overview; set empty in direct environment to disable |
| SMARTCITY_POLL_SECONDS | 60 | Delay between successful polls, plus up to 10% jitter; minimum 30 |
| SMARTCITY_ENTITY_IDS | empty | Optional comma-separated exact source URNs |
| SMARTCITY_METRICS | empty | Optional comma-separated local metric names from the table |
| SMARTCITY_STATE_DIR | /data | Latest snapshot and status directory |
| SMARTCITY_BASE_URL | https://dashboard-service.smartcity-system.de | Standalone HTTP service override |
| DB_HOST / DB_PORT | timescaledb / 5432 | Database host and port |
| DB_NAME / DB_USER / DB_PASSWORD | mydatabase / postgres / empty | Database credentials |

The daemon reads environment variables, not a local dotenv file. Compose supplies
the variables from the VPS `.env`. Empty filters mean all supported observations
on the chosen dashboard. New entities on that dashboard are included automatically
unless `SMARTCITY_ENTITY_IDS` restricts them. Changing the tenant only changes the
ID namespace; choose a matching dashboard UUID to change the source.

Only direct DB ingestion is supported. The current `/telemetry/batch` endpoint
does not provide the atomic deduplication this collector requires.

## Run and deploy

Local read-only inventory, with no database required:

```bash
python -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python main.py --dry-run
# Replay a saved response without network, DB or file writes:
.venv/bin/python main.py --dry-run --input tests/fixtures/overview.json
```

`--once` performs one real poll and commits it. Without a flag, collection repeats
until SIGINT/SIGTERM. Normal-mode DB/schema failures retry automatically; one-shot
and dry-run failures exit nonzero.

After committing/pushing and successful CI image publication, update the VPS
Compose file and deploy **the API schema before the collector**:

```bash
docker compose pull backend-api smartcity-collector
docker compose up -d --no-deps backend-api
docker compose logs --tail=50 backend-api
# Confirm "Database schema initialized successfully" before proceeding.
docker compose run --rm --no-deps smartcity-collector python main.py --dry-run
docker compose up -d --no-deps smartcity-collector
docker compose logs --tail=100 smartcity-collector
```

The first deployment needs these explicit commands: Watchtower is monitor-only
on the inspected production host, so it neither updates an existing image nor
adds a service or changes the Compose file. Use the release deployment runbook
and the active Compose project/override. Compose startup dependency order does
not guarantee migration readiness; the collector will retry if started early.

For a small 24-hour pilot, set these in the VPS `.env` before starting:

```dotenv
SMARTCITY_ENTITY_IDS=urn:ngsi-ld:WeatherObserved:IoT-Plan-Glatteis-70B3D57BA0006570
SMARTCITY_METRICS=temperature,relative_humidity
```

After reviewing freshness and errors, clear those filters and recreate the
container to collect the full reviewed overview scope. No historical samples
missed during the pilot/outages are recovered automatically.

## Operations

Requests have a 30-second HTTP timeout, 45-second total deadline and 20 MiB
decompressed limit. Failed polls back off exponentially to one hour and honor
longer `Retry-After` delays. There is no parallel source polling.

The named volume contains only the latest `latest-dashboard.json` and
`status.json` (replaced atomically), bounding snapshot storage. The status lists
accepted metrics, source timestamps/ages, skipped fields and ingestion counts.
Age is evaluated at the reported fetch time. Parking states can remain unchanged
for long periods, so old state timestamps alone do not prove an outage.

```bash
docker compose exec smartcity-collector python main.py --healthcheck
docker compose exec smartcity-collector cat /data/status.json
```

Container health means a recent successful fetch/normalization/DB cycle, not that
every sensor is fresh. No-readings polls emit a warning; source age and skip counts
must be reviewed separately. Failed polls leave the last successful status intact,
so it ages into an unhealthy state rather than falsely claiming fresh data.
Diagnostic SQL:

```sql
SELECT s.sensor_id, s.source_name, s.entity_id, o.metric,
       max(o.observed_at) AS latest_observation,
       now() - max(o.observed_at) AS observation_age
FROM smartcity_sources s JOIN smartcity_observations o USING (sensor_id)
GROUP BY s.sensor_id, s.source_name, s.entity_id, o.metric;
```

## Tests

```bash
python -m unittest discover -s tests
# Integration tests use isolated schemas in a disposable test database:
SMARTCITY_TEST_DATABASE_URL=postgresql://postgres:test@localhost:5432/postgres \
  python -m unittest discover -s tests
```

Without that variable, database tests explicitly skip. Set
`SMARTCITY_TEST_TIMESCALE=1` to apply the full production schema with the extension;
otherwise only Timescale-specific initialization is omitted for plain PostgreSQL.
CI runs all tests on TimescaleDB/PostgreSQL 16 before publishing the image.
Fixtures are trimmed public query responses captured on 2026-09-14; the tests
never need to contact the public service.


## Expanded coverage deployment

Update the collector, backend API **and** frontend together. Recreate the collector
with the updated Compose configuration; clear any old `SMARTCITY_ENTITY_IDS` or
`SMARTCITY_METRICS` pilot allowlist to collect the full supported scope. No new SQL
schema migration is required beyond the existing Smart City and latest-reading
schema. The collector fills coordinates only when both stored coordinates are
NULL, so previously registered water stations can appear on the map. Existing
coordinates, names and visibility choices are preserved.

The station inventory now includes visible stations without coordinates. The map
still shows only valid positions; “Messwerte & Zeitverlauf” lists all stations
independently of map filters, including parking groups and city totals. Latest
measurement cards remain visible when the historical query fails. Counts are
labelled in German and parking summaries show free/total capacity.

Default additional dashboards:
- `24c1807c-3c5a-4809-a57e-33baf13751ea` — main map (traffic, soil, water).
- `5a1a6650-26ce-4662-9d52-6e59102e1434` — traffic/parking map.
- `26f92cf2-4b45-4856-b0d3-b606ad186e62` — traffic overview / city totals.

Each request remains bounded to 20 MiB. Requests are sequential and a failed
source aborts the poll before DB ingestion; last-success health is not advanced.
The bounded diagnostic snapshot is now a list of up to four default dashboards.

## Common collector structure

Acquisition now lives in `source.py`, polling/CLI in `runtime.py`, and status handling in `health.py`. Source timestamp and revision semantics are unchanged. See [collector maintenance](../collectors.md) for the common status contract, bounded cycle, schema readiness and deployment steps.
