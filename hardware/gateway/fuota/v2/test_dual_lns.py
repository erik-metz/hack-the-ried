import asyncio
import json
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from websockets.legacy.server import serve

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'bridge'))
sys.path.insert(0, str(Path(__file__).parent))
from dual_lns import StationRouter, compatible, private_uplink, secondary_target


def config(frequency=868100000):
    return dict(msgtype='router_config',region='EU868',NetID=[19],
        DRs=[[sf,125,0] for sf in range(12,6,-1)]+[[7,250,0],[0,0,0]]+[[0,0,0] for _ in range(8)],
        sx1301_conf=[dict(radio_0=dict(freq=frequency),chan_multiSF_0=dict(enable=True,radio=0,**{'if':0}))])


class Socket:
    def __init__(self):
        self.sent = []
        self.messages = []
        self.closed = False

    async def send(self, raw):
        self.sent.append(json.loads(raw))

    async def __aiter__(self):
        for message in self.messages:
            yield json.dumps(message)

    async def close(self):
        self.closed = True


class RoutingTests(unittest.IsolatedAsyncioTestCase):
    def owner(self):
        return SimpleNamespace(devices={'70B3D57ED0079D88'},router_id='0102030405060708',record_private=lambda message,now:None)

    async def test_private_devices_are_not_fallback_forwarded_to_ttn(self):
        station = Socket()
        station.messages = [dict(msgtype='jreq',DevEui='70-B3-D5-7E-D0-07-9D-88'),
            dict(msgtype='updf',DevAddr=0x01000001), dict(msgtype='updf',DevAddr=0x26000001)]
        router = StationRouter(station,self.owner())
        self.assertEqual([json.loads(m) async for m in router], [station.messages[-1]])
        # Secondary is offline: private traffic is dropped, never sent to TTN.

    async def test_identical_lns_ids_get_distinct_station_ids_and_ack_owners(self):
        station, secondary = Socket(), Socket()
        router = StationRouter(station,self.owner())
        router.secondary, router.secondary_ready = secondary, True
        await router.to_station(dict(msgtype='dnmsg',diid=7), 'ttn')
        await router.to_station(dict(msgtype='dnmsg',diid=7,MuxTime=123), 'chirpstack')
        first, second = station.sent
        self.assertNotEqual(first['diid'],second['diid'])
        self.assertNotIn('MuxTime',second)
        station.messages = [dict(msgtype='dntxed',diid=second['diid']),
            dict(msgtype='dntxed',diid=first['diid']),dict(msgtype='dntxed',diid=123456)]
        self.assertEqual([json.loads(m) async for m in router], [dict(msgtype='dntxed',diid=7)])
        self.assertEqual(secondary.sent,[dict(msgtype='dntxed',diid=7)])

    async def test_only_primary_controls_radio_and_duty_cycle_stays_enabled(self):
        station = Socket()
        router = StationRouter(station,self.owner())
        primary = config()
        primary['nodc'] = True
        await router.to_station(primary, 'ttn')
        await router.to_station(config(867100000), 'chirpstack')
        self.assertEqual(len(station.sent),1)
        self.assertEqual(station.sent[0]['NetID'],[0,19])
        self.assertFalse(station.sent[0]['nodc'])
        self.assertEqual(station.sent[0]['sx1301_conf'],primary['sx1301_conf'])
        primary['NetID'] = None
        await router.to_station(primary, 'ttn')
        self.assertIsNone(station.sent[-1]['NetID'])

    def test_discovery_is_host_bound_and_radio_plans_must_match(self):
        uri = 'ws://gateway-bridge:3001'
        self.assertTrue(secondary_target(uri+'/gateway/1', uri))
        for target in ['ws://evil.example:3001/','ws://gateway-bridge:1234/','ws://user@gateway-bridge:3001/']:
            self.assertFalse(secondary_target(target,uri))
        self.assertTrue(compatible(config(),config()))
        self.assertFalse(compatible(config(),config(867100000)))
        self.assertFalse(compatible(config(),dict(config(),DRs=[])))
        secondary=config()
        secondary['DRs'][8:]=[[-1,0,0] for _ in range(8)]
        self.assertTrue(compatible(config(),secondary))
        del secondary['sx1301_conf'][0]['chan_multiSF_0']['radio']
        del secondary['sx1301_conf'][0]['chan_multiSF_0']['if']
        self.assertTrue(compatible(config(),secondary))
        secondary['DRs'][5]=[8,125,0]
        self.assertFalse(compatible(config(),secondary))
        self.assertFalse(compatible(dict(config(),DRs=[]),dict(config(),DRs=[])))
        self.assertFalse(private_uplink(dict(msgtype='updf',DevAddr='0'),set()))

    async def test_primary_plan_change_pauses_incompatible_secondary(self):
        station, secondary = Socket(), Socket()
        router = StationRouter(station,self.owner())
        router.secondary, router.secondary_ready, router.secondary_config = secondary, True, config()
        await router.to_station(config(867100000),'ttn')
        self.assertFalse(router.secondary_ready)
        self.assertTrue(secondary.closed)

    async def test_real_secondary_discovery_version_downlink_and_ack_exchange(self):
        acknowledged = asyncio.Event()
        async def handler(websocket,path):
            self.assertIsNone(websocket.request_headers.get('Authorization'))
            if path.endswith('/router-info'):
                await websocket.recv()
                await websocket.send(json.dumps({'uri':uri+'/traffic'}))
                return
            version = json.loads(await websocket.recv())
            self.assertEqual(version['msgtype'],'version')
            await websocket.send(json.dumps(config()))
            await websocket.send(json.dumps(dict(msgtype='dnmsg',dC=2,diid=7,RX2Freq=869525000,RX2DR=3)))
            answer = json.loads(await websocket.recv())
            self.assertEqual(answer['diid'],7)
            acknowledged.set()
        async with serve(handler,'127.0.0.1',0) as server:
            uri = 'ws://127.0.0.1:'+str(server.sockets[0].getsockname()[1])
            owner = self.owner()
            owner.secondary_uri = uri
            station = Socket()
            router = StationRouter(station,owner)
            router.version = dict(msgtype='version',protocol=2)
            await router.to_station(config(),'ttn')
            router.secondary_task = asyncio.create_task(router.secondary_loop())
            try:
                for _ in range(200):
                    if len(station.sent) > 1:
                        break
                    await asyncio.sleep(.01)
                self.assertTrue(router.secondary_ready)
                downlink = station.sent[-1]
                self.assertEqual(downlink['msgtype'],'dnmsg')
                station.messages = [dict(msgtype='dntxed',diid=downlink['diid'])]
                self.assertEqual([message async for message in router],[])
                await asyncio.wait_for(acknowledged.wait(),2)
            finally:
                await router.finish()
