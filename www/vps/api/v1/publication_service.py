"""Shared public publication boundary for HTTP and MCP adapters."""

import hashlib
import json
from datetime import UTC, datetime

from endpoints.infrastructure import get_emf_sites
from fastapi import HTTPException, Request, Response
from fastapi.encoders import jsonable_encoder
from measurement_reads import core_reads


def filtered(data, params):
    """Filter stored publications without fabricating records or summary values."""
    if not isinstance(data, list):
        if params.get("year") and str(data.get("year")) != params["year"]:
            raise HTTPException(404, "No publication for requested year")
        return data
    aliases = {
        "year": "year",
        "municipality": "municipality",
        "municipality_id": "municipality_id",
        "region_code": "region_code",
        "category": "category",
        "industry_sector": "industry_sector",
    }
    result = data
    for query, field in aliases.items():
        value = params.get(query)
        if value and value != "all":
            result = [
                row
                for row in result
                if str(
                    row.get(field, row.get("fiscal_year") if field == "year" else "")
                ).casefold()
                == value.casefold()
            ]
    if params.get("search"):
        needle = params["search"].casefold()
        result = [
            row
            for row in result
            if needle
            in (
                str(row.get("title", "")) + " " + str(row.get("description", ""))
            ).casefold()
        ]
    for param, compare in (
        ("from_date", lambda a, b: a >= b),
        ("to_date", lambda a, b: a <= b),
    ):
        if params.get(param):
            result = [
                r
                for r in result
                if compare(str(r.get("start_time", ""))[:10], params[param][:10])
            ]
    return result


def cached_response(data, request, seconds, headers=None):
    body = json.dumps(
        jsonable_encoder(data),
        ensure_ascii=False,
        separators=(",", ":"),
        allow_nan=False,
    ).encode()
    etag = '"' + hashlib.sha256(body).hexdigest() + '"'
    response_headers = {
        "Cache-Control": f"public, max-age={seconds}, s-maxage={seconds}",
        "ETag": etag,
        **(headers or {}),
    }
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers=response_headers)
    return Response(body, media_type="application/json", headers=response_headers)


async def regular_offers_publication(request, pool):
    """Combine independently expiring club publications, including the legacy row."""
    async with pool.connection() as conn:
        cursor = await conn.execute(
            "SELECT * FROM collected_datasets WHERE dataset=%s OR dataset LIKE %s",
            ("social/regular-offers", "social/regular-offers/%"),
        )
        rows = await cursor.fetchall()
    # A new source-specific row supersedes its legacy publication even when expired.
    sources = {}
    for row in sorted(rows, key=lambda r: r["dataset"]):
        sources[row["source_id"]] = row
    now = datetime.now(UTC)
    fresh = [row for row in sources.values() if row["expires_at"] > now]
    if not fresh:
        raise HTTPException(
            503, "Regular offers unavailable", headers={"Cache-Control": "no-store"}
        )
    expires = min(row["expires_at"] for row in fresh)
    data = sorted(
        [offer for row in fresh for offer in row["data"]], key=lambda offer: offer["id"]
    )
    return cached_response(
        filtered(data, dict(request.query_params)),
        request,
        max(0, min(300, int((expires - now).total_seconds()))),
        {
            "X-Data-Expires-At": expires.isoformat(),
            "X-Source-Updated-At": min(
                r["source_updated_at"] for r in fresh
            ).isoformat(),
            "X-Collected-At": max(r["fetched_at"] for r in fresh).isoformat(),
            "X-Data-Source": ",".join(sorted(r["source_id"] for r in fresh)),
        },
    )


async def read_publication(dataset: str, request: Request, pool):
    if dataset == "environment/inaturalist/observations":
        from inaturalist_publication import inaturalist_data, inaturalist_response
        return inaturalist_response(await inaturalist_data(pool, 2000, 0, True))
    if dataset == "infrastructure/emf":
        return cached_response(await get_emf_sites(pool), request, 300)
    if dataset == "social/regular-offers":
        return await regular_offers_publication(request, pool)
    municipality = None
    parts = dataset.split("/")
    if len(parts) == 3 and parts[0] == "demographics" and parts[2] == "commuters":
        municipality = parts[1]
        dataset = "demographics/commuters"
    async with pool.connection() as conn:
        cursor = await conn.execute(
            ("SELECT * FROM core_statistical_datasets WHERE dataset=%s"
             if core_reads() and dataset.startswith("statistics/")
             else "SELECT * FROM core_charger_datasets WHERE dataset=%s"
             if core_reads() and dataset in {"infrastructure/ev-charging", "map/layers/charging"}
             else "SELECT * FROM core_gauge_datasets WHERE dataset=%s"
             if core_reads() and dataset in {"environment/flood/gauges", "map/layers/floods"}
             else "SELECT * FROM core_coordinate_datasets WHERE dataset=%s"
             if core_reads() and (dataset.startswith('transport/stops/') or dataset in {
                 'map/layers/companies','map/layers/crops','map/layers/crossings','map/layers/energy',
                 'map/layers/nature','map/layers/places','map/layers/wifi','waste/address-inventory','waste/calendar'})
             else "SELECT * FROM collected_datasets WHERE dataset=%s"), (dataset,)
        )
        row = await cursor.fetchone()
    if row is None:
        raise HTTPException(
            503, "Source not collected yet", headers={"Cache-Control": "no-store"}
        )
    now = datetime.now(UTC)
    # Expired measurements must not appear current, even if a collector stopped.
    if row["expires_at"] <= now:
        raise HTTPException(
            503,
            "Stored source data expired",
            headers={
                "Cache-Control": "no-store",
                ("X-Inventory-Observed-At" if dataset.startswith("infrastructure/autobahn/") else "X-Source-Updated-At"): row["source_updated_at"].isoformat(),
            },
        )
    params = dict(request.query_params)
    if dataset.startswith("demographics/") and "municipality" in params:
        params["municipality_id"] = params.pop("municipality")
    if dataset == "demographics/commuters":
        municipality = municipality or params.pop("municipality_id", None)
    data = filtered(row["data"], params)
    if municipality:
        data = [row for row in data if row.get("home_municipality_id") == municipality]
    if dataset == "social/events" and params.get("include_past") != "true":
        data = [
            event
            for event in data
            if datetime.fromisoformat(event.get("end_time") or event["start_time"])
            >= now
        ]
    ttl = max(0, min(300, int((row["expires_at"] - now).total_seconds())))
    return cached_response(
        data,
        request,
        ttl,
        {
            ("X-Inventory-Observed-At" if dataset.startswith("infrastructure/autobahn/") else "X-Source-Updated-At"): row["source_updated_at"].isoformat(),
            "X-Collected-At": row["fetched_at"].isoformat(),
            "X-Data-Expires-At": row["expires_at"].isoformat(),
            "X-Data-Source": row["source_id"],
        },
    )
