# TTN sensor uplink ingestion

The API receives The Things Stack application uplinks at:

```text
POST https://<API-host>/api/v1/integrations/sensor/uplink
```

Configure `TTN_APPLICATION_ID`, `TTN_WEBHOOK_USERNAME`, and `TTN_WEBHOOK_PASSWORD` on the VPS. The application ID is an allowlist; the endpoint returns `503` while the application or credentials are not configured. Use unique, randomly generated webhook credentials and keep them out of source control and logs.

In the TTN Console, create a custom webhook using JSON, set the URL above, configure Request authentication with the webhook username and password, and enable only **Uplink message**. TTN can filter event fields, but the endpoint expects device/application identifiers, the uplink, and a received timestamp. Keep `received_at`, `end_device_ids`, `uplink_message.f_port`, `uplink_message.f_cnt`, `uplink_message.frm_payload`, `uplink_message.correlation_ids`, and `uplink_message.decoded_payload`.

## Payload formatter contract

The device or application uplink formatter must return a `decoded_payload.measurements` array. Each item has a stable metric name, finite numeric value, and explicit unit:

```json
{
  "measurements": [
    {"metric": "temperature", "value": 18.5, "unit": "°C"},
    {"metric": "humidity", "value": 62, "unit": "%"}
  ]
}
```

At most 32 measurements are accepted per uplink. Metric names use lowercase letters, digits and underscores, starting with a lowercase letter. Device IDs must be lowercase TTN slugs and are mapped to `ttn-<device_id>`. Units and metric semantics must remain stable for a sensor; change the metric or perform an explicit migration if its meaning or unit changes.

New sensor metadata is inserted as hidden. An administrator should verify the device, add its public name and coordinates, then make it visible through the existing sensor administration flow. Existing sensor metadata is preserved.

## Storage and delivery behavior

The endpoint stores an event receipt and all measurements in one database transaction, then returns `200`. TTN correlation IDs deduplicate redeliveries; the accepted payload hash prevents a correlation ID from being reused for different content. The receipt retains the application/device IDs, timestamp, frame port/counter, correlation IDs, and payload hash. Measurement rows use the established telemetry tables and existing shadow-write behavior, preserving compatibility with current public telemetry reads.

The endpoint does not persist decoded arbitrary JSON or gateway/session secrets. If a device decoder fails or supplies no valid measurements, the request is rejected with `422`. Verify delivery in TTN Live Data and inspect `as.webhook.fail` events if TTN reports an unsuccessful request. TTN retries require the relevant Cloud Plus feature; without retries a failed webhook attempt may be lost.

Before production, configure the webhook credentials and application ID on the VPS, create a test device, send a sample uplink, confirm exactly one row per measurement in the database, and verify the sensor remains hidden until reviewed.
