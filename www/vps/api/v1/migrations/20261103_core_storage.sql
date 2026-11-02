-- Explicit storage cutover. Install helpers before moving/retiring old tables.
-- No historical observation or table is removed by this additive file.
CREATE OR REPLACE FUNCTION core_storage_enabled() RETURNS BOOLEAN
LANGUAGE SQL STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM measurement_migration_state
   WHERE name='core_storage' AND state->>'enabled'='true')
$$;

-- Application data, not receipt hashes, processing metadata or old values.
-- These fields are still consumed by satellite/GBIF/window/mobility APIs.
CREATE OR REPLACE FUNCTION compact_reading_details(p_data JSONB) RETURNS JSONB
LANGUAGE SQL IMMUTABLE AS $$
 SELECT COALESCE(jsonb_object_agg(key,value),'{}') FROM jsonb_each(p_data)
 WHERE key=ANY(ARRAY['catalog','omm','element_epoch',
   'element_version','valid_until','sample_count','speciesKey','scientificName',
   'vernacularName','taxonRank','kingdom','phylum','class','order','family',
   'genus','species','basisOfRecord','occurrenceID','gbifID','datasetKey',
   'institutionCode','collectionCode','recordedBy','identifiedBy','eventDate',
   'coordinateUncertaintyInMeters','countryCode','locality','license',
   'spatial_reference','model','method','model_version','phase_name','max_score','class_id',
   'window_seconds','gbif_id','publishingOrgKey','taxonKey','issues','informationWithheld',
   'dataGeneralizations','date_precision','document_id','document_revision','document_created_at'])
$$;

CREATE OR REPLACE FUNCTION validate_core_reading() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE definition measurement_definitions%ROWTYPE;
BEGIN
 SELECT * INTO STRICT definition FROM measurement_definitions WHERE id=NEW.measurement_id;
 IF NEW.value IS NOT NULL AND (
   (definition.minimum IS NOT NULL AND NEW.value<definition.minimum) OR
   (definition.maximum IS NOT NULL AND NEW.value>definition.maximum) OR
   (definition.metric='latitude' AND NEW.value NOT BETWEEN -90 AND 90) OR
   (definition.metric='longitude' AND NEW.value NOT BETWEEN -180 AND 180)) THEN
   RAISE EXCEPTION 'Reading outside definition bounds: %',NEW.measurement_id USING ERRCODE='23514';
 END IF;
 IF TG_OP='UPDATE' AND (NEW.measurement_id,NEW.observed_at)
     IS DISTINCT FROM (OLD.measurement_id,OLD.observed_at) THEN
   RAISE EXCEPTION 'Reading identity is immutable' USING ERRCODE='23514';
 END IF;
 NEW.provenance:=compact_reading_details(NEW.provenance);
 NEW.revision:=0;
 RETURN NEW;
END $$;

