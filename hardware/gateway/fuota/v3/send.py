#!/usr/bin/env python3
"""Real multicast blocks; private per-node feedback; telemetry stays on TTN."""
import argparse
import base64
from contextlib import ExitStack
import fcntl
import json
from pathlib import Path
import sys
import time

# Keep v3 tools separate from v2's single-device sender.
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'v2'))
sys.path.insert(0,'/lab')
from lab import Lab
from send import Events
from chirpstack_api import api

def packets(bundle,maximum=32,pace=3):
    if pace<3 or bundle.get('protocol')!='kamue-fuota-lab1' or bundle.get('f_port')!=43:
        raise ValueError('Invalid bounded multicast transfer')
    if not 0<len(bundle.get('blocks',[]))<=maximum: raise ValueError('Multicast block limit exceeded')
    session=bundle['session']
    def decode(encoded,kind):
        data=base64.b64decode(encoded,validate=True)
        if len(data)<5 or data[0]!=kind or int.from_bytes(data[1:5],'big')!=session:
            raise ValueError('Invalid packet/session')
        return data
    start=base64.b64decode(bundle['start'],validate=True)
    if start[0] not in (1,6): raise ValueError('Invalid start')
    control={name:decode(bundle[name],kind) for name,kind in [('start',start[0]),('status',5),('apply',3)]}
    data={}
    for encoded in bundle['blocks']:
        block=decode(encoded,2)
        if not 8<=len(block)<=135: raise ValueError('Invalid block size')
        index=int.from_bytes(block[5:7],'big')
        if index in data: raise ValueError('Duplicate block')
        data[index]=block
    return control,data

def transfer(devices,bundle,pace=3,maximum=32,group_name="kamue-ttn-update-v3",state_path="/state/v3-group-id.json",already_current=()):
    if (group_name,state_path) not in [("kamue-ttn-update-v3","/state/v3-group-id.json"),("kamue-ttn-update-v3-heltec","/state/v3-heltec-group-id.json")]:
        raise ValueError("Unsupported isolated update group")
    control,data=packets(bundle,maximum,pace)
    if not devices or len(set(devices))!=len(devices): raise ValueError('Explicit unique companion device list required')
    if not set(already_current)<=set(devices) or len(set(already_current))!=len(already_current):
        raise ValueError('Already-current devices must be unique selected group members')
    updating=[device for device in devices if device not in already_current]
    if not updating: raise ValueError('No devices require this update')
    lab=Lab(); groups=api.MulticastGroupServiceStub(lab.channel)
    saved=json.loads(Path(state_path).read_text())
    group=lab.call(groups.Get,api.GetMulticastGroupRequest(id=saved['id'])).multicast_group
    if group.name!=group_name or group.f_cnt<1: raise ValueError('Not the private v3 multicast group')
    listing=lab.call(lab.devices.List,api.ListDevicesRequest(application_id=group.application_id,multicast_group_id=group.id,limit=100))
    members=listing.result
    if listing.total_count!=len(members): raise ValueError('Group exceeds explicit device limit')
    if {d.dev_eui.lower() for d in members}!={d.lower() for d in devices}:
        raise ValueError('Select every group member; multicast affects all members')
    for device in devices:
        item=lab.call(lab.devices.Get,api.GetDeviceRequest(dev_eui=device)).device
        if item.tags.get('update_role')!='ttn-companion-v3' or item.application_id!=group.application_id:
            raise ValueError('Refusing a non-companion device')
    def enqueue(packet):
        item=api.MulticastGroupQueueItem(multicast_group_id=group.id,f_port=43,data=packet)
        item.expires_at.FromSeconds(int(time.time())+120)
        result=lab.call(groups.Enqueue,api.EnqueueMulticastGroupQueueItemRequest(queue_item=item))
        print('Multicast queued frame '+str(result.f_cnt),flush=True)
    with ExitStack() as stack:
        events={device:stack.enter_context(Events(device)) for device in updating}
        for device in already_current:
            print("Already-current companion "+device+": update not applied; verify TTN before and after",flush=True)
        def command(name,expected=None):
            for attempt in range(3):
                since=time.monotonic(); enqueue(control[name]); replies={}
                try:
                    for device,event in events.items():
                        reply=event.wait_status(bundle['session'],since,expected=expected)
                        print(device+' '+json.dumps(reply),flush=True)
                        if reply['state']>=4: raise RuntimeError('Receiver rejected update; running image retained')
                        replies[device]=reply
                    return replies
                except TimeoutError:
                    if expected==3 and all(e.firmware==(2,222) for e in events.values()): return {}
                    print('Control retry '+str(attempt+1),flush=True)
            raise TimeoutError('Missing per-device multicast acknowledgement')
        print('Start real multicast for '+str(len(updating))+' devices; TTN telemetry is independent',flush=True)
        command('start'); missing=list(data)
        for repair in range(5):
            for index in missing:
                enqueue(data[index]); print('Multicast block '+str(index),flush=True); time.sleep(pace)
            replies=command('status')
            if all(r['state']==2 for r in replies.values()): break
            missing=sorted({i for r in replies.values() for i in r['missing']})
            if not missing or any(i not in data for i in missing): raise RuntimeError('Invalid repair set')
        else: raise RuntimeError('Multicast repair limit reached')
        command('apply',3)
        for device,event in events.items():
            event.wait_firmware(2,222)
            print('VERIFIED update companion '+device+': firmware 2, value 222; verify normal TTN uplink separately',flush=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('bundle',type=Path)
    parser.add_argument('--devices',nargs='+',required=True)
    parser.add_argument('--heltec',action='store_true',help='Use the isolated Heltec multicast group')
    parser.add_argument('--already-current',nargs='*',default=[],help='Explicit members already verified at target; broadcast still reaches them and incompatible base is rejected')
    args=parser.parse_args()
    with open('/state/v3-send.lock','w') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        transfer(args.devices,json.loads(args.bundle.read_text()),already_current=args.already_current,**(dict(group_name="kamue-ttn-update-v3-heltec",state_path="/state/v3-heltec-group-id.json") if args.heltec else {}))
