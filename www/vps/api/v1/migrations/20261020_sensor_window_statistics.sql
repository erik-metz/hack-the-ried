CREATE TABLE IF NOT EXISTS sensor_measurement_windows (
    sensor_id VARCHAR(64) NOT NULL REFERENCES sensor_metadata(id) ON DELETE CASCADE,
    window_end TIMESTAMPTZ NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    window_seconds INTEGER NOT NULL CHECK (window_seconds BETWEEN 1 AND 16777215),
    event_id TEXT NOT NULL,
    PRIMARY KEY (sensor_id, window_end),
    CHECK (window_start < window_end)
);

CREATE INDEX IF NOT EXISTS idx_sensor_measurement_windows_latest
    ON sensor_measurement_windows (sensor_id, window_end DESC);

CREATE TABLE IF NOT EXISTS sensor_window_metrics (
    sensor_id VARCHAR(64) NOT NULL,
    window_end TIMESTAMPTZ NOT NULL,
    metric VARCHAR(64) NOT NULL,
    unit VARCHAR(32) NOT NULL,
    minimum DOUBLE PRECISION,
    mean DOUBLE PRECISION NOT NULL,
    maximum DOUBLE PRECISION,
    sample_count INTEGER NOT NULL CHECK (sample_count BETWEEN 0 AND 16777215),
    PRIMARY KEY (sensor_id, window_end, metric),
    FOREIGN KEY (sensor_id, window_end)
        REFERENCES sensor_measurement_windows(sensor_id, window_end) ON DELETE CASCADE,
    CHECK (minimum IS NULL OR minimum <= mean),
    CHECK (maximum IS NULL OR maximum >= mean)
);

CREATE INDEX IF NOT EXISTS idx_sensor_window_metrics_latest
    ON sensor_window_metrics (sensor_id, metric, window_end DESC);
