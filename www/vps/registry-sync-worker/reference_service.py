"""Isolated slow-reference scheduler using the existing collector image/pipeline."""
import asyncio
import logging
import signal
from datetime import UTC, datetime

import psycopg
from config import Settings
from reference_data import stamp
from runner import collect, health_heartbeat_loop, sleep_until_stop, sources

LOG = logging.getLogger(__name__)


async def loop(source, settings, stop, slot):
    while not stop.is_set():
        try:
            # Long downloads and historical imports never consume realtime-worker slots.
            async with slot:
                result = await collect(source, settings)
            delay = 600 if result['status'] == 'failed' else source['interval_seconds']
            if result['status'] != 'failed':
                async with await psycopg.AsyncConnection.connect(**settings.db) as conn:
                    row = await (await conn.execute('SELECT metadata FROM entities WHERE id=%s',
                                                   ('reference-source:' + source['layer'],))).fetchone()
                if row:
                    due = stamp(row[0]['checked_at']).timestamp() + source['interval_seconds']
                    delay = max(30, due - datetime.now(UTC).timestamp())
        except Exception as exc:  # noqa: BLE001 - one failed provider must not stop other sources
            LOG.error('Reference source %s failed (%s)',source['id'],type(exc).__name__)
            delay = 600
        await sleep_until_stop(stop, delay)


async def main():
    settings = Settings.from_env()
    selected = [s for s in sources() if s.get('group') == 'reference' and s.get('enabled')]
    stop = asyncio.Event()
    for sig in (signal.SIGTERM, signal.SIGINT):
        asyncio.get_running_loop().add_signal_handler(sig, stop.set)
    slot = asyncio.Semaphore(1)
    await asyncio.gather(health_heartbeat_loop(stop), *(loop(s,settings,stop,slot) for s in selected))


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    asyncio.run(main())
