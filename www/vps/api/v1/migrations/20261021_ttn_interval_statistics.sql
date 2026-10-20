-- TTN interval min/mean/max are ordinary readings distinguished by dimensions.
-- This remains an explicit core-schema migration; API startup never creates the
-- canonical database as a side effect.
ALTER TABLE measurement_definitions
    DROP CONSTRAINT IF EXISTS measurement_definitions_semantics_check;
ALTER TABLE measurement_definitions
    ADD CONSTRAINT measurement_definitions_semantics_check
    CHECK (semantics IN ('instantaneous','counter','period_total','rate','state',
                         'reference','bound','unknown','interval_statistic'));

CREATE INDEX IF NOT EXISTS core_ttn_sensor_lookup
    ON measurement_definitions ((substr(entity_id,8)),metric,unit)
    WHERE entity_id LIKE 'sensor:%' AND source_id LIKE 'ttn:%';

-- Expose canonical TTN means through the established compatibility reader while
-- suppressing the matching shadow copy written to legacy sensor_data.
CREATE OR REPLACE VIEW core_sensor_data AS
SELECT r.observed_at AS timestamp,substr(d.entity_id,8) AS sensor_id,
       r.value::double precision AS value,d.unit,d.metric
FROM readings r JOIN measurement_definitions d ON d.id=r.measurement_id
WHERE d.entity_id LIKE 'sensor:%' AND r.quality='valid'
  AND ((d.source_id LIKE 'legacy-sensor:%' AND NOT EXISTS (
          SELECT 1 FROM readings t JOIN measurement_definitions td ON td.id=t.measurement_id
          WHERE td.entity_id=d.entity_id AND td.metric=d.metric AND td.unit=d.unit
            AND td.source_id LIKE 'ttn:%' AND COALESCE(td.dimensions->>'statistic','mean')='mean'
            AND t.observed_at=r.observed_at AND t.quality='valid'))
       OR (d.source_id LIKE 'ttn:%' AND COALESCE(d.dimensions->>'statistic','mean')='mean'));

CREATE OR REPLACE VIEW core_sensor_latest AS
SELECT r.observed_at AS timestamp,substr(d.entity_id,8) AS sensor_id,
       r.value::double precision AS value,d.unit,d.metric
FROM latest_readings r JOIN measurement_definitions d ON d.id=r.measurement_id
WHERE d.entity_id LIKE 'sensor:%' AND r.quality='valid'
  AND ((d.source_id LIKE 'legacy-sensor:%' AND NOT EXISTS (
          SELECT 1 FROM latest_readings t JOIN measurement_definitions td ON td.id=t.measurement_id
          WHERE td.entity_id=d.entity_id AND td.metric=d.metric AND td.unit=d.unit
            AND td.source_id LIKE 'ttn:%' AND COALESCE(td.dimensions->>'statistic','mean')='mean'
            AND t.observed_at=r.observed_at AND t.quality='valid'))
       OR (d.source_id LIKE 'ttn:%' AND COALESCE(d.dimensions->>'statistic','mean')='mean'));
