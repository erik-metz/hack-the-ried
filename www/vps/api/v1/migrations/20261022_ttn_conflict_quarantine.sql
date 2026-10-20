-- Keep ambiguous legacy TTN observations visible without choosing a value.
-- The original rows remain in sensor_data; this table records the conflict key
-- and the count of each distinct value observed by the resumable backfill.
CREATE TABLE IF NOT EXISTS measurement_backfill_conflicts (
    family TEXT NOT NULL CHECK (family = 'ttn'),
    sensor_id TEXT NOT NULL,
    metric TEXT NOT NULL,
    unit TEXT NOT NULL,
    observed_at TIMESTAMPTZ NOT NULL,
    source_rows BIGINT NOT NULL CHECK (source_rows > 1),
    variants JSONB NOT NULL CHECK (jsonb_typeof(variants) = 'array'),
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (family, sensor_id, metric, unit, observed_at)
);
