"""Independently scheduled acquisition, and one shared persisted prediction worker."""

import argparse
import asyncio
import json
import logging
import os
import random
import signal
from datetime import UTC, datetime
from pathlib import Path

import httpx
import psycopg
from adapters import import_cross7, import_lampertheim_events, import_tiles
from autobahn_inventory import import_autobahn_inventory
from bahn import import_fasta, import_netex, import_ris_stations, import_siri
from biblis_events import import_biblis_events
from boris import import_boris
from broadband import import_broadband
from budgets import import_biblis_budget
from chargers import import_chargers
from club_events import import_club_events
from config import Settings
from ecostress import import_ecostress
from elections import import_elections
from firms import import_firms
from groundwater import import_groundwater
from gtfs import import_gtfs
from hessen import import_hessen
from inaturalist import import_inaturalist
from invekos import import_invekos
from long_term_events import import_long_term_events
from maengelmelder import import_maengelmelder
from map_tiles import import_wms
from municipal_festival_notices import import_municipal_festival_notice
from municipal_notice_events import import_municipal_notice_events
from news_events import import_news_events
from osm_addresses import import_addresses
from prediction import predict_tick
from publications import acquisition_error, import_json, public_url
from realtime import import_realtime
from regular_offers import (
    import_buerstadt_lauftreff,
    import_rompin_stompin,
    import_tv_gymnastik,
    import_tv_lauftreff,
    import_tvl_triathlon,
)
from ris_boards import import_ris_boards
from satellite import import_satellite
from social_diagnostics import CURRENT
from social_diagnostics import begin as begin_social_diagnostics
from social_diagnostics import finish as finish_social_diagnostics
from verified_christmas_markets import import_christmas_markets
from verified_club_notice import import_verified_club_notice
from verified_hcv_campaign import import_hcv_campaign
from webcam_maintenance import maintain_archive, retention_config
from webcam_snapshots import import_webcam_snapshot
from webcam_snapshots import validate_source as validate_webcam_source
from zakb import import_zakb

LOG = logging.getLogger(__name__)
ADAPTERS = {
    "webcam-snapshot": import_webcam_snapshot,
    "autobahn-inventory": import_autobahn_inventory,
    "db-netex": import_netex,
    "db-siri-fm": import_siri,
    "db-fasta": import_fasta,
    "db-ris-stations": import_ris_stations,
    "db-ris-boards": import_ris_boards,
    "osm-addresses": import_addresses,
    "biblis-budget": import_biblis_budget,
    "json": import_json,
    "wms": import_wms,
    "hessen": import_hessen,
    "bba-households": import_broadband,
    "boris-wfs": import_boris,
    "election-precincts": import_elections,
    "bnetza": import_chargers,
    "gtfs": import_gtfs,
    "cross7": import_cross7,
    "lampertheim-events": import_lampertheim_events,
    "biblis-events": import_biblis_events,
    "tribe-events": import_biblis_events,
    "municipal-notice-events": import_municipal_notice_events,
    "municipal-news-events": import_news_events,
    "long-term-events": import_long_term_events,
    "municipal-festival-notice": import_municipal_festival_notice,
    "verified-club-notice": import_verified_club_notice,
    "verified-hcv-campaign": import_hcv_campaign,
    "verified-christmas-markets": import_christmas_markets,
    "tv-lauftreff": import_tv_lauftreff,
    "tv-gymnastik": import_tv_gymnastik,
    "tvl-triathlon-offers": import_tvl_triathlon,
    "buerstadt-lauftreff": import_buerstadt_lauftreff,
    "rompin-stompin-offers": import_rompin_stompin,
    "club-events": import_club_events,
    "tiles": import_tiles,
    "gtfs-rt": import_realtime,
    "zakb": import_zakb,
    "hlnug-groundwater": import_groundwater,
    "invekos": import_invekos,
    "sentinel-satellite": import_satellite,
    "ecostress": import_ecostress,
    "firms": import_firms,
    "inaturalist": import_inaturalist,
    "maengelmelder": import_maengelmelder,
}


