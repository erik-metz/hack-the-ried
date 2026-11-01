# Physical sensor identities

One senseBox can contain several physical sensors measuring the same metric at
the same instant (e.g. BME280 and DHT22). Their original openSenseMap sensor IDs
belong in the existing `measurement_definitions.dimensions.sensor_id` field.
The collector writes every channel separately and links each reading to its
checked source receipt. Existing value/unit normalization is unchanged.

The box-level legacy UI projection still uses the last reported channel, as
before. It now stores one row per key and audits replaced rows; it is not the
complete multi-channel dataset. The archive reads all canonical channels and
suppresses only exact copies in the compatibility projection.

Apply `api/v1/migrations/20261101_opensensemap_sensor_identity.sql` before
deploying this collector. It is also included in `measurement_migration.install`.

## Historical collisions

Stop the old collector before applying a repair; do not run the new collector
until repair is complete. Use the new image for a separate audit process:

```sh
docker compose run --rm opensensemap-collector python repair_history.py --month 2026-10
```

The default is read only. Every old native revision must match a unique original
SHA256-verified receipt, every legacy value must be explained, and at least two
physical sensor IDs must be present. Missing/unknown data stops the entire repair.
After reviewing the audit, repeat with `--apply`. Before replacing a collapsed
key, one transaction saves all original legacy rows, native readings and native
revisions in `opensensemap_legacy_repairs`. It reconstructs the channels from the
receipts with their original observation/collection times and retains provider
corrections through the normal native revision mechanism. Concurrent changes or
already-reconstructed native history stop the repair. Source receipts are not
modified. The audit tables are operational backups, never additional archive
tables. Afterwards deploy the new collector and restart the archive worker.
