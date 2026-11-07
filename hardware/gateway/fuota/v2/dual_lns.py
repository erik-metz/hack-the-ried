#!/usr/bin/env python3
"""Experimental private-device routing ahead of the existing durable TTN bridge.

Basics Station remains the only hardware owner. TTN owns radio configuration;
the local ChirpStack bridge receives only explicitly selected joins and NetID 0
data. No TTN gateway credentials are sent to ChirpStack.
"""
import asyncio
import json
import os
from pathlib import Path
import signal
import sys
import time
from urllib.parse import urlsplit

sys.path.insert(0, '/app/gateway-bridge')
from bridge import Bridge, ReceiveContext, downlink_fresh
from websockets.legacy.client import connect


def eui(value):
    if not isinstance(value, str):
        raise ValueError('Expected EUI string')
    value = value.replace('-', '').replace(':', '').upper()
    if len(value) != 16 or any(c not in '0123456789ABCDEF' for c in value):
        raise ValueError('Invalid EUI')
    return value


def private_uplink(message, devices):
    if message.get('msgtype') == 'jreq':
        try:
            return eui(message.get('DevEui', message.get('DevEUI'))) in devices
        except ValueError:
            return False
    address = message.get('DevAddr')
    return (message.get('msgtype') == 'updf' and type(address) is int
            and ((address & 0xffffffff) >> 25) == 0)


def secondary_target(uri, configured):
    source, target = urlsplit(configured), urlsplit(uri)
    return (target.scheme == 'ws' and not target.username and not target.password
            and target.hostname == source.hostname and target.port == source.port)


def channel_frequencies(config):
    frequencies = set()
    for concentrator in config.get('sx1301_conf', []):
        for key, channel in concentrator.items():
            if not key.startswith('chan_') or not channel.get('enable'):
                continue
            radio = concentrator.get('radio_' + str(channel.get('radio')), {})
            frequencies.add(radio.get('freq', 0) + channel.get('if', 0))
    return frequencies


def compatible(primary, secondary):
    # Secondary configuration can never reprogram the concentrator.
    primary_frequencies, secondary_frequencies = channel_frequencies(primary), channel_frequencies(secondary)
    return (primary.get('region') in ('EU868', 'EU863')
            and secondary.get('region') in ('EU868', 'EU863')
            and bool(primary_frequencies) and bool(secondary_frequencies)
            and secondary_frequencies <= primary_frequencies
            and data_rates(primary) is not None
            and data_rates(primary) == data_rates(secondary))


def data_rates(config):
    rates = config.get('DRs')
    if not isinstance(rates, list) or len(rates) != 16:
        return None
    # TTS marks unused EU868 DR8..15 as [0,0,0], Gateway Bridge as
    # [-1,0,0]. Compare their meaning while retaining every usable DR.
    return [([0,0,0] if i >= 8 and rate in ([0,0,0],[-1,0,0]) else rate)
            for i,rate in enumerate(rates)]


