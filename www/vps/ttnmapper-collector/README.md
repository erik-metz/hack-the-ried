# TTN gateway observations

Gateway `updatedAt` dates the registry record. The current `online` flag is an
observation of the fetched snapshot: store it under the poll's `fetched_at` in
both `readings` and the legacy compatibility tables. Keep the registry timestamp
for the gateway's coordinate references. Explicit historical imports use their
supplied snapshot observation time; do not use this path to invent historical
poll times.

The original response is retained in `collected_payloads`, with its verified
SHA-256. The active `collection_attempts` record and each online-status reading
reference that response. Storing the response and its measurements is atomic.
Coordinates keep stable provenance so each new poll does not create a revision
of an unchanged registry reference.

The collector advisory lock serializes legacy status writes. Since
`sensor_data` has no unique key, use an explicit existence check for retries;
`ON CONFLICT DO NOTHING` alone cannot prevent duplicates. A different online
value for the same poll raises an error and rolls back the whole write.

## Historical correction boundary

Versions before this fix used registry timestamps for online observations,
appended duplicate legacy rows, and did not retain the response body even though
the fetcher passed it to storage. Do not repair these rows by choosing an
arbitrary status or shifting timestamps. Existing canonical revision records may
prove individual observations, but they do not reconstruct every historical poll.
Keep the original records until a documented, evidence-backed repair is available.

Weather legacy conflicts are a separate issue: a provider can revise a model
value for the same forecast timestamp. The existing `weather_history_explained`
function checks whether all variants have verified source receipts and revision
history. Those checks must succeed before treating a legacy weather conflict as
a known provider correction. This collector fix does not delete historical data.

## Deploy and verify

After CI and the GHCR publication for the exact commit succeed, pull and recreate
only this service from the VPS Compose directory:

```sh
docker compose pull ttnmapper-collector
docker compose up -d --no-deps ttnmapper-collector
docker compose logs --tail=30 ttnmapper-collector
```

Watchtower in production only monitors images. Check the next successful poll
for a non-null `payload_sha256`, an actual stored body with the matching hash,
and online readings with `observed_at = collected_at = fetched_at`. Registry
coordinate timestamps should remain unchanged.
