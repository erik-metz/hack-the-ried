"""Unit tests for registry-sync-worker."""

from pathlib import Path

import pytest
from config import Settings
from health import read_status, record_job_status
from scheduler import REGISTERED_JOBS, run_all_jobs


def test_registered_jobs_completeness():
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
    assert set(REGISTERED_JOBS.keys()) == expected_jobs


def test_health_recording(tmp_path: Path):
    health_file = tmp_path / "health.json"
    status = record_job_status(health_file, "infrastructure", success=True, rows_ingested=15)
    assert status["overall_status"] == "healthy"
    assert "infrastructure" in status["jobs"]
    assert status["jobs"]["infrastructure"]["rows_ingested"] == 15

    # Check read_status
    read_back = read_status(health_file)
    assert read_back["jobs"]["infrastructure"]["status"] == "success"


@pytest.mark.asyncio
async def test_dry_run_all_jobs(tmp_path: Path):
    settings = Settings(
        db={"host": "localhost", "port": 5432, "dbname": "test", "user": "postgres", "password": ""},
        state_dir=tmp_path,
    )
    results = await run_all_jobs(settings, dry_run=True)
    assert len(results) == len(REGISTERED_JOBS)
    for res in results:
        assert res["status"] == "validated"
        assert res["rows_ingested"] == 0
