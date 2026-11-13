"""Compatibility entry points for the independent source scheduler."""

from runner import run_group

REGISTERED_JOBS = {
    name: name
    for name in (
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
    )
}


async def execute_job(job_key, settings, *, dry_run=False):
    if job_key not in REGISTERED_JOBS:
        raise ValueError("Unknown job")
    return await run_group(job_key, settings, dry_run)


async def run_all_jobs(settings, *, dry_run=False):
    return [
        await execute_job(key, settings, dry_run=dry_run) for key in REGISTERED_JOBS
    ]
