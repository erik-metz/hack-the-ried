#!/usr/bin/env python3
"""Provision TTN + isolated update credentials through physical USB only."""
import argparse
import json
import os
from pathlib import Path
import re
import time
from dual_profile import control_identity,group_file,usb_packet
from private_profile import raw

ROOT=Path(__file__).resolve().parent

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('profile')
    parser.add_argument('--port')
    parser.add_argument('--prepare-only',action='store_true')
    args=parser.parse_args()
    if not re.fullmatch('[a-z0-9][a-z0-9_-]{0,59}',args.profile): parser.error('Invalid profile')
    source=ROOT.parent/'profiles'/(args.profile+'.h')
    source.chmod(0o600)
    text=source.read_text()
    state=ROOT/'build'/'dual-network'; state.mkdir(parents=True,exist_ok=True,mode=0o700)
    state.chmod(0o700)
    group=group_file(state/'group.json')
    private=control_identity(text); private['name']=args.profile+'-update'; private['ttn_dev_eui']=raw(text)['dev_eui']
    registration=state/(args.profile+'.json')
    fd=os.open(registration,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
    with os.fdopen(fd,'w') as stream: json.dump(dict(group=group,devices=[private]),stream)
    command=usb_packet(text,group)
    print('TTN DevEUI '+private['ttn_dev_eui']+'; separate update DevEUI '+private['dev_eui'])
    print('Private registration prepared; no keys displayed')
    if not args.prepare_only:
        if not args.port: parser.error('--port required for USB provisioning')
        import serial
        with serial.Serial(port=None,baudrate=115200,timeout=.2) as port:
            port.dtr=True; port.rts=True; port.port=args.port; port.open(); time.sleep(1.5)
            port.write(command); port.flush()
            until=time.monotonic()+30
            while time.monotonic()<until:
                line=port.readline().decode(errors='replace').strip()
                if line=='PROFILE stored; restarting': print(line); break
                if line=='PROFILE rejected': raise RuntimeError('Dual identity rejected; existing state retained')
            else: raise TimeoutError('No USB provisioning acknowledgement')
