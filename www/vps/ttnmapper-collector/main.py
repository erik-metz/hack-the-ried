"""Collect complete LoRaWAN gateway coverage from Packet Broker & TTN Mapper and persist atomically."""

from dataclasses import asdict
from datetime import UTC, datetime
from time import monotonic

import collection_status
import psycopg
from config import Settings
from normalize import compute_ried_snapshot, normalize_gateways_payload
from runtime import cli
from runtime import run as run_loop
from source import fetch_gateways
from storage import persist_gateways


async def poll_cycle(client, settings, *, raw=None, dry_run=False):
    if dry_run:
        return await _poll_cycle(client, settings, raw=raw, dry_run=True)
    attempt_id = await collection_status.start(settings, 'ttnmapper')
    try:
        result = await _poll_cycle(client, settings, raw=raw, attempt_id=attempt_id)
        await collection_status.finish(settings, attempt_id, result['gateways_count'], 'gateways',
                                       partial_error=None if result['gateways_count'] else
                                       'No usable regional gateways produced')
        return result
    except Exception as exc:
        await collection_status.fail(settings, attempt_id, exc)
        raise


async def _poll_cycle(client, settings, *, raw=None, dry_run=False, attempt_id=None):
    started = monotonic()
    if raw is None:
        raw_gateways, raw_bytes, sha256 = await fetch_gateways(settings, client)
        await collection_status.received(settings, attempt_id)
    else:
        raw_gateways = raw
        raw_bytes = None
        sha256 = None

    fetched_at = datetime.now(UTC)
    fetched = monotonic()

    gateways = normalize_gateways_payload(raw_gateways, settings, fetched_at)
    snapshot = compute_ried_snapshot(gateways, fetched_at)
    normalized = monotonic()

    summary = {
        "fetched_at": fetched_at.isoformat(),
        "gateways_count": len(gateways),
        "active_gateways": snapshot.active_gateways,
        "outdoor_gateways": snapshot.outdoor_gateways,
        "indoor_gateways": snapshot.indoor_gateways,
        "online_ratio_pct": snapshot.online_ratio_pct,
        "region_center": [settings.center_lat, settings.center_lon],
        "radius_meters": settings.radius_meters,
        "complete": True,
    }

    if dry_run:
        return {
            **summary,
            "gateways": [asdict(g) for g in gateways],
            "snapshot": asdict(snapshot),
        }

    async with await psycopg.AsyncConnection.connect(**settings.db) as conn:
        ingestion = await persist_gateways(
            conn,
            gateways,
            snapshot,
            settings,
            fetched_at,
            payload_bytes=raw_bytes,
            payload_sha256=sha256,
            attempt_id=attempt_id,
        )
        summary["ingestion"] = ingestion

    summary["durations_seconds"] = {
        "fetch": fetched - started,
        "normalize": normalized - fetched,
        "persist": monotonic() - normalized,
    }
    return summary


async def run(settings, **options):
    await run_loop(settings, poll_cycle, "TTNMapperCollector", **options)


if __name__ == "__main__":
    cli(Settings.from_env, run)