-- Do not update a row just because another poll has a different receipt hash.
CREATE OR REPLACE FUNCTION write_measurement(
 p_entity TEXT,p_metric TEXT,p_unit TEXT,p_source TEXT,p_basis TEXT,
 p_dimensions JSONB,p_time TIMESTAMPTZ,p_value NUMERIC,p_collected TIMESTAMPTZ,
 p_provenance JSONB DEFAULT '{}',p_quality TEXT DEFAULT 'valid',
 p_start TIMESTAMPTZ DEFAULT NULL,p_end TIMESTAMPTZ DEFAULT NULL,
 p_semantics TEXT DEFAULT 'instantaneous',p_backfill BOOLEAN DEFAULT FALSE
) RETURNS BIGINT LANGUAGE plpgsql AS $$
DECLARE definition_id BIGINT; existing_semantics TEXT; details JSONB;
BEGIN
 IF to_regclass('measurement_current_members') IS NOT NULL THEN
   p_dimensions:=p_dimensions-'snapshot_sha256';
 END IF;
 SELECT id,semantics INTO definition_id,existing_semantics FROM measurement_definitions
 WHERE entity_id=p_entity AND metric=p_metric AND unit=p_unit AND source_id=p_source
   AND basis=p_basis AND dimensions=p_dimensions;
 IF definition_id IS NULL THEN
   INSERT INTO measurement_definitions(entity_id,metric,unit,source_id,basis,dimensions,semantics)
   VALUES(p_entity,p_metric,p_unit,p_source,p_basis,p_dimensions,p_semantics)
   ON CONFLICT(entity_id,metric,unit,source_id,basis,dimensions) DO NOTHING;
   SELECT id,semantics INTO STRICT definition_id,existing_semantics FROM measurement_definitions
   WHERE entity_id=p_entity AND metric=p_metric AND unit=p_unit AND source_id=p_source
     AND basis=p_basis AND dimensions=p_dimensions;
 END IF;
 IF existing_semantics<>p_semantics THEN
   RAISE EXCEPTION 'Measurement semantics changed for %',definition_id USING ERRCODE='23514';
 END IF;
 details:=compact_reading_details(p_provenance);
 IF p_backfill THEN
   INSERT INTO readings(measurement_id,observed_at,value,quality,collected_at,period_start,period_end,provenance)
   VALUES(definition_id,p_time,p_value,p_quality,p_collected,p_start,p_end,details) ON CONFLICT DO NOTHING;
 ELSE
   INSERT INTO readings(measurement_id,observed_at,value,quality,collected_at,period_start,period_end,provenance)
   VALUES(definition_id,p_time,p_value,p_quality,p_collected,p_start,p_end,details)
   ON CONFLICT(measurement_id,observed_at) DO UPDATE SET value=EXCLUDED.value,quality=EXCLUDED.quality,
     collected_at=EXCLUDED.collected_at,period_start=EXCLUDED.period_start,
     period_end=EXCLUDED.period_end,provenance=EXCLUDED.provenance,revision=0
   WHERE EXCLUDED.collected_at>=readings.collected_at AND
     (readings.value,readings.quality,readings.period_start,readings.period_end,readings.provenance)
     IS DISTINCT FROM (EXCLUDED.value,EXCLUDED.quality,EXCLUDED.period_start,EXCLUDED.period_end,EXCLUDED.provenance);
 END IF;
 RETURN definition_id;
END $$;

-- Old names are API projections only. A physical senseBox channel is never
-- discarded: DISTINCT ON applies to the old UI projection, not stored readings.
CREATE INDEX IF NOT EXISTS core_sensor_alias_lookup
 ON measurement_definitions((substr(entity_id,8)),metric,unit)
 WHERE entity_id LIKE 'sensor:%';

CREATE OR REPLACE VIEW core_sensor_aliases AS
 SELECT d.id AS measurement_id,substr(d.entity_id,8) AS sensor_id,d.metric,d.unit,
   d.basis,d.source_id,d.dimensions
 FROM measurement_definitions d WHERE d.entity_id LIKE 'sensor:%'
 UNION ALL
 SELECT d.id,substr(d.entity_id,8),'PM2.5',d.unit,d.basis,d.source_id,d.dimensions
 FROM measurement_definitions d WHERE d.entity_id LIKE 'sensor:%' AND d.metric='PM25'
 UNION ALL
 SELECT d.id,'ttn-gw-'||substr(d.entity_id,14),d.metric,d.unit,d.basis,d.source_id,d.dimensions
 FROM measurement_definitions d WHERE d.entity_id LIKE 'lora:gateway:%' AND d.metric='online_status';

