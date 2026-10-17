-- Firmware versions are the numeric firmware folder identifiers (v1, v2, ...).
-- Earlier deployments stored semantic strings such as "2.0.0"; retain their
-- major version and clear values that cannot be mapped safely.
ALTER TABLE sensor_metadata
    ALTER COLUMN firmware_version TYPE SMALLINT
    USING CASE
        WHEN firmware_version::TEXT ~ '^[0-9]+(\.[0-9]+){0,2}$'
            THEN split_part(firmware_version::TEXT, '.', 1)::SMALLINT
        ELSE NULL
    END;
