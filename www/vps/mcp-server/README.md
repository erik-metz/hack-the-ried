# HackTheRied public MCP

Anonymous, read-only Streamable HTTP endpoint: `https://hack-the-ried.duckdns.org/mcp`.
The URL describes the intended deployment; verify rollout evidence before claiming
the endpoint is live. No user OAuth/API key is needed. The model runs in the client.

## Tools

`list_datasets`, `get_dataset_info`, `search_entities`, `get_entity`,
`list_measurements`, `get_latest_readings`, `query_readings`, `query_dataset`,
`list_regional_datasets`, `query_regional_data`, `search_events`, `find_archives`,
`list_sources`, `get_source_health`, `get_source_history`,
`get_source_diagnostics`, `get_reliability_report`.

Start with the catalog, discover measurement IDs, then query their observations.
IDs/decimal values are returned as strings to preserve precision. Times are UTC;
historical observation ranges are start-inclusive/end-exclusive. ISO event dates
follow the existing public calendar's local-date filters. Object metadata and
provenance use public field allowlists. Unrecognised dimensions are omitted with
an explicit `dimensions_omitted` flag; the measurement ID still identifies the
exact series. iNaturalist data uses its dedicated publication/privacy boundary.
Raw source-diagnostic publications are excluded in favour of sanitised diagnostics.

Results are paginated: follow `next_offset` until null. Regional catalogs also
list configured publications not collected yet. Missing legacy migrations are
not silently repaired by reads. Unmigrated canonical history is outside canonical
queries; existing domain publications retain their configured API read model.
For nested publications, `get_dataset_info` lists top-level `available_sections`.
Use `section`, e.g. `tables/0/records` or `features`, to paginate existing nested
arrays without flattening or reinterpreting their domain schema.
Record filters apply to the selected array. Object containers reject unsupported
record filters instead of silently ignoring them. iNaturalist observations use
their existing privacy service with true offset/limit pagination; its generic
calendar/municipality filters are rejected rather than falsely claimed.

## Reliability interpretation

Read **all** report pages, sort by `priority`, then investigate `reason_codes`.
The report separates HTTP attempts, logical adapter runs, schedule-slot coverage,
processing success and expired publications. Empty/unchanged successful responses
are allowed. It does not infer failure from the age of an annual reference value.

Logical runs are currently instrumented for `registry-sync-worker`, when
`COLLECTION_RUN_EVIDENCE=true`. Its HTTP retries belong to a single adapter run.
Other collectors retain their existing attempt evidence: the report identifies
them as lacking logical-run instrumentation instead of inventing a success rate.
Sources without known cadence are `unknown`; known stopped sources can be `overdue`.
The observed-source registry discovers future attempt-only sources without scanning
the entire old acquisition history. Historical attempt-only sources with no current
registration, definitions, publications or new attempts remain a documented gap.

Policy versions start when the additive migration is installed. No historical
schedules, maintenance windows or successful runs are backfilled. Nominal cadence
bins are anchored to policy/coverage start and are descriptive only: the scheduler
uses jitter and does not record exact due times. `schedule_coverage_ratio` is null;
`nominal_slot_coverage_ratio` must not be interpreted as an execution SLA. Health
uses actual historical gaps exceeding cadence plus tolerance instead of counting
empty bins, and only overdue unfinished jobs count as processing incidents.
The final tolerance window is not overdue. Success ratios apply only to observed
logical runs. A report
can be healthy for its observed period while `full_window_instrumented=false`.
Individual dataset publication expiry remains a separate warning.

Policy precedence: disabled → latest failed → overdue → expired publications →
partial/failed runs → historical activity gaps → overdue unfinished runs → insufficient evidence → healthy.
Unfinished runs survive a worker crash and, once overdue, degrade health until the requested
window no longer contains them. The report supplies deterministic codes and no
LLM-generated numeric reliability score. Automatic bespoke seasonal/maintenance
rules and daily rollups are not implemented; changing cadence/enablement creates
a new policy segment. Keep evidence for at least 90 days; there is currently no
automatic deletion of these additive tables. Review storage growth before adding
high-frequency collectors to logical-run instrumentation.

## Local checks

Use a disposable PostgreSQL database, never a production DSN:

