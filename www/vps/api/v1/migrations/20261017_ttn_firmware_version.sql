ALTER TABLE sensor_metadata
    ADD COLUMN IF NOT EXISTS firmware_version TEXT;
