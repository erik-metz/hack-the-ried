#!/usr/bin/env python3
"""Build experimental A/B binaries outside the stable vN release series."""
import argparse
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
from private_profile import derive, raw

ROOT = Path(__file__).resolve().parent


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('profile')
    parser.add_argument('version', type=int, choices=[1, 2])
    parser.add_argument('--port')
    parser.add_argument('--network', choices=['ttn', 'chirpstack'], default='ttn',
                        help='TTN uses the existing 868.1-MHz device plan; ChirpStack uses full EU868')
    args = parser.parse_args()
    if args.port:
        import importlib.util
        if importlib.util.find_spec('serial') is None:
            parser.error('USB provisioning requires requirements-usb.txt in this Python environment')
    if not re.fullmatch(r'[a-z0-9][a-z0-9_-]{0,59}', args.profile):
        parser.error('Invalid profile ID')
    profile = ROOT.parent / 'profiles' / (args.profile + '.h')
    if not profile.is_file():
        parser.error('Missing local device profile')
    os.chmod(profile, 0o600)
    profile_text = profile.read_text()
    registration = raw(profile_text)
    if args.network == 'chirpstack':
        profile_text, registration = derive(profile_text)
    base = ROOT / 'build' / args.profile
    if args.network == 'chirpstack':
        base = base / 'chirpstack'
    output = base / str(args.version)
    output.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(ROOT / 'build', 0o700)
    if registration is not None:
        registration['name'] = args.profile
        registration_path = base / 'provision.json'
        fd = os.open(registration_path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, 'w') as stream:
            json.dump(registration, stream)
        os.chmod(registration_path, 0o600)
    fqbn = 'esp32:esp32:esp32s3:USBMode=hwcdc,CDCOnBoot=cdc,FlashSize=16M,PSRAM=opi'
    with tempfile.TemporaryDirectory(prefix='fuota-build-') as directory:
        sketch = Path(directory) / 'dummy'
        shutil.copytree(ROOT / 'dummy', sketch)
        (sketch / 'build_config.h').write_text(
            f'#define TEST_FIRMWARE_VERSION {args.version}\n'
            f'#define TEST_TTN_SINGLE_CHANNEL {int(args.network == "ttn")}\n'
            f'#define TEST_NETWORK_ID {2 if args.network == "chirpstack" else 1}\n')
        subprocess.run(['arduino-cli', 'compile', '--fqbn', fqbn,
            '--libraries', str(ROOT.parents[2] / 'libraries'),
            '--output-dir', str(output), str(sketch)], check=True)
        for path in output.iterdir():
            if path.is_file():
                os.chmod(path, 0o600)
        if args.port:
            subprocess.run(['arduino-cli', 'upload', '--fqbn', fqbn, '--port', args.port,
                '--input-dir', str(output), str(sketch)], check=True)
            subprocess.run([sys.executable,str(ROOT/'provision.py'),args.profile,
                '--network',args.network,'--port',args.port],check=True)
    print(f'Built common lab firmware {args.version} at {output}; provision device identity separately through USB')


if __name__ == '__main__':
    main()
