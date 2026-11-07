#!/usr/bin/env python3
"""Package a lab image into private-network LoRaWAN application downlinks.

Does not send any radio traffic or enqueue on TTN. Output contains the firmware,
including device credentials, and must be kept out of Git.
"""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import secrets
import struct


def package(image, session):
    if not image or len(image) > 6 * 1024 * 1024 or image[0] != 0xe9:
        raise ValueError('Expected ESP application image, 1 byte to 6 MiB')
    if not 0 < session <= 0xffffffff:
        raise ValueError('Session must be a nonzero uint32')
    prefix = struct.pack('>I', session)
    encode = lambda data: base64.b64encode(data).decode()
    return dict(protocol='kamue-fuota-lab1', f_port=43, session=session,
        size=len(image), sha256=hashlib.sha256(image).hexdigest(), block_size=128,
        start=encode(b'\x01'+prefix+struct.pack('>I',len(image))+hashlib.sha256(image).digest()),
        blocks=[encode(b'\x02'+prefix+struct.pack('>H',i//128)+image[i:i+128]) for i in range(0,len(image),128)],
        apply=encode(b'\x03'+prefix), abort=encode(b'\x04'+prefix), status=encode(b'\x05'+prefix))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('image', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    data = package(args.image.read_bytes(), secrets.randbelow(0xffffffff)+1)
    # Never overwrite an existing transfer/session silently.
    fd = os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd,'w') as stream:
        json.dump(data,stream,separators=(',',':'))
    print(f'Prepared {len(data["blocks"])} blocks, {data["size"]} bytes; no network traffic sent')
