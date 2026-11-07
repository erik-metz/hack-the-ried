#!/usr/bin/env python3
"""Create host-local secrets exactly once, without displaying their contents."""
import os
from pathlib import Path
import secrets


def prepare(directory):
    target = Path(directory) / '.env'
    try:
        fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        return False
    with os.fdopen(fd, 'w') as stream:
        stream.write('POSTGRES_PASSWORD=' + secrets.token_hex(32) + '\n')
        stream.write('API_SECRET=' + secrets.token_hex(32) + '\n')
    return True


if __name__ == '__main__':
    print('Created local .env' if prepare(Path(__file__).parent) else 'Existing .env retained')