CREATE OR REPLACE FUNCTION store_sensor_sample(
 p_time TIMESTAMPTZ,p_sensor TEXT,p_value DOUBLE PRECISION,p_unit TEXT,p_metric TEXT
) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE chosen RECORD; source_key TEXT; basis_key TEXT; entity_key TEXT:='sensor:'||p_sensor;
BEGIN
 IF p_value::text IN ('NaN','Infinity','-Infinity') THEN
   RAISE EXCEPTION 'Invalid sensor value' USING ERRCODE='23514';
 END IF;
 -- Native collectors write the authoritative channel first. Their compatibility
 -- insert must neither add a second definition nor overwrite another channel.
 SELECT a.measurement_id INTO chosen FROM core_sensor_aliases a JOIN readings r USING(measurement_id)
 WHERE a.sensor_id=p_sensor AND a.metric=p_metric AND a.unit=p_unit AND r.observed_at=p_time
   AND a.basis<>'unknown' AND (r.value=legacy_numeric(p_value) OR p_sensor LIKE 'osem-%' OR p_sensor LIKE 'uba-%' OR p_sensor LIKE 'ttn-gw-%') ORDER BY (r.value=legacy_numeric(p_value)) DESC,a.measurement_id LIMIT 1;
 IF FOUND THEN RETURN; END IF;
 SELECT d.* INTO chosen FROM measurement_definitions d
 WHERE d.entity_id=entity_key AND d.metric=p_metric AND d.unit=p_unit AND d.dimensions='{}'
 ORDER BY (d.basis<>'unknown') DESC,d.id LIMIT 1;
 IF FOUND THEN
   PERFORM write_measurement(chosen.entity_id,chosen.metric,chosen.unit,chosen.source_id,
     chosen.basis,chosen.dimensions,p_time,legacy_numeric(p_value),NOW(),'{}','valid',NULL,NULL,chosen.semantics);
   RETURN;
 END IF;
 INSERT INTO entities(id,name,entity_type,metadata,is_hidden)
 SELECT entity_key,s.friendly_name,'sensor',jsonb_strip_nulls(jsonb_build_object(
   'latitude',s.latitude,'longitude',s.longitude,'description',s.description)),s.is_hidden
 FROM sensor_metadata s WHERE s.id=p_sensor ON CONFLICT(id) DO NOTHING;
 IF NOT FOUND AND NOT EXISTS(SELECT 1 FROM entities WHERE id=entity_key) THEN
   RAISE EXCEPTION 'Unknown sensor: %',p_sensor USING ERRCODE='23503';
 END IF;
 source_key:='legacy-sensor:'||p_sensor;
 basis_key:='unknown';
 IF p_sensor='weather-dwd-ried' THEN source_key:='environment-weather';basis_key:='model';
 ELSIF p_sensor LIKE 'shake-%' THEN source_key:='raspberry-shake';basis_key:='observed';
 ELSIF p_sensor LIKE 'smartcity-%' THEN source_key:='smartcity';basis_key:='reported';
 END IF;
 PERFORM write_measurement(entity_key,p_metric,p_unit,source_key,basis_key,'{}',p_time,
   legacy_numeric(p_value),NOW(),'{}','valid',NULL,NULL,'unknown');
END $$;

CREATE OR REPLACE FUNCTION core_sensor_compat_write() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
   DELETE FROM readings r USING core_sensor_aliases a WHERE r.measurement_id=a.measurement_id
     AND a.sensor_id=OLD.sensor_id AND a.metric=OLD.metric AND a.unit=OLD.unit AND r.observed_at=OLD.timestamp;
   RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' THEN
   UPDATE readings r SET value=legacy_numeric(NEW.value),collected_at=NOW()
   FROM core_sensor_aliases a WHERE r.measurement_id=a.measurement_id
     AND a.sensor_id=OLD.sensor_id AND a.metric=OLD.metric AND a.unit=OLD.unit AND r.observed_at=OLD.timestamp;
 ELSE PERFORM store_sensor_sample(NEW.timestamp,NEW.sensor_id,NEW.value,NEW.unit,NEW.metric);
 END IF;
 INSERT INTO sensor_latest(sensor_id,metric,unit,timestamp,value)
 VALUES(NEW.sensor_id,NEW.metric,NEW.unit,NEW.timestamp,NEW.value)
 ON CONFLICT(sensor_id,metric,unit) DO UPDATE SET timestamp=EXCLUDED.timestamp,value=EXCLUDED.value
 WHERE EXCLUDED.timestamp>=sensor_latest.timestamp;
 RETURN NEW;
END $$;

-- Retry receipts are a bounded operational cache. The canonical primary key
-- also prevents duplicate observations after a receipt has expired.
CREATE INDEX IF NOT EXISTS telemetry_ingest_batches_time ON telemetry_ingest_batches(committed_at);
INSERT INTO collector_schema_versions(version) VALUES(20261103) ON CONFLICT DO NOTHING;

