-- GPS Tracker Points with Application-Level Encryption (AES-256-GCM)
CREATE TABLE IF NOT EXISTS gps_tracker_points (
    id BIGSERIAL PRIMARY KEY,
    device_id VARCHAR(64) NOT NULL,
    uplink_event_id VARCHAR(128) NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL,
    received_at TIMESTAMPTZ NOT NULL,
    slot_index SMALLINT NOT NULL CHECK (slot_index BETWEEN 0 AND 4),
    has_fix BOOLEAN NOT NULL DEFAULT TRUE,
    received_by_own_gateway BOOLEAN NOT NULL DEFAULT FALSE,
    own_gateway_rssi INTEGER,
    own_gateway_snr DOUBLE PRECISION,
    best_gateway_id VARCHAR(128),
    best_gateway_rssi INTEGER,
    best_gateway_snr DOUBLE PRECISION,
    gateway_count INTEGER NOT NULL DEFAULT 0,
    encrypted_payload BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gps_tracker_points_device_rec
    ON gps_tracker_points (device_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_gps_tracker_points_own_gw
    ON gps_tracker_points (received_by_own_gateway, recorded_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gps_tracker_points_event_slot
    ON gps_tracker_points (uplink_event_id, slot_index);
