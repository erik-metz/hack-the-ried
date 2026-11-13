import asyncio
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import MagicMock

if "httpx" not in sys.modules:
    sys.modules["httpx"] = MagicMock()
if "psycopg" not in sys.modules:
    psycopg_mock = types.ModuleType("psycopg")
    psycopg_types = types.ModuleType("psycopg.types")
    psycopg_types_json = types.ModuleType("psycopg.types.json")
    psycopg_types_json.Jsonb = lambda x: x
    sys.modules["psycopg"] = psycopg_mock
    sys.modules["psycopg.types"] = psycopg_types
    sys.modules["psycopg.types.json"] = psycopg_types_json
if "openpyxl" not in sys.modules:
    sys.modules["openpyxl"] = MagicMock()
if "google" not in sys.modules:
    sys.modules["google"] = MagicMock()
    sys.modules["google.transit"] = MagicMock()
if "icalendar" not in sys.modules:
    sys.modules["icalendar"] = MagicMock()

from config import Settings
from health import read_status, record_job_status
from scheduler import REGISTERED_JOBS, run_all_jobs


class TestSyncWorker(unittest.TestCase):
    def test_registered_jobs_completeness(self):
        expected_jobs = {
            "infrastructure",
            "environment",
            "realestate",
            "demographics",
            "economy",
            "finance",
            "social",
        "transport",
        "waste",
        "statistics",
        "elections",
        "maps",
        "reference",
        }
        self.assertEqual(set(REGISTERED_JOBS.keys()), expected_jobs)

    def test_health_recording(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            health_file = Path(tmp_dir) / "health.json"
            status = record_job_status(health_file, "infrastructure", success=True, rows_ingested=15)
            self.assertEqual(status["overall_status"], "healthy")
            self.assertIn("infrastructure", status["jobs"])
            self.assertEqual(status["jobs"]["infrastructure"]["rows_ingested"], 15)

            read_back = read_status(health_file)
            self.assertEqual(read_back["jobs"]["infrastructure"]["status"], "success")

    def test_dry_run_all_jobs(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            settings = Settings(
                db={"host": "localhost", "port": 5432, "dbname": "test", "user": "postgres", "password": ""},
                state_dir=Path(tmp_dir),
            )
            results = asyncio.run(run_all_jobs(settings, dry_run=True))
            self.assertEqual(len(results), len(REGISTERED_JOBS))
            for res in results:
                self.assertEqual(res["status"], "validated")
                self.assertEqual(res["rows_ingested"], 0)


if __name__ == "__main__":
    unittest.main()
