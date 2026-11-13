"""Read slow reference publications from the three canonical data tables only."""
from datetime import UTC, datetime, timedelta

from dependencies import get_db_pool
from fastapi import APIRouter, Depends, HTTPException
from fastapi.encoders import jsonable_encoder

router = APIRouter(prefix='/reference', tags=['Regional reference data'])


def source_status(metadata, now=None):
    now = now or datetime.now(UTC)
    checked = datetime.fromisoformat(metadata['checked_at'])
    return {k: v for k, v in metadata.items() if k not in {'members', 'etag', 'last_modified', 'content_sha256', 'contract_sha256', 'contract_version'}} | {
        'stale': now - checked > timedelta(seconds=max(86400, metadata['interval_seconds'] * 3))}


@router.get('')
async def reference_sources(pool=Depends(get_db_pool)):
    async with pool.connection() as conn, conn.transaction():
        await conn.execute('SET LOCAL max_parallel_workers_per_gather=0')
        rows = await (await conn.execute("SELECT metadata FROM entities WHERE entity_type='reference_source' AND NOT is_hidden ORDER BY name")).fetchall()
    return jsonable_encoder({'sources': [source_status(row['metadata']) for row in rows]})


@router.get('/{layer}')
async def reference_layer(layer: str, pool=Depends(get_db_pool)):
    if not layer.replace('-', '').isalnum() or len(layer) > 60:
        raise HTTPException(400, 'Invalid reference layer')
    # Keep current-set membership, metadata and numeric readings in one snapshot.
    async with pool.connection() as conn, conn.transaction():
        await conn.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')
        await conn.execute('SET LOCAL max_parallel_workers_per_gather=0')
        await conn.execute("SET LOCAL statement_timeout='15s'")
        row = await (await conn.execute("SELECT metadata FROM entities WHERE id=%s AND entity_type='reference_source' AND NOT is_hidden", ('reference-source:' + layer,))).fetchone()
        if not row:
            raise HTTPException(503, 'Reference data not collected', headers={'Cache-Control': 'no-store'})
        metadata = row['metadata']
        if source_status(metadata)['stale']:
            raise HTTPException(503,'Reference source check is overdue',headers={'Cache-Control':'no-store'})
        integration_layers = set()
        if layer == 'catalogue':
            states = await (await conn.execute("SELECT metadata FROM entities WHERE entity_type='reference_source' AND NOT is_hidden")).fetchall()
            integration_layers = {r['metadata']['layer'] for r in states if not source_status(r['metadata'])['stale']}
        rows = await (await conn.execute("""SELECT e.id,e.name,e.metadata,
            COALESCE((SELECT jsonb_agg(jsonb_build_object('metric',d.metric,'unit',d.unit,'basis',d.basis,
                'dimensions',d.dimensions,'value',r.value,'quality',r.quality,'observed_at',r.observed_at,
                'period_start',r.period_start,'period_end',r.period_end) ORDER BY d.metric)
              FROM measurement_definitions d JOIN latest_readings h ON h.measurement_id=d.id
                JOIN readings r ON r.measurement_id=d.id AND r.observed_at=h.observed_at
              WHERE d.entity_id=e.id AND d.source_id=%s),'[]') AS values
            FROM entities e WHERE e.id=ANY(%s) AND NOT e.is_hidden ORDER BY e.id""",
            ('reference-' + layer, metadata['members']))).fetchall()
    if len(rows) != metadata['count']:
        raise HTTPException(503, 'Incomplete reference publication', headers={'Cache-Control': 'no-store'})
    features = []
    for row in rows:
        props = dict(row['metadata']['properties'])
        if layer == 'catalogue':
            aliases={'hochwasser':'floodrisk','schutzgebiete':'protected','trinkwasser':'water-protection',
                     'starkregen':'heavy-rain','grundwasser':'groundwater-depth','hitze':'heat',
                     'radon_potential':'radon','geologie':'geology','buek200':'soil','zensus_miete':'census','zensus_leerstand':'census','zensus_eigentum':'census'}
            if aliases.get(props.get('id')) in integration_layers:
                props['integration']='collected'
            if props.get('id')=='bodenbewegung':
                props['overlap']='Original-Download benötigt ein Copernicus/CLMS-API-Token; noch keine EGMS-Messpunkte importiert.'
        # Compatibility for existing context-map popups; values still stored only in readings.
        for v in row['values']:
            props[v['metric']] = v['value']
        features.append({'type': 'Feature', 'id': row['id'], 'geometry': row['metadata']['geometry'],
                         'properties': {**props, 'name': row['name'], 'measurements': row['values']}})
    return jsonable_encoder({'type': 'FeatureCollection', 'features': features,
                             'source': source_status(metadata), 'region': [8.35,49.55,8.58,49.76]})
