-- A checksum catalogue is retained for provenance and foreign keys, not raw replies.
-- body remains nullable solely for the staged upgrade and explicit historical repairs.
-- Live collectors write size_bytes and never body. The operational cleanup clears it.
ALTER TABLE collected_payloads ALTER COLUMN body DROP NOT NULL;
ALTER TABLE collected_payloads ADD COLUMN IF NOT EXISTS size_bytes BIGINT CHECK (size_bytes >= 0);
ALTER TABLE collection_checkpoints ADD COLUMN IF NOT EXISTS parsed_data JSONB;

-- These bytes are actual served products (map tiles and generated raster crops).
CREATE TABLE IF NOT EXISTS collected_file_assets (
    sha256 TEXT PRIMARY KEY REFERENCES collected_payloads(sha256),
    body BYTEA NOT NULL,
    content_type TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE OR REPLACE FUNCTION store_collected_file(digest TEXT, content BYTEA, mime TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    IF content IS NULL OR mime NOT IN ('application/x-npz','image/png','image/jpeg','image/webp') THEN
        RAISE EXCEPTION 'Unsupported file product';
    END IF;
    INSERT INTO collected_payloads(sha256,size_bytes,content_type)
        VALUES(digest,octet_length(content),mime) ON CONFLICT DO NOTHING;
    INSERT INTO collected_file_assets(sha256,body,content_type)
        VALUES(digest,content,mime) ON CONFLICT DO NOTHING;
END;
$$;

-- Optional, short error samples: 64 KiB per failed attempt, 64 MiB globally, 24 h.
CREATE TABLE IF NOT EXISTS collection_failure_samples (
    attempt_id BIGINT PRIMARY KEY REFERENCES collection_attempts(id),
    body BYTEA NOT NULL CHECK (octet_length(body) <= 65536),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW()+INTERVAL '24 hours'
);
CREATE INDEX IF NOT EXISTS collection_failure_samples_expiry ON collection_failure_samples(expires_at);
CREATE OR REPLACE FUNCTION retain_collection_failure(attempt BIGINT, content BYTEA)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE used BIGINT;
BEGIN
    PERFORM pg_advisory_xact_lock(72819402);
    DELETE FROM collection_failure_samples WHERE expires_at <= NOW();
    -- Never retain successful responses or headers/credentials.
    IF content IS NULL OR NOT EXISTS (
        SELECT 1 FROM collection_attempts WHERE id=attempt AND status='failed'
    ) THEN RETURN; END IF;
    INSERT INTO collection_failure_samples(attempt_id,body)
        VALUES(attempt,substring(content FROM 1 FOR 65536)) ON CONFLICT DO NOTHING;
    SELECT COALESCE(sum(octet_length(body)),0) INTO used FROM collection_failure_samples;
    WHILE used > 67108864 LOOP
        DELETE FROM collection_failure_samples WHERE attempt_id=(
            SELECT attempt_id FROM collection_failure_samples ORDER BY expires_at,attempt_id LIMIT 1);
        SELECT COALESCE(sum(octet_length(body)),0) INTO used FROM collection_failure_samples;
    END LOOP;
END;
$$;
INSERT INTO collector_schema_versions(version) VALUES(20261102) ON CONFLICT DO NOTHING;
