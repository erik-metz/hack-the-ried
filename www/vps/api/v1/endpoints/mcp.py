"""Service-only routes. nginx blocks the entire prefix on public hosts."""

from datetime import datetime
from typing import Annotated, Literal

import mcp_data
import mcp_reliability
from dependencies import get_db_pool
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from mcp_auth import verify_mcp_service_key
from mcp_common import read_connection
from publication_service import read_publication

router = APIRouter(prefix='/internal/mcp', tags=['MCP internal'],
                   dependencies=[Depends(verify_mcp_service_key)], include_in_schema=False)
Page = Annotated[int, Query(ge=1, le=200)]
Offset = Annotated[int, Query(ge=0, le=100000)]
Text = Annotated[str | None, Query(max_length=200)]
Days = Annotated[int, Query(ge=1, le=90)]
Pool = Annotated[object, Depends(get_db_pool)]


@router.get('/capabilities')
async def capabilities(pool: Pool):
    async with read_connection(pool) as conn:
        cursor = await conn.execute("""SELECT to_regclass('entities') IS NOT NULL
            AND to_regclass('readings') IS NOT NULL
            AND to_regclass('collection_source_policies') IS NOT NULL AS ready""")
        if not (await cursor.fetchone())['ready']:
            raise HTTPException(503, 'Required data migration is not available')
    return {'ready': True, 'version': '1.0.0', 'public_read_only': True}


@router.get('/catalog')
async def catalog(pool: Pool, regional: bool = False, offset: Offset = 0, limit: Page = 50):
    return await mcp_data.catalog(pool, regional=regional, offset=offset, limit=limit)


@router.get('/entities')
async def entities(pool: Pool, entity_id: Text = None, entity_type: Text = None,
                   source_id: Text = None, search: Text = None, offset: Offset = 0, limit: Page = 50):
    return await mcp_data.entities(pool, entity_id=entity_id, entity_type=entity_type,
        source_id=source_id, search=search, offset=offset, limit=limit)


@router.get('/measurements')
async def measurements(pool: Pool, entity_id: Text = None, source_id: Text = None,
                       metric: Text = None, offset: Offset = 0, limit: Page = 50):
    return await mcp_data.measurements(pool, entity_id=entity_id, source_id=source_id,
        metric=metric, offset=offset, limit=limit)


@router.get('/readings')
async def readings(pool: Pool, measurement_id: Annotated[int, Query(gt=0)],
    start: datetime | None = None, end: datetime | None = None, latest: bool = False,
    interval_seconds: Annotated[int | None, Query(ge=60, le=2678400)] = None,
    aggregate: Literal['avg','min','max','count'] | None = None,
    offset: Offset = 0, limit: Annotated[int, Query(ge=1, le=1000)] = 1000):
    if latest and (aggregate or start or end or offset):
        raise HTTPException(422, 'Latest cannot be combined with history or aggregation')
    return await mcp_data.readings(pool, measurement_id=measurement_id, start=start, end=end,
        latest=latest, interval_seconds=interval_seconds, aggregate=aggregate, offset=offset, limit=limit)


@router.get('/datasets/info')
async def dataset_info(pool: Pool, dataset_id: Annotated[str, Query(min_length=1, max_length=200)]):
    return await mcp_data.publication_info(pool, dataset_id)


@router.get('/datasets/data')
async def dataset_data(request: Request, pool: Pool,
    dataset_id: Annotated[str, Query(min_length=1, max_length=200)],
    municipality: Text = None, municipality_id: Text = None, year: Text = None,
    category: Text = None, search: Text = None,
    section: Annotated[str | None, Query(max_length=120, pattern=r'^[A-Za-z0-9_-]+(?:/[A-Za-z0-9_-]+)*$')] = None,
    from_date: datetime | None = None, to_date: datetime | None = None,
    include_past: bool = False, offset: Offset = 0, limit: Page = 50):
    await mcp_data.publication_info(pool, dataset_id)  # Registered publications only.
    # Shared domain service preserves expiry, public filtering and read cutovers.
    # A read-only transaction also bounds the service's existing SQL operations.
    async with read_connection(pool) as conn:
        from contextlib import asynccontextmanager

        class BoundPool:
            @asynccontextmanager
            async def connection(self):
                yield conn

        response = await read_publication(dataset_id, request, BoundPool())
    return mcp_data.publication_page(response, section=section, offset=offset, limit=limit)


@router.get('/archives')
async def archives(pool: Pool, offset: Offset = 0, limit: Page = 50):
    return await mcp_data.archives(pool, offset=offset, limit=limit)


@router.get('/sources')
async def sources(pool: Pool, source_id: Text = None, days: Days = 7,
                  offset: Offset = 0, limit: Page = 50):
    return await mcp_reliability.report(pool, source_id=source_id, days=days, offset=offset, limit=limit)


@router.get('/sources/history')
async def history(pool: Pool, source_id: Annotated[str, Query(min_length=1, max_length=200)],
                  days: Days = 7, offset: Offset = 0, limit: Page = 50):
    return await mcp_reliability.history(pool, source_id, days=days, offset=offset, limit=limit)
