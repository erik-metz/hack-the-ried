-- 0. Ensure TimescaleDB Extension is enabled
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- 1. Metadata Table (Standard Postgres Table)
CREATE TABLE IF NOT EXISTS sensor_metadata (
    id VARCHAR(64) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    friendly_name VARCHAR(255) NOT NULL,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Idempotent migrations for existing installations
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'sensor_metadata' AND column_name = 'sensor_id'
    ) THEN
        ALTER TABLE sensor_metadata RENAME COLUMN sensor_id TO id;
    END IF;
END $$;

ALTER TABLE sensor_metadata ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
ALTER TABLE sensor_metadata ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE sensor_metadata ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE sensor_metadata ADD COLUMN IF NOT EXISTS firmware_version TEXT;
ALTER TABLE sensor_metadata ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 2. Time-Series Metrics Table
CREATE TABLE IF NOT EXISTS sensor_data (
    timestamp TIMESTAMPTZ NOT NULL,
    sensor_id VARCHAR(64) NOT NULL REFERENCES sensor_metadata(id),
    value DOUBLE PRECISION NOT NULL,
    unit VARCHAR(32) NOT NULL
);

-- 3. Convert sensor_data into a TimescaleDB Hypertable partitioned by time
SELECT create_hypertable('sensor_data', 'timestamp', if_not_exists => TRUE);

-- Create an index to speed up lookups by specific sensor over time
-- Ensure index exists for fast range queries per sensor
CREATE INDEX IF NOT EXISTS idx_sensor_data_composite 
ON sensor_data (sensor_id, timestamp DESC);

-- A station can publish multiple independently queryable measurements.
ALTER TABLE sensor_data ADD COLUMN IF NOT EXISTS metric VARCHAR(64) NOT NULL DEFAULT 'value';
CREATE INDEX IF NOT EXISTS idx_sensor_data_metric
ON sensor_data (sensor_id, metric, timestamp DESC);

-- Merge the legacy R498E RMS pseudo-station without losing its history.
-- Paired window timestamps identify historical PGV; unpaired samples retain
-- "value" because old raw waveform samples had no metric discriminator.
UPDATE sensor_data pgv SET metric = 'pgv'
WHERE pgv.sensor_id = 'shake-r498e' AND pgv.metric = 'value'
  AND EXISTS (
      SELECT 1 FROM sensor_data rms
      WHERE rms.sensor_id = 'shake-r498e-rms' AND rms.timestamp = pgv.timestamp
  );
UPDATE sensor_data SET sensor_id = 'shake-r498e', metric = 'rms'
WHERE sensor_id = 'shake-r498e-rms'
  AND EXISTS (SELECT 1 FROM sensor_metadata WHERE id = 'shake-r498e');
DELETE FROM sensor_metadata
WHERE id = 'shake-r498e-rms'
  AND EXISTS (SELECT 1 FROM sensor_metadata WHERE id = 'shake-r498e')
  AND NOT EXISTS (SELECT 1 FROM sensor_data WHERE sensor_id = 'shake-r498e-rms');

-- Published, versioned monthly export snapshots (UploadThing file keys stay private).
CREATE TABLE IF NOT EXISTS data_archives (
    month VARCHAR(10) PRIMARY KEY CHECK (month ~ '^[0-9]{4}(-(0[1-9]|1[0-2])|-Q[1-4])?$'),
    generated_at TIMESTAMPTZ NOT NULL,
    is_complete BOOLEAN NOT NULL,
    reading_count BIGINT NOT NULL CHECK (reading_count >= 0),
    size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
    station_ids TEXT[] NOT NULL,
    entity_ids TEXT[] NOT NULL DEFAULT '{}',
    format_version INTEGER NOT NULL DEFAULT 1,
    files JSONB NOT NULL
);

ALTER TABLE data_archives ADD COLUMN IF NOT EXISTS entity_ids TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE data_archives ADD COLUMN IF NOT EXISTS format_version INTEGER NOT NULL DEFAULT 1;

-- Smart City collector: scoped provenance/idempotency, without altering TTN/Shake.
CREATE TABLE IF NOT EXISTS smartcity_sources (
    sensor_id VARCHAR(64) PRIMARY KEY REFERENCES sensor_metadata(id) ON DELETE CASCADE,
    tenant VARCHAR(64) NOT NULL,
    entity_id TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    source_url TEXT NOT NULL,
    source_name TEXT NOT NULL,
    last_fetched_at TIMESTAMPTZ NOT NULL,
    UNIQUE (tenant, entity_id)
);

-- Mapping identity cannot silently change units or meaning between polls.
CREATE TABLE IF NOT EXISTS smartcity_metrics (
    sensor_id VARCHAR(64) NOT NULL REFERENCES smartcity_sources(sensor_id) ON DELETE CASCADE,
    metric VARCHAR(64) NOT NULL,
    attribute TEXT NOT NULL,
    unit VARCHAR(32) NOT NULL,
    PRIMARY KEY (sensor_id, metric),
    UNIQUE (sensor_id, attribute)
);

CREATE TABLE IF NOT EXISTS smartcity_observations (
    sensor_id VARCHAR(64) NOT NULL,
    metric VARCHAR(64) NOT NULL,
    observed_at TIMESTAMPTZ NOT NULL,
    value DOUBLE PRECISION NOT NULL,
    payload_hash TEXT NOT NULL,
    first_fetched_at TIMESTAMPTZ NOT NULL,
    last_fetched_at TIMESTAMPTZ NOT NULL,
    source_updated_at TIMESTAMPTZ,
    query_ids TEXT[] NOT NULL,
    revision INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (sensor_id, metric, observed_at),
    FOREIGN KEY (sensor_id, metric) REFERENCES smartcity_metrics(sensor_id, metric) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS smartcity_revisions (
    sensor_id VARCHAR(64) NOT NULL,
    metric VARCHAR(64) NOT NULL,
    observed_at TIMESTAMPTZ NOT NULL,
    revision INTEGER NOT NULL,
    previous_value DOUBLE PRECISION NOT NULL,
    previous_payload_hash TEXT NOT NULL,
    revised_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (sensor_id, metric, observed_at, revision),
    FOREIGN KEY (sensor_id, metric, observed_at)
        REFERENCES smartcity_observations(sensor_id, metric, observed_at) ON DELETE CASCADE
);

-- Map summaries read a small current-value table, never the full hypertable.
CREATE TABLE IF NOT EXISTS sensor_latest (
    sensor_id VARCHAR(64) NOT NULL REFERENCES sensor_metadata(id) ON DELETE CASCADE,
    metric VARCHAR(64) NOT NULL,
    unit VARCHAR(32) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    value DOUBLE PRECISION NOT NULL,
    PRIMARY KEY (sensor_id, metric, unit)
);

CREATE OR REPLACE FUNCTION maintain_sensor_latest() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND
        (OLD.sensor_id, OLD.metric, OLD.unit, OLD.timestamp) IS DISTINCT FROM
        (NEW.sensor_id, NEW.metric, NEW.unit, NEW.timestamp)) THEN
        DELETE FROM sensor_latest WHERE sensor_id = OLD.sensor_id AND metric = OLD.metric
            AND unit = OLD.unit AND timestamp = OLD.timestamp;
        IF FOUND THEN
            INSERT INTO sensor_latest (sensor_id, metric, unit, timestamp, value)
                SELECT sensor_id, metric, unit, timestamp, value FROM sensor_data
                WHERE sensor_id = OLD.sensor_id AND metric = OLD.metric AND unit = OLD.unit
                ORDER BY timestamp DESC LIMIT 1
            ON CONFLICT (sensor_id, metric, unit) DO UPDATE SET
                timestamp = EXCLUDED.timestamp, value = EXCLUDED.value
            WHERE sensor_latest.timestamp <= EXCLUDED.timestamp;
        END IF;
    END IF;
    IF TG_OP <> 'DELETE' THEN
        INSERT INTO sensor_latest (sensor_id, metric, unit, timestamp, value)
            VALUES (NEW.sensor_id, NEW.metric, NEW.unit, NEW.timestamp, NEW.value)
        ON CONFLICT (sensor_id, metric, unit) DO UPDATE SET
            timestamp = EXCLUDED.timestamp, value = EXCLUDED.value
        WHERE sensor_latest.timestamp <= EXCLUDED.timestamp;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER sensor_latest_changed
AFTER INSERT OR UPDATE OR DELETE ON sensor_data
FOR EACH ROW EXECUTE FUNCTION maintain_sensor_latest();

CREATE TABLE IF NOT EXISTS telemetry_schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
DO $$
BEGIN
    PERFORM pg_advisory_xact_lock(734219, 2);
    IF NOT EXISTS (SELECT 1 FROM telemetry_schema_migrations WHERE name = 'sensor_latest_v1') THEN
        INSERT INTO sensor_latest (sensor_id, metric, unit, timestamp, value)
            SELECT DISTINCT ON (sensor_id, metric, unit) sensor_id, metric, unit, timestamp, value
            FROM sensor_data ORDER BY sensor_id, metric, unit, timestamp DESC
        ON CONFLICT (sensor_id, metric, unit) DO UPDATE SET
            timestamp = EXCLUDED.timestamp, value = EXCLUDED.value
        WHERE sensor_latest.timestamp < EXCLUDED.timestamp;
        INSERT INTO telemetry_schema_migrations (name) VALUES ('sensor_latest_v1');
    END IF;
END $$;