-- Movement context is current descriptive entity data, never a parallel history.
CREATE OR REPLACE FUNCTION write_movement_position(p_data JSONB,p_backfill BOOLEAN DEFAULT FALSE)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE entity_key TEXT:='movement:'||(p_data->>'entity_id');
    sample_time TIMESTAMPTZ:=(p_data->>'timestamp')::timestamptz;
    metadata_value JSONB:=COALESCE(p_data->'metadata','{}'); evidence JSONB:='{}'; field RECORD;
BEGIN
    IF p_data->>'basis' NOT IN ('observed','schedule_prediction')
        OR p_data->>'kind' NOT IN ('bus','train','waste','ship','aircraft') THEN RAISE EXCEPTION 'Unsupported movement identity'; END IF;
    INSERT INTO entities(id,name,entity_type,metadata)
    VALUES(entity_key,p_data->>'entity_id',CASE WHEN p_data->>'basis'='schedule_prediction'
        THEN 'service_trip' ELSE p_data->>'kind' END,
        jsonb_build_object('legacy_movement_id',p_data->>'entity_id','kind',p_data->>'kind',
            'context_observed_at',sample_time) || (metadata_value-ARRAY['speed_kmh','delay_seconds',
            'course_deg','altitude_baro_m','altitude_geom_m','vertical_rate_mps','payload_sha256',
            'model_version','fetched_at','received_at']))
    ON CONFLICT(id) DO UPDATE SET metadata=EXCLUDED.metadata,updated_at=NOW()
    WHERE COALESCE((entities.metadata->>'context_observed_at')::timestamptz,'-infinity')<=sample_time
        AND (entities.metadata-'context_observed_at') IS DISTINCT FROM (EXCLUDED.metadata-'context_observed_at');
    PERFORM write_measurement(entity_key,'latitude','degrees',p_data->>'source_id',p_data->>'basis',
        '{"crs":"EPSG:4326"}',sample_time,(p_data->>'latitude')::numeric,NOW(),evidence,
        'valid',NULL,NULL,'instantaneous',p_backfill);
    PERFORM write_measurement(entity_key,'longitude','degrees',p_data->>'source_id',p_data->>'basis',
        '{"crs":"EPSG:4326"}',sample_time,(p_data->>'longitude')::numeric,NOW(),evidence,
        'valid',NULL,NULL,'instantaneous',p_backfill);
    IF jsonb_typeof(metadata_value->'speed_kmh')='number' THEN
        PERFORM write_measurement(entity_key,'speed','km/h',p_data->>'source_id',p_data->>'basis','{}',
            sample_time,(metadata_value->>'speed_kmh')::numeric,NOW(),evidence,'valid',NULL,NULL,'instantaneous',p_backfill);
    END IF;
    IF jsonb_typeof(metadata_value->'delay_seconds')='number' THEN
        PERFORM write_measurement(entity_key,'delay','s',p_data->>'source_id',p_data->>'basis','{}',
            sample_time,(metadata_value->>'delay_seconds')::numeric,NOW(),evidence,'valid',NULL,NULL,'instantaneous',p_backfill);
    END IF;
    FOR field IN SELECT * FROM (VALUES
        ('course_deg','course','degrees','{"reference":"true_north"}'::jsonb),
        ('altitude_baro_m','altitude_baro','m','{"reference":"pressure_1013.25_hPa"}'::jsonb),
        ('altitude_geom_m','altitude_geom','m','{"reference":"WGS84"}'::jsonb),
        ('vertical_rate_mps','vertical_rate','m/s','{"reference":"barometric"}'::jsonb)
    ) AS fields(key,metric,unit,dimensions) LOOP
        IF jsonb_typeof(metadata_value->field.key)='number' THEN
            PERFORM write_measurement(entity_key,field.metric,field.unit,p_data->>'source_id',p_data->>'basis',
                field.dimensions,sample_time,(metadata_value->>field.key)::numeric,NOW(),evidence,
                'valid',NULL,NULL,'instantaneous',p_backfill);
        END IF;
    END LOOP;
END $$;

