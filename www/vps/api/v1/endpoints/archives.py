from datetime import datetime
from typing import Literal

import psycopg_pool
from dependencies import get_db_pool
from fastapi import APIRouter, Depends
from measurement_reads import read_sql
from pydantic import BaseModel

router = APIRouter()


class ArchiveFile(BaseModel):
    filename: str
    format: Literal["csv", "parquet"]
    url: str
    size_bytes: int
    reading_count: int
    sha256: str


class Archive(BaseModel):
    month: str
    format_version: int
    generated_at: datetime
    is_complete: bool
    reading_count: int
    size_bytes: int
    files: list[ArchiveFile]


@router.get(
    "/archives",
    tags=["Archives Public"],
    summary="List public monthly data downloads",
    response_model=list[Archive],
)
async def list_archives(pool: psycopg_pool.AsyncConnectionPool = Depends(get_db_pool)):
    """Monthly ZIP parts without the interactive API row limit. Download every
    part of a month for its full snapshot; late data may require a new version.
    Snapshots containing stations which became private are not listed.
    """
    async with pool.connection() as conn:
        cur = await conn.execute(read_sql("""
            SELECT month, format_version, generated_at, is_complete, reading_count, size_bytes, files
            FROM data_archives a
            WHERE NOT EXISTS (
                SELECT 1 FROM unnest(a.station_ids) AS included(station_id)
                WHERE NOT EXISTS (SELECT 1 FROM sensor_metadata s
                    WHERE s.id = included.station_id AND NOT s.is_hidden)
            )
            AND NOT EXISTS (
                SELECT 1 FROM unnest(a.entity_ids) AS included(entity_id)
                WHERE NOT EXISTS (SELECT 1 FROM entities e WHERE e.id=included.entity_id
                    AND NOT e.is_hidden AND e.metadata->>'legacy_deleted' IS DISTINCT FROM 'true')
            )
            ORDER BY month DESC;
        """))
        rows = await cur.fetchall()
    return [
        {
            **{key: row[key] for key in ("month", "format_version", "generated_at", "is_complete", "reading_count", "size_bytes")},
            "files": [
                {**{key: file[key] for key in ("filename", "url", "size_bytes", "reading_count", "sha256")},
                 "format": file.get("format", "csv")}
                for file in row["files"]
            ],
        }
        for row in rows
    ]
