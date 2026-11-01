-- Operational backups; the public archive still contains only three tables.
CREATE TABLE IF NOT EXISTS opensensemap_legacy_repairs (
    id BIGSERIAL PRIMARY KEY,
    repaired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    sensor_id TEXT NOT NULL,
    metric TEXT NOT NULL,
    unit TEXT NOT NULL,
    observed_at TIMESTAMPTZ NOT NULL,
    original_rows JSONB NOT NULL,
    original_native_records JSONB NOT NULL DEFAULT '[]',
    original_native_revisions JSONB NOT NULL DEFAULT '[]',
    collection_attempt_id BIGINT NOT NULL REFERENCES collection_attempts(id)
);
