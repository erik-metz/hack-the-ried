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
