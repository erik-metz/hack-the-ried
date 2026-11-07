#!/usr/bin/env python3
"""Build experimental A/B binaries outside the stable vN release series."""
import argparse
import hashlib
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('profile')
    parser.add_argument('version', type=int, choices=[1, 2])
    parser.add_argument('--port')
    args = parser.parse_args()
    if not re.fullmatch(r'[a-z0-9][a-z0-9_-]{0,59}', args.profile):
        parser.error('Invalid profile ID')
    profile = ROOT.parent / 'profiles' / (args.profile + '.h')
    if not profile.is_file():
        parser.error('Missing local device profile')
    os.chmod(profile, 0o600)
    identity = hashlib.sha256(profile.read_bytes()).hexdigest()[:12]
    output = ROOT / 'build' / args.profile / str(args.version)
    output.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(ROOT / 'build', 0o700)
    fqbn = 'esp32:esp32:esp32s3:USBMode=hwcdc,CDCOnBoot=cdc,FlashSize=16M,PSRAM=opi'
    with tempfile.TemporaryDirectory(prefix='fuota-build-') as directory:
        sketch = Path(directory) / 'dummy'
        shutil.copytree(ROOT / 'dummy', sketch)
        shutil.copyfile(profile, sketch / 'secrets.h')
        os.chmod(sketch / 'secrets.h', 0o600)
        (sketch / 'build_config.h').write_text(
            f'#define TEST_FIRMWARE_VERSION {args.version}\n'
            f'#define TEST_NVS_NAMESPACE "f{identity}"\n')
        subprocess.run(['arduino-cli', 'compile', '--fqbn', fqbn,
            '--libraries', str(ROOT.parents[2] / 'libraries'),
            '--output-dir', str(output), str(sketch)], check=True)
        for path in output.iterdir():
            if path.is_file():
                os.chmod(path, 0o600)
        if args.port:
            subprocess.run(['arduino-cli', 'upload', '--fqbn', fqbn, '--port', args.port,
                '--input-dir', str(output), str(sketch)], check=True)
    print(f'Built lab firmware {args.version}; secret-bearing artifacts kept locally at {output}')


if __name__ == '__main__':
    main()
