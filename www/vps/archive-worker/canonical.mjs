// Match the public three-table download contract, independent of API read cutover.
// iNaturalist revalidation can withdraw public positions: no immutable monthly copy.
export const PUBLIC = `e.entity_type <> 'inaturalist_observation' AND NOT e.is_hidden AND e.metadata->>'legacy_deleted' IS DISTINCT FROM 'true'
  AND (e.id NOT LIKE 'sensor:%' OR EXISTS (SELECT 1 FROM sensor_metadata s
    WHERE s.id=substr(e.id,8) AND NOT s.is_hidden))`;

/** Prepare legacy definitions; stream missing readings without copying their history.
 * Unresolved legacy variants are exported separately, never guessed.
 * This preparation does not enable shadow writes or API cutover.
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
      const available = await client.query("SELECT to_regprocedure('clean_weather_legacy(text,text,text,timestamptz)') IS NOT NULL AS clean, to_regprocedure('reconcile_weather_history(text,text,text,timestamptz)') IS NOT NULL AS available");
      if (available.rows[0].available) for (const row of conflicts.rows) {
        if (row.sensor_id !== 'weather-dwd-ried') continue;
        await client.query(available.rows[0].clean ? 'SELECT clean_weather_legacy($1,$2,$3,$4)' : 'SELECT reconcile_weather_history($1,$2,$3,$4)',
          [row.sensor_id, row.metric, row.unit, row.timestamp]);
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
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}

// The TTN collector writes one event to its native stream and compatibility
// table. Export the native event once, without changing any value or timestamp.
const nativeGatewayCopy = (sensor, time, value, quality) => `EXISTS (
  SELECT 1 FROM measurement_definitions nd JOIN readings nr ON nr.measurement_id=nd.id
  JOIN entities ne ON ne.id=nd.entity_id
  WHERE nd.entity_id='lora:gateway:'||substr(${sensor},8) AND nd.metric='online_status'
    AND nd.unit='state' AND nd.source_id='ttnmapper' AND nd.basis='observed' AND nd.dimensions='{}'
    AND nr.observed_at=${time} AND nr.value=${value} AND nr.quality=${quality}
    AND nr.observed_at >= $1 AND nr.observed_at < $2
    AND NOT ne.is_hidden AND ne.metadata->>'legacy_deleted' IS DISTINCT FROM 'true')`;

const stamp = column => `CASE WHEN r.${column} IS NULL THEN NULL ELSE to_char(r.${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END`;
export const ROWS = `SELECT entity,definition,reading FROM (SELECT
  jsonb_build_object('id',e.id,'name',e.name,'entity_type',e.entity_type,'metadata',e.metadata) AS entity,
  to_jsonb(d) || jsonb_build_object('id',d.id::text,'minimum',d.minimum::text,'maximum',d.maximum::text) AS definition,
  to_jsonb(r) || jsonb_build_object('measurement_id',r.measurement_id::text,'value',r.value::text,
    'observed_at',${stamp('observed_at')},'collected_at',${stamp('collected_at')},
    'period_start',${stamp('period_start')},'period_end',${stamp('period_end')}) AS reading,
  r.observed_at AS sort_time,r.measurement_id AS sort_id
  FROM readings r JOIN measurement_definitions d ON d.id=r.measurement_id
  JOIN entities e ON e.id=d.entity_id WHERE ${PUBLIC}
    AND r.observed_at >= $1 AND r.observed_at < $2
    AND NOT (d.entity_id LIKE 'sensor:ttn-gw-%' AND d.source_id='legacy-sensor:'||substr(d.entity_id,8)
      AND d.metric='online_status' AND d.unit='state' AND d.basis='unknown' AND d.dimensions='{}'
      AND ${nativeGatewayCopy('substr(d.entity_id,8)', 'r.observed_at', 'r.value', 'r.quality')})
  UNION ALL SELECT
    jsonb_build_object('id',e.id,'name',e.name,'entity_type',e.entity_type,'metadata',e.metadata),
    to_jsonb(d) || jsonb_build_object('id',d.id::text,'minimum',d.minimum::text,'maximum',d.maximum::text),
    jsonb_build_object('measurement_id',d.id::text,'observed_at',
      to_char(t.timestamp AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      'value',t.value::text,'quality','valid','collected_at',NULL,'period_start',NULL,'period_end',NULL,
      'provenance',jsonb_build_object('legacy_table','sensor_data','basis_unverified',true),'revision',0,
      'legacy_conflict',t.variants>1,'legacy_variants',t.legacy_variants),
    t.timestamp,d.id
  FROM (
    SELECT sensor_id,metric,unit,timestamp,min(value) AS value,count(*) AS variants,
      jsonb_agg(jsonb_build_object('value',value::text,'source_row_count',source_row_count)) AS legacy_variants
    FROM (
      SELECT t.sensor_id,t.metric,t.unit,t.timestamp,legacy_numeric(t.value) AS value,count(*)::text AS source_row_count
      FROM sensor_data t JOIN sensor_metadata s ON s.id=t.sensor_id
      WHERE NOT s.is_hidden AND t.timestamp >= $1 AND t.timestamp < $2 AND t.value IS NOT NULL
      GROUP BY t.sensor_id,t.metric,t.unit,t.timestamp,t.value
    ) variants GROUP BY sensor_id,metric,unit,timestamp
  ) t JOIN measurement_definitions d ON d.entity_id='sensor:'||t.sensor_id
    AND d.source_id='legacy-sensor:'||t.sensor_id AND d.metric=t.metric AND d.unit=t.unit
    AND d.basis='unknown' AND d.dimensions='{}'::jsonb
  JOIN entities e ON e.id=d.entity_id WHERE ${PUBLIC}
    AND NOT (t.variants=1 AND t.sensor_id LIKE 'ttn-gw-%' AND t.metric='online_status' AND t.unit='state'
      AND ${nativeGatewayCopy('t.sensor_id', 't.timestamp', 't.value', "'valid'")})
    AND (t.variants>1 OR NOT EXISTS (SELECT 1 FROM readings r
      WHERE r.measurement_id=d.id AND r.observed_at=t.timestamp AND r.observed_at >= $1 AND r.observed_at < $2))
  ) samples ORDER BY sort_time,sort_id`;
