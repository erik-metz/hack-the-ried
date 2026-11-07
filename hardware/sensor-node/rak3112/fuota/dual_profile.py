"""Separate TTN identity, private control identity and USB-provisioned MC keys."""
import hashlib
import hmac
import json
import os
from pathlib import Path
import secrets
from private_profile import raw


def control_identity(text):
    original=raw(text)
    identity=bytes.fromhex(original['dev_eui'])
    def key(field,purpose,length):
        return hmac.new(bytes.fromhex(original[field]),b'kamue-ttn-fuota-v3/'+purpose+identity,hashlib.sha256).digest()[:length]
    device=bytearray(key('app_key',b'control-eui',8)); device[0]=2
    join=bytearray(key('app_key',b'join-eui',8)); join[0]=2
    return dict(dev_eui=device.hex().upper(),join_eui=join.hex().upper(),
        app_key=key('app_key',b'app-key',16).hex().upper(),nwk_key=key('nwk_key',b'nwk-key',16).hex().upper())


def group_file(path):
    path=Path(path)
    if path.exists():
        group=json.loads(path.read_text())
    else:
        group=dict(mc_addr=f'{0x01f00000|secrets.randbelow(0xfffff):08X}',
            mc_app_s_key=secrets.token_hex(16).upper(),mc_nwk_s_key=secrets.token_hex(16).upper())
        fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        with os.fdopen(fd,'w') as stream: json.dump(group,stream)
    encode_group(group)
    return group


def encode_group(group):
    data=b''.join(bytes.fromhex(group[k]) for k in ['mc_addr','mc_app_s_key','mc_nwk_s_key'])
    if len(data)!=36 or not 0<int.from_bytes(data[:4],'big')<0x02000000 or not any(data[4:20]) or not any(data[20:]):
        raise ValueError('Invalid private multicast group')
    return data


def usb_packet(text,group):
    def identity(fields,network):
        return bytes([1,network])+b''.join(bytes.fromhex(fields[k]) for k in ['join_eui','dev_eui','app_key','nwk_key'])
    payload=identity(raw(text),1)+identity(control_identity(text),2)+encode_group(group)
    assert len(payload)==136
    legacy='f'+hashlib.sha256(text.encode()).hexdigest()[:12]
    return ('CFG3:'+payload.hex()+':'+legacy+'\n').encode()
