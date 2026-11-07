import unittest
from lab import validate_registration
from send import status_packet, transfer


class ToolTests(unittest.TestCase):
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
