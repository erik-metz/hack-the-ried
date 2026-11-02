# Raw response retirement (2026-11-02)

## Contract

Successful HTTP responses are parsed from the current response bytes or a bounded,
short-lived temporary file. The database keeps extracted domain records plus
`collected_payloads` as a **checksum catalogue**: SHA-256, content type, original
receipt time and byte count. New collectors never write its legacy `body` column.
The column remains nullable for staged upgrades and explicit historical repair
fixtures; the final production constraint requires it to be NULL.

Original values, timestamps, measurement revisions and public monthly Parquet
archives are preserved. This change does not prune any domain history.

Served map tiles and generated Sentinel/ECOSTRESS crops are real file products,
stored separately in `collected_file_assets`. Existing API URLs keep working.
ZAKB checkpoints keep parsed dates/fractions or the needed address inventory,
not HTML or ICS replies. GBIF extracts the iNaturalist identifiers needed for
cross-source comparisons during processing. Historical links are backfilled
only where the original current-snapshot responses can prove them.

Optional HTTP/processing failure samples are limited to 64 KiB each, 64 MiB in
total, and 24 hours. Samples from the generic authenticated acquisition path are
redacted before truncation. The hourly registry maintenance removes expired
samples; insertion also purges expired samples and enforces the global budget.
Some collectors intentionally retain only failure metadata, without a body.

Discarded original replies cannot be replayed later. Historical receipt-based
repair tools require an explicitly preserved old response or a new provider
fetch; a checksum is not a substitute for the discarded content.

## Implementation and rollout order

1. First prune unused Docker images and build cache as requested. On Nov 2,
   about 9 GB was reclaimed; disk usage fell from 97% to 88% (about 13 GiB free).
2. Add the additive `20261102_payload_retention.sql` migration, checksum-only
   producers, in-memory parsing, parsed input caches and separate file products.
3. Pass collector, API, migration and cleanup tests, lint, and exact-commit CI
   including all planned GHCR publications; commit and push only task changes.
4. Apply the additive migration before restarting changed services. For
   canonical installations using schema validation, migrations are explicit.
5. Deploy API, registry, environment, openSenseMap, UBA, TTN Mapper, aircraft
   and AIS images. Confirm new receipts contain no raw body and acquisition and
   published data still work. Pause acquisition for the destructive cleanup so
   no old process can insert another raw reply or alter a checkpoint mid-copy.
6. Run the dry-run report, then the explicit purge. The script first preserves
   served files and parsed caches, clears only raw bodies in batches, and installs
   a validated `body IS NULL` constraint. It checks the archive catalogue is
   unchanged. API bootstrap is not responsible for deleting historical content.
7. Physically reclaim the old TOAST storage with the explicit VACUUM FULL
   option during the maintenance window. It takes an exclusive lock on the
   checksum table; measure actual disk space afterwards. Resume collection and
   verify the files, archives, source status and absence of new raw bodies.

Run `purge_raw_payloads.py` from the registry worker environment (copy the exact
committed script into the container); its parsers and DB environment are needed:

```sh
python /tmp/purge_raw_payloads.py                  # report only
python /tmp/purge_raw_payloads.py --apply --vacuum # explicit deletion and reclaim
```

The command preserves checksum rows and all referencing foreign keys. It does
not drop tables, delete measurements, delete archive files or truncate volumes.
Pre-existing quarantine/repair backups are outside its scope.