def sources():
    path = Path(
        os.getenv("SOURCE_MANIFEST", str(Path(__file__).with_name("sources.json")))
    )
    result = json.loads(path.read_text())["sources"]
    ids = [s["id"] for s in result]
    if len(ids) != len(set(ids)):
        raise ValueError("Duplicate source identifiers")
    for source in result:
        if source["adapter"] not in ADAPTERS or source.get("interval_seconds", 0) < 30:
            raise ValueError("Invalid adapter/cadence")
        if source.get("enabled") and not source.get("url"):
            raise ValueError("Enabled source has no URL")
        if source["adapter"] == "webcam-snapshot":
            validate_webcam_source(source)
    return result


async def register_source(conn, source):
    await conn.execute(
        """INSERT INTO collection_sources(id,source_url,adapter,enabled,interval_seconds,description)
        VALUES (%s,%s,%s,%s,%s,%s) ON CONFLICT(id) DO UPDATE SET source_url=EXCLUDED.source_url,
        adapter=EXCLUDED.adapter,enabled=EXCLUDED.enabled,interval_seconds=EXCLUDED.interval_seconds,
        description=EXCLUDED.description,updated_at=NOW()""",
        (
            source["id"],
            public_url(source.get("url", "")),
            source["adapter"],
            source.get("enabled", False),
            source["interval_seconds"],
            source.get("reason"),
        ),
    )
    await conn.commit()


async def collect(source, settings):
    if not source.get("enabled"):
        async with await psycopg.AsyncConnection.connect(**settings.db) as conn:
            await register_source(conn, source)
            await conn.execute(
                "INSERT INTO collection_attempts(source_id,status,error) VALUES (%s,'not_configured',%s)",
                (source["id"], source.get("reason", "Source not configured")),
            )
        return {"source_id": source["id"], "status": "not_configured"}
    async with await psycopg.AsyncConnection.connect(**settings.db) as conn:
        await register_source(conn, source)
        cursor = await conn.execute(
            "SELECT pg_try_advisory_lock(hashtext(%s))", (source["id"],)
        )
        if not (await cursor.fetchone())[0]:
            return {"source_id": source["id"], "status": "already_running"}
        await conn.commit()
        social_token = begin_social_diagnostics() if source.get("group") == "social" else None
        started_cursor = await conn.execute("SELECT clock_timestamp()")
        started = (await started_cursor.fetchone())[0]
        await conn.commit()
        try:
            async with httpx.AsyncClient(
                timeout=120,
                follow_redirects=True,
                headers={"User-Agent": "OpenRiedSens-Collector/2.0"},
            ) as client:
                status = await ADAPTERS[source["adapter"]](conn, client, source)
            if social_token is not None:
                await finish_social_diagnostics(conn, source, started)
            return {"source_id": source["id"], "status": status or "success"}
        except Exception as exc:  # noqa: BLE001 - isolate source jobs; record failure without secret URLs
            await conn.rollback()
            await conn.execute(
                "INSERT INTO collection_attempts(source_id,status,error,error_stage) VALUES (%s,'failed',%s,%s)",
                (source["id"], acquisition_error(exc),
                 "acquisition" if isinstance(exc, httpx.HTTPError) else
                 "storage" if isinstance(exc, (psycopg.Error, OSError)) else "processing"),
            )
            await conn.commit()
            # Do not log a credential-bearing request URL from the exception.
            LOG.error("Source %s failed (%s)", source["id"], acquisition_error(exc))
            return {"source_id": source["id"], "status": "failed"}
        finally:
            if social_token is not None:
                CURRENT.reset(social_token)
            await conn.execute(
                "SELECT pg_advisory_unlock(hashtext(%s))", (source["id"],)
            )
            await conn.commit()


async def run_group(group, settings, dry_run=False):
    selected = [s for s in sources() if s.get("group") == group]
    if dry_run:
        # Offline manifest validation; never fetch or claim imported rows.
        return {
            "job_name": group,
            "status": "validated",
            "rows_ingested": 0,
            "sources": len(selected),
        }
    results = [await collect(source, settings) for source in selected]
    status = (
        "success"
        if results and all(r["status"] == "success" for r in results)
        else "not_configured"
        if not results or all(r["status"] == "not_configured" for r in results)
        else "partial"
    )
    return {"job_name": group, "status": status, "sources": results}


async def sleep_until_stop(stop, seconds):
    try:
        await asyncio.wait_for(stop.wait(), timeout=seconds)
    except TimeoutError:
        pass


