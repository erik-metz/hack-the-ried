"""Explicit existing-schema startup for ordered deployments during long exports."""

import os


def schema_mode():
    mode = os.getenv('API_SCHEMA_MODE', 'bootstrap')
    if mode not in {'bootstrap', 'validate'}:
        raise RuntimeError('API_SCHEMA_MODE must be bootstrap or validate')
    return mode


async def validate_existing_schema(conn, *, mcp=False):
    """Read-only capability probes. Required migrations must be applied separately."""
    await conn.execute("SET LOCAL statement_timeout = '5s'")
    cursor = await conn.execute('SELECT 1 AS ready FROM collector_schema_versions WHERE version=20260928')
    if await cursor.fetchone() is None:
        raise RuntimeError('Existing collector schema is not ready')
    await conn.execute('SELECT id,is_hidden FROM sensor_metadata LIMIT 0')
    await conn.execute('SELECT dataset,data,expires_at FROM collected_datasets LIMIT 0')
    await conn.execute('SELECT sha256,size_bytes FROM collected_payloads LIMIT 0')
    await conn.execute('SELECT sha256,body FROM collected_file_assets LIMIT 0')
    if mcp:
        for probe in (
            'SELECT id,metadata,is_hidden FROM entities LIMIT 0',
            'SELECT id,entity_id,source_id,semantics FROM measurement_definitions LIMIT 0',
            'SELECT measurement_id,observed_at,collected_at,quality FROM readings LIMIT 0',
            'SELECT source_id,started_at,finished_at,status FROM collection_runs LIMIT 0',
            'SELECT source_id,since FROM collection_run_coverage LIMIT 0',
            'SELECT source_id FROM collection_observed_sources LIMIT 0',
            'SELECT source_id,revision,effective_at,enabled,interval_seconds,tolerance_seconds FROM collection_source_policies LIMIT 0',
        ):
            await conn.execute(probe)
