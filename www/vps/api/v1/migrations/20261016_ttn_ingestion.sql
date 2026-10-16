CREATE TABLE IF NOT EXISTS ttn_uplink_events (
    application_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    received_at TIMESTAMPTZ NOT NULL,
    f_port INTEGER,
    f_cnt BIGINT,
    payload_sha256 TEXT NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
    correlation_ids JSONB NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(correlation_ids) = 'array'),
    accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (application_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_ttn_uplink_events_device_time
    ON ttn_uplink_events (application_id, device_id, received_at DESC);
