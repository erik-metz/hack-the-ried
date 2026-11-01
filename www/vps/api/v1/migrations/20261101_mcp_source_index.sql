-- Optional performance index. Apply outside any transaction during an agreed
-- maintenance window: CONCURRENTLY can still wait for long-lived snapshots.
CREATE INDEX CONCURRENTLY IF NOT EXISTS measurement_definitions_mcp_source
    ON measurement_definitions(source_id,id);
