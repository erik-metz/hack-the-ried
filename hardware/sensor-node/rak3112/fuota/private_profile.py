"""Derive independent lab-network keys without changing a user's TTN profile."""
import hashlib
import hmac
import re


def derive(text):
    values = dict(re.findall(r'(joinEUIHex|devEUIHex|appKeyHex|nwkKeyHex)\[\]\s*=\s*"([^"]*)"', text))
    for name, length in [('joinEUIHex',16),('devEUIHex',16),('appKeyHex',32),('nwkKeyHex',32)]:
        value = re.sub(r'[\s:-]', '', values.get(name, ''))
        if not re.fullmatch(r'[0-9a-fA-F]{'+str(length)+'}', value):
            raise ValueError('Incomplete device profile; use compact hex keys and EUIs')
        values[name] = value.upper()
    identity = bytes.fromhex(values['devEUIHex'])
    def subkey(name, purpose, size=16):
        return hmac.new(bytes.fromhex(values[name]), b'kamue-private-fuota-v1/'+purpose+identity, hashlib.sha256).digest()[:size]
    join_eui = bytearray(subkey('appKeyHex',b'join-eui',8))
    join_eui[0] = 0x02  # Local experimental identifier, not a manufacturer EUI.
    registration = dict(dev_eui=values['devEUIHex'],join_eui=join_eui.hex().upper(),
        app_key=subkey('appKeyHex',b'app-key').hex().upper(),
        nwk_key=subkey('nwkKeyHex',b'nwk-key').hex().upper())
    header = '#pragma once\n'
    for name, field in [('joinEUIHex','join_eui'),('devEUIHex','dev_eui'),('appKeyHex','app_key'),('nwkKeyHex','nwk_key')]:
        header += f'static constexpr char {name}[] = "{registration[field]}";\n'
    return header, registration
