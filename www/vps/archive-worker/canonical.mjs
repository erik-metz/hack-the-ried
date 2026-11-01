// Match the public three-table download contract, independent of API read cutover.
// iNaturalist revalidation can withdraw public positions: no immutable monthly copy.
export const PUBLIC = `e.entity_type <> 'inaturalist_observation' AND NOT e.is_hidden AND e.metadata->>'legacy_deleted' IS DISTINCT FROM 'true'
  AND (e.id NOT LIKE 'sensor:%' OR EXISTS (SELECT 1 FROM sensor_metadata s
    WHERE s.id=substr(e.id,8) AND NOT s.is_hidden))`;

/** Add missing public telemetry for this period; never overwrite canonical values.
 * Legacy duplicates with conflicting values must be resolved, not guessed.
 * This bounded, transactional transfer does not enable shadow writes or API cutover.
 */
export async function includeLegacy(client, start, end) {
  await client.query('BEGIN');
  try {
    const params = [start, end];
    const scope = `FROM sensor_data t JOIN sensor_metadata s ON s.id=t.sensor_id
      WHERE NOT s.is_hidden AND t.timestamp >= $1 AND t.timestamp < $2`;
    const conflicts = await client.query(`SELECT t.timestamp::text AS timestamp,t.sensor_id,t.metric,t.unit ${scope}
      GROUP BY t.timestamp,t.sensor_id,t.metric,t.unit HAVING count(DISTINCT t.value)>1`, params);
    if (conflicts.rowCount) {
      const available = await client.query("SELECT to_regprocedure('reconcile_weather_history(text,text,text,timestamptz)') IS NOT NULL AS available");
      if (!available.rows[0].available) throw new Error('Conflicting legacy samples; resolve before monthly export');
      for (const row of conflicts.rows) {
        const result = await client.query('SELECT reconcile_weather_history($1,$2,$3,$4) AS reconciled',
          [row.sensor_id, row.metric, row.unit, row.timestamp]);
        if (!result.rows[0].reconciled) throw new Error('Conflicting legacy samples; resolve before monthly export');
      }
    }
    await client.query(`INSERT INTO entities(id,name,entity_type,metadata,is_hidden)
      SELECT 'sensor:'||s.id,s.friendly_name,'sensor',jsonb_build_object(
        'legacy_sensor_id',s.id,'description',s.description,'latitude',s.latitude,'longitude',s.longitude),false
      FROM sensor_metadata s WHERE NOT s.is_hidden AND EXISTS(SELECT 1 FROM sensor_data t
        WHERE t.sensor_id=s.id AND t.timestamp >= $1 AND t.timestamp < $2)
      ON CONFLICT(id) DO NOTHING`, params);
    await client.query(`INSERT INTO measurement_definitions(entity_id,metric,unit,source_id,basis,dimensions,semantics)
      SELECT DISTINCT 'sensor:'||t.sensor_id,t.metric,t.unit,'legacy-sensor:'||t.sensor_id,'unknown','{}'::jsonb,'unknown'
      ${scope} ON CONFLICT(entity_id,metric,unit,source_id,basis,dimensions) DO NOTHING`, params);
    await client.query(`INSERT INTO readings(measurement_id,observed_at,value,quality,collected_at,provenance)
      SELECT d.id,t.timestamp,min(legacy_numeric(t.value)),'valid',now(),
        '{"legacy_table":"sensor_data","basis_unverified":true}'::jsonb
      FROM sensor_data t JOIN sensor_metadata s ON s.id=t.sensor_id
      JOIN measurement_definitions d ON d.entity_id='sensor:'||t.sensor_id
        AND d.source_id='legacy-sensor:'||t.sensor_id AND d.metric=t.metric AND d.unit=t.unit
        AND d.basis='unknown' AND d.dimensions='{}'::jsonb
      WHERE NOT s.is_hidden AND t.timestamp >= $1 AND t.timestamp < $2
        AND t.value IS NOT NULL
      GROUP BY d.id,t.timestamp ON CONFLICT(measurement_id,observed_at) DO NOTHING`, params);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}

const stamp = column => `CASE WHEN r.${column} IS NULL THEN NULL ELSE to_char(r.${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END`;
export const ROWS = `SELECT
  jsonb_build_object('id',e.id,'name',e.name,'entity_type',e.entity_type,'metadata',e.metadata) AS entity,
  to_jsonb(d) || jsonb_build_object('id',d.id::text,'minimum',d.minimum::text,'maximum',d.maximum::text) AS definition,
  to_jsonb(r) || jsonb_build_object('measurement_id',r.measurement_id::text,'value',r.value::text,
    'observed_at',${stamp('observed_at')},'collected_at',${stamp('collected_at')},
    'period_start',${stamp('period_start')},'period_end',${stamp('period_end')}) AS reading
  FROM readings r JOIN measurement_definitions d ON d.id=r.measurement_id
  JOIN entities e ON e.id=d.entity_id WHERE ${PUBLIC}
    AND r.observed_at >= $1 AND r.observed_at < $2 ORDER BY r.observed_at,r.measurement_id`;