```sh
pip install -r www/vps/api/requirements.txt -r www/vps/mcp-server/requirements.txt pytest pyyaml ruff
PYTHONPATH=www/vps/api/v1 COLLECTOR_TEST_DATABASE_URL=postgresql://localhost/test python -m unittest discover -s www/vps/api/v1/tests -p test_mcp.py -v
PYTHONPATH=www/vps/mcp-server python -m pytest -q www/vps/mcp-server/tests
```

The HTTP tests cover anonymous tool discovery/calls, 2025-11-25 client
compatibility, origin/host checks, input/body limits, rate limits and sanitised
backend failures. Use the pinned SDK client and the smoke script below against
the deployed service as an additional real-network check.

## Ordered deployment

Use the **existing** Compose project/directory and preserve all active overrides.
Do not replace deployment-specific configuration with the repository defaults.
Save rollback image IDs and configuration before changing services. Verify CI
and intended GHCR publications for the exact commit first.

1. Copy the overlay and new Nginx rules to the active deployment directory.
2. Run `python provision.py /root/secrets` on the VPS. No values are printed.
   The directory is host-private; only designated secret files are mounted.
3. Validate the merged Compose configuration without printing resolved secrets.
4. Apply `api/v1/migrations/20261101_mcp.sql` explicitly with a short lock timeout
   before enabling the overlay. It adds evidence tables and policy triggers;
   it does not switch measurement readers. Keep the existing API serving during
   this step and retry later if a foreign transaction prevents the migration.
   The optional `20261101_mcp_source_index.sql` must run outside a transaction;
   defer it during long archive exports, which can delay concurrent index builds.
5. Enable the overlay and update the API. `API_SCHEMA_MODE=validate` verifies the
   existing schema without repeating startup DDL. This avoids an otherwise
   unnecessary `ALTER TABLE ... IF NOT EXISTS` waiting behind a long export
   and blocking unrelated writers. Missing schema capabilities fail startup.
6. Verify API health and the internal router with the mounted service key.
7. Update registry sync with `COLLECTION_RUN_EVIDENCE=true` only after migration.
8. Start `mcp-server` and check `/ready` from inside its container.
9. Run `nginx -t`, recreate Nginx if its networks changed, then reload rules.
10. Check the external tools, blocked internal prefix on both hostnames and actual
   lack of DB reachability from MCP. Record running image IDs and commit labels.

The opt-in overlay is `../docker-compose.mcp.yml`. Include it **after** the active
base and applicable overrides on every subsequent operation involving these
services. It preserves existing services on `default` and adds isolated MCP
frontend/backend networks. A local base-only deployment needs no MCP secret files.
The MCP container is not on `default`, where the database resides. Neither
MCP nor API publishes a host port. Validate these properties on the live stack.

Docker Compose local secrets are bind-mounted files, not an encrypted secret
store. Never commit or print them or `docker compose config` with resolved secrets.
For rotation, store a new random key in a new private file, add its digest as a
second line of `mcp-service-digests`, switch/recreate MCP to use the new key,
verify requests, then remove the old digest. Keep the host directory private and
the specifically mounted files readable by container UID 10001. Existing secret
files are never overwritten by provisioning. Do not use ingestion/admin keys.

Runtime limits: 60 MCP requests/minute/IP (IPv6 /64), 2 concurrent per IP,
8 globally, bounded limiter map, 256-KiB requests, 512-KiB backend results,
15-second tool deadline and 5-second SQL timeout. Nginx adds burst and connection
limits. State is per process; deploy one worker/replica until a shared limiter
exists. Only private-network proxies are trusted by Uvicorn, and Nginx replaces
incoming forwarded-IP headers. Only Nginx shares the MCP frontend network.

Rollback: close `/mcp` at Nginx, stop MCP, restore saved API/worker images and
the saved proxy configuration. Keep additive tables; do not drop production data
or recreate database volumes. GHCR publication alone does not deploy services:
Watchtower is monitor-only in the repository configuration.

## Weekly AI review

Call `get_reliability_report(days=7)` and follow all pages. Inspect health/history
for failing, overdue, degraded or insufficiently observed sources. Review the
source's expected cadence and dataset freshness before diagnosing an incident.
Repository changes and deployments use the caller's separately authorised tools.
After a repair, verify a new completed run/publication. This service schedules
no job and exposes no restart, SQL, shell, filesystem or write tool.