CREATE OR REPLACE FUNCTION maintain_core_storage() RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE batches BIGINT; attempts BIGINT; payloads BIGINT; refs TEXT; fk RECORD;
BEGIN
 IF NOT core_storage_enabled() THEN RETURN '{"pending_cutover":true}'; END IF;
 DELETE FROM telemetry_ingest_batches WHERE batch_id IN(
   SELECT batch_id FROM telemetry_ingest_batches WHERE committed_at<NOW()-INTERVAL '7 days'
   ORDER BY committed_at LIMIT 10000);
 GET DIAGNOSTICS batches=ROW_COUNT;
 DELETE FROM collection_failure_samples WHERE expires_at<=NOW();
 DELETE FROM collection_attempts a WHERE a.id IN(
   SELECT old.id FROM collection_attempts old
   WHERE old.received_at<NOW()-INTERVAL '7 days'
     AND NOT EXISTS(SELECT 1 FROM webcam_snapshot_observations w WHERE w.attempt_id=old.id)
     AND NOT EXISTS(SELECT 1 FROM collection_failure_samples s WHERE s.attempt_id=old.id)
     AND EXISTS(SELECT 1 FROM collection_attempts newer WHERE newer.source_id=old.source_id
        AND newer.received_at>old.received_at)
   LIMIT 5000);
 GET DIAGNOSTICS attempts=ROW_COUNT;
 -- Current snapshots and a short ingest window are caches, never a second
 -- unlimited measurement history. Preserve untransferred numeric records.
 DELETE FROM smartcity_observations o WHERE o.observed_at<NOW()-INTERVAL '7 days'
   AND EXISTS(SELECT 1 FROM core_sensor_aliases a JOIN readings r USING(measurement_id)
     WHERE a.sensor_id=o.sensor_id AND a.metric=o.metric AND r.observed_at=o.observed_at
       AND r.value=legacy_numeric(o.value));
 DELETE FROM nextbike_observations o WHERE o.observed_at<NOW()-INTERVAL '7 days'
   AND EXISTS(SELECT 1 FROM core_sensor_aliases a JOIN readings r USING(measurement_id)
     WHERE a.sensor_id=o.sensor_id AND a.metric=o.metric AND r.observed_at=o.observed_at
       AND r.value=legacy_numeric(o.value))
   AND EXISTS(SELECT 1 FROM nextbike_observations newer WHERE newer.sensor_id=o.sensor_id
     AND newer.metric=o.metric AND newer.observed_at>o.observed_at);
 IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema()
     AND table_name='sensor_latest' AND column_name='cached_at') THEN
   DELETE FROM sensor_latest WHERE cached_at<NOW()-INTERVAL '7 days';
 END IF;
 IF to_regclass('measurement_current_members') IS NOT NULL THEN
   DELETE FROM measurement_current_members m WHERE m.seen_at<NOW()-INTERVAL '7 days'
     AND m.seen_at<(SELECT max(current.seen_at) FROM measurement_current_members current WHERE current.source_id=m.source_id);
 END IF;
 DELETE FROM movement_latest WHERE valid_until<NOW()-INTERVAL '1 day';
 DELETE FROM movement_trip_updates WHERE valid_until<NOW()-INTERVAL '7 days';
 DELETE FROM movement_schedules WHERE ends_at<NOW()-INTERVAL '7 days';
 IF to_regclass('collection_runs') IS NOT NULL THEN
   DELETE FROM collection_runs WHERE finished_at<NOW()-INTERVAL '7 days';
   UPDATE collection_run_coverage SET since=GREATEST(since,NOW()-INTERVAL '7 days');
 END IF;
 -- Honour all actual foreign keys, including file products. Never collect an
 -- asset checksum or a current checkpoint as an unreferenced receipt.
 refs:='';
 FOR fk IN SELECT c.conrelid::regclass AS relation,a.attname AS column_name
   FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
   WHERE c.contype='f' AND c.confrelid='collected_payloads'::regclass LOOP
   refs:=refs||format(' AND NOT EXISTS(SELECT 1 FROM %s x WHERE x.%I=p.sha256)',fk.relation,fk.column_name);
 END LOOP;
 EXECUTE 'DELETE FROM collected_payloads WHERE sha256 IN(SELECT p.sha256 FROM collected_payloads p '
   ||'WHERE p.received_at<NOW()-INTERVAL ''7 days'''||refs||' LIMIT 5000)';
 GET DIAGNOSTICS payloads=ROW_COUNT;
 RETURN jsonb_build_object('expired_batch_receipts',batches,'expired_attempts',attempts,'unused_receipts',payloads);
