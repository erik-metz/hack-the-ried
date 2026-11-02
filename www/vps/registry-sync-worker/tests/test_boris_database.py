from urllib.parse import parse_qs

import httpx
from boris import import_boris
from db_support import DatabaseCase
from test_boris import SOURCE, page


class BorisDatabaseTests(DatabaseCase):
    async def test_archive_all_pages_and_atomically_publish_both_datasets(self):
        requests = []
        def respond(request):
            offset = parse_qs(request.url.query.decode())['startIndex'][0]
            requests.append(offset)
            return httpx.Response(200, content=page(offset != '0'))
        async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
            await import_boris(self.conn, client, SOURCE)
        self.assertEqual(requests, ['0', '100'])
        data = await self.scalar("SELECT data FROM collected_datasets WHERE dataset='realestate/boris'")
        self.assertEqual(len(data), 4)
        geo = await self.scalar("SELECT data FROM collected_datasets WHERE dataset='map/layers/boris'")
        self.assertEqual(geo['features'][0]['geometry'], data[0]['geometry'])
        self.assertEqual(await self.scalar('SELECT count(*) FROM collected_payloads'), 3)
        self.assertEqual(await self.scalar('SELECT count(*) FROM collected_payloads WHERE body IS NOT NULL'),0)
        self.assertGreater(await self.scalar("SELECT size_bytes FROM collected_payloads WHERE content_type LIKE 'application/vnd.openried.%'"),0)
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(200, content=page()))) as client:
            with self.assertRaisesRegex(ValueError, 'pagination'):
                await import_boris(self.conn, client, SOURCE)
        self.assertEqual(await self.scalar("SELECT data FROM collected_datasets WHERE dataset='realestate/boris'"), data)
        self.assertEqual(await self.scalar('SELECT count(*) FROM collected_dataset_versions'), 0)

    async def test_missing_municipality_does_not_publish(self):
        source = {**SOURCE, 'municipalities': {**SOURCE['municipalities'], '06431099': 'Fehlt'}}
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(200, content=page(parse_qs(r.url.query.decode())['startIndex'][0] != '0')))) as client:
            with self.assertRaisesRegex(ValueError, 'Incomplete'):
                await import_boris(self.conn, client, source)
        self.assertEqual(await self.scalar('SELECT count(*) FROM collected_datasets'), 0)
