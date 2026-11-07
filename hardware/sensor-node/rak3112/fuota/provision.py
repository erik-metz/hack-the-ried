#!/usr/bin/env python3
"""Provision the chosen profile through USB without logging its credentials."""
import argparse
import hashlib
from pathlib import Path
import re
import time
from private_profile import derive, raw


def packet(text, network, original_bytes):
    if network == 'chirpstack':
        legacy_text, fields = derive(text)
        legacy_bytes = legacy_text.encode()
    else:
        fields = raw(text)
        legacy_bytes = original_bytes
    identity = bytes([1,2 if network == 'chirpstack' else 1]) + b''.join(
        bytes.fromhex(fields[key]) for key in ('join_eui','dev_eui','app_key','nwk_key'))
    if not any(identity[10:18]) or not any(identity[18:34]) or not any(identity[34:50]):
        raise ValueError('Profile contains empty device identity or keys')
    legacy = 'f'+hashlib.sha256(legacy_bytes).hexdigest()[:12]
    return ('CFG1:'+identity.hex()+':'+legacy+'\n').encode(),fields['dev_eui']


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('profile')
    parser.add_argument('--network',choices=['ttn','chirpstack'],required=True)
    parser.add_argument('--port',required=True)
    parser.add_argument('--dry-run',action='store_true')
    args=parser.parse_args()
    if not re.fullmatch(r'[a-z0-9][a-z0-9_-]{0,59}',args.profile):
        parser.error('Invalid profile ID')
    path=Path(__file__).resolve().parents[1]/'profiles'/(args.profile+'.h')
    original=path.read_bytes()
    command,device=packet(original.decode(),args.network,original)
    print('Selected '+args.profile+', DevEUI '+device+', network '+args.network)
    if args.dry_run:
        print('USB identity packet validated; no credentials displayed or sent')
        return
    import serial
    with serial.Serial(port=None,baudrate=115200,timeout=.2) as port:
        # Match the Arduino monitor's working native USB-CDC line state.
        port.dtr=True; port.rts=True; port.port=args.port; port.open()
        time.sleep(1.5)
        port.write(command); port.flush()
        deadline=time.monotonic()+30
        while time.monotonic()<deadline:
            line=port.readline().decode(errors='replace').strip()
            if line=='PROFILE stored; restarting':
                print(line)
                return
            if line=='PROFILE rejected':
                raise RuntimeError('Device rejected USB identity; existing credentials retained')
    raise TimeoutError('No provisioning acknowledgement received from selected USB port')


if __name__=='__main__':
    main()
