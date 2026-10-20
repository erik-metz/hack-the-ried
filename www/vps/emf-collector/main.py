"""Main entrypoint and orchestrator for BNetzA EMF collector."""

import asyncio
import logging
import sys
from datetime import UTC, datetime
from pathlib import Path
from time import monotonic

import collection_status
import httpx
import psycopg
from client import BNetzAEmfClient
from config import Settings
from normalize import normalize_site
from storage import persist_emf_sites

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
LOG = logging.getLogger("emf-collector")


async def _heartbeat_loop():
    path = Path("/tmp/emf-heartbeat")
    while True:
        path.touch()
        await asyncio.sleep(30)


async def _poll_cycle(
    client: httpx.AsyncClient,
    settings: Settings,
    *,
    dry_run: bool = False,
    fetch_details: bool = True,
    max_details: int | None = None,
    attempt_id: int | None = None,
) -> dict:
    """Execute one complete EMF collection cycle for the configured BBox."""
    started = monotonic()
    emf_client = BNetzAEmfClient(settings, client)

    LOG.info(
        "Fetching EMF sites for BBOX [%s,%s] to [%s,%s]...",
        settings.min_lat,
        settings.min_lon,
        settings.max_lat,
        settings.max_lon,
    )
    raw_sites = await emf_client.get_all_sites_tiled(
        settings.min_lat, settings.max_lat, settings.min_lon, settings.max_lon
    )
    LOG.info("Discovered %d raw sites from BNetzA API", len(raw_sites))

    normalized_sites = []
    details_count = 0
    detail_failures = 0

    for raw in raw_sites:
        fid = int(raw["fID"])
        details = None
        if fetch_details and (max_details is None or details_count < max_details):
            try:
                # Small pause to avoid aggressive throttling by BNetzA webserver
                await asyncio.sleep(0.1)
                details = await emf_client.get_site_details(fid)
                details_count += 1
            except Exception as e:  # noqa: BLE001 - keep usable sites, report partial details
                detail_failures += 1
                LOG.warning("Failed to fetch detail for FID %d: %s", fid, type(e).__name__)

        normalized = normalize_site(raw, details)
        normalized_sites.append(normalized)

    await collection_status.received(settings, attempt_id)

    LOG.info(
        "Normalized %d sites (with %d detailed HTML fetches)",
        len(normalized_sites),
        details_count,
    )

    now = datetime.now(UTC)
    duration_sec = round(monotonic() - started, 2)

    if dry_run:
        return {
            "status": "dry_run",
            "sites_count": len(normalized_sites),
            "details_count": details_count,
            "duration_sec": duration_sec,
            "sample": normalized_sites[0].__dict__ if normalized_sites else None,
        }

    async with await psycopg.AsyncConnection.connect(**settings.db) as conn:
        stats = await persist_emf_sites(conn, normalized_sites, now=now)

    LOG.info("Persist complete in %s seconds: %s", duration_sec, stats)
    return {
        "status": "partial" if detail_failures else "success",
        "detail_failures": detail_failures,
        "sites_count": len(normalized_sites),
        "details_count": details_count,
        "duration_sec": duration_sec,
        **stats,
    }


async def poll_cycle(client, settings, *, dry_run=False, fetch_details=True, max_details=None):
    if dry_run:
        return await _poll_cycle(client, settings, dry_run=True,
                                 fetch_details=fetch_details, max_details=max_details)
    attempt_id = await collection_status.start(settings, 'bnetza-emf')
    try:
        result = await _poll_cycle(client, settings, fetch_details=fetch_details,
                                   max_details=max_details, attempt_id=attempt_id)
        partial_error = (f"{result['detail_failures']} site detail requests failed"
                         if result['detail_failures'] else
                         None if result['sites_count'] else 'No usable regional sites produced')
        await collection_status.finish(settings, attempt_id, result['sites_count'], 'sites',
                                       partial_error=partial_error,
                                       error_stage="acquisition" if result["detail_failures"] else "processing")
        return result
    except Exception as exc:
        await collection_status.fail(settings, attempt_id, exc)
        raise


async def main():
    settings = Settings.from_env()
    dry_run = "--dry-run" in sys.argv
    once = "--once" in sys.argv or dry_run

    async with httpx.AsyncClient(
        headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)",
            "Referer": f"{settings.base_url}/DE/Vportal/TK/Funktechnik/EMF/start.html",
        },
        timeout=25.0,
        follow_redirects=True,
    ) as http_client:
        if once:
            res = await poll_cycle(http_client, settings, dry_run=dry_run)
            LOG.info("Run finished: %s", res)
            return

        heartbeat = asyncio.create_task(_heartbeat_loop())
        try:
            while True:
                try:
                    await poll_cycle(http_client, settings)
                except Exception:
                    LOG.exception("Error in EMF collection cycle")
                LOG.info("Sleeping for %d seconds...", settings.poll_seconds)
                await asyncio.sleep(settings.poll_seconds)
        finally:
            heartbeat.cancel()
            await asyncio.gather(heartbeat, return_exceptions=True)


if __name__ == "__main__":
    asyncio.run(main())