END $$;

-- Bounded historical transfer uses the same compact record contract.
-- A bounded interval is materialized once, then inserted as a set. This avoids
-- rescanning compressed source partitions for every historical timestamp.
CREATE OR REPLACE FUNCTION backfill_measurement_window(p_family TEXT,p_start TIMESTAMPTZ,p_end TIMESTAMPTZ)
RETURNS BIGINT LANGUAGE plpgsql AS $$
DECLARE conflict RECORD; total BIGINT;
BEGIN
    IF p_end<=p_start OR p_end-p_start>INTERVAL '1 hour' THEN RAISE EXCEPTION 'Invalid history window'; END IF;
    PERFORM pg_advisory_xact_lock(2026093001);
    CREATE TEMP TABLE migration_window (
        entity_id TEXT,metric TEXT,unit TEXT,source_id TEXT,basis TEXT,dimensions JSONB,
        semantics TEXT,observed_at TIMESTAMPTZ,value NUMERIC,provenance JSONB
    ) ON COMMIT DROP;
    IF p_family='sensors' THEN
        FOR conflict IN SELECT sensor_id,metric,unit,timestamp FROM sensor_data
            WHERE timestamp>=p_start AND timestamp<p_end GROUP BY sensor_id,metric,unit,timestamp
            HAVING count(DISTINCT value)>1 LOOP
            IF NOT reconcile_weather_history(conflict.sensor_id,conflict.metric,conflict.unit,conflict.timestamp) THEN
                RAISE EXCEPTION 'Unexplained history conflict: %/% at %',conflict.sensor_id,conflict.metric,conflict.timestamp;
            END IF;
        END LOOP;
        INSERT INTO migration_window
        SELECT 'sensor:'||sensor_id,metric,unit,'legacy-sensor:'||sensor_id,'unknown','{}','unknown',timestamp,
            CASE WHEN count(DISTINCT value)>1 THEN (
                SELECT r.value FROM readings r JOIN measurement_definitions d ON d.id=r.measurement_id
                WHERE d.entity_id='sensor:'||s.sensor_id AND d.source_id='environment-weather'
                    AND d.basis='model' AND d.dimensions='{}' AND d.metric=s.metric AND d.unit=s.unit
                    AND r.observed_at=s.timestamp
            ) ELSE min(legacy_numeric(value)) END,
            '{"legacy_table":"sensor_data","basis_unverified":true}'
        FROM sensor_data s WHERE timestamp>=p_start AND timestamp<p_end
        GROUP BY sensor_id,metric,unit,timestamp;
    ELSIF p_family='movements' THEN
        CREATE TEMP TABLE migration_positions ON COMMIT DROP AS
            SELECT * FROM movement_positions WHERE timestamp>=p_start AND timestamp<p_end;
        INSERT INTO entities(id,name,entity_type,metadata)
        SELECT DISTINCT ON(entity_id) 'movement:'||entity_id,entity_id,
            CASE WHEN basis='schedule_prediction' THEN 'service_trip' ELSE kind END,
            jsonb_build_object('legacy_movement_id',entity_id,'kind',kind)
        FROM migration_positions ORDER BY entity_id,timestamp DESC ON CONFLICT(id) DO NOTHING;
        INSERT INTO migration_window
        SELECT 'movement:'||p.entity_id,v.metric,v.unit,p.source_id,p.basis,v.dimensions,
            'instantaneous',p.timestamp,v.value,
            '{}'::jsonb
        FROM migration_positions p CROSS JOIN LATERAL (VALUES
            ('latitude','degrees','{"crs":"EPSG:4326"}'::jsonb,legacy_numeric(p.latitude)),
            ('longitude','degrees','{"crs":"EPSG:4326"}'::jsonb,legacy_numeric(p.longitude)),
            ('speed','km/h','{}'::jsonb,CASE WHEN jsonb_typeof(p.metadata->'speed_kmh')='number' THEN (p.metadata->>'speed_kmh')::numeric END),
            ('delay','s','{}'::jsonb,CASE WHEN jsonb_typeof(p.metadata->'delay_seconds')='number' THEN (p.metadata->>'delay_seconds')::numeric END),
            ('course','degrees','{"reference":"true_north"}'::jsonb,CASE WHEN jsonb_typeof(p.metadata->'course_deg')='number' THEN (p.metadata->>'course_deg')::numeric END),
            ('altitude_baro','m','{"reference":"pressure_1013.25_hPa"}'::jsonb,CASE WHEN jsonb_typeof(p.metadata->'altitude_baro_m')='number' THEN (p.metadata->>'altitude_baro_m')::numeric END),
            ('altitude_geom','m','{"reference":"WGS84"}'::jsonb,CASE WHEN jsonb_typeof(p.metadata->'altitude_geom_m')='number' THEN (p.metadata->>'altitude_geom_m')::numeric END),
            ('vertical_rate','m/s','{"reference":"barometric"}'::jsonb,CASE WHEN jsonb_typeof(p.metadata->'vertical_rate_mps')='number' THEN (p.metadata->>'vertical_rate_mps')::numeric END)
        ) v(metric,unit,dimensions,value) WHERE v.value IS NOT NULL;
    ELSE RAISE EXCEPTION 'Unknown history family'; END IF;
    SELECT count(*) INTO total FROM migration_window;
    IF total>100000 THEN RAISE EXCEPTION 'History window too large; use a shorter interval'; END IF;
    INSERT INTO measurement_definitions(entity_id,metric,unit,source_id,basis,dimensions,semantics)
    SELECT DISTINCT entity_id,metric,unit,source_id,basis,dimensions,semantics FROM migration_window
    ON CONFLICT(entity_id,metric,unit,source_id,basis,dimensions) DO NOTHING;
    INSERT INTO readings(measurement_id,observed_at,value,quality,collected_at,provenance)
    SELECT d.id,w.observed_at,w.value,'valid',NOW(),w.provenance
    FROM migration_window w JOIN measurement_definitions d USING(entity_id,metric,unit,source_id,basis,dimensions)
    ORDER BY d.id,w.observed_at ON CONFLICT(measurement_id,observed_at) DO NOTHING;
    -- Store transfer progress in the same transaction as the copied values.
    INSERT INTO measurement_migration_state(name,state)
    VALUES ('window:'||p_family,jsonb_build_object('through',p_end,'last_window_samples',total))
    ON CONFLICT(name) DO UPDATE SET state=EXCLUDED.state,updated_at=NOW();
    RETURN total;
