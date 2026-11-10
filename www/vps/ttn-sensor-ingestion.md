# TTN sensor uplink ingestion

The API receives The Things Stack application uplinks at:

```text
POST https://<API-host>/api/v1/integrations/sensor/uplink
```

Configure `TTN_APPLICATION_ID`, `TTN_WEBHOOK_USERNAME`, and `TTN_WEBHOOK_PASSWORD` on the VPS. The application ID is an allowlist; the endpoint returns `503` while the application or credentials are not configured. Use unique, randomly generated webhook credentials and keep them out of source control and logs.

In the TTN Console, create a custom webhook using JSON, set the URL above, configure Request authentication with the webhook username and password, and enable only **Uplink message**. TTN can filter event fields, but the endpoint expects device/application identifiers, the uplink, and a received timestamp. Keep `received_at`, `end_device_ids`, `uplink_message.f_port`, `uplink_message.f_cnt`, `uplink_message.frm_payload`, `uplink_message.correlation_ids`, and `uplink_message.decoded_payload`.

## Payload formatter contract

The FPort-10 application formatter supports RAK payload formats 3, 4, 5 and 6.
For formats 3/4 it returns `decoded_payload.measurements`. Format 5 and 6 also return
`firmware_version`, `window_seconds` and a `window_statistics` array. Format 6 adds
an optional `sound_events` array for on-device aggregated audio classifications:

```json
{
  "measurements": [
    {"metric": "temperature", "value": 18.5, "unit": "°C"},
    {"metric": "humidity", "value": 62, "unit": "%"}
  ],
  "sound_events": [
    {"class": "siren", "class_id": 42, "count": 2, "max_score": 0.88}
  ]
}
```

Sound events are written as canonical interval statistics in `readings` under the metric
`sound_event_count` with unit `count`, dimensions `{"class": "<class>", "taxonomy": "esc50_v1"}`
and peak score in provenance. When no sound events are detected during a window (silence),
the sound events section in the payload is omitted (0 bytes overhead).

At most 41 measurements and 41 window statistics are accepted per uplink.
Names use lowercase letters, digits and underscores, starting with a lowercase
letter. Device IDs must be lowercase TTN slugs and are mapped to
`ttn-<device_id>`. Units and metric semantics must remain stable; use a new
metric name or an explicit migration if meaning or unit changes. For format 5,
each statistic has `min_value`, `mean_value`, `max_value` and `sample_count`;
the mean must match that metric's entry in `measurements`.

New sensor metadata is inserted as hidden. An administrator should verify the device, add its public name and coordinates, then make it visible through the existing sensor administration flow. Existing sensor metadata is preserved.

## Storage and delivery behavior

The endpoint stores an event receipt and measurements in one database
transaction, then returns `200`. TTN correlation IDs deduplicate redeliveries;
the accepted payload hash prevents an event identity from being reused for
different content. The receipt retains application/device IDs, timestamp,
frame port/counter, correlation IDs and payload hash. The authoritative
measurement model is `entities`, `measurement_definitions` and `readings`;
interval statistics carry their statistic dimension, period bounds, sample
count and TTN provenance. For compatibility, decoded means are also mirrored
to `sensor_data`. New windows are not written to the legacy
`sensor_measurement_windows` / `sensor_window_metrics` tables; window reads
prefer canonical `readings` and use those legacy tables only as a fallback for
older stored windows.

The endpoint does not persist decoded arbitrary JSON or gateway/session secrets. If a device decoder fails or supplies no valid measurements, the request is rejected with `422`. Verify delivery in TTN Live Data and inspect `as.webhook.fail` events if TTN reports an unsuccessful request. TTN retries require the relevant Cloud Plus feature; without retries a failed webhook attempt may be lost.

Before production, configure webhook credentials and application ID on the VPS,
create a test device, send a sample uplink, confirm the receipt and canonical
readings, verify the compatibility mean if a legacy chart consumes it, and
confirm the sensor stays hidden until reviewed.

## GPS tracker uplinks (FPort 44)

The Heltec range-test tracker uses a separate device-level payload formatter and
webhook. Do not route it through the sensor measurement endpoint above; its
decoded payload is a position list, not measurements.

```text
POST https://<API-host>/api/v1/integrations/gps/uplink
```

Create a second custom webhook in the TTN application with the same Basic Auth
credentials (`TTN_WEBHOOK_USERNAME` / `TTN_WEBHOOK_PASSWORD`) and enable only
**Uplink message**. The endpoint also checks `TTN_APPLICATION_ID` when it is
configured.

The FPort-44 formatter emits five minute slots per uplink. Slot 4 is the
current position, slots 0-3 are one to four minutes older:

```json
{
  "version": 2,
  "positions": [
    {"slot": 0, "offset_seconds": -240, "has_fix": true,
     "latitude": 49.68, "longitude": 8.45, "altitude": 95, "satellites": 7}
  ],
  "gps_fix": true
}
```

Storage and security:

- Coordinates are encrypted with AES-256-GCM before they reach PostgreSQL.
  The key is never stored in the database. `GPS_ENCRYPTION_KEY` must be set to
  64 hex characters (32 bytes) or exactly 32 raw characters; the API refuses to
  ingest GPS data when the key is missing or malformed.
- Redeliveries are deduplicated by `(uplink_event_id, slot_index)`.
- `received_by_own_gateway` is true when any `rx_metadata` entry matches
  `OWN_GATEWAY_ID` or `OWN_GATEWAY_EUI`. The best gateway RSSI/SNR and the
  number of gateways that heard the uplink are stored for every slot.
- The admin view decrypts points on demand through
  `GET /api/v1/admin/gps-tracker/points`; this route requires
  `ADMIN_API_KEY` and is proxied by the authenticated Next.js admin panel.

Apply the migration before the first uplink. With `API_SCHEMA_MODE=bootstrap`
the API runs `api/v1/migrations/20261109_gps_tracker.sql` during startup; with
`API_SCHEMA_MODE=validate` run `python migrate.py` from the API container first.

