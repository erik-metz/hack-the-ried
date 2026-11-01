-- Operational repair evidence; not part of the public three-table archive.
CREATE TABLE IF NOT EXISTS weather_legacy_repairs (
    id BIGSERIAL PRIMARY KEY,
    repaired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    sensor_id TEXT NOT NULL,
    metric TEXT NOT NULL,
    unit TEXT NOT NULL,
    observed_at TIMESTAMPTZ NOT NULL,
    original_rows JSONB NOT NULL,
    chosen_value NUMERIC NOT NULL,
    source_provenance JSONB NOT NULL
);

CREATE OR REPLACE FUNCTION clean_weather_legacy(
    p_sensor TEXT,p_metric TEXT,p_unit TEXT,p_time TIMESTAMPTZ
) RETURNS BOOLEAN LANGUAGE plpgsql SET extra_float_digits=3 AS $$
DECLARE chosen readings%ROWTYPE; originals JSONB; n BIGINT; keep_table OID; keep_tid TID;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('weather-legacy-repair'));
    IF NOT weather_history_explained(p_sensor,p_metric,p_unit,p_time) THEN RETURN FALSE; END IF;
    SELECT r.* INTO STRICT chosen FROM readings r JOIN measurement_definitions d ON d.id=r.measurement_id
    WHERE d.entity_id='sensor:'||p_sensor AND d.source_id='environment-weather' AND d.basis='model'
        AND d.dimensions='{}' AND d.metric=p_metric AND d.unit=p_unit AND r.observed_at=p_time
    FOR SHARE OF r;
    IF legacy_numeric(chosen.value::double precision) IS DISTINCT FROM chosen.value THEN
        RAISE EXCEPTION 'Weather value cannot be represented exactly in legacy storage';
    END IF;
    SELECT count(*),jsonb_agg(to_jsonb(s)) INTO n,originals FROM sensor_data s
    WHERE s.sensor_id=p_sensor AND s.metric=p_metric AND s.unit=p_unit AND s.timestamp=p_time;
    SELECT tableoid,ctid INTO keep_table,keep_tid FROM sensor_data
    WHERE sensor_id=p_sensor AND metric=p_metric AND unit=p_unit AND timestamp=p_time
        AND legacy_numeric(value)=chosen.value LIMIT 1;
    IF n=1 AND keep_tid IS NOT NULL THEN RETURN TRUE; END IF;
    INSERT INTO weather_legacy_repairs(sensor_id,metric,unit,observed_at,original_rows,chosen_value,source_provenance)
    VALUES(p_sensor,p_metric,p_unit,p_time,coalesce(originals,'[]'),chosen.value,chosen.provenance);
    IF keep_tid IS NULL THEN
        INSERT INTO sensor_data(sensor_id,metric,unit,timestamp,value)
        VALUES(p_sensor,p_metric,p_unit,p_time,chosen.value::double precision)
        RETURNING tableoid,ctid INTO keep_table,keep_tid;
    END IF;
    DELETE FROM sensor_data WHERE sensor_id=p_sensor AND metric=p_metric AND unit=p_unit AND timestamp=p_time
        AND (tableoid,ctid) <> (keep_table,keep_tid);
    UPDATE sensor_latest SET value=chosen.value::double precision
    WHERE sensor_id=p_sensor AND metric=p_metric AND unit=p_unit AND timestamp=p_time;
    RETURN TRUE;
END $$;
