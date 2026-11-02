-- Additive traffic event semantics; start_time remains first observation.
ALTER TABLE traffic_incidents ADD COLUMN IF NOT EXISTS provider_id TEXT;
ALTER TABLE traffic_incidents ADD COLUMN IF NOT EXISTS provider_start_at TIMESTAMPTZ;
ALTER TABLE traffic_incidents ADD COLUMN IF NOT EXISTS provider_end_at TIMESTAMPTZ;
ALTER TABLE traffic_incidents ADD COLUMN IF NOT EXISTS overall_end_date DATE;
ALTER TABLE traffic_incidents ADD COLUMN IF NOT EXISTS provider_future BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE traffic_incidents ADD COLUMN IF NOT EXISTS closure_kind TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE traffic_incidents ADD COLUMN IF NOT EXISTS work_length_meters INTEGER;
ALTER TABLE traffic_incidents ADD COLUMN IF NOT EXISTS display_type TEXT;
ALTER TABLE traffic_incidents ADD COLUMN IF NOT EXISTS title TEXT;
DO $$ BEGIN
 IF (SELECT relkind FROM pg_class WHERE oid=to_regclass('traffic_corridor_snapshots'))='r' THEN
   ALTER TABLE traffic_corridor_snapshots ADD COLUMN IF NOT EXISTS delay_kind TEXT NOT NULL DEFAULT 'unknown';
 END IF;
END $$;
CREATE TABLE IF NOT EXISTS traffic_source_checks (
    road_name TEXT NOT NULL,
    source TEXT NOT NULL,
    last_success_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (road_name, source)
);
CREATE OR REPLACE VIEW traffic_events AS
SELECT t.*,
    CASE WHEN NOT is_active THEN 'resolved'
         WHEN provider_end_at <= NOW() THEN 'ended'
         WHEN provider_start_at > NOW()
              OR (provider_future AND provider_start_at IS NULL) THEN 'planned'
         ELSE 'active' END AS event_status,
    last_seen_at < NOW() - CASE WHEN source='hessen_verkehrsservice'
        THEN INTERVAL '20 minutes' ELSE INTERVAL '10 minutes' END AS is_stale
FROM traffic_incidents t;
INSERT INTO collector_schema_versions(version) VALUES (20261009) ON CONFLICT DO NOTHING;
