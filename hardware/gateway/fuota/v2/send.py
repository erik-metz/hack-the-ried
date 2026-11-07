#!/usr/bin/env python3
"""Paced, bounded lab transfer through the local ChirpStack API and MQTT only."""
import argparse
import base64
import collections
import json
from pathlib import Path
import struct
import threading
import time

from chirpstack_api import api
import paho.mqtt.client as mqtt
from lab import Lab


def status_packet(data):
    if len(data)<14 or len(data)>30 or len(data)%2 or data[0]!=1:
        raise ValueError('Invalid lab status packet')
    return dict(state=data[1],session=int.from_bytes(data[2:6],'big'),
        received=int.from_bytes(data[6:10],'big'),total=int.from_bytes(data[10:14],'big'),
        missing=[int.from_bytes(data[i:i+2],'big') for i in range(14,len(data),2)])


class Events:
    def __init__(self, device):
        self.device=device.lower()
        self.condition=threading.Condition()
        self.status=collections.deque(maxlen=100)
        self.firmware=None
        self.connected=threading.Event()
        self.client=mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
        self.client.on_connect=self.on_connect
        self.client.on_message=self.on_message
        self.client.on_subscribe=self.on_subscribe

    def on_connect(self,client,userdata,flags,reason,properties):
        if reason==0:
            client.subscribe('application/+/device/'+self.device+'/event/up',qos=1)

    def on_subscribe(self,client,userdata,mid,reason_codes,properties):
        if all(not code.is_failure for code in reason_codes):
            self.connected.set()

    def on_message(self,client,userdata,message):
        try:
            event=json.loads(message.payload)
            port=event.get('fPort')
            data=base64.b64decode(event.get('data',''),validate=True)
            with self.condition:
                if port==43:
                    self.status.append((time.monotonic(),status_packet(data)))
                elif port==42 and len(data)==8 and data[0]==1:
                    self.firmware=(data[1],int.from_bytes(data[2:4],'big'))
                self.condition.notify_all()
        except (ValueError,TypeError):
            pass

    def __enter__(self):
        self.client.connect('mosquitto',1883,30)
        self.client.loop_start()
        if not self.connected.wait(15):
            self.client.loop_stop()
            raise TimeoutError('Private MQTT connection unavailable')
        return self

    def __exit__(self,*args):
        self.client.disconnect()
        self.client.loop_stop()

    def wait_status(self, session, since, timeout=40, expected=None):
        deadline=time.monotonic()+timeout
        with self.condition:
            while True:
                for at,status in reversed(self.status):
                    if at>=since and status['session']==session and (expected is None or status['state']==expected or status['state']>=4):
                        return status
                remaining=deadline-time.monotonic()
                if remaining<=0:
                    raise TimeoutError('No fresh status from private device')
                self.condition.wait(remaining)

    def wait_firmware(self, version, value, timeout=90):
        with self.condition:
            if not self.condition.wait_for(lambda:self.firmware==(version,value),timeout):
                raise TimeoutError('Updated firmware/value not confirmed by real uplink')


def transfer(device,bundle,pace=3,maximum=32):
    if pace<3:
        raise ValueError('Lab pacing must be at least 3 seconds')
    if bundle.get('protocol')!='kamue-fuota-lab1' or bundle.get('f_port')!=43:
        raise ValueError('Not a lab update bundle')
    if len(bundle['blocks'])>maximum:
        raise ValueError('Transfer exceeds explicit lab block limit')
    packets={}
    for encoded in bundle['blocks']:
        packet=base64.b64decode(encoded,validate=True)
        if len(packet)<8 or packet[0]!=2 or int.from_bytes(packet[1:5],'big')!=bundle['session']:
            raise ValueError('Invalid data block/session')
        index=int.from_bytes(packet[5:7],'big')
        if index in packets:
            raise ValueError('Duplicate block in bundle')
        packets[index]=packet
    lab=Lab()
    existing=lab.call(lab.devices.Get,api.GetDeviceRequest(dev_eui=device)).device
    if existing.tags.get('kamue_lab')!='v2':
        raise ValueError('Refusing to enqueue on a non-lab device')
    def enqueue(packet):
        lab.call(lab.devices.Enqueue,api.EnqueueDeviceQueueItemRequest(queue_item=api.DeviceQueueItem(
            dev_eui=device,f_port=43,confirmed=False,data=packet)))
    session=bundle['session']
    with Events(device) as events:
        def control(encoded,expected=None):
            packet=base64.b64decode(encoded,validate=True)
            if len(packet)<5 or int.from_bytes(packet[1:5],'big')!=session:
                raise ValueError('Control/session mismatch')
            for attempt in range(3):
                since=time.monotonic()
                enqueue(packet)
                try:
                    status=events.wait_status(session,since,expected=expected)
                    print('Status '+json.dumps(status),flush=True)
                    if status['state']>=4:
                        raise RuntimeError('Receiver rejected transfer; running image retained')
                    return status
                except TimeoutError:
                    if expected==3 and events.firmware==(2,222):
                        return dict(state=3,session=session)
                    print('Control status timeout; retry '+str(attempt+1),flush=True)
            raise TimeoutError('Private device did not acknowledge control')
        print('Start private transfer: '+str(len(packets))+' radio blocks, '+str(bundle['size'])+' image bytes',flush=True)
        status=control(bundle['start'])
        pending=list(packets)
        for repair_round in range(5):
            for index in pending:
                enqueue(packets[index])
                print('Queued block '+str(index),flush=True)
                time.sleep(pace)
            status=control(bundle['status'])
            if status['state']==2:
                break
            pending=status['missing']
            if not pending or any(index not in packets for index in pending):
                raise RuntimeError('Unexpected repair request; transfer stopped')
        else:
            raise RuntimeError('Radio transfer incomplete after bounded repair rounds')
        try:
            control(bundle['apply'],expected=3)
        except TimeoutError:
            # Final status may be lost while the newly selected image boots.
            print('Awaiting independent post-reboot firmware uplink',flush=True)
        events.wait_firmware(2,222)
        print('VERIFIED: firmware 2, value 222 received from '+device,flush=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('device')
    parser.add_argument('bundle',type=Path)
    parser.add_argument('--pace',type=float,default=3)
    parser.add_argument('--max-blocks',type=int,default=32)
    args=parser.parse_args()
    transfer(args.device,json.loads(args.bundle.read_text()),args.pace,args.max_blocks)
