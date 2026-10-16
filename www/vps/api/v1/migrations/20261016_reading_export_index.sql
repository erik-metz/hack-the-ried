-- Time-bounded public exports filter all readings by observed_at first.
-- The existing primary key starts with measurement_id and cannot efficiently
-- serve that range scan across many sensors.
DO $$ BEGIN
    IF to_regclass('public.readings') IS NOT NULL THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_readings_observed_measurement
            ON readings (observed_at, measurement_id)';
    END IF;
END $$;
