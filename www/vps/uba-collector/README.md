# UBA compatibility corrections

Apply `api/v1/migrations/20261101_uba_legacy_repairs.sql` before deploying this
collector (also included in `measurement_migration.install`). The collector
serializes compatibility writes with its existing advisory lock. Repeated polls
keep one current row; provider corrections retain original native revisions and
receipts, and save all replaced compatibility rows in `uba_legacy_repairs`.
Native provenance links new readings to the exact checked source receipt.

Historical index conflicts can be audited with:

```sh
docker compose run --rm uba-collector python repair_history.py --month 2026-10
```

The default is read only. The audit requires an original SHA256-verified UBA
receipt for every native revision and explains every conflicting legacy value.
It refuses unknown values, missing evidence, and concurrent changes. After
reviewing the audit, repeat with `--apply`: originals are saved and the
compatibility projection is repaired atomically. No native reading, revision,
timestamp or source receipt is changed. Run again without `--apply` to confirm
zero remaining conflicts before restarting the archive worker.
