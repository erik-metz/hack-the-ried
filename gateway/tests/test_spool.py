import asyncio
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

BRIDGE = Path(__file__).resolve().parents[1]/'bridge'
sys.path.insert(0,str(BRIDGE))
from spool import Spool
from bridge import Bridge, downlink_fresh, valid_target
from websockets.legacy.client import connect


class SpoolTests(unittest.TestCase):
    def test_durable_order_and_unknown_sends_survive_restart(self):
        with tempfile.TemporaryDirectory() as d:
            s=Spool(d,'ttn')
            first=s.append({'msgtype':'updf','FCnt':10},'boot-a')
            s.append({'msgtype':'updf','FCnt':11},'boot-a')
            s.attempted(first); s.close()
            s=Spool(d,'ttn')
            self.assertEqual(s.candidate()[0],first)
            self.assertEqual(s.status()['pending'],1)
            self.assertEqual(s.status()['acceptance_unknown'],1)
            self.assertEqual(json.loads(s.candidate(first)[3])['FCnt'],11)
            s.close()

    def test_limits_and_profile_isolation_are_explicit(self):
        with tempfile.TemporaryDirectory() as d:
            now=[100.0]
            s=Spool(d,'a',max_rows=2,max_age=10,clock=lambda:now[0])
            for i in range(3): s.append({'FCnt':i},'boot')
            self.assertEqual(s.status()['counters']['overflow_dropped'],1)
            s.profile='b'; self.assertIsNone(s.candidate())
            now[0]=120; s.prune()
            self.assertEqual(s.status()['rows'],0)
            self.assertEqual(s.status()['counters']['expired'],2)
            s.close()

    def test_discovery_cannot_exfiltrate_key(self):
        self.assertTrue(valid_target('wss://eu1.cloud.thethings.network:8887/path','eu1.cloud.thethings.network'))
        for uri in ['ws://eu1.cloud.thethings.network/path','wss://evil.example:8887',
                    'wss://key@eu1.cloud.thethings.network:8887']:
            self.assertFalse(valid_target(uri,'eu1.cloud.thethings.network'))

    def test_stale_class_a_downlink_is_blocked(self):
        m=dict(msgtype='dnmsg',dC=0,rctx=0,xtime=123,RxDelay=1)
        self.assertTrue(downlink_fresh(m,{(0,123):99.5},100))
        self.assertFalse(downlink_fresh(m,{(0,123):80},100))
        self.assertFalse(downlink_fresh(m,{},100))


class OfflineBridgeTests(unittest.IsolatedAsyncioTestCase):
    async def test_backlog_precedes_live_traffic_and_is_retained_as_unknown(self):
        from websockets.legacy.server import serve
        import bridge as module
        received=[]
        config=dict(msgtype='router_config',region='EU868')
        async def lns(ws,path):
            if path.endswith('/router-info'):
                await ws.recv()
                await ws.send(json.dumps(dict(uri='wss://127.0.0.1:8887/traffic')))
            else:
                await ws.recv()
                await ws.send(json.dumps(config))
                async for raw in ws:
                    received.append(json.loads(raw)['FCnt'])
        with tempfile.TemporaryDirectory() as d:
            b=Bridge(d,'wss://127.0.0.1:8887','0102030405060708','NNSXS.test')
            b.spool.append(dict(msgtype='updf',FCnt=100),'previous-boot')
            b.spool.append(dict(msgtype='updf',FCnt=101),'previous-boot')
            async with serve(lns,'127.0.0.1',0) as server:
                port=server.sockets[0].getsockname()[1]
                def test_connect(uri,**kwargs):
                    return connect('ws://127.0.0.1:'+str(port)+urlsplit(uri).path,**kwargs)
                from urllib.parse import urlsplit
                async with serve(b.handler,'127.0.0.1',0) as local:
                    local_port=local.sockets[0].getsockname()[1]
                    with patch.object(module,'connect',side_effect=test_connect):
                        async with connect(f'ws://127.0.0.1:{local_port}') as radio:
                            await radio.send(json.dumps(dict(msgtype='version',protocol=2)))
                            self.assertEqual(json.loads(await radio.recv())['region'],'EU868')
                            await radio.send(json.dumps(dict(msgtype='updf',FCnt=102)))
                            for _ in range(200):
                                if len(received)==3: break
                                await asyncio.sleep(.01)
                            self.assertEqual(received,[100,101,102])
                            self.assertEqual(b.spool.status()['acceptance_unknown'],3)
                            self.assertEqual(b.spool.status()['rows'],3)
            b.spool.close()

    async def test_offline_coldstart_uses_cache_and_persists_radio_frames(self):
        with tempfile.TemporaryDirectory() as d:
            b=Bridge(d,'wss://127.0.0.1:1','0102030405060708','NNSXS.test',port=0)
            b.spool.set('router_config:'+b.spool.profile,dict(msgtype='router_config',region='EU868'))
            from websockets.legacy.server import serve
            async with serve(b.handler,'127.0.0.1',0) as server:
                port=server.sockets[0].getsockname()[1]
                b.port=port
                async with connect(f'ws://127.0.0.1:{port}/router-info') as discovery:
                    await discovery.send(json.dumps({'router':'1:2:3:4'}))
                    reply=json.loads(await discovery.recv())
                    self.assertEqual(reply['uri'],f'ws://127.0.0.1:{port}/traffic')
                async with connect(f'ws://127.0.0.1:{port}') as radio:
                    await radio.send(json.dumps(dict(msgtype='version',protocol=2)))
                    config=json.loads(await asyncio.wait_for(radio.recv(),2))
                    self.assertEqual(config['region'],'EU868')
                    await radio.send(json.dumps(dict(msgtype='updf',FCnt=42,upinfo=dict(xtime=100,rctx=0))))
                    for _ in range(100):
                        if b.spool.status()['rows']: break
                        await asyncio.sleep(.01)
                    self.assertEqual(b.spool.status()['pending'],1)
            b.spool.close()
            journal=Spool(d,b.spool.profile)
            self.assertEqual(json.loads(journal.candidate()[3])['FCnt'],42)
            journal.close()


class GuardianTests(unittest.TestCase):
    def test_pin_changes_only_image_and_preserves_key(self):
        path=Path(__file__).resolve().parents[1]/'scripts/gateway-guardian.py'
        spec=importlib.util.spec_from_file_location('guardian',path)
        guardian=importlib.util.module_from_spec(spec); spec.loader.exec_module(guardian)
        with tempfile.TemporaryDirectory() as d:
            env=Path(d)/'.env'; env.write_text('TC_KEY=NNSXS.synthetic\nGATEWAY_IMAGE=pilot\nGATEWAY_EUI=1234\n')
            guardian.pin_image(env,'kamue-gateway-rollback:abcdef')
            self.assertIn('TC_KEY=NNSXS.synthetic\n',env.read_text())
            self.assertEqual(env.stat().st_mode & 0o777,0o600)
            self.assertIn('GATEWAY_IMAGE=kamue-gateway-rollback:abcdef',env.read_text())
