# Follow-up validation and deployment observations

24 September 2026. The user reports deploying the previous refactor. New changes in this increment have not been deployed by this task.

## Public deployment observations

Read-only checks of `https://api.hack-the-ried.de` returned:

- `/health`: HTTP 200, `{"status":"healthy"}`.
- `/api/v1/collection/status`: HTTP 404.
- `/api/v1/movements/latest`: HTTP 404.
- `/api/v1/collected/statistics/demographics`: HTTP 404.
- `/api/v1/openapi.json`: HTTP 200; no new collection/publication/movement routes.

This indicates the checked origin is serving an older API or a different backend. It does not identify which deployment step failed. Verify the pulled API image and reverse-proxy destination, not just container health. The frontend URL was requested and has not yet been provided, so a browser network audit of the deployed frontend is still pending.

`python3 www/vps/scripts/check-deployment.py https://api.hack-the-ried.de` provides read-only checks. The new health response includes schema version and capabilities. This increment requires schema **20260928** for durable collection checkpoints; migrate before deploying its worker image. No SSH session or production mutation was performed.

## Acquisition improvements

- ZAKB successful address calendars and the OSM inventory are checkpointed by input identity. Fresh checkpoints preserve acquisition timestamps and avoid duplicate provider downloads on resumed runs.
- Every calendar request is paced. GET retries are bounded to transient HTTP/transport errors, preserve raw receipts and respect numeric Retry-After up to 60 seconds. Form workflows are not blindly retried in place.
- Runs default to a 15-minute budget, with individual address work bounded by the remaining budget and 120 seconds. Coverage reports include target streets, attempted/successful/failed/reused calendars and unprocessed streets. Partial coverage never means complete household coverage.
- A run with no verified calendars preserves the previous calendar/schedule publication. Failed/partial source loops retry with backoff/jitter; partial runs retry after roughly five minutes. Recently rejected addresses are deferred for 30 minutes so they cannot repeatedly consume the entire run budget.
- BKG tile acquisition skips fresh stored tiles and resumes missing/expired ones.

## Real-source validation

The complete configured BKG inventory of **460 tiles** was downloaded into a disposable local TimescaleDB in **155.71 seconds**. A second run reused the stored tiles and added no new payloads.

The first regional ZAKB address lookup failed with HTTP 504. A retry succeeded and identified **844 representative street addresses**: Biblis 173, Bürstadt 243, Groß-Rohrheim 74 and Lampertheim 354. The initial crawl saved calendar checkpoints but was interrupted to introduce bounded execution. Full successful calendar coverage has **not** been established; sampled addresses also do not prove every house on a street shares the same collection date.

## Budget collector

The current [Biblis listing](https://www.biblis.eu/rathaus/ortsrecht/haushaltsplan/) links a different [2026 PDF](https://www.biblis.eu/rathaus/ortsrecht/haushaltsplan/haushaltsplan-2026.pdf?cid=ha1) than the earlier indexed search result. Discovery now follows the current official listing.

The downloaded document has 302 pages and identifies adoption on 11 February 2026. PDF page 4 was visually inspected: ordinary revenue is €24,166,774 and expenditure €26,800,450, while the printed ordinary balance is −€2,572,977. The arithmetic difference is −€2,633,676, a discrepancy of €60,699. The collector preserves the printed source figures in a review publication and withholds normalized budget KPIs. It does not silently substitute a computed balance.

The real importer returned `partial` and created only `finance/budget-review/biblis` with `quality=needs_review`. The budget UI displays the unresolved source discrepancy and a page link. A later internally consistent adopted document can publish `finance/adopted-budget/biblis`; this is a narrow summary adapter, not complete budget-category extraction. Other municipalities still need their own reviewed adapters.

## Still outstanding

Resolve the deployed API mismatch, finish regional calendar coverage, obtain verified remaining data feeds, complete per-domain contracts and native-worker status, define retention/archive limits, and run browser/network plus 200-client full-stack staging tests. The successful earlier API-only load test is not a production capacity certification.

A subsequent 90-second live run returned `partial` in **90.05 seconds**, verified four address calendars (three reused), reported 14 rejected samples and **826 unprocessed street samples**. These are per-run figures, not regional completion counts. Regression tests also cover inventory reuse and preserving previous valid calendars when a bounded run cannot verify any address.

## Resume verification — 25 September 2026

The public deployment check still reports an old/missing schema identifier and HTTP 404 for collection status and movements. The frontend URL remains unconfirmed.

Calendar publication now includes all fresh checkpoints before the network budget is spent. New requests alternate municipalities rather than exhausting one city's streets first. Recently failed addresses are deferred for 30 minutes; failures cannot repeatedly consume the next run's whole budget. An exhausted network budget does not remove valid cached calendars.

Collector tests: **45 passed**, including database replay, retry deferral, bounded execution and preservation of fresh cached records. Frontend: **108 tests passed**, TypeScript and production build passed. Repository-wide Python lint passes after import cleanup. Source integrations and production validation listed above remain incomplete.

Final API regression: 81 passed, 4 optional tests skipped, 6 subtests passed. Environment regression: 3 passed. The disposable validation database was archived to `/tmp/ried-collector-validation-20260925.dump` before cleanup; a restore of this archive has not been rehearsed. This is a local test archive, not a production backup.

### VRN collector memory recovery (2026-09-25)

Production evidence: registry worker exited 137 with OOMKilled=true and 11 restarts on a roughly 2 GiB, no-swap VPS. Concurrency limits alone were insufficient. GTFS now streams downloads into temporary files, archives raw bytes using chunked PostgreSQL binary COPY, spools generated schedules to disk, and inserts stop times per trip. Full raw archives remain in collected_payloads; publication replacement remains atomic. Temporary files are automatically removed on normal completion/failure. The 512 MiB compressed download ceiling and existing 2 GB expanded ZIP ceiling reject oversized feeds.

Local public VRN ZIP: 160,806,966 bytes. Binary archival round-trip verified its full SHA-256 with 49,086,464 bytes peak client RSS. Disk-backed parsing emitted 8,239 trip-day schedules and 1,020 regional stops, spooling 150,924,652 bytes with 291,340,288 bytes peak process RSS. These are macOS process measurements, not a guarantee of whole-VPS memory use; PostgreSQL still needs memory for the individual BYTEA value. Production stability remains to be verified after the image update. No production database was modified by these tests.

### ZAKB address dependency replacement (2026-09-25)

AWS could reach the ZAKB form but not obtain a response from either tested public Overpass service. The new weekly Geofabrik address collector publishes a regional inventory to the DB, and enabled ZAKB collection reads it without an Overpass request. Full Hessen PBF validation produced 16,903 address nodes/ways: Lampertheim 8,123, Bürstadt 4,428, Biblis 3,070, Groß-Rohrheim 1,282. Two-pass parsing took 157 seconds with 100,515,840 bytes peak RSS locally. Raw statewide data is temporary; the regional extraction and parent checksum are persisted. Fresh inventories survive worker restarts without redownload. Tests verify expiry rejection, preservation on corrupt refresh, coordinates, and no live Overpass calls in the configured calendar path. Full collector suite: 54 passed against disposable TimescaleDB. AWS download/collection completion still requires deployment verification.
