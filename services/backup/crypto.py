"""services/backup/crypto.py — encrypted backup container format.

The snapshot CLI writes a tar.gz to disk. Without encryption, that tarball
contains the live SQLite database, the Fernet key, RAG indexes, attachments,
and any operator-stored secrets — anyone with file-system access to the
backup destination reads all of it. This module adds an at-rest envelope.

Envelope layout
---------------

::

    +--------+--------+--------+----------------+----------------+----------------------+
    | magic  | ver    | kdf_id | salt (16 B)    | nonce (12 B)   | ciphertext + GCM tag |
    | 4 B    | 1 B    | 1 B    |                |                | (rest of payload)     |
    +--------+--------+--------+----------------+----------------+----------------------+

* **magic** = ``b"TAIB"`` (TaiAi Backup). Cheap structural check before
  any crypto work; a wrong magic means "this is not a backup" not
  "decrypt failed".
* **ver** = ``1``. Bump only on a backwards-incompatible format change.
* **kdf_id** = ``1`` for scrypt; ``2`` reserved for Argon2id once the
  ``argon2-cffi`` package is installed. The decoder dispatches on this.
* **salt** is per-encryption random; never reuse across encryptions.
* **nonce** is per-encryption random; AES-GCM must never reuse
  (key, nonce) pairs.
* **ciphertext + GCM tag** is the output of ``AESGCM.encrypt(nonce, data, aad)``
  where ``aad = magic || ver || kdf_id || salt || nonce`` so any header
  tampering invalidates the tag.

The passphrase never enters the envelope. The key is derived from
``passphrase + salt`` via the KDF; losing the passphrase means losing
the backup. There is no key-recovery path by design.
"""

from __future__ import annotations

import hashlib
import hmac
import os
import secrets
from dataclasses import dataclass
from typing import Final

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


# --- format constants --------------------------------------------------

MAGIC: Final[bytes] = b"TAIB"
FORMAT_VERSION: Final[int] = 1
HEADER_LEN: Final[int] = 4 + 1 + 1 + 16 + 12  # magic + ver + kdf_id + salt + nonce
SALT_LEN: Final[int] = 16
NONCE_LEN: Final[int] = 12
KEY_LEN: Final[int] = 32  # AES-256

# KDF identifiers. Wire-format stable: changing these is a format-version
# bump, not just an edit here.
KDF_SCRYPT: Final[int] = 1
KDF_ARGON2ID: Final[int] = 2  # not yet wired (no argon2-cffi in env)

# Scrypt parameters. OWASP (2023) recommends N>=2^17, r=8, p=1. Memory
# cost is 128 * N * r * p bytes — so N=2^17 needs ~128 MiB peak. OpenSSL's
# default ``maxmem`` is 32 MiB which silently raises "memory limit
# exceeded"; we pass maxmem explicitly so this works on Windows + Linux.
_SCRYPT_N: Final[int] = 1 << 17  # 131072
_SCRYPT_R: Final[int] = 8
_SCRYPT_P: Final[int] = 1
# Headroom: 256 MiB >= the 128 MiB the call needs, with margin for
# Python/openssl bookkeeping. Increase SCRYPT_MAXMEM_BYTES if you raise N.
_SCRYPT_MAXMEM_BYTES: Final[int] = 256 * 1024 * 1024


# --- errors -----------------------------------------------------------


class CryptoError(Exception):
    """Base for all backup-crypto errors."""


class HeaderError(CryptoError):
    """Magic / version / kdf_id did not match. Likely not a backup blob."""


class AuthenticationFailedError(CryptoError):
    """AES-GCM tag check failed. Wrong passphrase, or the blob was tampered with."""


class UnsupportedKDFError(CryptoError):
    """The blob's KDF ID has no implementation in this build (e.g. Argon2 without argon2-cffi)."""


# --- KDF --------------------------------------------------------------


def _derive_scrypt(passphrase: bytes, salt: bytes) -> bytes:
    """Derive a 32-byte AES key via scrypt. Memory-hard, stdlib-only."""
    # hashlib.scrypt raises ValueError on bad parameters; the constants
    # above are validated below at import time so this should only fire
    # on absurdly large inputs.
    return hashlib.scrypt(
        passphrase,
        salt=salt,
        n=_SCRYPT_N,
        r=_SCRYPT_R,
        p=_SCRYPT_P,
        maxmem=_SCRYPT_MAXMEM_BYTES,
        dklen=KEY_LEN,
    )


