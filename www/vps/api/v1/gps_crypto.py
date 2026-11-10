"""AES-256-GCM encryption for GPS tracking coordinates.

Protects sensitive position data at rest in the database.
The encryption key must be provided via the GPS_ENCRYPTION_KEY environment variable.
"""

import json
import os
import secrets

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

_CACHED_AESGCM: AESGCM | None = None
_CACHED_RAW_KEY: bytes | None = None


def get_encryption_key() -> bytes:
    """Read the 256-bit AES key from ``GPS_ENCRYPTION_KEY``.

    The key must be supplied explicitly. Falling back to a repository-known
    value would make the encryption useless, so a missing or malformed key is
    a hard configuration error.
    """
    key_str = os.getenv("GPS_ENCRYPTION_KEY", "").strip()
    if not key_str:
        raise RuntimeError("GPS_ENCRYPTION_KEY is not configured")

    if len(key_str) == 64:
        try:
            return bytes.fromhex(key_str)
        except ValueError:
            pass

    key_bytes = key_str.encode("utf-8")
    if len(key_bytes) != 32:
        raise RuntimeError(
            "GPS_ENCRYPTION_KEY must be 64 hex characters or 32 raw bytes"
        )
    return key_bytes


def _get_cipher() -> AESGCM:
    global _CACHED_AESGCM, _CACHED_RAW_KEY
    key = get_encryption_key()
    if _CACHED_AESGCM is None or _CACHED_RAW_KEY != key:
        _CACHED_RAW_KEY = key
        _CACHED_AESGCM = AESGCM(key)
    return _CACHED_AESGCM


def encrypt_gps_data(data: dict) -> bytes:
    """Encrypt a dictionary containing GPS coordinates into bytes (nonce + ciphertext)."""
    cipher = _get_cipher()
    nonce = secrets.token_bytes(12)  # Standard 96-bit nonce for AES-GCM
    plaintext = json.dumps(data, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    ciphertext = cipher.encrypt(nonce, plaintext, None)
    return nonce + ciphertext


def decrypt_gps_data(payload: bytes) -> dict:
    """Decrypt encrypted bytes back into the GPS coordinate dictionary."""
    if len(payload) < 28:  # 12 nonce + 16 auth tag minimum
        raise ValueError("Invalid encrypted GPS payload size")
    cipher = _get_cipher()
    nonce = payload[:12]
    ciphertext = payload[12:]
    plaintext = cipher.decrypt(nonce, ciphertext, None)
    return json.loads(plaintext.decode("utf-8"))
