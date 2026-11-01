-- Additive evidence only. No history backfill or measurement read cutover.
CREATE TABLE IF NOT EXISTS collection_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    finished_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'running'
        CHECK (status IN ('running','success','partial','failed')),
    CHECK (finished_at IS NULL OR finished_at >= started_at)
);
CREATE INDEX IF NOT EXISTS collection_runs_source_time ON collection_runs(source_id,started_at DESC);

-- Do not DISTINCT-scan the entire acquisition history for each public report.
CREATE TABLE IF NOT EXISTS collection_observed_sources (source_id TEXT PRIMARY KEY);
CREATE OR REPLACE FUNCTION record_observed_collection_source() RETURNS trigger AS $$
BEGIN
    INSERT INTO collection_observed_sources(source_id) VALUES (NEW.source_id) ON CONFLICT DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS collection_observed_source ON collection_attempts;
CREATE TRIGGER collection_observed_source AFTER INSERT ON collection_attempts
    FOR EACH ROW EXECUTE FUNCTION record_observed_collection_source();

CREATE TABLE IF NOT EXISTS collection_run_coverage (
    source_id TEXT PRIMARY KEY,
    since TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS collection_source_policies (
    revision BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source_id TEXT NOT NULL,
    effective_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    enabled BOOLEAN NOT NULL,
    interval_seconds INTEGER NOT NULL CHECK (interval_seconds > 0),
    tolerance_seconds INTEGER NOT NULL CHECK (tolerance_seconds >= 0)
);
CREATE INDEX IF NOT EXISTS collection_source_policies_time
    ON collection_source_policies(source_id,effective_at DESC);

CREATE OR REPLACE FUNCTION record_collection_source_policy() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF (NEW.enabled,NEW.interval_seconds) IS NOT DISTINCT FROM (OLD.enabled,OLD.interval_seconds) THEN
            RETURN NEW;
        END IF;
    END IF;
    INSERT INTO collection_source_policies(source_id,enabled,interval_seconds,tolerance_seconds)
    VALUES (NEW.id,NEW.enabled,GREATEST(NEW.interval_seconds,1),GREATEST(NEW.interval_seconds,60));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS collection_source_policy_changed ON collection_sources;
CREATE TRIGGER collection_source_policy_changed AFTER INSERT OR UPDATE ON collection_sources
    FOR EACH ROW EXECUTE FUNCTION record_collection_source_policy();
INSERT INTO collection_source_policies(source_id,enabled,interval_seconds,tolerance_seconds)
SELECT s.id,s.enabled,GREATEST(s.interval_seconds,1),GREATEST(s.interval_seconds,60)
FROM collection_sources s WHERE NOT EXISTS (
    SELECT 1 FROM collection_source_policies p WHERE p.source_id=s.id);
