import importlib.util
from pathlib import Path
import stat
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('prepare', Path(__file__).with_name('prepare.py'))
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)


class PrepareTest(unittest.TestCase):
    def test_restart_preserves_database_credentials(self):
        with tempfile.TemporaryDirectory() as directory:
            self.assertTrue(prepare.prepare(directory))
            path = Path(directory) / '.env'
            original = path.read_bytes()
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
            self.assertFalse(prepare.prepare(directory))
            self.assertEqual(path.read_bytes(), original)
            values = dict(line.split('=', 1) for line in original.decode().splitlines())
            self.assertEqual(len(values['API_SECRET']), 64)
            self.assertNotEqual(values['API_SECRET'], values['POSTGRES_PASSWORD'])
