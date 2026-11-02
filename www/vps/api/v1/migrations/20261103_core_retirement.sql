-- Destructive step: the operator must verify/backfill coverage first while
-- writers are paused. The operational command sets this transaction-local gate.
DO $$ BEGIN
 IF current_setting('ried.core_retirement_verified',true) IS DISTINCT FROM 'yes' THEN
   RAISE EXCEPTION 'Run the verified storage consolidation command first';
 END IF;
END $$;

DROP TABLE sensor_data;
CREATE VIEW sensor_data AS
 SELECT DISTINCT ON(a.sensor_id,a.metric,a.unit,r.observed_at)
   r.observed_at AS timestamp,a.sensor_id,r.value::double precision AS value,a.unit,a.metric
 FROM core_sensor_aliases a JOIN readings r USING(measurement_id)
 WHERE r.quality='valid'
 ORDER BY a.sensor_id,a.metric,a.unit,r.observed_at,(a.basis<>'unknown') DESC,r.collected_at DESC,a.measurement_id DESC;
CREATE TRIGGER canonical_sensor_write INSTEAD OF INSERT OR UPDATE OR DELETE ON sensor_data
 FOR EACH ROW EXECUTE FUNCTION core_sensor_compat_write();
CREATE OR REPLACE VIEW core_sensor_data AS SELECT * FROM sensor_data;

-- No retained prior values or complete publication versions. Empty views keep
-- old read-only repair tools from crashing; there is no physical history store.
DROP TABLE reading_revisions;
CREATE VIEW reading_revisions AS SELECT NULL::bigint AS measurement_id,
 NULL::timestamptz AS observed_at,NULL::integer AS revision,NULL::jsonb AS previous_record,
 NULL::timestamptz AS replaced_at WHERE false;
DROP TABLE collected_dataset_versions;
CREATE VIEW collected_dataset_versions AS SELECT NULL::text AS dataset,NULL::text AS payload_sha256,
 NULL::timestamptz AS source_updated_at,NULL::jsonb AS data WHERE false;
CREATE OR REPLACE FUNCTION discard_retired_history() RETURNS TRIGGER LANGUAGE plpgsql AS $$
 BEGIN RETURN NULL; END $$;
CREATE TRIGGER discard_retired_versions INSTEAD OF INSERT OR UPDATE OR DELETE ON collected_dataset_versions
 FOR EACH ROW EXECUTE FUNCTION discard_retired_history();
CREATE TRIGGER discard_retired_revisions INSTEAD OF INSERT OR UPDATE OR DELETE ON reading_revisions
 FOR EACH ROW EXECUTE FUNCTION discard_retired_history();

-- Existing metadata is an editable station configuration, not a second history.
-- Current-value caches contain at most one row per measurement/station.
INSERT INTO measurement_migration_state(name,state)
 VALUES('core_storage','{"enabled":true,"version":20261103}')
 ON CONFLICT(name) DO UPDATE SET state=EXCLUDED.state,updated_at=NOW();

DROP FUNCTION IF EXISTS mirror_movement_reading(movement_positions,boolean);
DROP TABLE movement_positions;
CREATE VIEW movement_positions AS
 SELECT c.observed_at AS timestamp,substr(c.entity_id,10) AS entity_id,
   COALESCE(e.metadata->>'kind',e.entity_type) AS kind,c.latitude::double precision AS latitude,
   c.longitude::double precision AS longitude,c.basis,c.source_id,
   NULL::text AS payload_sha256,NULL::text AS model_version,
   (e.metadata-ARRAY['legacy_movement_id','kind','context_observed_at']) || COALESCE((
     SELECT jsonb_object_agg(CASE d.metric WHEN 'speed' THEN 'speed_kmh' WHEN 'delay' THEN 'delay_seconds'
         WHEN 'course' THEN 'course_deg' WHEN 'altitude_baro' THEN 'altitude_baro_m'
         WHEN 'altitude_geom' THEN 'altitude_geom_m' WHEN 'vertical_rate' THEN 'vertical_rate_mps' WHEN 'heading' THEN 'heading_deg'
         WHEN 'navigation_status' THEN 'navigation_status' END,r.value)
     FROM measurement_definitions d JOIN readings r ON r.measurement_id=d.id
     WHERE d.entity_id=c.entity_id AND d.source_id=c.source_id AND d.basis=c.basis
       AND d.metric IN('speed','delay','course','altitude_baro','altitude_geom','vertical_rate','heading','navigation_status')
       AND r.observed_at=c.observed_at AND r.quality='valid'), '{}') AS metadata
 FROM measurement_positions c JOIN entities e ON e.id=c.entity_id
 WHERE c.entity_id LIKE 'movement:%' AND c.dimensions='{"crs":"EPSG:4326"}';
CREATE OR REPLACE FUNCTION core_movement_compat_write() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Movement history only supports canonical inserts'; END IF;
 PERFORM write_movement_position(to_jsonb(NEW));
 RETURN NEW;
END $$;
CREATE TRIGGER canonical_movement_write INSTEAD OF INSERT ON movement_positions
 FOR EACH ROW EXECUTE FUNCTION core_movement_compat_write();

-- Historical repair copies cease to be live database stores. Native collectors
-- bypass these paths in compact mode; Smart City legacy inserts are discarded.
DROP TABLE IF EXISTS weather_legacy_repairs;
DROP TABLE IF EXISTS opensensemap_legacy_repairs;
DROP TABLE IF EXISTS uba_legacy_repairs;
DROP TABLE smartcity_revisions;
CREATE VIEW smartcity_revisions AS SELECT NULL::text AS sensor_id,NULL::text AS metric,
 NULL::timestamptz AS observed_at,NULL::integer AS revision,NULL::double precision AS previous_value,
 NULL::text AS previous_payload_hash,NULL::timestamptz AS revised_at WHERE false;
CREATE TRIGGER discard_smartcity_revisions INSTEAD OF INSERT ON smartcity_revisions
 FOR EACH ROW EXECUTE FUNCTION discard_retired_history();

DROP TABLE movement_contexts;