async def bounded_collect(source, settings, slots, gtfs_slot):
    # Acquire the GTFS gate first so a second large import cannot occupy a
    # general slot while waiting. National feeds are expensive to parse.
    if source["adapter"] in {"gtfs", "osm-addresses", "db-netex"}:
        async with gtfs_slot, slots:
            return await collect(source, settings)
    async with slots:
        return await collect(source, settings)


async def source_loop(source, settings, stop, slots, gtfs_slot):
    failures = 0
    while not stop.is_set():
        try:
            result = await bounded_collect(source, settings, slots, gtfs_slot)
        except Exception as exc:  # noqa: BLE001 - isolate source jobs; record failure without secret URLs
            LOG.error(
                "Source connection failed: %s (%s)", source["id"], type(exc).__name__
            )
            result = {"status": "failed"}
        failures = failures + 1 if result["status"] == "failed" else 0
        interval = source["interval_seconds"]
        if failures:
            backoff = min(interval, 300) * min(2**min(failures, 4), 12)
            interval = max(interval, backoff) if source.get("adapter") == "webcam-snapshot" else backoff
        elif result["status"] == "partial":
            interval = min(interval, max(30, source.get("partial_retry_seconds", 300)))
        # Avoid synchronized provider bursts after simultaneous worker restarts.
        await sleep_until_stop(stop, interval * random.uniform(1.0 if source.get("adapter") == "webcam-snapshot" else 0.9, 1.1))


async def prediction_loop(settings, stop):
    while not stop.is_set():
        try:
            async with await psycopg.AsyncConnection.connect(**settings.db) as conn:
                await predict_tick(conn)
        except Exception as exc:  # noqa: BLE001 - isolate source jobs; record failure without secret URLs
            LOG.error("Prediction tick failed (%s)", type(exc).__name__)
        await sleep_until_stop(stop, 10 - datetime.now(UTC).timestamp() % 10)


async def webcam_maintenance_loop(settings, stop):
    while not stop.is_set():
        try:
            async with await psycopg.AsyncConnection.connect(**settings.db) as conn:
                result = await maintain_archive(conn)
            LOG.info("Webcam archive maintenance: %s", result)
        except Exception as exc:  # noqa: BLE001 - retry next cycle without stopping acquisition
            LOG.error("Webcam archive maintenance failed (%s)", type(exc).__name__)
        await sleep_until_stop(stop, 3600)


async def health_heartbeat_loop(stop):
    path = Path("/tmp/registry-sync-heartbeat")
    while not stop.is_set():
        path.touch()
        await sleep_until_stop(stop, 30)


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--job")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--webcam-maintenance", action="store_true")
    args = parser.parse_args()
    manifest = sources()
    settings = Settings.from_env()
    retention_config()
    if args.dry_run:
        print(
            json.dumps(
                {"status": "validated", "sources": len(manifest), "rows_ingested": 0}
            )
        )
        return
    if args.webcam_maintenance:
        async with await psycopg.AsyncConnection.connect(**settings.db) as conn:
            print(json.dumps(await maintain_archive(conn)))
        return
    if args.all or args.job:
        selected = [
            s for s in manifest if not args.job or args.job in (s["id"], s.get("group"))
        ]
        if not selected:
            raise SystemExit("Unknown source/group")
        results = [await collect(s, settings) for s in selected]
        print(json.dumps(results))
        raise SystemExit(0 if all(r["status"] == "success" for r in results) else 1)
    stop = asyncio.Event()
    concurrency = int(os.getenv("COLLECTOR_CONCURRENCY", "2"))
    if not 1 <= concurrency <= 8:
        raise ValueError("COLLECTOR_CONCURRENCY must be between 1 and 8")
    slots = asyncio.Semaphore(concurrency)
    gtfs_slot = asyncio.Semaphore(1)
    # Reserve a separate connection for short realtime jobs; a daily import
    # must not delay these or the independent prediction loop.
    realtime_slot = asyncio.Semaphore(1)
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, stop.set)
    await asyncio.gather(
        health_heartbeat_loop(stop),
        prediction_loop(settings, stop),
        webcam_maintenance_loop(settings, stop),
        *(source_loop(s, settings, stop,
                      realtime_slot if s["adapter"] in {"gtfs-rt", "db-siri-fm", "db-fasta", "db-ris-boards"} else slots,
                      gtfs_slot) for s in manifest),
    )
