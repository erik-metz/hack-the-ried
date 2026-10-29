"""Loopback LNS bridge: durable uplinks, cached channel plan, TLS to the real LNS."""
import asyncio
import hashlib
import json
import os
from pathlib import Path
import signal
import time
import uuid
from urllib.parse import urlsplit

from websockets.legacy.client import connect
from websockets.legacy.server import serve

from spool import Spool


def valid_target(uri, discovery_host):
    u = urlsplit(uri)
    return (u.scheme == 'wss' and not u.username and not u.password
            and u.hostname == discovery_host and u.port in (None, 443, 8887))


def downlink_fresh(message, recent, now):
    # Never turn a historical Class A uplink into a new receive opportunity.
    if message.get('msgtype') == 'dnmsg' and message.get('dC', 0) == 0:
        key = (message.get('rctx'), message.get('xtime'))
        received = recent.get(key)
        return received is not None and now-received < message.get('RxDelay',1)+1
    return True


class Bridge:
    def __init__(self, directory, upstream, eui, key, port=3001):
        self.directory = Path(directory)
        self.upstream, self.eui, self.key, self.port = upstream, eui, key, port
        self.host = urlsplit(upstream).hostname
        self.router_id = eui
        profile = hashlib.sha256((upstream+'|'+eui).encode()).hexdigest()
        self.spool = Spool(directory, profile)
        self.boot = str(uuid.uuid4())
        self.local = None
        self.remote = None
        self.version = None
        self.ready = False
        self.recent = {}
        self.stop = asyncio.Event()
        self.wake = asyncio.Event()
        self.child = None
        self.radio_ready = False
        self.last_rx = None
        self.sent_config = None
        self.tasks = set()

    async def handler(self, ws, path):
        if path.endswith('/router-info'):
            request = json.loads(await asyncio.wait_for(ws.recv(), 10))
            self.router_id = request['router']
            await ws.send(json.dumps(dict(router=request['router'], muxs=request['router'],
                                         uri=f'ws://127.0.0.1:{self.port}/traffic')))
            return
        if self.local is not None:
            await ws.close(1013, 'Only one radio connection supported')
            return
        self.local = ws
        cloud = None
        try:
            self.version = json.loads(await asyncio.wait_for(ws.recv(), 15))
            if self.version.get('msgtype') != 'version':
                return
            cached = self.spool.get('router_config:'+self.spool.profile)
            self.sent_config = None
            if cached:
                # MuxTime is transient, not a valid time reference after reboot.
                cached.pop('MuxTime', None)
                await ws.send(json.dumps(cached))
                self.sent_config = cached
            cloud = asyncio.create_task(self.cloud_loop())
            async for raw in ws:
                message = json.loads(raw)
                kind = message.get('msgtype')
                if kind in ('updf','propdf'):
                    self.spool.append(message, self.boot)
                    now = time.time()
                    self.last_rx = now
                    upinfo = message.get('upinfo', {})
                    self.recent[(upinfo.get('rctx'),upinfo.get('xtime'))] = now
                    self.recent = {k:v for k,v in self.recent.items() if now-v < 30}
                    self.wake.set()
                elif kind == 'jreq':
                    # Joining is meaningful only while a receive window is open.
                    info = message.get('upinfo',{})
                    self.recent[(info.get('rctx'),info.get('xtime'))] = time.time()
                    if self.ready:
                        await self.remote.send(raw)
                    else:
                        with self.spool.db:
                            self.spool.increment('offline_joins_not_replayed')
                elif self.ready:
                    await self.remote.send(raw)
        except (OSError, ValueError, asyncio.TimeoutError):
            print('Local station connection failed', flush=True)
        finally:
            if cloud:
                cloud.cancel()
                await asyncio.gather(cloud, return_exceptions=True)
            self.local, self.remote, self.ready = None, None, False

    async def cloud_loop(self):
        delay = 1
        while not self.stop.is_set():
            sender = None
            try:
                headers = {'Authorization':'Bearer '+self.key}
                async with connect(self.upstream.rstrip('/')+'/router-info', extra_headers=headers, open_timeout=15) as discovery:
                    await discovery.send(json.dumps({'router':self.router_id}))
                    answer = json.loads(await asyncio.wait_for(discovery.recv(),15))
                uri = answer.get('uri','')
                # Never forward gateway credentials to another discovery host.
                if not valid_target(uri,self.host):
                    raise ValueError('LNS discovery target must use TLS on the configured host')
                async with connect(uri, extra_headers=headers, open_timeout=15, ping_interval=20, ping_timeout=20) as remote:
                    self.remote = remote
                    await remote.send(json.dumps(self.version))
                    config = json.loads(await asyncio.wait_for(remote.recv(),30))
                    if config.get('msgtype') != 'router_config':
                        raise ValueError('No channel plan received')
                    saved = dict(config)
                    saved.pop('MuxTime', None)
                    self.spool.set('router_config:'+self.spool.profile, saved)
                    if saved != self.sent_config:
                        await self.local.send(json.dumps(config))
                        self.sent_config = saved
                    self.ready = True
                    delay = 1
                    print('LNS connected; replaying durable journal', flush=True)
                    sender = asyncio.create_task(self.send_queue())
                    async for raw in remote:
                        message = json.loads(raw)
                        if downlink_fresh(message,self.recent,time.time()):
                            await self.local.send(raw)
                        else:
                            with self.spool.db:
                                self.spool.increment('stale_downlinks_dropped')
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                # Exceptions may contain request headers: log type only.
                print('LNS unavailable: '+type(exc).__name__, flush=True)
            finally:
                self.ready, self.remote = False, None
                if sender:
                    sender.cancel()
                    await asyncio.gather(sender,return_exceptions=True)
            await asyncio.sleep(delay)
            delay = min(60,delay*2)

    async def send_queue(self):
        last = 0
        while self.ready:
            row = self.spool.candidate(last)
            if row is None:
                self.wake.clear()
                await self.wake.wait()
                continue
            row_id, received, boot, raw = row
            # Record uncertainty before sending: a crash may happen during send.
            self.spool.attempted(row_id)
            try:
                await self.remote.send(raw)
            except Exception:
                await self.remote.close()
                raise
            last = row_id
            await asyncio.sleep(0.02)  # bounded recovery rate: at most 50 frames/s

    async def heartbeat(self):
        while not self.stop.is_set():
            self.spool.prune()
            data = dict(at=time.time(), boot=self.boot, station_pid=self.child.pid if self.child else None,
                        radio_ready=self.radio_ready, station_connected=self.local is not None,
                        lns_connected=self.ready, last_rx=self.last_rx, spool=self.spool.status())
            temp = self.directory/'health.json.tmp'
            temp.write_text(json.dumps(data))
            os.replace(temp,self.directory/'health.json')
            await asyncio.sleep(5)

    async def log_station(self):
        async for line in self.child.stdout:
            text = line.decode(errors='replace')
            # Detect actual HAL startup, never equate silence with radio failure.
            if 'Concentrator started' in text or 'Lora gateway started' in text:
                self.radio_ready = True
            print(text,end='',flush=True)
        self.stop.set()

    async def run(self, launch=True):
        async with serve(self.handler,'127.0.0.1',self.port,max_size=65536):
            if launch:
                self.child = await asyncio.create_subprocess_exec('/app/start',stdout=asyncio.subprocess.PIPE,
                                                                  stderr=asyncio.subprocess.STDOUT)
                self.tasks.add(asyncio.create_task(self.log_station()))
            self.tasks.add(asyncio.create_task(self.heartbeat()))
            await self.stop.wait()
            if self.child and self.child.returncode is None:
                self.child.terminate()
                try:
                    await asyncio.wait_for(self.child.wait(),20)
                except asyncio.TimeoutError:
                    self.child.kill()
            for task in self.tasks:
                task.cancel()
            await asyncio.gather(*self.tasks,return_exceptions=True)
            self.spool.close()


async def main():
    os.umask(0o077)
    bridge = Bridge('/var/lib/kamue-gateway',os.environ['TC_URI'],os.environ['GATEWAY_EUI'],os.environ.pop('TC_KEY'))
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM,signal.SIGINT):
        loop.add_signal_handler(sig,bridge.stop.set)
    await bridge.run()
    raise SystemExit(1)


if __name__ == '__main__':
    asyncio.run(main())
