INSERT INTO collection_sources(id,source_url,adapter,enabled,interval_seconds,description)
VALUES ('astronomy-engine:hessisches-ried-v1',
    'https://pypi.org/project/astronomy-engine/', 'sky-collector', TRUE, 300,
    'Calculated solar and lunar positions for fixed Hessian Ried regional reference coordinates')
ON CONFLICT (id) DO UPDATE SET source_url=EXCLUDED.source_url,
    adapter=EXCLUDED.adapter, enabled=EXCLUDED.enabled,
    interval_seconds=EXCLUDED.interval_seconds, description=EXCLUDED.description,
    updated_at=NOW();
