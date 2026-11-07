import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('private_profile', Path(__file__).parents[1] / 'private_profile.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class PrivateProfileTest(unittest.TestCase):
    def source(self, device='70B3D57ED0079D88'):
        return '\n'.join(f'static constexpr char {key}[] = "{value}";' for key,value in {
            'devEUIHex':device,'joinEUIHex':'0'*16,'appKeyHex':'11'*16,'nwkKeyHex':'22'*16}.items())

    def test_private_identity_is_stable_but_keys_are_network_and_device_specific(self):
        source = self.source()
        header, fields = module.derive(source)
        self.assertEqual(module.derive(source),(header,fields))
        self.assertEqual(fields['dev_eui'],'70B3D57ED0079D88')
        self.assertTrue(fields['join_eui'].startswith('02'))
        self.assertNotEqual(fields['app_key'],'11'*16)
        self.assertNotEqual(fields['nwk_key'],'22'*16)
        self.assertNotEqual(fields['app_key'],fields['nwk_key'])
        self.assertNotEqual(fields['app_key'],module.derive(self.source('70B3D57ED0079D89'))[1]['app_key'])
        self.assertNotIn(fields['app_key'],source)

    def test_invalid_profile_is_rejected_before_build(self):
        with self.assertRaises(ValueError):
            module.derive(self.source().replace('11'*16,''))

    def test_usb_identity_has_network_scoped_keys_and_preserves_migration_namespace(self):
        import sys
        import hashlib
        sys.path.insert(0,str(Path(__file__).parents[1]))
        from provision import packet
        source=self.source()
        command,device=packet(source,'ttn',source.encode())
        fields=command.decode().strip().split(':')
        identity=bytes.fromhex(fields[1])
        self.assertEqual(len(identity),50)
        self.assertEqual(identity[:2],bytes([1,1]))
        self.assertEqual(identity[10:18].hex().upper(),device)
        self.assertEqual(fields[2],'f'+hashlib.sha256(source.encode()).hexdigest()[:12])
        private,_=packet(source,'chirpstack',source.encode())
        self.assertNotEqual(private,command)
        self.assertEqual(bytes.fromhex(private.decode().split(':')[1])[1],2)