-- 4. Rail Infrastructure & Bahnübergänge
CREATE TABLE IF NOT EXISTS rail_crossings (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    location_name VARCHAR(255) NOT NULL,
    street VARCHAR(255) NOT NULL,
    line VARCHAR(64) NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    crossing_type VARCHAR(64) NOT NULL DEFAULT 'road_barrier',
    note TEXT,
    daily_closure_count_avg INT NOT NULL DEFAULT 48,
    avg_closure_duration_sec INT NOT NULL DEFAULT 120,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rail_crossing_events (
    id BIGSERIAL PRIMARY KEY,
    crossing_id VARCHAR(64) NOT NULL REFERENCES rail_crossings(id) ON DELETE CASCADE,
    train_line VARCHAR(64),
    destination VARCHAR(128),
    closed_at TIMESTAMPTZ NOT NULL,
    opened_at TIMESTAMPTZ,
    duration_sec INT,
    source VARCHAR(64) DEFAULT 'schedule_prediction'
);

-- 5. Moving Trains Positioning (TimescaleDB Hypertable)
CREATE TABLE IF NOT EXISTS train_positions (
    timestamp TIMESTAMPTZ NOT NULL,
    train_id VARCHAR(64) NOT NULL,
    line VARCHAR(32) NOT NULL,
    origin VARCHAR(128),
    destination VARCHAR(128) NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    speed_kmh DOUBLE PRECISION NOT NULL,
    status VARCHAR(32) NOT NULL, -- 'moving' | 'stopped'
    station_id VARCHAR(64)       -- if stopped
);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
        PERFORM create_hypertable('train_positions', 'timestamp', if_not_exists => TRUE);
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_train_positions_id_time ON train_positions (train_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_train_positions_time ON train_positions (timestamp DESC);

-- 6. Seed the 4 Active Bahnübergänge in rail_crossings


-- 7. ZAKB Waste Collection & Refuse Fleet Telemetry
CREATE TABLE IF NOT EXISTS waste_facilities (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    facility_type VARCHAR(64) NOT NULL DEFAULT 'recycling_yard',
    municipality VARCHAR(64) NOT NULL,
    address VARCHAR(255) NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    accepted_fractions TEXT[] NOT NULL DEFAULT ARRAY['restmuell', 'biomuell', 'papier', 'gelber_sack', 'sperrmuell', 'schadstoffe'],
    opening_hours JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS waste_truck_fleet (
    id VARCHAR(64) PRIMARY KEY,
    license_plate VARCHAR(32) NOT NULL,
    vehicle_model VARCHAR(128) NOT NULL,
    assigned_fraction VARCHAR(32) NOT NULL,
    assigned_municipality VARCHAR(64) NOT NULL,
    capacity_m3 DOUBLE PRECISION DEFAULT 22.0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS waste_collection_calendar (
    id BIGSERIAL PRIMARY KEY,
    municipality VARCHAR(64) NOT NULL,
    district VARCHAR(64),
    street_name VARCHAR(255) NOT NULL,
    fraction VARCHAR(32) NOT NULL,
    collection_date DATE NOT NULL,
    expected_time_start TIME,
    expected_time_end TIME,
    tour_code VARCHAR(32),
    source VARCHAR(64) DEFAULT 'zakb_abfuhrkalender',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_waste_calendar_pickup UNIQUE (municipality, street_name, fraction, collection_date)
);
CREATE INDEX IF NOT EXISTS idx_waste_calendar_date ON waste_collection_calendar (collection_date);
CREATE INDEX IF NOT EXISTS idx_waste_calendar_street ON waste_collection_calendar (municipality, street_name);

CREATE TABLE IF NOT EXISTS waste_truck_positions (
    timestamp TIMESTAMPTZ NOT NULL,
    truck_id VARCHAR(64) NOT NULL REFERENCES waste_truck_fleet(id) ON DELETE CASCADE,
    tour_code VARCHAR(32) NOT NULL,
    fraction VARCHAR(32) NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    heading DOUBLE PRECISION,
    speed_kmh DOUBLE PRECISION NOT NULL,
    status VARCHAR(32) NOT NULL, -- 'collecting' | 'bin_emptying' | 'transit' | 'depot'
    current_street VARCHAR(255),
    next_street VARCHAR(255),
    load_percent INT,
    empty_countdown_sec INT,
    position_basis VARCHAR(64) NOT NULL DEFAULT 'model_prediction' -- 'model_prediction' | 'observed_gps' | 'crowdsourced'
);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
        PERFORM create_hypertable('waste_truck_positions', 'timestamp', if_not_exists => TRUE);
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_waste_truck_positions_id_time ON waste_truck_positions (truck_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_waste_truck_positions_time ON waste_truck_positions (timestamp DESC);

CREATE TABLE IF NOT EXISTS waste_collection_events (
    id BIGSERIAL PRIMARY KEY,
    truck_id VARCHAR(64) NOT NULL REFERENCES waste_truck_fleet(id) ON DELETE CASCADE,
    street_name VARCHAR(255) NOT NULL,
    municipality VARCHAR(64) NOT NULL,
    fraction VARCHAR(32) NOT NULL,
    dwell_started_at TIMESTAMPTZ NOT NULL,
    dwell_ended_at TIMESTAMPTZ,
    dwell_duration_sec INT,
    status VARCHAR(32) DEFAULT 'completed'
);
CREATE INDEX IF NOT EXISTS idx_waste_events_truck ON waste_collection_events (truck_id, dwell_started_at DESC);

-- Seed ZAKB Facilities


-- Seed ZAKB Fleet Vehicles


-- 8. Bus Infrastructure & VRN GTFS-RT Telemetry
CREATE TABLE IF NOT EXISTS bus_stops (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    municipality VARCHAR(64) NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    lines TEXT[] NOT NULL,
    is_school_stop BOOLEAN NOT NULL DEFAULT FALSE,
    nearby_school_name VARCHAR(255),
    is_train_hub BOOLEAN NOT NULL DEFAULT FALSE,
    direction VARCHAR(64),
    direction_label VARCHAR(128),
    platforms TEXT[] DEFAULT ARRAY['Steig 1'],
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE bus_stops ADD COLUMN IF NOT EXISTS direction VARCHAR(64);
ALTER TABLE bus_stops ADD COLUMN IF NOT EXISTS direction_label VARCHAR(128);

CREATE TABLE IF NOT EXISTS bus_lines (
    id VARCHAR(64) PRIMARY KEY,
    line_number VARCHAR(32) NOT NULL,
    operator VARCHAR(128) NOT NULL,
    route_name VARCHAR(255) NOT NULL,
    color VARCHAR(16) DEFAULT '#0284c7',
    is_school_line BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bus_positions (
    timestamp TIMESTAMPTZ NOT NULL,
    vehicle_id VARCHAR(64) NOT NULL,
    trip_id VARCHAR(64),
    line VARCHAR(32) NOT NULL,
    origin VARCHAR(128),
    destination VARCHAR(128) NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    heading DOUBLE PRECISION,
    speed_kmh DOUBLE PRECISION NOT NULL,
    status VARCHAR(32) NOT NULL, -- 'moving' | 'stopped'
    stop_id VARCHAR(64),
    is_school_bus BOOLEAN NOT NULL DEFAULT FALSE,
    delay_sec INT DEFAULT 0,
    position_basis VARCHAR(64) NOT NULL DEFAULT 'model_prediction' -- 'model_prediction' | 'vrn_gtfs_rt'
);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
        PERFORM create_hypertable('bus_positions', 'timestamp', if_not_exists => TRUE);
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_bus_positions_id_time ON bus_positions (vehicle_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_bus_positions_time ON bus_positions (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_bus_positions_line ON bus_positions (line, timestamp DESC);

-- Seed Ried Bus Lines


-- Seed Ried Bus Stops (Directional platforms for both sides of the street across all municipalities)


-- 8. VRNnextbike Sharing Infrastructure, Individual Bike Tracking & Trips
CREATE TABLE IF NOT EXISTS nextbike_sources (
    sensor_id VARCHAR(64) PRIMARY KEY REFERENCES sensor_metadata(id) ON DELETE CASCADE,
    station_uid BIGINT NOT NULL UNIQUE,
    station_number INTEGER,
    city_id INTEGER NOT NULL,
    city_name TEXT NOT NULL,
    spot BOOLEAN NOT NULL DEFAULT TRUE,
    terminal_type TEXT,
    bike_racks INTEGER NOT NULL DEFAULT 0,
    last_fetched_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS nextbike_bikes (
    bike_number VARCHAR(32) PRIMARY KEY,
    current_station_id VARCHAR(64) REFERENCES sensor_metadata(id) ON DELETE SET NULL,
    current_station_name TEXT,
    bike_type INTEGER,
    electric_lock BOOLEAN DEFAULT TRUE,
    pedelec_battery INTEGER,
    state TEXT DEFAULT 'ok',
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    last_seen_at TIMESTAMPTZ NOT NULL,
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS nextbike_trips (
    id BIGSERIAL PRIMARY KEY,
    bike_number VARCHAR(32) NOT NULL,
    start_station_id VARCHAR(64) REFERENCES sensor_metadata(id) ON DELETE SET NULL,
    start_station_name TEXT,
    end_station_id VARCHAR(64) REFERENCES sensor_metadata(id) ON DELETE SET NULL,
    end_station_name TEXT,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    duration_seconds INTEGER,
    distance_meters DOUBLE PRECISION
);

CREATE INDEX IF NOT EXISTS idx_nextbike_trips_bike ON nextbike_trips(bike_number, end_time DESC);
CREATE INDEX IF NOT EXISTS idx_nextbike_trips_end_time ON nextbike_trips(end_time DESC);

CREATE TABLE IF NOT EXISTS nextbike_observations (
    sensor_id VARCHAR(64) NOT NULL,
    metric VARCHAR(64) NOT NULL,
    observed_at TIMESTAMPTZ NOT NULL,
    value DOUBLE PRECISION NOT NULL,
    bike_numbers TEXT[],
    first_fetched_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (sensor_id, metric, observed_at)
);

-- 8. Traffic Jam (Stau) Tracking for Autobahnen (A67, A5, A6) & Bundesstraßen (B47, B44)
CREATE TABLE IF NOT EXISTS traffic_incidents (
    id VARCHAR(128) PRIMARY KEY,
    road_name VARCHAR(32) NOT NULL,
    direction VARCHAR(128) NOT NULL,
    location_from VARCHAR(128) NOT NULL,
    location_to VARCHAR(128) NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ,
    last_seen_at TIMESTAMPTZ NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    delay_seconds INT NOT NULL DEFAULT 0,
    length_meters INT NOT NULL DEFAULT 0,
    severity VARCHAR(32) NOT NULL DEFAULT 'moderate',
    cause_type VARCHAR(64) NOT NULL DEFAULT 'congestion',
    description TEXT,
    coordinates JSONB,
    source VARCHAR(64) NOT NULL DEFAULT 'autobahn_api',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_traffic_active ON traffic_incidents (is_active, road_name);
-- Provider direction/location labels exceed 128 characters; preserve them intact.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_schema=current_schema() AND table_name='traffic_incidents'
          AND column_name IN ('direction','location_from','location_to') AND data_type != 'text') THEN
        ALTER TABLE traffic_incidents
            ALTER COLUMN direction TYPE TEXT,
            ALTER COLUMN location_from TYPE TEXT,
            ALTER COLUMN location_to TYPE TEXT;
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_traffic_time_window ON traffic_incidents (start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_traffic_road_active ON traffic_incidents (road_name, is_active);

-- Hypertable for periodic corridor congestion snapshots (enables air quality / noise correlation)
CREATE TABLE IF NOT EXISTS traffic_corridor_snapshots (
    timestamp TIMESTAMPTZ NOT NULL,
    corridor_id VARCHAR(32) NOT NULL,
    road_name VARCHAR(32) NOT NULL,
    status VARCHAR(32) NOT NULL,
    delay_seconds INT NOT NULL DEFAULT 0,
    active_incidents_count INT NOT NULL DEFAULT 0,
    max_length_meters INT NOT NULL DEFAULT 0
);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
        PERFORM create_hypertable('traffic_corridor_snapshots', 'timestamp', if_not_exists => TRUE);
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_traffic_corridor_snapshots ON traffic_corridor_snapshots (corridor_id, timestamp DESC);


ALTER TABLE nextbike_bikes ADD COLUMN IF NOT EXISTS fresh_until TIMESTAMPTZ;

-- Collector migration 20260916: replay receipts and explicit source provenance.
CREATE TABLE IF NOT EXISTS telemetry_ingest_batches (
    batch_id VARCHAR(128) PRIMARY KEY,
    payload_hash VARCHAR(64) NOT NULL,
    committed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE traffic_incidents ADD COLUMN IF NOT EXISTS delay_kind TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE traffic_incidents ADD COLUMN IF NOT EXISTS source_category TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE nextbike_trips ADD COLUMN IF NOT EXISTS evidence TEXT NOT NULL DEFAULT 'inferred_station_change';

-- Old artifact keys are queued in the same transaction that replaces the catalogue.
CREATE TABLE IF NOT EXISTS archive_cleanup (
    key TEXT PRIMARY KEY,
    queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS collector_schema_versions (
    version INTEGER PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO collector_schema_versions(version) VALUES (20260916) ON CONFLICT DO NOTHING;

-- 9. Road Closures (Straßensperrungen) for the Ried Area (Lampertheim, Bürstadt, Biblis, Groß-Rohrheim, etc.)
CREATE TABLE IF NOT EXISTS street_closures (
    id VARCHAR(128) PRIMARY KEY,
    municipality VARCHAR(64) NOT NULL,
    district VARCHAR(64),
    street_name VARCHAR(128) NOT NULL,
    location_from VARCHAR(128),
    location_to VARCHAR(128),
    closure_type VARCHAR(32) NOT NULL DEFAULT 'full',
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    reason VARCHAR(255),
    description TEXT,
    detour TEXT,
    coordinates JSONB,
    source VARCHAR(64) NOT NULL DEFAULT 'hessen_mobil',
    source_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_closures_active_status ON street_closures (is_active, status);
CREATE INDEX IF NOT EXISTS idx_closures_time_window ON street_closures (start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_closures_municipality ON street_closures (municipality, district);

INSERT INTO street_closures (
    id, municipality, district, street_name, location_from, location_to,
    closure_type, status, start_time, end_time, is_active,
    reason, description, detour, coordinates, source, source_url
) VALUES
('closure-lampertheim-in-den-gaerten', 'Lampertheim', 'Kernstadt', 'In den Gärten', 'Bubengasse', 'Bruchgasse (Nr. 111–117)', 'full', 'active', '2026-09-16T06:00:00Z', '2026-10-23T18:00:00Z', TRUE, 'Erneuerung der Fahrbahndecke', 'Vollsperrung für den motorisierten Durchgangsverkehr. Zufahrt bis zur Baustelle frei.', 'Örtliche Umleitung über Römerstraße und Bürstädter Straße ausgeschildert.', '[[49.5958, 8.4705], [49.5962, 8.4715], [49.5966, 8.4728]]'::jsonb, 'Stadt Lampertheim', 'https://www.lampertheim.de'),
('closure-lampertheim-hospitalstr', 'Lampertheim', 'Kernstadt', 'Hospitalstraße', 'Eugen-Schreiber-Straße', 'Carl-Ulrich-Straße', 'full', 'active', '2026-09-16T07:00:00Z', '2026-10-26T18:00:00Z', TRUE, 'Straßeneinbruch / Kanalreparatur', 'Vollsperrung auf Höhe Hausnummer 47 nach Straßeneinbruch zur Gefahrenabwehr.', 'Umleitung über die Parkstraße und Carl-Ulrich-Straße eingerichtet.', '[[49.5928, 8.4678], [49.5934, 8.4682], [49.5940, 8.4687]]'::jsonb, 'Stadt Lampertheim', 'https://www.lampertheim.de'),
('closure-huettenfeld-kreisel-l3110', 'Lampertheim', 'Hüttenfeld', 'L 3110 / L 3111 (Kreisverkehr)', 'Zufahrt Viernheim', 'Zufahrt Lorsch / Hüttenfeld', 'partial', 'active', '2026-09-21T06:00:00Z', '2027-05-30T18:00:00Z', TRUE, 'Grundhafte Instandsetzung Kreisverkehrsplatz', 'Geplante Bauarbeiten im süd-westlichen Bereich. Verkehrsregelung über Baustellenampel mit Wartezeiten.', 'Einspurige Verkehrsführung über Lichtsignalanlage. Großräumige Umleitung für LKW über A67.', '[[49.5975, 8.5865], [49.5985, 8.5878], [49.5995, 8.5890]]'::jsonb, 'Hessen Mobil', 'https://mobil.hessen.de'),
('closure-rosengarten-wehrzollhaus-b47', 'Lampertheim', 'Rosengarten', 'B 47 (Wehrzollhaus / Rheinbrücke Ost)', 'Wehrzollhaus', 'Rheinbrücke Worms Ostrampe', 'partial', 'active', '2026-09-08T05:00:00Z', '2026-10-15T20:00:00Z', TRUE, 'Fahrbahnübergang & Brückensanierung', 'Verengte Fahrstreifen im Bereich Wehrzollhaus / Rosengarten. Tempo 50.', 'Zweispurige Behelfsführung, Umleitung für Großraumtransporte über A6 Rheinbrücke.', '[[49.6318, 8.3610], [49.6335, 8.3742], [49.6358, 8.3880]]'::jsonb, 'Hessen Mobil', 'https://verkehrsservice.hessen.de'),
('closure-hofheim-bensheimer-str', 'Lampertheim', 'Hofheim', 'Bensheimer Straße', 'Kirchstraße', 'Bahnhofstraße', 'partial', 'active', '2026-09-01T07:00:00Z', '2026-10-31T17:00:00Z', TRUE, 'Kabelverlegung Stromtrasse', 'Halbseitige Sperrung des 2. Bauabschnitts mit wandernder Baustelle.', 'Vorbeifahrt an der Arbeitsstelle mittels Gegenverkehrsregelung.', '[[49.6405, 8.4080], [49.6415, 8.4110], [49.6425, 8.4140]]'::jsonb, 'Stadt Lampertheim', 'https://www.lampertheim.de'),
('closure-buerstadt-mainstrasse', 'Bürstadt', 'Kernstadt', 'Mainstraße', 'Nibelungenstraße', 'Wilhelminenstraße', 'full', 'active', '2026-09-25T20:00:00Z', '2026-10-28T05:00:00Z', TRUE, 'Gleis- und Schrankenanlagen-Erneuerung', 'Vollständige Wochenendsperrung des Bahnübergangs Bürstadt Mitte für Kfz und Radfahrer.', 'Umleitung über B47 Ortsumgehung und Boxheimerhof.', '[[49.6425, 8.4518], [49.6432, 8.4525], [49.6440, 8.4532]]'::jsonb, 'Stadt Bürstadt', 'https://www.buerstadt.de'),
('closure-bobstadt-frankenstr', 'Bürstadt', 'Bobstadt', 'Frankenstraße', 'B44 Einmündung', 'St.-Josef-Straße', 'full', 'active', '2026-09-10T06:30:00Z', '2026-10-30T18:00:00Z', TRUE, 'Nahwärmeanschluss & Tiefbau', 'Vollsperrung des Kreuzungsbereichs. Anlieger bis Baustelle frei.', 'Umleitung über Bensheimer Straße und B44.', '[[49.6602, 8.4495], [49.6610, 8.4505], [49.6618, 8.4515]]'::jsonb, 'Stadt Bürstadt', 'https://www.buerstadt.de'),
('closure-nordheim-steiner-wald', 'Biblis', 'Nordheim', 'L 3261 (Nordheimer Straße)', 'Nordheim Ortsausgang', 'Hofheim Kreuzung', 'full', 'active', '2026-09-05T06:00:00Z', '2026-10-20T19:00:00Z', TRUE, 'Deckenerneuerung & Baumfällarbeiten zur Verkehrssicherung', 'Vollsperrung der Landstraße durch den Steiner Wald zwischen Nordheim und Hofheim.', 'Großräumige Umleitung über B44 (Groß-Rohrheim / Bürstadt) und B47.', '[[49.6800, 8.3980], [49.6690, 8.4120], [49.6550, 8.4210]]'::jsonb, 'Hessen Mobil', 'https://mobil.hessen.de'),
('closure-wattenheim-rheinstr', 'Biblis', 'Wattenheim', 'Rheinstraße (K 64)', 'Ortsmitte Wattenheim', 'Rheindeich', 'partial', 'active', '2026-09-12T07:00:00Z', '2026-10-15T17:00:00Z', TRUE, 'Deichsicherungsmaßnahmen & Böschungsbefestigung', 'Halbseitige Sperrung für landwirtschaftliche Fahrzeuge und Radverkehr zugänglich.', 'Verkehrsregelung über Vorfahrtsbeschilderung.', '[[49.7010, 8.4010], [49.7025, 8.3950], [49.7040, 8.3900]]'::jsonb, 'Gemeinde Biblis', 'https://www.biblis.eu'),
('closure-gross-rohrheim-siemensstr', 'Groß-Rohrheim', 'Kernort', 'Werner-von-Siemens-Straße', 'B44 Anschlussstelle', 'Gewerbegebiet Nord', 'full', 'active', '2026-09-28T06:00:00Z', '2026-10-28T18:00:00Z', TRUE, 'Asphaltierungsarbeiten und Radweganbindung', 'Geplante Vollsperrung des Zubringers. Zufahrt zum Gewerbegebiet über Rheinstraße.', 'Ausgeschilderte Umleitung über L3111 und Rheinstraße.', '[[49.7180, 8.4650], [49.7210, 8.4680], [49.7240, 8.4710]]'::jsonb, 'Gemeinde Groß-Rohrheim', 'https://www.gross-rohrheim.de')
ON CONFLICT (id) DO NOTHING;

INSERT INTO collector_schema_versions(version) VALUES (20260917) ON CONFLICT DO NOTHING;

-- 10. People, Demographics, Commuters & Educational Infrastructure
CREATE TABLE IF NOT EXISTS municipalities (
    id VARCHAR(64) PRIMARY KEY,
    ags VARCHAR(8) NOT NULL UNIQUE,
    name VARCHAR(128) NOT NULL,
    county VARCHAR(128) NOT NULL DEFAULT 'Kreis Bergstraße',
    state VARCHAR(64) NOT NULL DEFAULT 'Hessen',
    area_sqkm DOUBLE PRECISION NOT NULL,
    center_lat DOUBLE PRECISION NOT NULL,
    center_lng DOUBLE PRECISION NOT NULL,
    boundary_geojson JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS demographic_snapshots (
    id BIGSERIAL PRIMARY KEY,
    municipality_id VARCHAR(64) NOT NULL REFERENCES municipalities(id) ON DELETE CASCADE,
    year INT NOT NULL,
    category VARCHAR(64) NOT NULL,
    metric VARCHAR(64) NOT NULL,
    value DOUBLE PRECISION NOT NULL,
    unit VARCHAR(32) NOT NULL DEFAULT 'count',
    dimension VARCHAR(64) NOT NULL DEFAULT 'total',
    source VARCHAR(128) NOT NULL DEFAULT 'hessisches_statistisches_landesamt',
    source_url TEXT,
    recorded_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_demographic_snapshot UNIQUE (municipality_id, year, category, metric, dimension)
);

CREATE INDEX IF NOT EXISTS idx_demographics_lookup ON demographic_snapshots (municipality_id, year, category);
CREATE INDEX IF NOT EXISTS idx_demographics_metric ON demographic_snapshots (metric, year);

CREATE TABLE IF NOT EXISTS commuter_flows (
    id BIGSERIAL PRIMARY KEY,
    year INT NOT NULL,
    home_municipality_id VARCHAR(64) NOT NULL REFERENCES municipalities(id) ON DELETE CASCADE,
    partner_ags VARCHAR(8) NOT NULL,
    partner_name VARCHAR(128) NOT NULL,
    direction VARCHAR(16) NOT NULL, -- 'outbound' (Auspendler) | 'inbound' (Einpendler)
    commuter_count INT NOT NULL,
    source VARCHAR(128) NOT NULL DEFAULT 'bundesagentur_fuer_arbeit_pendleratlas',
    recorded_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_commuter_flow UNIQUE (year, home_municipality_id, partner_ags, direction)
);

CREATE INDEX IF NOT EXISTS idx_commuter_flows_query ON commuter_flows (home_municipality_id, year, direction);

CREATE TABLE IF NOT EXISTS educational_facilities (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    facility_type VARCHAR(64) NOT NULL, -- 'kita', 'krippe', 'grundschule', 'gesamtschule', 'gymnasium', 'foerderschule'
    municipality_id VARCHAR(64) NOT NULL REFERENCES municipalities(id) ON DELETE CASCADE,
    district VARCHAR(64),
    address VARCHAR(255) NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    operator VARCHAR(128) NOT NULL, -- 'stadt_buerstadt', 'stadt_lampertheim', 'kreis_bergstrasse', 'kirche', 'freier_traeger'
    operator_name VARCHAR(255),
    capacity INT,
    current_enrollment INT,
    min_age_years INT,
    max_age_years INT,
    opening_hours VARCHAR(255),
    website_url TEXT,
    reporting_year INT NOT NULL DEFAULT 2025,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_edu_municipality ON educational_facilities (municipality_id, facility_type);

-- Seed Ried Municipalities


-- Seed Baseline Demographic Snapshots (Hessisches Statistisches Landesamt / HSL)


-- Seed Key Commuter Patterns (Bundesagentur für Arbeit - Pendleratlas)


-- Seed Educational & Childcare Infrastructure (Schools & Kindergartens)


INSERT INTO collector_schema_versions(version) VALUES (20260918) ON CONFLICT DO NOTHING;

-- 11. Infrastructure, Energy & Connectivity (Straßenzustandsmonitoring, ZAKB Energy, Broadband, EV Charging, Wi-Fi)

-- 11.1 Road Condition / Street Quality (Straßenzustandsmonitoring Kreis Bergstraße / ZAKB Fleet AI)
CREATE TABLE IF NOT EXISTS road_condition_segments (
    id VARCHAR(64) PRIMARY KEY,
    road_name VARCHAR(128) NOT NULL,
    road_class VARCHAR(32) NOT NULL,
    municipality VARCHAR(64) NOT NULL,
    district VARCHAR(64),
    condition_grade DOUBLE PRECISION NOT NULL,
    condition_category VARCHAR(32) NOT NULL,
    potholes_count INT NOT NULL DEFAULT 0,
    cracking_severity VARCHAR(32) DEFAULT 'none',
    surface_type VARCHAR(64) DEFAULT 'asphalt',
    last_inspected_at TIMESTAMPTZ NOT NULL,
    inspected_by VARCHAR(64) DEFAULT 'zakb_fleet_ai',
    coordinates JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_road_cond_muni ON road_condition_segments (municipality, condition_category);
CREATE INDEX IF NOT EXISTS idx_road_cond_grade ON road_condition_segments (condition_grade);

-- 11.2 Renewable Energy Facilities & Generation Telemetry
CREATE TABLE IF NOT EXISTS energy_facilities (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    facility_type VARCHAR(32) NOT NULL,
    operator VARCHAR(128) NOT NULL,
    municipality VARCHAR(64) NOT NULL,
    address VARCHAR(255),
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    installed_capacity_kw DOUBLE PRECISION NOT NULL,
    annual_generation_mwh_est DOUBLE PRECISION,
    commissioned_date DATE,
    mastr_id VARCHAR(64),
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS energy_production_readings (
    timestamp TIMESTAMPTZ NOT NULL,
    facility_id VARCHAR(64) NOT NULL REFERENCES energy_facilities(id) ON DELETE CASCADE,
    current_power_kw DOUBLE PRECISION NOT NULL,
    energy_today_kwh DOUBLE PRECISION,
    total_energy_mwh DOUBLE PRECISION,
    co2_saved_today_kg DOUBLE PRECISION,
    source VARCHAR(64) NOT NULL DEFAULT 'zakb_telemetry'
);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
        PERFORM create_hypertable('energy_production_readings', 'timestamp', if_not_exists => TRUE);
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_energy_readings_fac_time ON energy_production_readings (facility_id, timestamp DESC);

-- 11.3 Broadband & Fibre Rollout (Breitbandausbau / Gigabit-Grundbuch)
CREATE TABLE IF NOT EXISTS broadband_coverage (
    id VARCHAR(64) PRIMARY KEY,
    municipality VARCHAR(64) NOT NULL,
    district VARCHAR(64) NOT NULL,
    area_name VARCHAR(128) NOT NULL,
    tech_type VARCHAR(32) NOT NULL,
    max_download_mbps INT NOT NULL,
    max_upload_mbps INT NOT NULL,
    rollout_status VARCHAR(32) NOT NULL,
    contract_quota_pct DOUBLE PRECISION,
    primary_provider VARCHAR(128) NOT NULL,
    completion_target_date DATE,
    coordinates JSONB,
    source VARCHAR(64) DEFAULT 'bmdv_gigabit_grundbuch',
    last_updated TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_broadband_muni_status ON broadband_coverage (municipality, rollout_status);

-- 11.4 EV Charging Infrastructure & Live Utilisation (BNetzA Ladesäulenregister & OCPI)
CREATE TABLE IF NOT EXISTS ev_charging_stations (
    id VARCHAR(64) PRIMARY KEY,
    bnetza_id VARCHAR(64),
    name VARCHAR(255) NOT NULL,
    operator VARCHAR(128) NOT NULL,
    address VARCHAR(255) NOT NULL,
    municipality VARCHAR(64) NOT NULL,
    district VARCHAR(64),
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    total_points INT NOT NULL DEFAULT 2,
    max_power_kw DOUBLE PRECISION NOT NULL,
    is_fast_charger BOOLEAN NOT NULL DEFAULT FALSE,
    connector_types TEXT[] NOT NULL DEFAULT ARRAY['Type2'],
    pricing_info TEXT,
    is_public BOOLEAN NOT NULL DEFAULT TRUE,
    access_hours VARCHAR(64) DEFAULT '24/7',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ev_charging_status (
    station_id VARCHAR(64) PRIMARY KEY REFERENCES ev_charging_stations(id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ NOT NULL,
    available_points INT NOT NULL,
    occupied_points INT NOT NULL,
    out_of_service_points INT NOT NULL DEFAULT 0,
    status_source VARCHAR(64) NOT NULL DEFAULT 'live_ocpi'
);

-- 11.5 Public Wi-Fi Hotspots (Hessen-WLAN, Freifunk, etc.)
CREATE TABLE IF NOT EXISTS public_wifi_hotspots (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    ssid VARCHAR(64) NOT NULL,
    operator VARCHAR(128) NOT NULL,
    location_type VARCHAR(64) NOT NULL,
    address VARCHAR(255) NOT NULL,
    municipality VARCHAR(64) NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    indoor_outdoor VARCHAR(16) DEFAULT 'outdoor',
    auth_mode VARCHAR(64) DEFAULT 'captive_terms_only',
    bandwidth_mbps INT DEFAULT 50,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wifi_muni ON public_wifi_hotspots (municipality, is_active);

-- Seed Baseline Data for Infrastructure & Energy


INSERT INTO collector_schema_versions(version) VALUES (20260919) ON CONFLICT DO NOTHING;

-- 13. Environment & Agriculture for the Hessisches Ried
CREATE TABLE IF NOT EXISTS nature_protected_areas (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    designation VARCHAR(32) NOT NULL, -- 'nsg' (Naturschutzgebiet), 'ffh', 'spa' (Vogelschutz), 'lsg', 'wsg' (Wasserschutz)
    municipality VARCHAR(64) NOT NULL,
    area_hectares DOUBLE PRECISION,
    legal_ordinance_year INT,
    conservation_aims TEXT,
    visiting_rules JSONB,
    geojson JSONB NOT NULL,
    source VARCHAR(64) NOT NULL DEFAULT 'hlnug_natureg',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_nature_areas_municipality ON nature_protected_areas (municipality);
CREATE INDEX IF NOT EXISTS idx_nature_areas_designation ON nature_protected_areas (designation);

CREATE TABLE IF NOT EXISTS agriculture_crop_zones (
    id VARCHAR(64) PRIMARY KEY,
    municipality VARCHAR(64) NOT NULL,
    crop_name VARCHAR(128) NOT NULL,
    crop_family VARCHAR(64) NOT NULL, -- 'sonderkultur', 'gemuese', 'getreide', 'oelfrucht', 'brache'
    year INT NOT NULL,
    area_hectares DOUBLE PRECISION,
    irrigation_demand_class VARCHAR(16) DEFAULT 'medium', -- 'low', 'medium', 'high'
    geojson JSONB NOT NULL,
    source VARCHAR(64) DEFAULT 'invekos_hessen',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agri_crop_year ON agriculture_crop_zones (year, municipality);

CREATE TABLE IF NOT EXISTS agriculture_municipal_stats (
    municipality VARCHAR(64) NOT NULL,
    year INT NOT NULL,
    crop_family VARCHAR(64) NOT NULL,
    crop_name VARCHAR(128) NOT NULL,
    area_hectares DOUBLE PRECISION NOT NULL,
    percentage_of_agricultural_land DOUBLE PRECISION NOT NULL,
    PRIMARY KEY (municipality, year, crop_name)
);

CREATE TABLE IF NOT EXISTS flood_infrastructure (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    infrastructure_type VARCHAR(64) NOT NULL, -- 'polder', 'dike', 'pumping_station', 'weir', 'flood_gate'
    water_body VARCHAR(64) NOT NULL, -- 'Rhein', 'Weschnitz', 'Landgraben'
    municipality VARCHAR(64) NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    protection_level VARCHAR(32) DEFAULT 'HQ100',
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS flood_gauges (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    water_body VARCHAR(64) NOT NULL,
    municipality VARCHAR(64) NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    current_level_m DOUBLE PRECISION NOT NULL,
    discharge_m3_s DOUBLE PRECISION,
    alarm_level_1_m DOUBLE PRECISION NOT NULL,
    alarm_level_2_m DOUBLE PRECISION NOT NULL,
    alarm_level_3_m DOUBLE PRECISION NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'normal', -- 'normal' | 'stage_1' | 'stage_2' | 'stage_3'
    source VARCHAR(64) NOT NULL DEFAULT 'pegelonline_wsv',
    source_station_id VARCHAR(64),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS noise_corridors (
    id VARCHAR(128) PRIMARY KEY,
    corridor_type VARCHAR(32) NOT NULL, -- 'rail_riedbahn', 'road_a67', 'road_a5', 'road_b47', 'road_b44'
    name VARCHAR(255) NOT NULL,
    noise_metric VARCHAR(16) NOT NULL, -- 'Lden' | 'Lnight'
    db_band VARCHAR(16) NOT NULL, -- '55-60', '60-65', '65-70', '>70'
    geojson JSONB NOT NULL,
    source VARCHAR(64) NOT NULL DEFAULT 'eba_noise_mapping',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS environmental_map_services (
    id VARCHAR(64) PRIMARY KEY,
    title VARCHAR(128) NOT NULL,
    category VARCHAR(32) NOT NULL, -- 'starkregen', 'flood_risk', 'groundwater', 'protected_areas'
    service_type VARCHAR(16) NOT NULL DEFAULT 'WMS',
    wms_url TEXT NOT NULL,
    layer_name TEXT NOT NULL,
    legend_url TEXT,
    attribution TEXT NOT NULL,
    default_opacity DOUBLE PRECISION DEFAULT 0.65,
    min_zoom INT DEFAULT 10,
    max_zoom INT DEFAULT 19,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- Seed Nature Protected Areas


-- Seed Agricultural Municipal Statistics (Hessisches Ried: Gemüsegarten Hessens)


-- Seed Sample Representative Crop Zones (Parcels for Zoom >= 13)


-- Seed Flood Gauges & Infrastructure


-- Seed Strategic Noise Corridors (Riedbahn & A67)


-- Seed Environmental WMS Tile Services (BKG & Geoportal Hessen)


CREATE TABLE IF NOT EXISTS groundwater_stations (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    municipality VARCHAR(64) NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    depth_to_water_m DOUBLE PRECISION,
    nitrate_mg_l DOUBLE PRECISION,
    measured_at TIMESTAMPTZ,
    hlnug_station_no VARCHAR(32),
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed Groundwater Monitoring Wells


INSERT INTO collector_schema_versions(version) VALUES (20260920) ON CONFLICT DO NOTHING;

-- 14. Social & Daily Life for the Hessisches Ried
-- Covers Unemployment & SGB II, Healthcare Density & Facilities, Cultural & Sports Associations, ZAKB Waste & Recycling, and Tourism.

CREATE TABLE IF NOT EXISTS municipal_statistics (
    id BIGSERIAL PRIMARY KEY,
    municipality VARCHAR(64) NOT NULL, -- 'Bürstadt', 'Lampertheim', 'Biblis', 'Groß-Rohrheim', 'Kreis Bergstraße', 'Hessen'
    category VARCHAR(64) NOT NULL,     -- 'employment', 'social', 'healthcare_density', 'associations', 'tourism'
    metric_key VARCHAR(64) NOT NULL,   -- 'unemployment_rate', 'sgb2_recipients', 'doctors_per_10k', 'total_clubs', 'tourist_overnights'
    period VARCHAR(32) NOT NULL,       -- '2024', '2025', '2026-Q2', etc.
    period_date DATE NOT NULL,
    value DOUBLE PRECISION NOT NULL,
    unit VARCHAR(32) NOT NULL,         -- '%', 'count', 'per_10k', 'days'
    benchmark_value DOUBLE PRECISION,  -- Reference value (e.g. Hessen average)
    dimension VARCHAR(64) NOT NULL DEFAULT 'total',
    source VARCHAR(128) NOT NULL,      -- 'Bundesagentur für Arbeit', 'Hessisches Statistisches Landesamt', etc.
    source_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_municipal_metric_period UNIQUE (municipality, metric_key, period, dimension)
);

CREATE INDEX IF NOT EXISTS idx_muni_stats_lookup ON municipal_statistics (municipality, category, period_date DESC);
CREATE INDEX IF NOT EXISTS idx_muni_stats_category ON municipal_statistics (category, period_date DESC);

CREATE TABLE IF NOT EXISTS zakb_waste_statistics (
    id BIGSERIAL PRIMARY KEY,
    municipality VARCHAR(64) NOT NULL, -- 'Bürstadt', 'Lampertheim', 'Kreis Bergstraße'
    year INT NOT NULL,
    fraction VARCHAR(32) NOT NULL,     -- 'restmuell', 'biomuell', 'papier', 'wertstoffe', 'sperrmuell', 'schadstoffe', 'total'
    weight_tons DOUBLE PRECISION NOT NULL,
    kg_per_capita DOUBLE PRECISION NOT NULL,
    recycling_rate_percent DOUBLE PRECISION,
    source VARCHAR(128) DEFAULT 'ZAKB Jahresbericht & HLNUG',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_zakb_waste_stat UNIQUE (municipality, year, fraction)
);

CREATE INDEX IF NOT EXISTS idx_zakb_waste_stats_lookup ON zakb_waste_statistics (municipality, year DESC);

CREATE TABLE IF NOT EXISTS regional_facilities (
    id VARCHAR(128) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(64) NOT NULL,      -- 'healthcare', 'culture_sports', 'tourism'
    facility_type VARCHAR(64) NOT NULL, -- 'pharmacy', 'doctor_gp', 'doctor_specialist', 'sports_complex', 'culture_center', 'attraction'
    municipality VARCHAR(64) NOT NULL,
    district VARCHAR(64),
    street_address VARCHAR(255) NOT NULL,
    postal_code VARCHAR(16) NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    phone VARCHAR(64),
    website TEXT,
    description TEXT,
    opening_hours JSONB,
    extra_attributes JSONB,             -- e.g. {"specialty": "Allgemeinmedizin", "emergency_duty": false}
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_facilities_category ON regional_facilities (category, facility_type);
CREATE INDEX IF NOT EXISTS idx_facilities_muni ON regional_facilities (municipality);

CREATE TABLE IF NOT EXISTS cultural_events (
    id VARCHAR(128) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    organizer VARCHAR(255) NOT NULL,
    venue_id VARCHAR(128) REFERENCES regional_facilities(id) ON DELETE SET NULL,
    venue_name VARCHAR(255) NOT NULL,
    municipality VARCHAR(64) NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ,
    category VARCHAR(64) NOT NULL,     -- 'concert', 'exhibition', 'workshop', 'festival', 'sports', 'civic', 'market', 'theater'
    description TEXT,
    ticket_url TEXT,
    event_url TEXT,
    image_url TEXT,
    street_address TEXT,
    postal_code VARCHAR(16),
    status VARCHAR(32) DEFAULT 'scheduled', -- 'scheduled', 'cancelled', 'postponed', 'past'
    is_free BOOLEAN DEFAULT FALSE,
    is_archived BOOLEAN DEFAULT FALSE,
    source VARCHAR(64) DEFAULT 'kamue_events',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Idempotent column migrations for existing databases
ALTER TABLE cultural_events ADD COLUMN IF NOT EXISTS event_url TEXT;
ALTER TABLE cultural_events ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE cultural_events ADD COLUMN IF NOT EXISTS street_address TEXT;
ALTER TABLE cultural_events ADD COLUMN IF NOT EXISTS postal_code VARCHAR(16);
ALTER TABLE cultural_events ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE cultural_events ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
ALTER TABLE cultural_events ADD COLUMN IF NOT EXISTS status VARCHAR(32) DEFAULT 'scheduled';
ALTER TABLE cultural_events ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE;
ALTER TABLE cultural_events ADD COLUMN IF NOT EXISTS expected_visitors INTEGER;
ALTER TABLE cultural_events ADD COLUMN IF NOT EXISTS source VARCHAR(64) DEFAULT 'kamue_events';
ALTER TABLE cultural_events ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_events_time ON cultural_events (start_time ASC);
CREATE INDEX IF NOT EXISTS idx_events_muni_start ON cultural_events (municipality, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_events_source ON cultural_events (source);
CREATE INDEX IF NOT EXISTS idx_events_status ON cultural_events (status);
CREATE INDEX IF NOT EXISTS idx_events_category ON cultural_events (category);
CREATE INDEX IF NOT EXISTS idx_events_geo ON cultural_events (latitude, longitude);

-- Seed Municipal Social Statistics (Unemployment, SGB II, Healthcare Density, Associations, Tourism)


-- Seed ZAKB Waste Volumes & Recycling Rates (Zweckverband Abfallwirtschaft Kreis Bergstraße)


-- Seed Regional Facilities (Healthcare, Culture & Sports, Tourism Attractions)


-- Seed Cultural & Community Events (Authentic Ried Events & KAMÜ Spotlight)


INSERT INTO collector_schema_versions(version) VALUES (20260921) ON CONFLICT DO NOTHING;

-- ============================================================================
-- 15. Real Estate, Buildings, Land Use & Housing Stock for the Hessisches Ried
-- Covers Housing Stock & Age (Zensus 2022), Land Values (BORIS Hessen),
-- Land Use (ALKIS/ATKIS), Construction Permits & Completions (Statistik Hessen),
-- Market Benchmarks (Gutachterausschuss Bergstraße) and Development Plans (Bau-Pläne).
-- ============================================================================

CREATE TABLE IF NOT EXISTS realestate_sources (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    provider VARCHAR(255) NOT NULL,
    dataset_type VARCHAR(64) NOT NULL,
    license VARCHAR(64) NOT NULL DEFAULT 'dl-zero-de/2.0',
    source_url TEXT,
    last_imported_at TIMESTAMPTZ,
    record_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS housing_stock_stats (
    id VARCHAR(128) PRIMARY KEY,
    municipality VARCHAR(64) NOT NULL,
    district VARCHAR(64),
    reference_year INTEGER NOT NULL,
    total_buildings INTEGER NOT NULL,
    residential_buildings INTEGER NOT NULL,
    total_dwellings INTEGER NOT NULL,
    avg_living_space_sqm DOUBLE PRECISION NOT NULL,
    vacant_dwellings INTEGER NOT NULL,
    vacancy_rate_pct DOUBLE PRECISION NOT NULL,
    age_distribution JSONB NOT NULL,
    building_types JSONB NOT NULL,
    heating_energy JSONB NOT NULL,
    source VARCHAR(128) NOT NULL DEFAULT 'statistik_hessen_zensus_2022',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_housing_stock_muni_year UNIQUE (municipality, reference_year)
);

CREATE INDEX IF NOT EXISTS idx_housing_stock_muni_year ON housing_stock_stats (municipality, reference_year);

CREATE TABLE IF NOT EXISTS boris_land_value_zones (
    id VARCHAR(128) PRIMARY KEY,
    zone_code VARCHAR(64) NOT NULL,
    municipality VARCHAR(64) NOT NULL,
    district VARCHAR(64),
    stichtag DATE NOT NULL,
    land_value_eur_sqm DOUBLE PRECISION NOT NULL,
    zone_type VARCHAR(64) NOT NULL, -- 'Wohnbaufläche', 'Gewerbefläche', 'Mischgebiet', 'Landwirtschaft'
    development_status VARCHAR(64) NOT NULL DEFAULT 'baureifes Land',
    floor_space_index DOUBLE PRECISION,
    center_lat DOUBLE PRECISION NOT NULL,
    center_lng DOUBLE PRECISION NOT NULL,
    geometry JSONB NOT NULL,
    source VARCHAR(64) NOT NULL DEFAULT 'boris_hessen',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_boris_muni_stichtag ON boris_land_value_zones (municipality, stichtag);
CREATE INDEX IF NOT EXISTS idx_boris_zone_type ON boris_land_value_zones (zone_type);

CREATE TABLE IF NOT EXISTS land_use_polygons (
    id VARCHAR(128) PRIMARY KEY,
    municipality VARCHAR(64) NOT NULL,
    district VARCHAR(64),
    category VARCHAR(64) NOT NULL, -- 'agriculture', 'forest', 'settlement', 'industrial', 'water', 'traffic'
    category_detail VARCHAR(128) NOT NULL,
    area_sqm DOUBLE PRECISION,
    area_hectares DOUBLE PRECISION,
    center_lat DOUBLE PRECISION NOT NULL,
    center_lng DOUBLE PRECISION NOT NULL,
    geometry JSONB NOT NULL,
    source VARCHAR(64) NOT NULL DEFAULT 'alkis_hessen',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_land_use_muni_cat ON land_use_polygons (municipality, category);

CREATE TABLE IF NOT EXISTS construction_permits (
    id VARCHAR(128) PRIMARY KEY,
    municipality VARCHAR(64) NOT NULL,
    year INTEGER NOT NULL,
    residential_permits_count INTEGER NOT NULL,
    residential_dwellings_count INTEGER NOT NULL,
    residential_living_space_sqm DOUBLE PRECISION,
    non_residential_volume_m3 DOUBLE PRECISION,
    completions_buildings_count INTEGER NOT NULL,
    completions_dwellings_count INTEGER NOT NULL,
    source VARCHAR(128) NOT NULL DEFAULT 'statistik_hessen_f_ii_1',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_construction_permits UNIQUE (municipality, year)
);

CREATE INDEX IF NOT EXISTS idx_construction_muni_year ON construction_permits (municipality, year);

CREATE TABLE IF NOT EXISTS realestate_market_benchmarks (
    id VARCHAR(128) PRIMARY KEY,
    municipality VARCHAR(64) NOT NULL,
    year INTEGER NOT NULL,
    metric_type VARCHAR(64) NOT NULL, -- 'apartment_buy_sqm', 'house_buy_avg', 'rent_cold_sqm', 'commercial_rent_sqm'
    median_val DOUBLE PRECISION,
    avg_val DOUBLE PRECISION NOT NULL,
    min_val DOUBLE PRECISION,
    max_val DOUBLE PRECISION,
    unit VARCHAR(16) NOT NULL,
    transaction_count INTEGER,
    source VARCHAR(128) NOT NULL DEFAULT 'gutachterausschuss_bergstrasse',
    source_title VARCHAR(255),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_realestate_benchmark UNIQUE (municipality, year, metric_type)
);

CREATE INDEX IF NOT EXISTS idx_market_muni_year_metric ON realestate_market_benchmarks (municipality, year, metric_type);

CREATE TABLE IF NOT EXISTS development_plans (
    id VARCHAR(128) PRIMARY KEY,
    municipality VARCHAR(64) NOT NULL,
    district VARCHAR(64),
    plan_name VARCHAR(255) NOT NULL,
    plan_number VARCHAR(64),
    status VARCHAR(64) NOT NULL, -- 'rechtskraeftig', 'in_aufstellung', 'im_verfahren'
    target_use VARCHAR(64) NOT NULL, -- 'Wohnen', 'Gewerbe', 'Mischgebiet', 'Sondergebiet'
    area_hectares DOUBLE PRECISION,
    resolution_year INTEGER,
    document_url TEXT,
    center_lat DOUBLE PRECISION NOT NULL,
    center_lng DOUBLE PRECISION NOT NULL,
    geometry JSONB,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dev_plans_muni ON development_plans (municipality, status);

-- Seed Data Sources


-- Seed Housing Stock & Building Age (Zensus 2022 / Statistik Hessen)


-- Seed BORIS Bodenrichtwerte (Official Land Value Zones)


-- Seed Land Use Polygons (ALKIS Tatsächliche Nutzung)


-- Seed Construction Activity & Permits (Statistik Hessen F II 1)


-- Seed Real Estate Market Benchmarks (Gutachterausschuss Kreis Bergstraße)


-- Seed Active Municipal Development Plans (Bau-Pläne / Neubaugebiete)


INSERT INTO collector_schema_versions(version) VALUES (20260922) ON CONFLICT DO NOTHING;

-- ============================================================================
-- 13. Public Finance, Municipal Budgets, Spending & Elections
-- Covers Municipal Budgets (Haushalte & Steuern: Gewerbesteuer, Grundsteuer, etc.),
-- Functional Expenditures (Produkthaushalt: Schulen, Straßen, Kultur/Sport, Kitas/Soziales),
-- Election Events & Voting Districts (Wahlbezirke / Stimmbezirke mit Geodaten & Wahlergebnissen).
-- ============================================================================

CREATE TABLE IF NOT EXISTS finance_budgets (
    id VARCHAR(64) PRIMARY KEY, -- e.g. 'buerstadt-2024-plan'
    municipality VARCHAR(64) NOT NULL,
    fiscal_year INT NOT NULL,
    record_type VARCHAR(16) NOT NULL DEFAULT 'plan', -- 'plan' (Ansatz) | 'actual' (Rechnungsergebnis)
    total_revenue_eur DOUBLE PRECISION NOT NULL,
    total_expense_eur DOUBLE PRECISION NOT NULL,
    net_result_eur DOUBLE PRECISION NOT NULL,
    tax_gewerbesteuer_eur DOUBLE PRECISION,
    tax_grundsteuer_a_eur DOUBLE PRECISION,
    tax_grundsteuer_b_eur DOUBLE PRECISION,
    tax_income_share_eur DOUBLE PRECISION, -- Gemeindeanteil an der Einkommensteuer
    tax_vat_share_eur DOUBLE PRECISION,    -- Gemeindeanteil an der Umsatzsteuer
    hebesatz_gewerbesteuer INT,          -- Hebesatz in % (z.B. 400)
    hebesatz_grundsteuer_a INT,
    hebesatz_grundsteuer_b INT,
    total_debt_eur DOUBLE PRECISION,       -- Schuldenstand Kernhaushalt
    debt_per_capita_eur DOUBLE PRECISION,
    reserves_eur DOUBLE PRECISION,         -- Rücklagen
    source_document_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_finance_budget UNIQUE (municipality, fiscal_year, record_type)
);

CREATE INDEX IF NOT EXISTS idx_finance_budgets_muni_year ON finance_budgets (municipality, fiscal_year);

CREATE TABLE IF NOT EXISTS finance_expenditures (
    id BIGSERIAL PRIMARY KEY,
    budget_id VARCHAR(64) NOT NULL REFERENCES finance_budgets(id) ON DELETE CASCADE,
    municipality VARCHAR(64) NOT NULL,
    fiscal_year INT NOT NULL,
    product_area_code VARCHAR(8) NOT NULL, -- '01', '02', '03', '06', '08', '11', '12'
    category_name VARCHAR(64) NOT NULL,    -- 'administration', 'public_order', 'schools', 'social_childcare', 'culture_sport', 'roads_transport', 'utilities'
    title VARCHAR(255) NOT NULL,           -- e.g. 'Schulträgeraufgaben & Grundschulen'
    expense_budgeted_eur DOUBLE PRECISION NOT NULL,
    expense_actual_eur DOUBLE PRECISION,
    investments_eur DOUBLE PRECISION DEFAULT 0, -- Sachinvestitionen / Baumaßnahmen
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_finance_exp_cat ON finance_expenditures (municipality, category_name, fiscal_year);

CREATE TABLE IF NOT EXISTS election_events (
    id VARCHAR(64) PRIMARY KEY, -- e.g. 'kw-2021-buerstadt', 'bm-2023-buerstadt', 'eu-2024-buerstadt'
    municipality VARCHAR(64) NOT NULL,
    election_type VARCHAR(32) NOT NULL, -- 'kommunalwahl', 'buergermeister', 'landtag', 'bundestag', 'europawahl'
    title VARCHAR(255) NOT NULL,
    election_date DATE NOT NULL,
    eligible_voters INT NOT NULL,
    total_voters INT NOT NULL,
    turnout_percent DOUBLE PRECISION NOT NULL,
    valid_votes INT NOT NULL,
    invalid_votes INT NOT NULL,
    seats_total INT,
    results_summary JSONB NOT NULL, -- party vote shares, percentage, seats
    source VARCHAR(128) DEFAULT 'votemanager_ekom21',
    source_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_elections_muni_type ON election_events (municipality, election_type, election_date DESC);

CREATE TABLE IF NOT EXISTS election_districts (
    id VARCHAR(64) PRIMARY KEY, -- e.g. 'ed-bst-01-altes-rathaus'
    municipality VARCHAR(64) NOT NULL,
    district_number VARCHAR(16) NOT NULL,
    name VARCHAR(255) NOT NULL,
    polling_station_name VARCHAR(255),
    polling_station_address VARCHAR(255),
    center_lat DOUBLE PRECISION NOT NULL,
    center_lng DOUBLE PRECISION NOT NULL,
    boundaries JSONB, -- GeoJSON Polygon / MultiPolygon
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_election_districts_muni ON election_districts (municipality);

CREATE TABLE IF NOT EXISTS election_district_results (
    id BIGSERIAL PRIMARY KEY,
    election_id VARCHAR(64) NOT NULL REFERENCES election_events(id) ON DELETE CASCADE,
    district_id VARCHAR(64) NOT NULL REFERENCES election_districts(id) ON DELETE CASCADE,
    eligible_voters INT NOT NULL,
    total_voters INT NOT NULL,
    turnout_percent DOUBLE PRECISION NOT NULL,
    valid_votes INT NOT NULL,
    invalid_votes INT NOT NULL,
    party_results JSONB NOT NULL, -- {"CDU": 520, "SPD": 310, "Gruene": 180, ...}
    winning_party VARCHAR(64),
    CONSTRAINT uq_election_district_res UNIQUE (election_id, district_id)
);

CREATE INDEX IF NOT EXISTS idx_election_district_res_lookup ON election_district_results (election_id, district_id);

-- Seed Municipal Budgets (Bürstadt, Lampertheim, Biblis, Groß-Rohrheim)


-- Seed Functional Spending by Product Area (Bürstadt & Lampertheim 2024/2025)


-- Seed Election Events (Kommunalwahlen, Bürgermeisterwahlen, Europawahl)


-- Seed Polling Districts (Wahlbezirke / Stimmbezirke mit GeoJSON Polygonen)


-- Seed Precinct Results for Bürstadt Kommunalwahl 2021


INSERT INTO collector_schema_versions(version) VALUES (20260923) ON CONFLICT DO NOTHING;

-- 11. Economy, Companies, Business Registrations & Municipal Trade Taxes (Kreis Bergstraße & Hessisches Ried)

CREATE TABLE IF NOT EXISTS municipality_tax_rates (
    id BIGSERIAL PRIMARY KEY,
    municipality_id VARCHAR(64) NOT NULL REFERENCES municipalities(id) ON DELETE CASCADE,
    year INT NOT NULL,
    hebesatz_gewerbesteuer INT NOT NULL,      -- Trade tax rate in % (e.g. 380)
    hebesatz_grundsteuer_a INT NOT NULL,      -- Agricultural property tax in % (e.g. 350)
    hebesatz_grundsteuer_b INT NOT NULL,      -- Real property tax B in % (e.g. 450)
    revenue_gewerbesteuer_eur BIGINT,         -- Net trade tax revenue in €
    revenue_grundsteuer_a_eur BIGINT,         -- Property tax A revenue in €
    revenue_grundsteuer_b_eur BIGINT,         -- Property tax B revenue in €
    tax_revenue_per_capita_eur DOUBLE PRECISION,
    source VARCHAR(128) NOT NULL DEFAULT 'statistik_hessen', -- HSL Realsteuervergleich
    source_url TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_muni_tax_year UNIQUE (municipality_id, year)
);

CREATE INDEX IF NOT EXISTS idx_tax_rates_muni_year ON municipality_tax_rates (municipality_id, year DESC);
CREATE INDEX IF NOT EXISTS idx_tax_rates_year_gewerbe ON municipality_tax_rates (year, hebesatz_gewerbesteuer);

CREATE TABLE IF NOT EXISTS business_registrations (
    id BIGSERIAL PRIMARY KEY,
    region_code VARCHAR(64) NOT NULL, -- municipality_id or 'kreis-bergstrasse'
    region_type VARCHAR(16) NOT NULL, -- 'municipality' | 'county'
    year INT NOT NULL,
    registrations_total INT NOT NULL,   -- Gewerbeanmeldungen gesamt
    new_foundations INT NOT NULL,       -- Betriebsgründungen & sonstige Neugründungen
    relocations_in INT NOT NULL,        -- Zuzüge aus anderen Gemeinden/Kreisen
    deregistrations_total INT NOT NULL, -- Gewerbeabmeldungen gesamt
    liquidations INT NOT NULL,          -- Vollständige Aufgaben / Liquidationen
    relocations_out INT NOT NULL,       -- Fortzüge in andere Regionen
    net_balance INT GENERATED ALWAYS AS (registrations_total - deregistrations_total) STORED,
    source VARCHAR(128) NOT NULL DEFAULT 'statistik_hessen', -- HSL Statistischer Bericht D I 1 - j
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_biz_reg_year UNIQUE (region_code, year)
);

CREATE INDEX IF NOT EXISTS idx_biz_reg_region_year ON business_registrations (region_code, year DESC);

CREATE TABLE IF NOT EXISTS industry_employment (
    id BIGSERIAL PRIMARY KEY,
    region_code VARCHAR(64) NOT NULL, -- municipality_id or 'kreis-bergstrasse'
    year INT NOT NULL,
    sector_code VARCHAR(16) NOT NULL, -- 'A', 'B-F', 'G-J', 'K-N', 'O-U'
    sector_name VARCHAR(128) NOT NULL,
    employees_count INT NOT NULL,
    share_percent DOUBLE PRECISION,
    source VARCHAR(128) NOT NULL DEFAULT 'statistik_hessen',
    CONSTRAINT uq_industry_emp UNIQUE (region_code, year, sector_code)
);

CREATE INDEX IF NOT EXISTS idx_industry_emp_region_year ON industry_employment (region_code, year DESC);

CREATE TABLE IF NOT EXISTS companies (
    id VARCHAR(64) PRIMARY KEY, -- e.g. 'comp-basf-lampertheim'
    name VARCHAR(255) NOT NULL,
    legal_form VARCHAR(64),     -- 'GmbH', 'AG', 'SE', 'e.K.'
    municipality_id VARCHAR(64) NOT NULL REFERENCES municipalities(id) ON DELETE CASCADE,
    district VARCHAR(64),
    street_address VARCHAR(255) NOT NULL,
    postal_code VARCHAR(10) NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    industry_sector VARCHAR(128) NOT NULL, -- e.g. 'Chemie & Kunststoffe', 'Logistik & Distribution'
    wz_code VARCHAR(16),
    employee_range VARCHAR(32) NOT NULL,   -- '10-49', '50-249', '250-499', '500-999', '1000+'
    turnover_estimated_range VARCHAR(64),  -- '< 10 Mio. €', '10-50 Mio. €', '50-100 Mio. €', '> 100 Mio. €'
    description TEXT,
    website VARCHAR(255),
    is_headquarters BOOLEAN DEFAULT FALSE,
    source VARCHAR(128) NOT NULL DEFAULT 'bundesanzeiger_northdata',
    source_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_companies_muni ON companies (municipality_id);
CREATE INDEX IF NOT EXISTS idx_companies_sector ON companies (industry_sector);

CREATE TABLE IF NOT EXISTS startup_initiatives (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(64) NOT NULL, -- 'grant', 'consulting', 'competition', 'hub'
    organizer VARCHAR(128) NOT NULL,
    description TEXT NOT NULL,
    url VARCHAR(255),
    funding_bracket VARCHAR(64),
    target_group VARCHAR(128),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed All 22 Municipalities of Kreis Bergstraße (including Bergstraße core and Odenwald parts)


-- Seed Trade Tax Rates (Gewerbesteuer-Hebesätze) & Property Taxes across Municipalities


-- Seed Business Registrations & Closures (Statistik Hessen HSL D I 1 - j)


-- Seed Industry Employment Structure (WZ 2008 / Statistik Hessen)


-- Seed Major Employers (Bürstadt, Lampertheim, Biblis, Bensheim, Lorsch, Viernheim)


-- Seed Regional Startup & Innovation Initiatives


INSERT INTO collector_schema_versions(version) VALUES (20260924) ON CONFLICT DO NOTHING;

-- 16. Audit & History Sync Logging for Scheduled Fetch Services (registry-sync-worker)
CREATE TABLE IF NOT EXISTS collector_sync_logs (
    id BIGSERIAL PRIMARY KEY,
    job_name VARCHAR(64) NOT NULL,
    status VARCHAR(16) NOT NULL, -- 'running', 'success', 'warning', 'failed'
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    rows_ingested INT NOT NULL DEFAULT 0,
    rows_updated INT NOT NULL DEFAULT 0,
    source_url TEXT,
    error_message TEXT,
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_sync_logs_job ON collector_sync_logs (job_name, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_logs_status ON collector_sync_logs (status, started_at DESC);

-- Historical indexes and time-range query support for master registries
CREATE INDEX IF NOT EXISTS idx_boris_historical_zone ON boris_land_value_zones (municipality, stichtag DESC, id);
CREATE INDEX IF NOT EXISTS idx_broadband_survey_time ON broadband_coverage (municipality, last_updated DESC);
CREATE INDEX IF NOT EXISTS idx_wifi_verification_time ON public_wifi_hotspots (municipality, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_permits_historical ON construction_permits (municipality, year DESC);

INSERT INTO collector_schema_versions(version) VALUES (20260925) ON CONFLICT DO NOTHING;

-- Collector-owned publications. No seed rows: legacy illustrative registries
-- are intentionally not promoted into this provenance boundary.
CREATE TABLE IF NOT EXISTS collected_payloads (
    sha256 TEXT PRIMARY KEY,
    body BYTEA NOT NULL,
    content_type TEXT NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS collection_attempts (
    id BIGSERIAL PRIMARY KEY,
    source_id TEXT NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    http_status INTEGER,
    payload_sha256 TEXT REFERENCES collected_payloads(sha256),
    status TEXT NOT NULL,
    error TEXT
);
CREATE INDEX IF NOT EXISTS collection_attempts_source_time ON collection_attempts(source_id, received_at DESC);
-- Add evidence for newly completed attempts; never invent historical processing times.
ALTER TABLE collection_attempts ADD COLUMN IF NOT EXISTS fetched_at TIMESTAMPTZ;
ALTER TABLE collection_attempts ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;
ALTER TABLE collection_attempts ADD COLUMN IF NOT EXISTS item_count BIGINT CHECK (item_count >= 0);
ALTER TABLE collection_attempts ADD COLUMN IF NOT EXISTS item_count_unit TEXT;
ALTER TABLE collection_attempts ADD COLUMN IF NOT EXISTS error_stage TEXT;
CREATE OR REPLACE FUNCTION collection_attempt_completion() RETURNS trigger AS $$
BEGIN
    IF NEW.status IN ('success','partial') AND NEW.processed_at IS NULL THEN
        IF TG_OP = 'INSERT' THEN
            NEW.processed_at := clock_timestamp();
        ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
            NEW.processed_at := clock_timestamp();
        END IF;
    END IF;
    IF NEW.http_status BETWEEN 200 AND 299 AND NEW.fetched_at IS NULL THEN
        NEW.fetched_at := NEW.received_at;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS collection_attempt_completion ON collection_attempts;
CREATE TRIGGER collection_attempt_completion BEFORE INSERT OR UPDATE ON collection_attempts
FOR EACH ROW EXECUTE FUNCTION collection_attempt_completion();
CREATE INDEX IF NOT EXISTS collection_attempts_fetch_success ON collection_attempts(source_id,fetched_at DESC) WHERE fetched_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS collection_attempts_processed_success ON collection_attempts(source_id,processed_at DESC) WHERE status='success' AND processed_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS collected_datasets (
    dataset TEXT PRIMARY KEY,
    source_id TEXT NOT NULL,
    source_url TEXT NOT NULL,
    source_updated_at TIMESTAMPTZ NOT NULL,
    fetched_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    payload_sha256 TEXT NOT NULL REFERENCES collected_payloads(sha256),
    data JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS collected_dataset_versions (
    dataset TEXT NOT NULL,
    payload_sha256 TEXT NOT NULL REFERENCES collected_payloads(sha256),
    source_updated_at TIMESTAMPTZ NOT NULL,
    data JSONB NOT NULL,
    PRIMARY KEY(dataset, payload_sha256, source_updated_at)
);
CREATE TABLE IF NOT EXISTS movement_schedules (
    source_id TEXT NOT NULL,
    trip_id TEXT NOT NULL,
    service_date DATE NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('bus','train','waste')),
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    payload_sha256 TEXT NOT NULL REFERENCES collected_payloads(sha256),
    fetched_at TIMESTAMPTZ NOT NULL,
    trajectory JSONB NOT NULL,
    metadata JSONB NOT NULL,
    PRIMARY KEY(source_id, trip_id, service_date)
);
CREATE INDEX IF NOT EXISTS movement_schedules_active ON movement_schedules(starts_at, ends_at);
CREATE TABLE IF NOT EXISTS movement_positions (
    timestamp TIMESTAMPTZ NOT NULL,
    entity_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('bus','train','waste')),
    latitude DOUBLE PRECISION NOT NULL CHECK(latitude BETWEEN -90 AND 90),
    longitude DOUBLE PRECISION NOT NULL CHECK(longitude BETWEEN -180 AND 180),
    basis TEXT NOT NULL CHECK(basis IN ('observed','schedule_prediction')),
    source_id TEXT NOT NULL,
    payload_sha256 TEXT NOT NULL REFERENCES collected_payloads(sha256),
    model_version TEXT,
    metadata JSONB NOT NULL,
    PRIMARY KEY(timestamp, entity_id, basis)
);
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
        PERFORM create_hypertable('movement_positions','timestamp',if_not_exists => TRUE);
    END IF;
END $$;
CREATE TABLE IF NOT EXISTS movement_latest (
    entity_id TEXT NOT NULL,
    basis TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    valid_until TIMESTAMPTZ NOT NULL,
    data JSONB NOT NULL,
    PRIMARY KEY(entity_id, basis)
);
CREATE TABLE IF NOT EXISTS collected_map_tiles (
    layer TEXT NOT NULL,
    z INTEGER NOT NULL,
    x INTEGER NOT NULL,
    y INTEGER NOT NULL,
    payload_sha256 TEXT NOT NULL REFERENCES collected_payloads(sha256),
    fetched_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY(layer,z,x,y)
);
INSERT INTO collector_schema_versions(version) VALUES (20260922) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS movement_trip_updates (
    source_id TEXT NOT NULL,
    trip_id TEXT NOT NULL,
    service_date DATE NOT NULL,
    observed_at TIMESTAMPTZ NOT NULL,
    valid_until TIMESTAMPTZ NOT NULL,
    cancelled BOOLEAN NOT NULL,
    delay_seconds INTEGER NOT NULL,
    payload_sha256 TEXT NOT NULL REFERENCES collected_payloads(sha256),
    PRIMARY KEY(source_id,trip_id,service_date)
);

ALTER TABLE movement_trip_updates ADD COLUMN IF NOT EXISTS delay_basis TEXT NOT NULL DEFAULT 'schedule_only';

-- Unknown thresholds are not zero thresholds and must not use seeded alarm values.
ALTER TABLE flood_gauges ALTER COLUMN alarm_level_1_m DROP NOT NULL;
ALTER TABLE flood_gauges ALTER COLUMN alarm_level_2_m DROP NOT NULL;
ALTER TABLE flood_gauges ALTER COLUMN alarm_level_3_m DROP NOT NULL;

CREATE TABLE IF NOT EXISTS collection_sources (
    id TEXT PRIMARY KEY,
    source_url TEXT NOT NULL,
    adapter TEXT NOT NULL,
    enabled BOOLEAN NOT NULL,
    interval_seconds INTEGER NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO collector_schema_versions(version) VALUES (20260926) ON CONFLICT DO NOTHING;

-- Indexed stop projection: departure reads must not expand every trip's JSON.
CREATE TABLE IF NOT EXISTS movement_stop_times (
    source_id TEXT NOT NULL,
    trip_id TEXT NOT NULL,
    service_date DATE NOT NULL,
    sequence INTEGER NOT NULL,
    stop_id TEXT NOT NULL,
    arrival_at TIMESTAMPTZ NOT NULL,
    departure_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY(source_id,trip_id,service_date,sequence),
    FOREIGN KEY(source_id,trip_id,service_date)
        REFERENCES movement_schedules(source_id,trip_id,service_date) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS movement_stop_times_departures
    ON movement_stop_times(stop_id,departure_at,source_id);
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM collector_schema_versions WHERE version=20260927) THEN
        INSERT INTO movement_stop_times
        SELECT s.source_id,s.trip_id,s.service_date,(t->>'sequence')::integer,t->>'stop_id',
            to_timestamp((t->>'arrival')::double precision),to_timestamp((t->>'departure')::double precision)
        FROM movement_schedules s CROSS JOIN LATERAL jsonb_array_elements(s.metadata->'stop_times') t
        ON CONFLICT DO NOTHING;
        INSERT INTO collector_schema_versions(version) VALUES (20260927);
    END IF;
END $$;

-- Durable per-address acquisition progress, separate from published calendar data.
CREATE TABLE IF NOT EXISTS collection_checkpoints (
    source_id TEXT NOT NULL,
    item_key TEXT NOT NULL,
    payload_sha256 TEXT NOT NULL REFERENCES collected_payloads(sha256),
    fetched_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY(source_id,item_key)
);

CREATE TABLE IF NOT EXISTS collection_item_failures (
    source_id TEXT NOT NULL,
    item_key TEXT NOT NULL,
    retry_after TIMESTAMPTZ NOT NULL,
    error TEXT NOT NULL,
    PRIMARY KEY(source_id,item_key)
);

INSERT INTO collector_schema_versions(version) VALUES (20260928) ON CONFLICT DO NOTHING;

-- Reported ship positions reuse the movement history and canonical scalar writer.
ALTER TABLE movement_positions DROP CONSTRAINT IF EXISTS movement_positions_kind_check;
ALTER TABLE movement_positions ADD CONSTRAINT movement_positions_kind_check
    CHECK(kind IN ('bus','train','waste','ship','aircraft'));
CREATE TABLE IF NOT EXISTS ais_vessels (
    mmsi TEXT PRIMARY KEY CHECK(mmsi ~ '^[1-9][0-9]{8}$'),
    updated_at TIMESTAMPTZ NOT NULL,
    metadata JSONB NOT NULL
);
INSERT INTO collection_sources(id,source_url,adapter,enabled,interval_seconds,description)
VALUES ('aisstream-rhein','https://aisstream.io/','ais-websocket',true,60,
    'AISstream reception Worms–Gernsheim; connected does not imply complete vessel coverage')
ON CONFLICT(id) DO NOTHING;

-- Observed aircraft reuse the common movement history and measurement writer.
ALTER TABLE movement_positions DROP CONSTRAINT IF EXISTS movement_positions_kind_check;
ALTER TABLE movement_positions ADD CONSTRAINT movement_positions_kind_check
    CHECK(kind IN ('bus','train','waste','ship','aircraft'));
INSERT INTO collection_sources(id,source_url,adapter,enabled,interval_seconds,description)
VALUES ('adsblol-ried','https://www.adsb.lol/','adsb-json',true,15,
    'Received aircraft over the buffered Ried; adsb.lol ODbL 1.0; incomplete coverage, no OGN adapter yet')
ON CONFLICT(id) DO NOTHING;

-- Authorized browser map acquisition, separate operational identity from AISstream.
INSERT INTO collection_sources(id,source_url,adapter,enabled,interval_seconds,description)
VALUES ('rhein-map','urn:open-ried:rhine-map','rhine-map-browser',true,300,
    'Authorized Rhine map reception Frankenthal–Gernsheim; provider observation times preserved')
ON CONFLICT(id) DO NOTHING;

-- OGN is deliberately isolated from permanent evidence, scalar and archive tables.
CREATE TABLE IF NOT EXISTS ogn_permissions (
    device_key text PRIMARY KEY,
    metadata jsonb NOT NULL,
    valid_until timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS ogn_positions (
    device_key text NOT NULL REFERENCES ogn_permissions(device_key) ON DELETE CASCADE,
    timestamp timestamptz NOT NULL,
    data jsonb NOT NULL,
    PRIMARY KEY(device_key,timestamp)
);
CREATE INDEX IF NOT EXISTS ogn_positions_time ON ogn_positions(timestamp);
CREATE OR REPLACE VIEW ogn_public_positions AS
    SELECT p.device_key,p.timestamp,p.data FROM ogn_positions p
    JOIN ogn_permissions d USING(device_key)
    WHERE d.valid_until>NOW() AND p.timestamp>NOW()-INTERVAL '24 hours'
        AND p.timestamp<=NOW()+INTERVAL '10 seconds';
INSERT INTO collection_sources(id,source_url,adapter,enabled,interval_seconds,description)
VALUES ('ogn-ried','https://www.glidernet.org/','ogn-aprs',true,30,
    'OGN regional live positions; current DDB tracking and identification opt-in; ODbL; no permanent archives')
ON CONFLICT(id) DO NOTHING;

-- Current regional snapshot only; integer prices in thousandths of EUR/litre.
CREATE TABLE IF NOT EXISTS fuel_snapshot (
    id integer PRIMARY KEY CHECK (id=1),
    fetched_at timestamptz NOT NULL,
    data jsonb NOT NULL
);

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
ALTER TABLE traffic_corridor_snapshots ADD COLUMN IF NOT EXISTS delay_kind TEXT NOT NULL DEFAULT 'unknown';
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

-- JPEG bytes live in the persistent worker volume; Postgres stores identity and observations.
CREATE TABLE IF NOT EXISTS webcam_snapshot_images (
    source_id TEXT NOT NULL REFERENCES collection_sources(id),
    sha256 TEXT NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
    relative_path TEXT NOT NULL UNIQUE,
    byte_count BIGINT NOT NULL CHECK (byte_count > 0),
    width INTEGER NOT NULL CHECK (width > 0),
    height INTEGER NOT NULL CHECK (height > 0),
    first_observed_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (source_id, sha256)
);
CREATE TABLE IF NOT EXISTS webcam_snapshot_observations (
    id BIGSERIAL PRIMARY KEY,
    source_id TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    attempt_id BIGINT NOT NULL UNIQUE REFERENCES collection_attempts(id),
    observed_at TIMESTAMPTZ NOT NULL,
    capture_time TIMESTAMPTZ, -- Unknown: neither HTTP Last-Modified nor fetch time is capture time.
    http_status INTEGER NOT NULL CHECK (http_status IN (200,304)),
    etag TEXT,
    last_modified TEXT, -- Untrusted provider header, deliberately not an inferred timestamp.
    FOREIGN KEY (source_id,sha256) REFERENCES webcam_snapshot_images(source_id,sha256)
);
CREATE INDEX IF NOT EXISTS webcam_snapshot_observations_source_id
    ON webcam_snapshot_observations(source_id,id DESC);

-- Quality describes successful byte observations, not a verified capture time.
ALTER TABLE webcam_snapshot_observations
    ADD COLUMN IF NOT EXISTS unchanged_since TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS unchanged_observations INTEGER NOT NULL DEFAULT 1
        CHECK (unchanged_observations > 0),
    ADD COLUMN IF NOT EXISTS quality_status TEXT NOT NULL DEFAULT 'fresh'
        CHECK (quality_status IN ('fresh','unchanged','suspected_stale'));
CREATE INDEX IF NOT EXISTS webcam_snapshot_observations_observed_at
    ON webcam_snapshot_observations(observed_at);
