#!/usr/bin/env python3
"""Local-only ChirpStack lab provisioning and diagnostics. Never logs keys/JWTs."""
import argparse
import asyncio
import json
from pathlib import Path
import re
import sys
from urllib.parse import urlsplit

import grpc
from chirpstack_api import api, common
from websockets.legacy.client import connect


class Lab:
    def __init__(self, endpoint='chirpstack:8080'):
        password = Path('/state/admin-password')
        password = password.read_text().strip() if password.exists() else 'admin'
        self.channel = grpc.insecure_channel(endpoint)
        # ChirpStack v4 exposes this internal service over gRPC, not the v3
        # /api/internal/login REST route. Keep the short-lived JWT in memory.
        token = api.InternalServiceStub(self.channel).Login(
            api.LoginRequest(email='admin',password=password),timeout=10).jwt
        self.metadata = [('authorization','Bearer '+token)]
        self.tenants = api.TenantServiceStub(self.channel)
        self.applications = api.ApplicationServiceStub(self.channel)
        self.profiles = api.DeviceProfileServiceStub(self.channel)
        self.gateways = api.GatewayServiceStub(self.channel)
        self.devices = api.DeviceServiceStub(self.channel)

    def call(self, method, request):
        return method(request,metadata=self.metadata,timeout=15)

    def provision(self, gateway_eui, registrations):
        name = 'kamue-fuota-lab-v2'
        tenants = self.call(self.tenants.List,api.ListTenantsRequest(limit=100)).result
        tenant = next((t.id for t in tenants if t.name == name),None)
        if not tenant:
            tenant = self.call(self.tenants.Create,api.CreateTenantRequest(tenant=api.Tenant(
                name=name,can_have_gateways=True,private_gateways_up=True,private_gateways_down=True,
                tags={'kamue_lab':'v2'}))).id
        applications = self.call(self.applications.List,api.ListApplicationsRequest(tenant_id=tenant,limit=100)).result
        application = next((a.id for a in applications if a.name == name),None)
        if not application:
            application = self.call(self.applications.Create,api.CreateApplicationRequest(
                application=api.Application(name=name,tenant_id=tenant))).id
        profiles = self.call(self.profiles.List,api.ListDeviceProfilesRequest(tenant_id=tenant,limit=100)).result
        profile = next((p.id for p in profiles if p.name == name),None)
        if not profile:
            profile = self.call(self.profiles.Create,api.CreateDeviceProfileRequest(device_profile=api.DeviceProfile(
                name=name,tenant_id=tenant,region=common.EU868,mac_version=common.LORAWAN_1_1_0,
                reg_params_revision=common.B,region_config_id='eu868',adr_algorithm_id='default',
                supports_otaa=True,supports_class_c=True,class_c_timeout=30,uplink_interval=300,
                flush_queue_on_activate=True,payload_codec_runtime=api.JS,
                payload_codec_script=Path('/lab/payload-formatter.js').read_text(),tags={'kamue_lab':'v2'}))).id
        try:
            gateway = self.call(self.gateways.Get,api.GetGatewayRequest(gateway_id=gateway_eui)).gateway
            if gateway.tenant_id != tenant:
                raise ValueError('Gateway already belongs to a different tenant')
        except grpc.RpcError as exc:
            if exc.code() != grpc.StatusCode.NOT_FOUND:
                raise
            self.call(self.gateways.Create,api.CreateGatewayRequest(gateway=api.Gateway(
                gateway_id=gateway_eui,name='kamue-lora-pi-private-lab',tenant_id=tenant,stats_interval=30,
                tags={'kamue_lab':'v2'})))
        for item in registrations:
            validate_registration(item)
            dev_eui = item['dev_eui']
            try:
                device = self.call(self.devices.Get,api.GetDeviceRequest(dev_eui=dev_eui)).device
                if device.application_id != application or device.tags.get('kamue_lab') != 'v2':
                    raise ValueError('Refusing to change an existing non-lab device')
            except grpc.RpcError as exc:
                if exc.code() != grpc.StatusCode.NOT_FOUND:
                    raise
                self.call(self.devices.Create,api.CreateDeviceRequest(device=api.Device(
                    dev_eui=dev_eui,name=item.get('name',dev_eui)+'-private',application_id=application,
                    device_profile_id=profile,tags={'kamue_lab':'v2'})))
            expected = api.DeviceKeys(dev_eui=dev_eui,app_key=item['app_key'],nwk_key=item['nwk_key'])
            try:
                keys = self.call(self.devices.GetKeys,api.GetDeviceKeysRequest(dev_eui=dev_eui)).device_keys
                if keys.app_key.lower() != expected.app_key.lower() or keys.nwk_key.lower() != expected.nwk_key.lower():
                    raise ValueError('Existing lab keys differ; explicit session reset required')
            except grpc.RpcError as exc:
                if exc.code() != grpc.StatusCode.NOT_FOUND:
                    raise
                self.call(self.devices.CreateKeys,api.CreateDeviceKeysRequest(device_keys=expected))
            print('Private lab device ready: '+dev_eui)
        print('Lab tenant/application/profile ready; existing device sessions retained')


def validate_registration(item):
    for name,size in [('dev_eui',16),('join_eui',16),('app_key',32),('nwk_key',32)]:
        if not re.fullmatch(r'[0-9a-fA-F]{'+str(size)+'}',item.get(name,'')):
            raise ValueError('Invalid private device registration')


async def probe(gateway):
    async with connect('ws://gateway-bridge:3001/router-info') as websocket:
        await websocket.send(json.dumps({'router':'-'.join(gateway[i:i+2] for i in range(0,16,2))}))
        result = json.loads(await websocket.recv())
    target = urlsplit(result.get('uri',''))
    if (target.scheme != 'ws' or target.hostname != 'gateway-bridge' or target.port != 3001
            or target.username or target.password):
        raise ValueError('Unexpected discovery target')
    async with connect(result['uri']) as websocket:
        await websocket.send(json.dumps(dict(msgtype='version',station='lab-probe',model='sx1301/1',protocol=2,features='')))
        config = json.loads(await websocket.recv())
    print(json.dumps(config))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action',choices=['provision','probe'])
    parser.add_argument('--gateway-eui',required=True)
    parser.add_argument('--registrations',default='/state/profiles.json')
    args = parser.parse_args()
    if not re.fullmatch('[0-9a-fA-F]{16}',args.gateway_eui):
        parser.error('Gateway EUI must have 16 hex digits')
    if args.action == 'probe':
        asyncio.run(probe(args.gateway_eui))
    else:
        registrations = json.loads(Path(args.registrations).read_text())
        for item in registrations:
            validate_registration(item)
        Lab().provision(args.gateway_eui, registrations)


if __name__ == '__main__':
    try:
        main()
    except grpc.RpcError as exc:
        print('ChirpStack API failed: '+str(exc.code()),file=sys.stderr)
        raise SystemExit(1)