class StationRouter:
    def __init__(self, websocket, owner):
        self.websocket, self.owner = websocket, owner
        self.secondary = None
        self.secondary_ready = False
        self.secondary_task = None
        self.health_task = None
        self.secondary_config = None
        self.version = None
        self.primary_config = None
        self.config_ready = asyncio.Event()
        self.recent = {}
        self.sequence = 0
        self.pending = {}

    async def recv(self):
        raw = await self.websocket.recv()
        self.version = json.loads(raw)
        if self.version.get('msgtype') == 'version':
            self.secondary_task = asyncio.create_task(self.secondary_loop())
            self.health_task = asyncio.create_task(self.health_loop())
        return raw

    async def close(self, *args):
        await self.websocket.close(*args)

    async def finish(self):
        tasks = [task for task in (self.secondary_task,self.health_task) if task]
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)

    async def health_loop(self):
        path = self.owner.directory / 'fuota-health.json'
        temporary = path.with_suffix('.tmp')
        while True:
            temporary.write_text(json.dumps(dict(at=time.time(),private_lns_connected=self.secondary_ready,
                test_devices=len(self.owner.devices))))
            os.replace(temporary,path)
            await asyncio.sleep(3)

    async def send(self, raw):
        await self.to_station(json.loads(raw), 'ttn')

    async def to_station(self, message, origin):
        kind = message.get('msgtype')
        if kind == 'router_config':
            if origin != 'ttn':
                return
            self.primary_config = dict(message)
            if self.secondary_config and not compatible(self.primary_config, self.secondary_config):
                self.secondary_ready = False
                if self.secondary:
                    await self.secondary.close()
            message = dict(message)
            if message.get('NetID') is not None:
                message['NetID'] = sorted(set(message['NetID']) | {0})
            # Selected private devices have non-TTN JoinEUIs. Filtering by
            # DevEUI happens here, so all JoinEUIs must reach this local router.
            message['JoinEui'] = []
            # Both LNSs share a transmitter. Never rely on independent server
            # budgets in lieu of the Station's global duty-cycle enforcement.
            message['nodc'] = False
            self.config_ready.set()
        elif kind == 'dnmsg':
            if type(message.get('diid')) is not int:
                return
            now = time.monotonic()
            self.pending = {k:v for k,v in self.pending.items() if now-v[2] < 120}
            if len(self.pending) >= 4096:
                return
            self.sequence += 1
            self.pending[self.sequence] = (origin, message['diid'], now)
            message = dict(message, diid=self.sequence)
            if origin != 'ttn':
                message.pop('MuxTime', None)
        elif origin != 'ttn':
            return
        await self.websocket.send(json.dumps(message))

    async def __aiter__(self):
        async for raw in self.websocket:
            message = json.loads(raw)
            if message.get('msgtype') == 'dntxed':
                target = self.pending.pop(message.get('diid'), None)
                if not target:
                    continue
                origin, original, _ = target
                message['diid'] = original
                raw = json.dumps(message)
                if origin == 'chirpstack':
                    await self.send_secondary(raw)
                    continue
            elif private_uplink(message, self.owner.devices):
                info = message.get('upinfo', {})
                now = time.time()
                self.owner.record_private(message,now)
                self.recent[(info.get('rctx'), info.get('xtime'))] = ReceiveContext(
                    now, join=message['msgtype'] == 'jreq')
                self.recent = {k:v for k,v in self.recent.items() if now-v.received < 30}
                await self.send_secondary(raw)
                # No fallback to TTN, no replay of missed private joins.
                continue
            yield raw

    async def send_secondary(self, raw):
        if self.secondary_ready:
            try:
                await self.secondary.send(raw)
            except Exception:
                self.secondary_ready = False

    async def secondary_loop(self):
        delay = 1
        while True:
            try:
                await self.config_ready.wait()
                uri = self.owner.secondary_uri
                async with connect(uri.rstrip('/')+'/router-info', open_timeout=10) as discovery:
                    await discovery.send(json.dumps({'router':self.owner.router_id}))
                    answer = json.loads(await asyncio.wait_for(discovery.recv(),10))
                target = answer.get('uri', '')
                if not secondary_target(target, uri):
                    raise ValueError('Secondary discovery target changed host')
                async with connect(target, open_timeout=10) as remote:
                    await remote.send(json.dumps(self.version))
                    config = json.loads(await asyncio.wait_for(remote.recv(),10))
                    if config.get('msgtype') != 'router_config' or not compatible(self.primary_config, config):
                        raise ValueError('Secondary radio plan differs from TTN')
                    self.secondary = remote
                    self.secondary_config = config
                    self.secondary_ready = True
                    delay = 1
                    print('Private ChirpStack LNS connected; TTN radio plan retained', flush=True)
                    async for raw in remote:
                        message = json.loads(raw)
                        if message.get('msgtype') == 'dnmsg' and downlink_fresh(message,self.recent,time.time()):
                            await self.to_station(message, 'chirpstack')
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                print('Private LNS unavailable: '+type(exc).__name__, flush=True)
            finally:
                self.secondary_ready, self.secondary = False, None
            await asyncio.sleep(delay)
            delay = min(30, delay*2)


class DualBridge(Bridge):
    def __init__(self, *args, devices, secondary_uri, **kwargs):
        super().__init__(*args, **kwargs)
        self.devices = {eui(device) for device in devices}
        self.secondary_uri = secondary_uri

    def record_private(self, message, now):
        self.radio_stats.add(message,now)
        self.last_rx=now
        self.spool.set('last_rx',now)

    async def handler(self, websocket, path):
        if path.endswith('/router-info'):
            return await super().handler(websocket, path)
        router = StationRouter(websocket, self)
        try:
            await super().handler(router, path)
        finally:
            await router.finish()


async def main():
    os.umask(0o077)
    bridge = DualBridge('/var/lib/kamue-gateway',os.environ['TC_URI'],os.environ['GATEWAY_EUI'],
        os.environ.pop('TC_KEY'), devices=os.environ['FUOTA_TEST_DEV_EUIS'].split(','),
        secondary_uri='ws://gateway-bridge:3001')
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, bridge.stop.set)
    await bridge.run()
    raise SystemExit(1)


if __name__ == '__main__':
    asyncio.run(main())