END $$;

CREATE OR REPLACE FUNCTION canonical_publication_change() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF NOT core_storage_enabled() THEN RETURN NULL; END IF;
 IF NEW.dataset LIKE 'statistics/%' THEN PERFORM mirror_statistical_publication(NEW);
 ELSIF NEW.dataset IN('infrastructure/ev-charging','map/layers/charging') THEN PERFORM mirror_charger_publication(NEW);
 ELSIF NEW.dataset IN('environment/flood/gauges','map/layers/floods') THEN PERFORM mirror_gauge_publication(NEW);
 ELSIF is_coordinate_publication(NEW.dataset) THEN PERFORM mirror_coordinate_publication(NEW);
 END IF;
 RETURN NULL;
END $$;
CREATE OR REPLACE TRIGGER canonical_publication_measurements AFTER INSERT OR UPDATE ON collected_datasets
 FOR EACH ROW EXECUTE FUNCTION canonical_publication_change();

-- Lossless column compression is configured here, activated only by the final
-- maintenance step after metadata cleanup. Plain PostgreSQL fixtures stay valid.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_extension WHERE extname='timescaledb') THEN
   ALTER TABLE readings SET(timescaledb.compress,
     timescaledb.compress_segmentby='measurement_id',timescaledb.compress_orderby='observed_at');
 END IF;
END $$;
