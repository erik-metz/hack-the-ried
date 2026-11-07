import base64
import importlib.util
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
from types import SimpleNamespace
from chirpstack_api import api

HERE=Path(__file__).parent
def module(name,file):
    spec=importlib.util.spec_from_file_location(name,HERE/file)
    result=importlib.util.module_from_spec(spec);spec.loader.exec_module(result);return result
tools3=module('companion_tools','tools.py')
sender=module('multicast_sender','send.py')
firmware=Path(__file__).resolve().parents[3]/'sensor-node/rak3112/fuota'
sys.path.insert(0,str(firmware))

class MulticastTests(unittest.TestCase):
    def test_multicast_repairs_one_receivers_loss_before_applying_to_all(self):
        ids=['0211223344556677','0288776655443322']
        received={device:set() for device in ids}
        replies={}; sent=[]; dropped=False
        group=api.MulticastGroup(id='group',name='kamue-ttn-update-v3',application_id='app',f_cnt=1)
        def call(method,request):
            nonlocal dropped
            if isinstance(request,api.GetMulticastGroupRequest):
                return api.GetMulticastGroupResponse(multicast_group=group)
            if isinstance(request,api.ListDevicesRequest):
                return api.ListDevicesResponse(total_count=2,result=[api.DeviceListItem(dev_eui=i) for i in ids])
            if isinstance(request,api.GetDeviceRequest):
                return api.GetDeviceResponse(device=api.Device(dev_eui=request.dev_eui,application_id='app',tags={'update_role':'ttn-companion-v3'}))
            packet=request.queue_item.data; kind=packet[0]; sent.append(packet)
            if kind==2:
                index=int.from_bytes(packet[5:7],'big')
                received[ids[0]].add(index)
                if index==1 and not dropped: dropped=True
                else: received[ids[1]].add(index)
            else:
                for device in ids:
                    missing=sorted({0,1}-received[device])
                    state=3 if kind==3 else 2 if not missing else 1
                    replies[device]=dict(state=state,session=1,received=2-len(missing),total=2,missing=missing)
                if kind==3: self.assertTrue(all(len(r)==2 for r in received.values()))
            return api.EnqueueMulticastGroupQueueItemResponse(f_cnt=len(sent))
        class Event:
            def __init__(self,device): self.device=device; self.firmware=None
            def __enter__(self): return self
            def __exit__(self,*args): pass
            def wait_status(self,*args,**kwargs): return replies[self.device]
            def wait_firmware(self,version,value):
                assert replies[self.device]['state']==3
                assert (version,value)==(2,222)
        fake=SimpleNamespace(call=call,channel=None,devices=SimpleNamespace(List='list',Get='get'))
        group_api=SimpleNamespace(Get='group',Enqueue='enqueue')
        enc=lambda data:base64.b64encode(data).decode()
        prefix=b'\0\0\0\1'
        bundle=dict(protocol='kamue-fuota-lab1',f_port=43,session=1,start=enc(b'\1'+prefix+b'0'*36),status=enc(b'\5'+prefix),apply=enc(b'\3'+prefix),
            blocks=[enc(b'\2'+prefix+bytes([0,i])+b'x') for i in [0,1]])
        with patch.object(sender,'Lab',return_value=fake),patch.object(sender,'Events',Event), \
                patch.object(sender.api,'MulticastGroupServiceStub',return_value=group_api), \
                patch.object(sender.Path,'read_text',return_value='{"id":"group"}'),patch.object(sender.time,'sleep'):
            sender.transfer(ids,bundle)
        self.assertEqual([int.from_bytes(p[5:7],'big') for p in sent if p[0]==2],[0,1,1])
        self.assertEqual([p[0] for p in sent].count(3),1)

    def test_companion_registration_cannot_take_over_original_ttn_identity(self):
        item=dict(dev_eui='0211223344556677',ttn_dev_eui='70B3D57ED0079D8A',join_eui='0200000000000001',app_key='11'*16,nwk_key='22'*16)
        config=dict(group=dict(mc_addr='01f00001',mc_app_s_key='33'*16,mc_nwk_s_key='44'*16),devices=[item])
        tools3.validate(config)
        item['ttn_dev_eui']=item['dev_eui']
        with self.assertRaises(ValueError): tools3.validate(config)
        item['ttn_dev_eui']='70B3D57ED0079D8A';config['devices'].append(item.copy())
        with self.assertRaises(ValueError): tools3.validate(config)

    def test_multicast_packet_validation_fails_before_any_api_or_radio_access(self):
        def enc(value): return base64.b64encode(value).decode()
        prefix=b'\0\0\0\1'
        bundle=dict(protocol='kamue-fuota-lab1',f_port=43,session=1,start=enc(b'\1'+prefix+b'0'*36),
            status=enc(b'\5'+prefix),apply=enc(b'\3'+prefix),blocks=[enc(b'\2'+prefix+b'\0\0x')])
        controls,data=sender.packets(bundle)
        self.assertEqual(set(data),{0})
        self.assertEqual(controls['apply'],b'\3'+prefix)
        with self.assertRaises(ValueError): sender.packets(bundle,pace=0)
        bundle['blocks']*=2
        with self.assertRaises(ValueError): sender.packets(bundle)
        bundle['blocks']=['not-base64']
        with self.assertRaises(ValueError): sender.packets(bundle)
