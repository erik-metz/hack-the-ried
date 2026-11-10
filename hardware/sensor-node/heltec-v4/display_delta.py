#!/usr/bin/env python3
"""Prepare a bounded OLED-only lab delta from an exact saved Heltec ELF/image.

No compilation, provisioning, USB writes or radio traffic. Reuses the saved ELF
to retain its exact layout and newer GPS behavior. esptool regenerates image
checksums and the ELF/image digests. Never distribute the private build folder.
"""
import argparse
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parent
OLD = b'Heltec GPS v%u\n\0'
NEW = b'Heltec OTA v%u\n\0'


def prepare(elf, base, output, esptool):
    original = elf.read_bytes()
    if len(OLD) != len(NEW) or original.count(OLD) != 1:
        raise ValueError('Expected exactly one unchanged Heltec OLED title')
    output.mkdir(mode=0o700)  # Exclusive: exact saved builds are never overwritten.

    def image(source, target):
        subprocess.run([str(esptool), '--chip', 'esp32s3', 'elf2image',
                        '--flash-mode', 'dio', '--flash-freq', '80m',
                        '--flash-size', '16MB', '--elf-sha256-offset', '0xb0',
                        '-o', str(target), str(source)], check=True)
        target.chmod(0o600)

    recreated = output / 'recreated-base.bin'
    image(elf, recreated)
    if recreated.read_bytes() != base.read_bytes():
        raise ValueError('Saved ELF does not exactly reproduce the base image')
    target_elf = output / 'display-ota.elf'
    with target_elf.open('xb') as stream:
        os.chmod(target_elf, 0o600)
        stream.write(original.replace(OLD, NEW))
    target = output / 'display-ota.bin'
    image(target_elf, target)
    if target.read_bytes().count(NEW) != 1 or OLD in target.read_bytes():
        raise ValueError('Generated image does not contain the new OLED title')
    pack = ROOT.parent / 'rak3112' / 'fuota' / 'pack.py'
    subprocess.run([sys.executable, str(pack), str(target), str(output / 'bundle.json'),
                    '--base', str(base)], check=True)
    return target


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--elf', type=Path, required=True)
    parser.add_argument('--base', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--esptool', type=Path, required=True)
    args = parser.parse_args()
    prepare(args.elf, args.base, args.output, args.esptool)
