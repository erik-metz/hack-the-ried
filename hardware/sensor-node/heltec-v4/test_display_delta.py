"""Safety gates and real packet construction for the OLED-only lab delta.

The synthetic converter models byte-stable image generation. Actual ESP image
validation is additionally performed with the installed esptool on the bench.
"""
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('display_delta', Path(__file__).with_name('display_delta.py'))
delta = importlib.util.module_from_spec(spec)
spec.loader.exec_module(delta)


class DisplayDeltaTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.elf = self.root / 'saved.elf'
        self.base = self.root / 'saved.bin'
        self.data = b'\xe9' + bytes(150) + delta.OLD + bytes(200)
        self.elf.write_bytes(self.data)
        self.base.write_bytes(self.data)
        self.output = self.root / 'new'
        real_run = subprocess.run

        def converter(command, **kwargs):
            if command[0] != 'synthetic-esptool':
                return real_run(command, **kwargs)
            Path(command[command.index('-o') + 1]).write_bytes(Path(command[-1]).read_bytes())

        self.converter = converter

    def prepare(self):
        with patch.object(delta.subprocess, 'run', side_effect=self.converter):
            return delta.prepare(self.elf, self.base, self.output, Path('synthetic-esptool'))

    def test_only_title_changes_and_real_pack_contains_exact_base_hash(self):
        target = self.prepare()
        self.assertEqual(target.read_bytes(), self.data.replace(delta.OLD, delta.NEW))
        bundle = json.loads((self.output / 'bundle.json').read_text())
        self.assertEqual(bundle['block_indices'], [1])
        import base64
        import hashlib
        start = base64.b64decode(bundle['start'])
        self.assertEqual(start[0], 6)
        self.assertEqual(start[45:77], hashlib.sha256(self.data).digest())
        self.assertEqual((self.output / 'bundle.json').stat().st_mode & 0o777, 0o600)
        self.assertEqual(self.base.read_bytes(), self.data)
        self.assertEqual(self.elf.read_bytes(), self.data)

    def test_wrong_saved_base_never_produces_a_target_or_transfer(self):
        self.base.write_bytes(self.data + b'wrong-build')
        with self.assertRaisesRegex(ValueError, 'exactly reproduce'):
            self.prepare()
        self.assertFalse((self.output / 'display-ota.bin').exists())
        self.assertFalse((self.output / 'bundle.json').exists())

    def test_ambiguous_title_is_rejected_before_creating_artifacts(self):
        self.elf.write_bytes(self.data + delta.OLD)
        with self.assertRaisesRegex(ValueError, 'exactly one'):
            self.prepare()
        self.assertFalse(self.output.exists())

    def test_existing_output_is_never_overwritten(self):
        self.output.mkdir()
        sentinel = self.output / 'bundle.json'
        sentinel.write_bytes(b'previous-exact-transfer')
        with self.assertRaises(FileExistsError):
            self.prepare()
        self.assertEqual(sentinel.read_bytes(), b'previous-exact-transfer')


if __name__ == '__main__':
    unittest.main()
