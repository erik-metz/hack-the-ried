-- Additive core. Applied explicitly, never as a history backfill at API startup.
-- float8 -> numeric normally rounds to 15 significant digits. Preserve the
-- shortest decimal that round-trips to the original legacy float instead.
CREATE OR REPLACE FUNCTION legacy_numeric(p_value DOUBLE PRECISION)
RETURNS NUMERIC LANGUAGE SQL IMMUTABLE STRICT SET extra_float_digits=3 AS $$
    SELECT p_value::text::numeric
$$;

CREATE TABLE IF NOT EXISTS entities (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(metadata) = 'object'),
    is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS measurement_definitions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    entity_id TEXT NOT NULL REFERENCES entities(id),
    metric TEXT NOT NULL CHECK (metric <> ''),
    unit TEXT NOT NULL,
    source_id TEXT NOT NULL CHECK (source_id <> ''),
    basis TEXT NOT NULL CHECK (basis IN ('observed','reported','model','schedule_prediction','unknown')),
    dimensions JSONB NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(dimensions) = 'object'),
    semantics TEXT NOT NULL DEFAULT 'instantaneous'
        CHECK (semantics IN ('instantaneous','counter','period_total','rate','state','reference','bound','unknown')),
    minimum NUMERIC,
    maximum NUMERIC,
    UNIQUE(entity_id, metric, unit, source_id, basis, dimensions),
    CHECK (minimum IS NULL OR maximum IS NULL OR minimum <= maximum)
);

