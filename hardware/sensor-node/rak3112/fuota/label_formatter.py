#!/usr/bin/env python3
"""Render a device-level TTN label from device identity and received value."""
import argparse
from pathlib import Path

def render(number):
    if not isinstance(number,int) or isinstance(number,bool) or not 1<=number<=999:
        raise ValueError('RAK number must be 1..999')
    source=Path(__file__).parent/'ttn_multicast'/'payload-formatter.js'
    return f'var RAK_NUMBER = {number};\n'+source.read_text()

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('number',type=int);args=parser.parse_args()
    print(render(args.number),end='')
