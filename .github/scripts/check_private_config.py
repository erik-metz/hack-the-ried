#!/usr/bin/env python3
"""Reject private configuration paths in the Git index without reading values."""

from pathlib import PurePosixPath
import subprocess
import sys


def is_private_config(path: str) -> bool:
    name = PurePosixPath(path).name.lower()
    if name.endswith((".example", ".sample", ".template")):
        return False
    return (
        name == ".env"
        or name.startswith(".env.")
        or name.endswith(".env")
        or name == "secrets.h"
    )


def main() -> int:
    # The index includes force-added ignored files, and excludes staged deletions.
    paths = subprocess.check_output(["git", "ls-files", "-z"]).decode().split("\0")
    blocked = sorted(path for path in paths if path and is_private_config(path))
    if blocked:
        print("Private configuration files must not be committed:", file=sys.stderr)
        for path in blocked:
            print(f"  {path}", file=sys.stderr)
        print("Keep values outside Git; commit a sanitized .example instead.", file=sys.stderr)
        return 1
    print("No private configuration paths in the Git index.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
