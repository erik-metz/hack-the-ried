import httpx
from broadband import import_broadband
from db_support import DatabaseCase
from test_broadband import MUNICIPALITIES, workbook


class BroadbandDatabaseTests(DatabaseCase):
    async def test_atomic_publication_and_failed_refresh_preserves_data(self):
        source = {'id': 'bba-test', 'url': 'https://example.org/bba.xlsx',
                  'municipalities': MUNICIPALITIES, 'max_age_seconds': 63072000}
        payload = workbook()
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(200, content=payload))) as client:
            await import_broadband(self.conn, client, source)
            before = await self.scalar("SELECT data FROM collected_datasets WHERE dataset='infrastructure/broadband'")
            self.assertEqual(len(before['areas']), 4)
            self.assertEqual(await self.scalar('SELECT count(*) FROM collected_payloads'), 1)
            self.assertEqual(await self.scalar("SELECT item_count FROM collection_attempts WHERE status='success'"), 4)
            self.assertIsNotNone(await self.scalar("SELECT processed_at FROM collection_attempts WHERE status='success'"))
            payload = workbook(lambda s: setattr(s['N5'], 'value', 101))
            with self.assertRaisesRegex(ValueError, 'percentage'):
                await import_broadband(self.conn, client, source)
            self.assertEqual(await self.scalar("SELECT data FROM collected_datasets WHERE dataset='infrastructure/broadband'"), before)
            self.assertEqual(await self.scalar('SELECT count(*) FROM collected_dataset_versions'), 0)
