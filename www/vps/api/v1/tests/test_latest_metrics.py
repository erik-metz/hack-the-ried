import unittest
from unittest.mock import AsyncMock, MagicMock

from endpoints.telemetry import get_latest_sensor_metrics


def pool_with(*results):
    pool = MagicMock(); conn = MagicMock(); cursors = []
    for rows in results:
        cursor = MagicMock(); cursor.fetchall = AsyncMock(return_value=rows); cursors.append(cursor)
    pool.connection.return_value.__aenter__.return_value = conn
    conn.execute = AsyncMock(side_effect=cursors)
    return pool, conn


class LatestMetricsTests(unittest.IsolatedAsyncioTestCase):
    async def test_latest_projection_is_a_key_lookup_without_history_scan(self):
        row = {'timestamp': '2026-11-27T09:30:00Z', 'sensor_id': 'pegel-rhein-worms', 'value': 1.72, 'unit': 'm', 'metric': 'water_level'}
        pool, conn = pool_with([row])
        self.assertEqual(await get_latest_sensor_metrics('pegel-rhein-worms', pool), [row])
        self.assertEqual(conn.execute.await_count, 1)
        self.assertIn('sensor_latest', conn.execute.await_args.args[0])
        self.assertNotIn('sensor_data', conn.execute.await_args.args[0])

    async def test_series_without_projection_fall_back_to_history(self):
        row = {'timestamp': '2026-11-27T09:30:00Z', 'sensor_id': 'x', 'value': 1, 'unit': 'm', 'metric': 'm'}
        pool, conn = pool_with([], [row])
        self.assertEqual(await get_latest_sensor_metrics('x', pool), [row])
        self.assertIn('sensor_data', conn.execute.await_args_list[1].args[0])
