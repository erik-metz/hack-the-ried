-- Periodic traffic quantities use the same authoritative scalar core.
CREATE OR REPLACE FUNCTION write_corridor_snapshot(p_data JSONB,p_backfill BOOLEAN DEFAULT FALSE)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE entity_key TEXT:=p_data->>'corridor_id'; sample_time TIMESTAMPTZ:=(p_data->>'timestamp')::timestamptz;
 status_code INTEGER; delay_basis TEXT:=COALESCE(p_data->>'delay_kind','unknown');
BEGIN
 status_code:=CASE p_data->>'status' WHEN 'unknown' THEN 0 WHEN 'clear' THEN 1
   WHEN 'sluggish' THEN 2 WHEN 'congestion' THEN 3 WHEN 'closure' THEN 4 END;
 IF status_code IS NULL OR (p_data->>'active_incidents_count')::numeric<0
     OR (p_data->>'max_length_meters')::numeric<0 THEN
   RAISE EXCEPTION 'Invalid corridor snapshot' USING ERRCODE='23514';
 END IF;
 INSERT INTO entities(id,name,entity_type,metadata)
 VALUES(entity_key,'Autobahn-Korridor '||(p_data->>'road_name'),'corridor',jsonb_build_object('road',p_data->>'road_name'))
 ON CONFLICT(id) DO NOTHING;
 PERFORM write_measurement(entity_key,'active_incidents','count','autobahn_api','observed','{}',sample_time,
   (p_data->>'active_incidents_count')::numeric,NOW(),'{}','valid',NULL,NULL,'instantaneous',p_backfill);
 PERFORM write_measurement(entity_key,'traffic_status','state','autobahn_api','model',
   '{"labels":{"0":"unknown","1":"clear","2":"sluggish","3":"congestion","4":"closure"}}',sample_time,
   status_code,NOW(),'{}','valid',NULL,NULL,'state',p_backfill);
 PERFORM write_measurement(entity_key,'max_incident_length','m','autobahn_api','model',
   '{"aggregation":"maximum_reported_extent","empty_set":0}',sample_time,
   (p_data->>'max_length_meters')::numeric,NOW(),'{}','valid',NULL,NULL,'instantaneous',p_backfill);
 -- Legacy zeros/values with unknown delay semantics are not accepted delays.
 IF delay_basis IN('reported','estimated') AND (p_data->>'active_incidents_count')::integer>0 THEN
   PERFORM write_measurement(entity_key,'delay','s','autobahn_api',
     CASE WHEN delay_basis='estimated' THEN 'model' ELSE 'reported' END,'{}',sample_time,
     (p_data->>'delay_seconds')::numeric,NOW(),'{}','valid',NULL,NULL,'instantaneous',p_backfill);
 END IF;
END $$;

CREATE OR REPLACE VIEW core_corridor_snapshots AS
SELECT r.observed_at AS timestamp,d.entity_id::varchar(32) AS corridor_id,
 (e.metadata->>'road')::varchar(32) AS road_name,
 CASE state.value::integer WHEN 1 THEN 'clear' WHEN 2 THEN 'sluggish' WHEN 3 THEN 'congestion'
   WHEN 4 THEN 'closure' ELSE 'unknown' END::varchar(32) AS status,
 delay.value::integer AS delay_seconds,r.value::integer AS active_incidents_count,
 extent.value::integer AS max_length_meters,
 CASE delay.basis WHEN 'reported' THEN 'reported' WHEN 'model' THEN 'estimated' ELSE 'unknown' END AS delay_kind
FROM measurement_definitions d JOIN entities e ON e.id=d.entity_id JOIN readings r ON r.measurement_id=d.id
LEFT JOIN LATERAL (
 SELECT s.value FROM measurement_definitions x JOIN readings s ON s.measurement_id=x.id
 WHERE x.entity_id=d.entity_id AND x.metric='traffic_status' AND x.source_id='autobahn_api'
   AND x.basis='model' AND x.unit='state' AND s.observed_at=r.observed_at AND s.quality='valid'
 LIMIT 1
) state ON TRUE
LEFT JOIN LATERAL (
 SELECT s.value FROM measurement_definitions x JOIN readings s ON s.measurement_id=x.id
 WHERE x.entity_id=d.entity_id AND x.metric='max_incident_length' AND x.source_id='autobahn_api'
   AND x.basis='model' AND x.unit='m' AND s.observed_at=r.observed_at AND s.quality='valid'
 LIMIT 1
) extent ON TRUE
LEFT JOIN LATERAL (
 SELECT s.value,x.basis FROM measurement_definitions x JOIN readings s ON s.measurement_id=x.id
 WHERE x.entity_id=d.entity_id AND x.metric='delay' AND x.source_id='autobahn_api' AND x.dimensions='{}'
   AND x.basis IN('reported','model') AND x.unit='s' AND s.observed_at=r.observed_at AND s.quality='valid'
 ORDER BY s.collected_at DESC LIMIT 1
) delay ON TRUE
WHERE e.entity_type='corridor' AND d.metric='active_incidents' AND d.source_id='autobahn_api'
 AND d.basis='observed' AND d.unit='count' AND d.dimensions='{}' AND r.quality='valid';

CREATE OR REPLACE FUNCTION core_corridor_compat_write() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN PERFORM write_corridor_snapshot(to_jsonb(NEW)); RETURN NEW; END $$;
