"""Download HackTheRied public monthly snapshots, with SHA-256 verification.
Python 3.9+, standard library only. Files are not automatically extracted.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path
from urllib.request import urlopen

CATALOGUE = "https://api.hack-the-ried.de/api/v1/archives"


def checksum(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--year", type=int, help="Only download this year (e.g. 2026)")
    parser.add_argument("--quarter", type=str, help="Only download this quarter (e.g. Q1, Q2, Q3, Q4)")
    parser.add_argument("--month", type=str, help="Only download this specific month (e.g. 2026-04)")
    parser.add_argument("--type", choices=["all", "month", "quarter", "year"], default="all", help="Archive type to download")
    parser.add_argument("--output", type=Path, default=Path("hack-the-ried-data"))
    args = parser.parse_args()
    with urlopen(CATALOGUE, timeout=30) as response:
        catalogue = json.load(response)
    def matches_filter(item):
        period = item.get("month", "")
        if args.year is not None and not period.startswith(f"{args.year:04d}"):
            return False
        if args.month is not None and period != args.month:
            return False
        if args.quarter is not None and not period.endswith(f"-{args.quarter.upper()}"):
            return False
        if args.type == "month" and not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", period):
            return False
        if args.type == "quarter" and not re.fullmatch(r"\d{4}-Q[1-4]", period):
            return False
        if args.type == "year" and not re.fullmatch(r"\d{4}", period):
            return False
        return True
    selected = [item for item in catalogue if matches_filter(item)]
    for archive in selected:
        period = archive["month"]
        if not re.fullmatch(r"\d{4}(-(0[1-9]|1[0-2])|-Q[1-4])?", period):
            raise ValueError(f"Invalid period in catalogue: {period}")
        directory = args.output / period
        directory.mkdir(parents=True, exist_ok=True)
        for file in archive["files"]:
            filename = file["filename"]
            if not re.fullmatch(r"hack-the-ried-\d{4}(-(0[1-9]|1[0-2])|-Q[1-4])?-part-\d+\.zip", filename):
                raise ValueError(f"Invalid archive filename: {filename}")
            if not file["url"].startswith("https://"):
                raise ValueError("Archive URL must use HTTPS")
            target = directory / filename
            if target.is_file() and checksum(target) == file["sha256"]:
                print(f"Already verified: {target}")
                continue
            temporary = target.with_suffix(".zip.partial")
            try:
                print(f"Downloading {filename} ({file['size_bytes']:,} bytes)")
                with urlopen(file["url"], timeout=120) as source, temporary.open("wb") as output:
                    while True:
                        block = source.read(1024 * 1024)
                        if not block:
                            break
                        output.write(block)
                if temporary.stat().st_size != file["size_bytes"] or checksum(temporary) != file["sha256"]:
                    raise ValueError(f"Checksum or size mismatch: {filename}; retry the download")
                temporary.replace(target)
            finally:
                temporary.unlink(missing_ok=True)
    # Save the exact catalogue used; refreshed archives may change later.
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / "catalogue.json").write_text(json.dumps(selected, indent=2), encoding="utf-8")
    print(f"Done: {len(selected)} archive(s) downloaded into {args.output}")


if __name__ == "__main__":
    main()
