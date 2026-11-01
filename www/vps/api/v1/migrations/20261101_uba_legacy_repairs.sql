-- Operational evidence for corrections to the compatibility projection.
-- Original readings/revisions and provider receipts remain in their own tables.
CREATE TABLE IF NOT EXISTS uba_legacy_repairs (
    id BIGSERIAL PRIMARY KEY,
    repaired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    sensor_id TEXT NOT NULL,
    metric TEXT NOT NULL,
    unit TEXT NOT NULL,
    observed_at TIMESTAMPTZ NOT NULL,
    original_rows JSONB NOT NULL,
    chosen_value NUMERIC NOT NULL,
    collection_attempt_id BIGINT NOT NULL REFERENCES collection_attempts(id)
);