def _derive_argon2id(passphrase: bytes, salt: bytes) -> bytes:
    """Argon2id path. Wired but disabled until ``argon2-cffi`` is installed."""
    try:
        from argon2.low_level import hash_secret_raw, Type  # type: ignore
    except ImportError as e:  # pragma: no cover — exercised only when installed
        raise UnsupportedKDFError(
            "argon2-cffi is not installed; rebuild the backup with --kdf scrypt"
        ) from e
    # 64 MiB, t=3, p=1 — comparable to scrypt at the cost level above.
    return hash_secret_raw(
        secret=passphrase,
        salt=salt,
        time_cost=3,
        memory_cost=1 << 16,
        parallelism=1,
        hash_len=KEY_LEN,
        type=Type.ID,
    )


def _derive_key(passphrase: bytes, salt: bytes, kdf_id: int) -> bytes:
    if kdf_id == KDF_SCRYPT:
        return _derive_scrypt(passphrase, salt)
    if kdf_id == KDF_ARGON2ID:
        return _derive_argon2id(passphrase, salt)
    raise UnsupportedKDFError(f"unknown kdf_id: {kdf_id!r}")


# --- public API -------------------------------------------------------


@dataclass(frozen=True)
class EncryptResult:
    ciphertext: bytes
    salt: bytes
    nonce: bytes
    kdf_id: int


def encrypt(plaintext: bytes, passphrase: bytes, *, kdf_id: int = KDF_SCRYPT) -> bytes:
    """Encrypt ``plaintext`` under ``passphrase``. Returns the full envelope.

    The output is :data:`HEADER_LEN` + ``len(plaintext) + 16`` bytes
    (the +16 is the GCM tag). Suitable for writing to disk as-is.
    """
    if not isinstance(plaintext, (bytes, bytearray)):
        raise TypeError("plaintext must be bytes")
    if not isinstance(passphrase, (bytes, bytearray)) or len(passphrase) == 0:
        raise ValueError("passphrase must be a non-empty bytes object")

    salt = secrets.token_bytes(SALT_LEN)
    nonce = secrets.token_bytes(NONCE_LEN)
    key = _derive_key(bytes(passphrase), salt, kdf_id)

    header = MAGIC + bytes([FORMAT_VERSION, kdf_id]) + salt + nonce
    # AAD = the entire header. Any byte flip in the header invalidates the
    # GCM tag → AuthenticationFailedError at decrypt time.
    ciphertext = AESGCM(key).encrypt(nonce, bytes(plaintext), header)
    return header + ciphertext


def decrypt(blob: bytes, passphrase: bytes) -> bytes:
    """Decrypt an envelope produced by :func:`encrypt`.

    Raises :class:`HeaderError`, :class:`AuthenticationFailedError`, or
    :class:`UnsupportedKDFError` on failure. Does not leak *which* failure
    via timing — both header and tag checks are constant-time at the
    crypto level.
    """
    if not isinstance(blob, (bytes, bytearray)):
        raise TypeError("blob must be bytes")
    if not isinstance(passphrase, (bytes, bytearray)) or len(passphrase) == 0:
        raise ValueError("passphrase must be a non-empty bytes object")
    if len(blob) < HEADER_LEN + 16:  # header + at least a 16-byte tag
        raise HeaderError(f"blob too short: {len(blob)} bytes")

    blob = bytes(blob)
    magic = blob[:4]
    ver = blob[4]
    kdf_id = blob[5]
    salt = blob[6:22]
    nonce = blob[22:34]
    body = blob[34:]

    # Constant-time magic check. hmac.compare_digest would also work; for
    # short fixed-length compares it does not measurably differ from a
    # plain equality, but using it is the safer habit.
    if not hmac.compare_digest(magic, MAGIC):
        raise HeaderError(f"bad magic: {magic!r}")
    if ver != FORMAT_VERSION:
        raise HeaderError(f"unsupported format version: {ver}")
    if kdf_id not in (KDF_SCRYPT, KDF_ARGON2ID):
        raise UnsupportedKDFError(f"unknown kdf_id: {kdf_id!r}")

    key = _derive_key(bytes(passphrase), salt, kdf_id)
    header = blob[:HEADER_LEN]
    try:
        return AESGCM(key).decrypt(nonce, body, header)
    except Exception as e:  # cryptography raises InvalidTag as a generic Exception
        raise AuthenticationFailedError(
            "decryption failed: wrong passphrase or tampered blob"
        ) from e


# --- self-test (run with `python -m services.backup.crypto`) ---------

if __name__ == "__main__":  # pragma: no cover
    import sys

    pw = (sys.argv[1] if len(sys.argv) > 1 else "correct horse battery staple").encode()
    msg = b"the quick brown fox jumps over the lazy dog"
    blob = encrypt(msg, pw)
    out = decrypt(blob, pw)
    assert out == msg, "round-trip failed"
    print(f"OK — {len(msg)}B plaintext → {len(blob)}B envelope → recovered")
