-- Normalize response-derived identities after the verified storage cutover.
-- Original valid times and genuine run/issue times remain unchanged.
DO $$ BEGIN
 IF NOT core_storage_enabled() THEN RAISE EXCEPTION 'Complete the core storage cutover first'; END IF;
END $$;

-- A bounded index of the current result set contains keys, never measurement
-- values, receipt hashes or copies of source responses.
CREATE TABLE IF NOT EXISTS measurement_current_members(
 source_id TEXT NOT NULL,
 measurement_id BIGINT NOT NULL REFERENCES measurement_definitions(id) ON DELETE CASCADE,
 observed_at TIMESTAMPTZ NOT NULL,
 seen_at TIMESTAMPTZ NOT NULL,
 PRIMARY KEY(measurement_id,observed_at)
);
CREATE INDEX IF NOT EXISTS measurement_current_members_source ON measurement_current_members(source_id,seen_at DESC);

-- Initialize exactly the sets served by the previous API before merging IDs.
WITH current_sources AS (
 (SELECT DISTINCT ON(source_id) source_id,payload_sha256 AS sha
 FROM collection_attempts WHERE status='success' AND source_id<>'environment-gbif'
 ORDER BY source_id,received_at DESC,id DESC)
 UNION ALL
 SELECT 'environment-gbif',metadata->>'snapshot_sha256' FROM entities
 WHERE id='environment:gbif:ried'
)
INSERT INTO measurement_current_members(source_id,measurement_id,observed_at,seen_at)
SELECT d.source_id,d.id,r.observed_at,NOW() FROM current_sources s
 JOIN measurement_definitions d ON d.source_id=s.source_id AND d.dimensions->>'snapshot_sha256'=s.sha
 JOIN readings r ON r.measurement_id=d.id
WHERE NOT EXISTS(SELECT 1 FROM measurement_migration_state WHERE name='snapshot_identity' AND state->>'initialized'='true')
ON CONFLICT DO NOTHING;

INSERT INTO measurement_migration_state(name,state) VALUES('snapshot_identity','{"initialized":true}') ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION current_snapshot_matches(p_definition BIGINT,p_time TIMESTAMPTZ,p_legacy_sha TEXT)
RETURNS BOOLEAN LANGUAGE SQL STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM measurement_current_members m
 WHERE m.measurement_id=p_definition AND m.observed_at=p_time AND m.seen_at=(
   SELECT max(current.seen_at) FROM measurement_current_members current WHERE current.source_id=m.source_id))
$$;

CREATE OR REPLACE FUNCTION write_measurement(
 p_entity TEXT,p_metric TEXT,p_unit TEXT,p_source TEXT,p_basis TEXT,
 p_dimensions JSONB,p_time TIMESTAMPTZ,p_value NUMERIC,p_collected TIMESTAMPTZ,
 p_provenance JSONB DEFAULT '{}',p_quality TEXT DEFAULT 'valid',
 p_start TIMESTAMPTZ DEFAULT NULL,p_end TIMESTAMPTZ DEFAULT NULL,
 p_semantics TEXT DEFAULT 'instantaneous',p_backfill BOOLEAN DEFAULT FALSE
) RETURNS BIGINT LANGUAGE plpgsql AS $$
DECLARE definition_id BIGINT; existing_semantics TEXT; details JSONB;
BEGIN
 -- A transport response hash is not a distinct measurement quantity.
 p_dimensions:=p_dimensions-'snapshot_sha256';
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

CREATE OR REPLACE FUNCTION write_environment_measurement(
    p_entity TEXT, p_metric TEXT, p_unit TEXT, p_source TEXT, p_kind TEXT,
    p_dimensions JSONB, p_time TIMESTAMPTZ, p_value NUMERIC,
    p_attempt BIGINT, p_metadata JSONB,
    p_quality TEXT DEFAULT 'valid', p_start TIMESTAMPTZ DEFAULT NULL,
    p_end TIMESTAMPTZ DEFAULT NULL, p_semantics TEXT DEFAULT 'instantaneous',
    p_issued TIMESTAMPTZ DEFAULT NULL
) RETURNS BIGINT LANGUAGE plpgsql AS $$
DECLARE receipt collection_attempts%ROWTYPE; dims JSONB; evidence JSONB; basis TEXT; definition_id BIGINT;
BEGIN
    IF p_kind IS NULL OR p_kind NOT IN ('observation','model','forecast','derived') THEN
        RAISE EXCEPTION 'Unknown data kind' USING ERRCODE='23514';
    END IF;
    IF p_dimensions IS NULL OR jsonb_typeof(p_dimensions)<>'object'
        OR p_dimensions ?| ARRAY['contract','data_kind','issued_at'] THEN
        RAISE EXCEPTION 'Invalid or reserved dimensions' USING ERRCODE='23514';
    END IF;
    IF p_metadata IS NULL OR jsonb_typeof(p_metadata)<>'object'
        OR COALESCE(length(trim(p_metadata->>'license')),0)=0
        OR COALESCE(length(trim(p_metadata->>'spatial_reference')),0)=0
        OR (p_kind IN ('model','forecast') AND COALESCE(length(trim(p_metadata->>'model')),0)=0)
        OR (p_kind='derived' AND COALESCE(length(trim(p_metadata->>'method')),0)=0) THEN
        RAISE EXCEPTION 'License, spatial reference and model/method required' USING ERRCODE='23514';
    END IF;
    IF (p_kind='forecast' AND (p_issued IS NULL OR NOT isfinite(p_issued)))
        OR (p_kind<>'forecast' AND p_issued IS NOT NULL) THEN
        RAISE EXCEPTION 'Forecasts require an explicit issue time only' USING ERRCODE='23514';
    END IF;
    SELECT a.* INTO receipt FROM collection_attempts a
        JOIN collected_payloads p ON p.sha256=a.payload_sha256
        WHERE a.id=p_attempt AND a.source_id=p_source
        AND a.http_status BETWEEN 200 AND 299 AND a.status IN ('received','success');
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Successful archived source receipt required' USING ERRCODE='23514';
    END IF;
    IF p_issued IS NOT NULL AND p_issued>receipt.received_at THEN
        RAISE EXCEPTION 'Issue time exceeds receipt time' USING ERRCODE='23514';
    END IF;
    dims := p_dimensions || jsonb_build_object('contract','environment-v1','data_kind',p_kind);
    IF p_issued IS NOT NULL THEN
        dims := dims || jsonb_build_object('issued_at',
            to_char(p_issued AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
    END IF;
    evidence := p_metadata || jsonb_build_object('attempt_id',receipt.id,
        'payload_sha256',receipt.payload_sha256,'data_kind',p_kind,'issued_at',p_issued);
    basis := CASE WHEN p_kind='observation' THEN 'observed' ELSE 'model' END;
    definition_id:=write_measurement(p_entity,p_metric,p_unit,p_source,basis,dims,p_time,p_value,
        receipt.received_at,evidence,p_quality,p_start,p_end,p_semantics);
    IF p_dimensions ? 'snapshot_sha256' THEN
        INSERT INTO measurement_current_members(source_id,measurement_id,observed_at,seen_at)
        VALUES(p_source,definition_id,p_time,NOW())
        ON CONFLICT(measurement_id,observed_at) DO UPDATE SET seen_at=EXCLUDED.seen_at;
    END IF;
    RETURN definition_id;
END $$;
