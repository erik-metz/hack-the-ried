import sys
from pathlib import Path
import tempfile
import unittest

sys.path.insert(0,str(Path(__file__).parents[1]))
from dual_profile import control_identity,group_file,usb_packet
from private_profile import raw

class DualIdentityTests(unittest.TestCase):
    def source(self,eui='70B3D57ED0079D8A'):
        return '\n'.join(f'static constexpr char {k}[] = "{v}";' for k,v in {
            'joinEUIHex':'0'*16,'devEUIHex':eui,'appKeyHex':'11'*16,'nwkKeyHex':'22'*16}.items())
    def test_ttn_keys_are_retained_only_in_usb_packet_not_private_registration(self):
        text=self.source(); original=raw(text); private=control_identity(text)
        self.assertNotEqual(original['dev_eui'],private['dev_eui'])
        self.assertTrue(private['dev_eui'].startswith('02'))
        self.assertNotEqual(original['app_key'],private['app_key'])
        self.assertNotEqual(original['nwk_key'],private['nwk_key'])
        self.assertEqual(private,control_identity(text))
        self.assertNotEqual(private,control_identity(self.source('70B3D57ED0079D89')))
        with tempfile.TemporaryDirectory() as temp:
            group=group_file(Path(temp)/'group.json')
            self.assertEqual(group,group_file(Path(temp)/'group.json'))
            self.assertEqual((Path(temp)/'group.json').stat().st_mode&0o777,0o600)
            packet=usb_packet(text,group).decode().strip()
            self.assertEqual(len(packet),291)
            data=bytes.fromhex(packet.split(':')[1])
            self.assertEqual(len(data),136)
            self.assertEqual(data[:2],b'\x01\x01')
            self.assertEqual(data[50:52],b'\x01\x02')
            self.assertEqual(data[18:34],bytes.fromhex(original['app_key']))
            self.assertEqual(data[60:68],bytes.fromhex(private['dev_eui']))
            self.assertEqual(len(packet.split(':')[2]),13)
