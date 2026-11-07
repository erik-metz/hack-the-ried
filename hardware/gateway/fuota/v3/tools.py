#!/usr/bin/env python3
"""Companion device and multicast provisioning; never imports TTN root keys."""
import argparse
import json
import os
from pathlib import Path
import sys
import re
import grpc

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'v2'))
sys.path.insert(0,'/lab')
from lab import Lab, validate_registration
from chirpstack_api import api,common

GROUP_NAME='kamue-ttn-update-v3'

def validate(config):
    group=config['group']
    address=bytes.fromhex(group['mc_addr'])
    if len(address)!=4 or not 0<int.from_bytes(address,'big')<0x02000000:
        raise ValueError('Invalid private multicast address')
    for key in ['mc_app_s_key','mc_nwk_s_key']:
        value=bytes.fromhex(group[key])
        if len(value)!=16 or not any(value): raise ValueError('Invalid multicast key')
    seen=set()
    if not config['devices']: raise ValueError('No companion devices')
    for device in config['devices']:
        validate_registration(device)
        if (not re.fullmatch('[0-9a-fA-F]{16}',device.get('ttn_dev_eui',''))
                or device['dev_eui'].upper()==device.get('ttn_dev_eui','').upper()
                or not device['dev_eui'].upper().startswith('02') or device['dev_eui'].upper() in seen):
            raise ValueError('Companion identity must be distinct from TTN and unique')
        seen.add(device['dev_eui'].upper())

def provision(config,gateway):
    validate(config)
    lab=Lab()
    lab.provision(gateway,config['devices'])
    application=None
    for item in config['devices']:
        device=lab.call(lab.devices.Get,api.GetDeviceRequest(dev_eui=item['dev_eui'])).device
        application=device.application_id
        if device.tags.get('kamue_lab')!='v2': raise ValueError('Not a private lab device')
        device.tags.update(update_role='ttn-companion-v3',ttn_dev_eui=item['ttn_dev_eui'])
        lab.call(lab.devices.Update,api.UpdateDeviceRequest(device=device))
    groups=api.MulticastGroupServiceStub(lab.channel)
    result=lab.call(groups.List,api.ListMulticastGroupsRequest(application_id=application,limit=100)).result
    existing=next((g.id for g in result if g.name==GROUP_NAME),None)
    expected=api.MulticastGroup(name=GROUP_NAME,application_id=application,region=common.EU868,
        mc_addr=config['group']['mc_addr'],mc_app_s_key=config['group']['mc_app_s_key'],
        mc_nwk_s_key=config['group']['mc_nwk_s_key'],f_cnt=1,group_type=api.CLASS_C,dr=5,frequency=869525000)
    if existing:
        current=lab.call(groups.Get,api.GetMulticastGroupRequest(id=existing)).multicast_group
        for name in ['mc_addr','mc_app_s_key','mc_nwk_s_key']:
            if getattr(current,name).lower()!=getattr(expected,name).lower():
                raise ValueError('Existing multicast keys differ; refusing counter reset')
        if (current.frequency,current.dr,current.group_type)!=(expected.frequency,expected.dr,expected.group_type):
            raise ValueError('Existing multicast radio configuration differs')
        if current.f_cnt<1: raise ValueError('Multicast counter must start above zero')
    else:
        existing=lab.call(groups.Create,api.CreateMulticastGroupRequest(multicast_group=expected)).id
    def add(method,request):
        try: lab.call(method,request)
        except grpc.RpcError as exc:
            if exc.code()!=grpc.StatusCode.ALREADY_EXISTS: raise
    for item in config['devices']:
        add(groups.AddDevice,api.AddDeviceToMulticastGroupRequest(multicast_group_id=existing,dev_eui=item['dev_eui']))
    add(groups.AddGateway,api.AddGatewayToMulticastGroupRequest(multicast_group_id=existing,gateway_id=gateway))
    state=Path('/state/v3-group-id.json')
    record=dict(id=existing,name=GROUP_NAME,application_id=application,gateway=gateway)
    fd=os.open(state,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
    with os.fdopen(fd,'w') as stream: json.dump(record,stream)
    print('Private multicast group ready: '+existing+'; TTN identities unchanged')

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('registration',type=Path)
    parser.add_argument('--gateway',required=True)
    args=parser.parse_args()
    provision(json.loads(args.registration.read_text()),args.gateway)
