-- Private operational telemetry; numeric authority remains in the core.
CREATE TABLE IF NOT EXISTS gateway_devices (
 id TEXT PRIMARY KEY CHECK (id ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
 entity_id TEXT UNIQUE NOT NULL REFERENCES entities(id),
 name TEXT NOT NULL, token_hash TEXT NOT NULL,
 latest_at TIMESTAMPTZ, last_contact TIMESTAMPTZ,
 latest_boot UUID, latest_sequence BIGINT,
 sensor_config JSONB NOT NULL DEFAULT '{"sht41":false}'
);
CREATE TABLE IF NOT EXISTS gateway_receipts (
 gateway_id TEXT NOT NULL REFERENCES gateway_devices(id), sample_id UUID NOT NULL,
 digest TEXT NOT NULL, observed_at TIMESTAMPTZ NOT NULL,
 PRIMARY KEY(gateway_id,sample_id)
);
CREATE INDEX IF NOT EXISTS gateway_receipts_expiry ON gateway_receipts(observed_at);
CREATE TABLE IF NOT EXISTS gateway_events (
 gateway_id TEXT NOT NULL REFERENCES gateway_devices(id), event_id UUID NOT NULL,
 observed_at TIMESTAMPTZ NOT NULL, kind TEXT NOT NULL, details JSONB NOT NULL,
 PRIMARY KEY(gateway_id,event_id)
);
CREATE INDEX IF NOT EXISTS gateway_events_time ON gateway_events(gateway_id,observed_at);
CREATE TABLE IF NOT EXISTS gateway_rollup_hours (
 gateway_id TEXT NOT NULL REFERENCES gateway_devices(id), hour TIMESTAMPTZ NOT NULL,
 dirty BOOLEAN NOT NULL DEFAULT TRUE, completed_at TIMESTAMPTZ,
 PRIMARY KEY(gateway_id,hour)
);
CREATE UNIQUE INDEX IF NOT EXISTS gateway_receipt_minute ON gateway_receipts(gateway_id,observed_at);
