"""Create dedicated Compose secrets without printing their values."""

import argparse
import hashlib
import os
import secrets
from pathlib import Path


def provision(directory):
    directory = Path(directory)
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(directory,0o700)
    key = secrets.token_urlsafe(32)
    key_path, digest_path = directory/'mcp-service-key', directory/'mcp-service-digests'
    if key_path.exists() or digest_path.exists():
        raise SystemExit('Existing secrets preserved; use the documented rotation procedure')
    for path, value in ((key_path,key), (digest_path,hashlib.sha256(key.encode()).hexdigest())):
        fd = os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o400)
        with os.fdopen(fd,'w') as output:
            output.write(value+'\n')
        # Host directory stays private; Compose's unprivileged container can
        # read the specifically mounted file, without access to the directory.
        os.chmod(path,0o444)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory',type=Path)
    provision(parser.parse_args().directory)
    print('Dedicated MCP secret files created; values were not printed.')
