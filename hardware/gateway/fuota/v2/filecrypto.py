#!/usr/bin/env python3
"""Seal provisioning files to the Pi; only a public key/ciphertext leaves tools."""
import argparse
import json
import os
from pathlib import Path
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey, X25519PublicKey
from cryptography.hazmat.primitives.ciphers.aead import ChaCha20Poly1305
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

LABEL=b'kamue-fuota-file-transfer-v1'


def secret_file(path,data):
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'wb') as stream:
        stream.write(data)


def public(private):
    return private.public_key().public_bytes(serialization.Encoding.Raw,serialization.PublicFormat.Raw)


def key(shared):
    return HKDF(algorithm=hashes.SHA256(),length=32,salt=None,info=LABEL).derive(shared)


def seal(recipient,data):
    ephemeral=X25519PrivateKey.generate()
    nonce=os.urandom(12)
    cipher=ChaCha20Poly1305(key(ephemeral.exchange(X25519PublicKey.from_public_bytes(recipient))))
    return dict(version=1,ephemeral=public(ephemeral).hex(),nonce=nonce.hex(),ciphertext=cipher.encrypt(nonce,data,LABEL).hex())


def unseal(private,envelope):
    if envelope.get('version')!=1:
        raise ValueError('Unknown sealed file format')
    cipher=ChaCha20Poly1305(key(private.exchange(X25519PublicKey.from_public_bytes(bytes.fromhex(envelope['ephemeral'])))))
    return cipher.decrypt(bytes.fromhex(envelope['nonce']),bytes.fromhex(envelope['ciphertext']),LABEL)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action',choices=['generate','encrypt','decrypt'])
    parser.add_argument('--key',type=Path)
    parser.add_argument('--public')
    parser.add_argument('--input',type=Path)
    parser.add_argument('--output',type=Path)
    args=parser.parse_args()
    if args.action=='generate':
        if args.key.exists():
            private=serialization.load_pem_private_key(args.key.read_bytes(),password=None)
        else:
            private=X25519PrivateKey.generate()
            secret_file(args.key,private.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption()))
        print(public(private).hex())
    elif args.action=='encrypt':
        envelope=seal(bytes.fromhex(args.public),args.input.read_bytes())
        secret_file(args.output,json.dumps(envelope).encode())
        print('Sealed file ready; credentials were not displayed')
    else:
        private=serialization.load_pem_private_key(args.key.read_bytes(),password=None)
        secret_file(args.output,unseal(private,json.loads(args.input.read_text())))
        print('Private file decrypted on destination only')
