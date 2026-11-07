import base64
import hashlib
import importlib.util
from pathlib import Path
import struct
import unittest

spec = importlib.util.spec_from_file_location('pack', Path(__file__).parents[1] / 'pack.py')
pack = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pack)


class PackTest(unittest.TestCase):
    def test_manifest_and_fragments_reconstruct_exact_image(self):
        image = b'\xe9' + bytes(range(256))
        bundle = pack.package(image, 0x12345678)
        start = base64.b64decode(bundle['start'])
        self.assertEqual(start[:9], b'\x01' + struct.pack('>II', 0x12345678, len(image)))
        self.assertEqual(start[9:], hashlib.sha256(image).digest())
        rebuilt = bytearray()
        for i, encoded in enumerate(bundle['blocks']):
            data = base64.b64decode(encoded)
            self.assertEqual(data[:7], b'\x02' + struct.pack('>IH', 0x12345678, i))
            rebuilt.extend(data[7:])
        self.assertEqual(rebuilt, image)
        self.assertEqual(len(base64.b64decode(bundle['blocks'][-1])), 8)
        for name, opcode in [('apply', 3), ('abort', 4), ('status', 5)]:
            self.assertEqual(base64.b64decode(bundle[name]), bytes([opcode]) + struct.pack('>I', 0x12345678))

    def test_invalid_images_and_session_ids_are_refused(self):
        for image in (b'', b'not-an-esp-image', b'\xe9' * (6*1024*1024 + 1)):
            with self.assertRaises(ValueError):
                pack.package(image, 1)
        for session in (0, -1, 0x100000000):
            with self.assertRaises(ValueError):
                pack.package(b'\xe9', session)
