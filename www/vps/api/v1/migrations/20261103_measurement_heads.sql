-- Latest-value acceleration keeps keys only; numeric values live in readings.
DO $$
DECLARE relation_kind "char"; view_row RECORD;
BEGIN
 IF NOT core_storage_enabled() THEN RAISE EXCEPTION 'Complete the core storage cutover first'; END IF;
 SELECT relkind INTO relation_kind FROM pg_class WHERE oid='latest_readings'::regclass;
 IF relation_kind='r' THEN
   LOCK TABLE readings IN SHARE ROW EXCLUSIVE MODE;
   CREATE TABLE measurement_heads(
     measurement_id BIGINT PRIMARY KEY REFERENCES measurement_definitions(id) ON DELETE CASCADE,
     observed_at TIMESTAMPTZ NOT NULL
   );
   INSERT INTO measurement_heads SELECT measurement_id,observed_at FROM latest_readings;
   CREATE TEMP TABLE rebound_latest_views ON COMMIT DROP AS
     SELECT DISTINCT n.nspname,c.relname,pg_get_viewdef(c.oid,true) AS definition
     FROM pg_depend d JOIN pg_rewrite w ON d.classid='pg_rewrite'::regclass AND w.oid=d.objid
     JOIN pg_class c ON c.oid=w.ev_class JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE d.refobjid='latest_readings'::regclass AND c.relkind='v';
   ALTER TABLE latest_readings RENAME TO retired_latest_readings_cache;
   CREATE VIEW latest_readings AS SELECT h.measurement_id,h.observed_at,
     r.value,r.quality,r.collected_at,r.provenance
     FROM measurement_heads h JOIN readings r ON r.measurement_id=h.measurement_id AND r.observed_at=h.observed_at;
   FOR view_row IN SELECT * FROM rebound_latest_views LOOP
     EXECUTE format('CREATE OR REPLACE VIEW %I.%I AS %s',view_row.nspname,view_row.relname,view_row.definition);
   END LOOP;
   DROP TABLE retired_latest_readings_cache;
 END IF;
END $$;

CREATE OR REPLACE FUNCTION maintain_core_latest() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE previous_time TIMESTAMPTZ;
BEGIN
 IF TG_OP='DELETE' THEN
   DELETE FROM measurement_heads WHERE measurement_id=OLD.measurement_id AND observed_at=OLD.observed_at;
   IF FOUND THEN
     SELECT max(observed_at) INTO previous_time FROM readings WHERE measurement_id=OLD.measurement_id;
     IF previous_time IS NOT NULL THEN
       INSERT INTO measurement_heads VALUES(OLD.measurement_id,previous_time)
       ON CONFLICT(measurement_id) DO UPDATE SET observed_at=EXCLUDED.observed_at;
     END IF;
   END IF;
 ELSE
   INSERT INTO measurement_heads VALUES(NEW.measurement_id,NEW.observed_at)
   ON CONFLICT(measurement_id) DO UPDATE SET observed_at=EXCLUDED.observed_at
   WHERE EXCLUDED.observed_at>measurement_heads.observed_at;
 END IF;
 RETURN NULL;
END $$;

-- Withdrawal paths delete accepted rows in readings. This projection stays
-- read-only, so deleting a cache can never hide a still-present measurement.

-- The legacy UI cache is small and expires by refresh time, not observation age.
ALTER TABLE sensor_latest ADD COLUMN IF NOT EXISTS cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE OR REPLACE FUNCTION refresh_sensor_cache_time() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.cached_at:=NOW(); RETURN NEW; END $$;
CREATE OR REPLACE TRIGGER refresh_sensor_cache_time BEFORE INSERT OR UPDATE ON sensor_latest
 FOR EACH ROW EXECUTE FUNCTION refresh_sensor_cache_time();

INSERT INTO measurement_migration_state(name,state) VALUES('measurement_heads','{"keys_only":true}')
ON CONFLICT(name) DO UPDATE SET state=EXCLUDED.state,updated_at=NOW();
