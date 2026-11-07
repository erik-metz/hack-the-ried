import unittest
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch
import grpc
from chirpstack_api import api
from lab import Lab, validate_registration
from send import status_packet, transfer
from filecrypto import seal,unseal,public
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey
from cryptography.exceptions import InvalidTag


class ToolTests(unittest.TestCase):
    def test_v4_login_and_authenticated_request_use_grpc(self):
        observed=[]
        class Internal(api.InternalServiceServicer):
            def Login(self, request, context):
                observed.append((request.email,request.password))
                return api.LoginResponse(jwt='synthetic-short-lived-jwt')
        class Tenants(api.TenantServiceServicer):
            def List(self, request, context):
                observed.append(dict(context.invocation_metadata()).get('authorization'))
                return api.ListTenantsResponse(total_count=0)
        server=grpc.server(ThreadPoolExecutor(max_workers=2))
        api.add_InternalServiceServicer_to_server(Internal(),server)
        api.add_TenantServiceServicer_to_server(Tenants(),server)
        port=server.add_insecure_port('127.0.0.1:0')
        server.start()
        try:
            with patch('lab.Path.exists',return_value=False):
                lab=Lab('127.0.0.1:'+str(port))
            try:
                response=lab.call(lab.tenants.List,api.ListTenantsRequest(limit=100))
                self.assertEqual(response.total_count,0)
                self.assertEqual(observed,[('admin','admin'),'Bearer synthetic-short-lived-jwt'])
            finally:
                lab.channel.close()
        finally:
            server.stop(0).wait()

    def test_provisioning_file_is_recipient_bound_and_tampering_is_rejected(self):
        private=X25519PrivateKey.generate()
        envelope=seal(public(private),b'synthetic profile fixture')
        self.assertEqual(unseal(private,envelope),b'synthetic profile fixture')
        with self.assertRaises(InvalidTag):
            unseal(X25519PrivateKey.generate(),envelope)
        envelope['ciphertext']=f'{int(envelope["ciphertext"][:2],16)^1:02x}'+envelope['ciphertext'][2:]
        with self.assertRaises(InvalidTag):
            unseal(private,envelope)

    def test_status_retains_uint32_counters_and_missing_blocks(self):
        data=bytes([1,1,255,255,255,255,0,0,0,1,0,0,0,3,0,0,0,2])
        self.assertEqual(status_packet(data),dict(state=1,session=4294967295,received=1,total=3,missing=[0,2]))
        for malformed in (data[:10],data+b'0',b'\0'*14):
            with self.assertRaises(ValueError):
                status_packet(malformed)

    def test_invalid_registrations_and_unbounded_transfers_fail_before_network_access(self):
        with self.assertRaises(ValueError):
            validate_registration(dict(dev_eui='not-an-eui'))
        with self.assertRaises(ValueError):
            transfer('0000000000000000',{},pace=0)
        with self.assertRaises(ValueError):
            transfer('0000000000000000',dict(protocol='kamue-fuota-lab1',f_port=43,blocks=['x']*33))