CREATE TABLE IF NOT EXISTS readings (
    measurement_id BIGINT NOT NULL REFERENCES measurement_definitions(id),
    observed_at TIMESTAMPTZ NOT NULL,
    value NUMERIC,
    quality TEXT NOT NULL DEFAULT 'valid' CHECK (quality IN ('valid','missing','suppressed','invalid')),
    collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    period_start TIMESTAMPTZ,
    period_end TIMESTAMPTZ,
    provenance JSONB NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(provenance) = 'object'),
    revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
    PRIMARY KEY(measurement_id, observed_at),
    CHECK (isfinite(observed_at) AND isfinite(collected_at)),
    CHECK ((quality = 'valid' AND value IS NOT NULL) OR (quality <> 'valid' AND value IS NULL)),
    CHECK (value IS NULL OR value::text NOT IN ('NaN','Infinity','-Infinity')),
    CHECK ((period_start IS NULL AND period_end IS NULL) OR
        (period_start IS NOT NULL AND period_end IS NOT NULL AND period_start < period_end))
);
CREATE INDEX IF NOT EXISTS idx_readings_observed_measurement
    ON readings (observed_at, measurement_id);
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
        PERFORM create_hypertable('readings', 'observed_at', if_not_exists => TRUE);
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS reading_revisions (
    measurement_id BIGINT NOT NULL REFERENCES measurement_definitions(id),
    observed_at TIMESTAMPTZ NOT NULL,
    revision INTEGER NOT NULL,
    previous_record JSONB NOT NULL,
    replaced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(measurement_id, observed_at, revision)
);
CREATE TABLE IF NOT EXISTS latest_readings (
    measurement_id BIGINT PRIMARY KEY REFERENCES measurement_definitions(id),
    observed_at TIMESTAMPTZ NOT NULL,
    value NUMERIC,
    quality TEXT NOT NULL,
    collected_at TIMESTAMPTZ NOT NULL,
    provenance JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS measurement_migration_state (
    name TEXT PRIMARY KEY,
    state JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION validate_core_reading() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE definition measurement_definitions%ROWTYPE;
BEGIN
    SELECT * INTO STRICT definition FROM measurement_definitions WHERE id = NEW.measurement_id;
    IF NEW.value IS NOT NULL AND (
        (definition.minimum IS NOT NULL AND NEW.value < definition.minimum) OR
        (definition.maximum IS NOT NULL AND NEW.value > definition.maximum) OR
        (definition.metric = 'latitude' AND NEW.value NOT BETWEEN -90 AND 90) OR
        (definition.metric = 'longitude' AND NEW.value NOT BETWEEN -180 AND 180)
    ) THEN
        RAISE EXCEPTION 'Reading outside definition bounds: %', NEW.measurement_id USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'UPDATE' THEN
        IF (NEW.measurement_id, NEW.observed_at) IS DISTINCT FROM (OLD.measurement_id, OLD.observed_at) THEN
            RAISE EXCEPTION 'Reading identity is immutable' USING ERRCODE = '23514';
        END IF;
        IF (NEW.value, NEW.quality, NEW.period_start, NEW.period_end, NEW.provenance)
            IS DISTINCT FROM (OLD.value, OLD.quality, OLD.period_start, OLD.period_end, OLD.provenance) THEN
            INSERT INTO reading_revisions VALUES (OLD.measurement_id, OLD.observed_at, OLD.revision, to_jsonb(OLD), NOW());
            NEW.revision := OLD.revision + 1;
        ELSE
            NEW.revision := OLD.revision;
        END IF;
    END IF;
    RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER core_reading_validation BEFORE INSERT OR UPDATE ON readings
FOR EACH ROW EXECUTE FUNCTION validate_core_reading();

CREATE OR REPLACE FUNCTION maintain_core_latest() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        DELETE FROM latest_readings WHERE measurement_id = OLD.measurement_id AND observed_at = OLD.observed_at;
        IF FOUND THEN
            INSERT INTO latest_readings
            SELECT measurement_id, observed_at, value, quality, collected_at, provenance
            FROM readings WHERE measurement_id = OLD.measurement_id ORDER BY observed_at DESC LIMIT 1
            ON CONFLICT (measurement_id) DO NOTHING;
        END IF;
    ELSE
        -- Historical inserts cannot improve an already newer cache entry. Avoid
        -- taking its row lock at all while live collectors update other metrics.
        IF EXISTS (SELECT 1 FROM latest_readings WHERE measurement_id=NEW.measurement_id
            AND observed_at>NEW.observed_at) THEN RETURN NULL; END IF;
        INSERT INTO latest_readings VALUES
            (NEW.measurement_id, NEW.observed_at, NEW.value, NEW.quality, NEW.collected_at, NEW.provenance)
        ON CONFLICT (measurement_id) DO UPDATE SET observed_at = EXCLUDED.observed_at,
            value = EXCLUDED.value, quality = EXCLUDED.quality, collected_at = EXCLUDED.collected_at,
            provenance = EXCLUDED.provenance
        WHERE EXCLUDED.observed_at >= latest_readings.observed_at;
    END IF;
    RETURN NULL;
END $$;
CREATE OR REPLACE TRIGGER core_latest_changed AFTER INSERT OR UPDATE OR DELETE ON readings
FOR EACH ROW EXECUTE FUNCTION maintain_core_latest();

-- Definition changes must not reinterpret already stored values.
CREATE OR REPLACE FUNCTION immutable_measurement_definition() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION 'Measurement definitions are immutable; create a versioned definition' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER definition_immutable BEFORE UPDATE ON measurement_definitions
FOR EACH ROW EXECUTE FUNCTION immutable_measurement_definition();

-- Shared database ingestion primitive: accessible from every independently built collector.
CREATE OR REPLACE FUNCTION write_measurement(
    p_entity TEXT, p_metric TEXT, p_unit TEXT, p_source TEXT, p_basis TEXT,
    p_dimensions JSONB, p_time TIMESTAMPTZ, p_value NUMERIC,
    p_collected TIMESTAMPTZ, p_provenance JSONB DEFAULT '{}',
    p_quality TEXT DEFAULT 'valid', p_start TIMESTAMPTZ DEFAULT NULL,
    p_end TIMESTAMPTZ DEFAULT NULL, p_semantics TEXT DEFAULT 'instantaneous',
    p_backfill BOOLEAN DEFAULT FALSE
) RETURNS BIGINT LANGUAGE plpgsql AS $$
DECLARE definition_id BIGINT; existing_semantics TEXT;
BEGIN
    SELECT id, semantics INTO definition_id, existing_semantics FROM measurement_definitions
    WHERE entity_id=p_entity AND metric=p_metric AND unit=p_unit AND source_id=p_source
        AND basis=p_basis AND dimensions=p_dimensions;
    IF definition_id IS NULL THEN
        INSERT INTO measurement_definitions(entity_id,metric,unit,source_id,basis,dimensions,semantics)
        VALUES (p_entity,p_metric,p_unit,p_source,p_basis,p_dimensions,p_semantics)
        ON CONFLICT (entity_id,metric,unit,source_id,basis,dimensions) DO NOTHING;
        SELECT id, semantics INTO STRICT definition_id, existing_semantics FROM measurement_definitions
        WHERE entity_id=p_entity AND metric=p_metric AND unit=p_unit AND source_id=p_source
            AND basis=p_basis AND dimensions=p_dimensions;
    END IF;
    IF existing_semantics <> p_semantics THEN
        RAISE EXCEPTION 'Measurement semantics changed for %', definition_id USING ERRCODE = '23514';
    END IF;
    IF p_backfill THEN
        INSERT INTO readings(measurement_id,observed_at,value,quality,collected_at,period_start,period_end,provenance)
        VALUES (definition_id,p_time,p_value,p_quality,p_collected,p_start,p_end,p_provenance)
        ON CONFLICT DO NOTHING;
    ELSE
        INSERT INTO readings(measurement_id,observed_at,value,quality,collected_at,period_start,period_end,provenance)
        VALUES (definition_id,p_time,p_value,p_quality,p_collected,p_start,p_end,p_provenance)
        ON CONFLICT (measurement_id,observed_at) DO UPDATE SET value=EXCLUDED.value, quality=EXCLUDED.quality,
            collected_at=EXCLUDED.collected_at, period_start=EXCLUDED.period_start,
            period_end=EXCLUDED.period_end, provenance=EXCLUDED.provenance
        WHERE EXCLUDED.collected_at >= readings.collected_at AND
            (readings.value,readings.quality,readings.period_start,readings.period_end,readings.provenance)
            IS DISTINCT FROM (EXCLUDED.value,EXCLUDED.quality,EXCLUDED.period_start,EXCLUDED.period_end,EXCLUDED.provenance);
    END IF;
    RETURN definition_id;
END $$;

-- History view deliberately joins exact timestamps, not two independent latest values.
CREATE OR REPLACE VIEW measurement_positions AS
SELECT lat.entity_id, lat.source_id, lat.basis, lat.dimensions, a.observed_at,
       a.value AS latitude, b.value AS longitude, a.provenance
FROM measurement_definitions lat
JOIN measurement_definitions lon ON lon.entity_id=lat.entity_id AND lon.source_id=lat.source_id
    AND lon.basis=lat.basis AND lon.dimensions=lat.dimensions AND lon.unit=lat.unit
    AND lon.metric='longitude'
JOIN readings a ON a.measurement_id=lat.id AND a.quality='valid'
JOIN readings b ON b.measurement_id=lon.id AND b.observed_at=a.observed_at AND b.quality='valid'
WHERE lat.metric='latitude';

INSERT INTO measurement_migration_state(name,state) VALUES ('schema', '{"version":20260930}')
ON CONFLICT (name) DO NOTHING;
