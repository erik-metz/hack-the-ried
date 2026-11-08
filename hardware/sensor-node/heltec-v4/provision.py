#!/usr/bin/env python3
"""Provision this tracker using an isolated Heltec multicast group."""
import argparse,json,os,sys,time
from pathlib import Path
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT.parent/'rak3112'/'fuota'))
from private_profile import raw
from dual_profile import control_identity,group_file,usb_packet
if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port');parser.add_argument('--prepare-only',action='store_true')
    args=parser.parse_args()
    source=ROOT.parent/'rak3112'/'profiles'/'heltec-v-001.h';source.chmod(0o600)
    text=source.read_bytes().decode();state=ROOT/'build'/'private';state.mkdir(parents=True,exist_ok=True,mode=0o700);state.chmod(0o700)
    group=group_file(state/'group.json');device=control_identity(text)
    device.update(name='heltec-v-001-update',ttn_dev_eui=raw(text)['dev_eui'])
    registration=state/'registration.json'
    fd=os.open(registration,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
    with os.fdopen(fd,'w') as stream:json.dump(dict(group=group,devices=[device]),stream)
    print('TTN DevEUI '+device['ttn_dev_eui']+'; update companion '+device['dev_eui'])
    if not args.prepare_only:
        if not args.port:parser.error('--port required')
        import serial
        with serial.Serial(port=None,baudrate=115200,timeout=.2) as port:
            port.dtr=True;port.rts=True;port.port=args.port;port.open();time.sleep(1.5)
            port.reset_input_buffer();port.write(b'\n');port.flush();until=time.monotonic()+10
            while time.monotonic()<until:
                if port.readline().decode(errors='replace').strip()=='PROFILE rejected':break
            else:raise TimeoutError('USB parser did not acknowledge reset')
            command=usb_packet(text,group)
            for offset in range(0,len(command),32):port.write(command[offset:offset+32]);port.flush();time.sleep(.02)
            until=time.monotonic()+30
            while time.monotonic()<until:
                line=port.readline().decode(errors='replace').strip()
                if line=='PROFILE stored; restarting':print(line);break
                if line=='PROFILE rejected':raise RuntimeError('Profile rejected')
            else:raise TimeoutError('No USB acknowledgement')
