"""Tests for services/backup/crypto.py — encrypted backup container."""

from __future__ import annotations

import os

import pytest

from services.backup.crypto import (
    AuthenticationFailedError,
    HEADER_LEN,
    HeaderError,
    KDF_ARGON2ID,
    KDF_SCRYPT,
    MAGIC,
    UnsupportedKDFError,
    decrypt,
    encrypt,
)


# -- round-trip --------------------------------------------------------


class TestRoundTrip:
    def test_basic_roundtrip(self):
        pt = b"hello, backup"
        pw = b"correct horse battery staple"
        blob = encrypt(pt, pw)
        assert decrypt(blob, pw) == pt

    def test_roundtrip_preserves_binary_payload(self):
        # All 256 byte values, in order.
        pt = bytes(range(256)) * 4  # 1024 bytes
        pw = b"pw"
        assert decrypt(encrypt(pt, pw), pw) == pt

    def test_empty_plaintext_roundtrips(self):
        # AES-GCM accepts empty input; the GCM tag is still emitted.
        assert decrypt(encrypt(b"", b"pw"), b"pw") == b""

    def test_large_payload_roundtrips(self):
        pt = os.urandom(1024 * 1024)  # 1 MiB
        assert decrypt(encrypt(pt, b"pw"), b"pw") == pt


# -- header layout ----------------------------------------------------


class TestEnvelopeStructure:
    def test_magic_at_offset_zero(self):
        blob = encrypt(b"x", b"pw")
        assert blob[:4] == MAGIC

    def test_envelope_length_is_header_plus_plaintext_plus_tag(self):
        pt = b"hello"
        blob = encrypt(pt, b"pw")
        assert len(blob) == HEADER_LEN + len(pt) + 16  # 16-byte GCM tag

    def test_two_encryptions_of_same_plaintext_produce_different_blobs(self):
        # Salt and nonce must be random per encryption.
        a = encrypt(b"same", b"pw")
        b = encrypt(b"same", b"pw")
        # Different salt (offset 6..22) and nonce (22..34).
        assert a[6:22] != b[6:22]
        assert a[22:34] != b[22:34]


# -- failure modes -----------------------------------------------------


class TestWrongPassphrase:
    def test_wrong_passphrase_raises_authentication_failed(self):
        blob = encrypt(b"secret", b"right")
        with pytest.raises(AuthenticationFailedError):
            decrypt(blob, b"wrong")

    def test_empty_passphrase_rejected_on_encrypt(self):
        with pytest.raises(ValueError):
            encrypt(b"x", b"")

    def test_empty_passphrase_rejected_on_decrypt(self):
        blob = encrypt(b"x", b"pw")
        with pytest.raises(ValueError):
            decrypt(blob, b"")


class TestTampering:
    def test_flip_in_ciphertext_raises_authentication_failed(self):
        blob = bytearray(encrypt(b"secret payload here", b"pw"))
        # Flip one bit in the ciphertext body (after header).
        blob[HEADER_LEN + 2] ^= 0x01
        with pytest.raises(AuthenticationFailedError):
            decrypt(bytes(blob), b"pw")

    def test_flip_in_header_salt_raises_authentication_failed(self):
        blob = bytearray(encrypt(b"secret payload here", b"pw"))
        # Salt is at offset 6..22; flipping any bit invalidates AAD.
        blob[10] ^= 0x01
        with pytest.raises(AuthenticationFailedError):
            decrypt(bytes(blob), b"pw")

    def test_flip_in_nonce_raises_authentication_failed(self):
        blob = bytearray(encrypt(b"secret payload here", b"pw"))
        # Nonce at offset 22..34.
        blob[25] ^= 0x01
        with pytest.raises(AuthenticationFailedError):
            decrypt(bytes(blob), b"pw")


class TestHeaderValidation:
    def test_bad_magic_raises_header_error(self):
        blob = bytearray(encrypt(b"x", b"pw"))
        blob[0] ^= 0xFF  # corrupt magic
        with pytest.raises(HeaderError):
            decrypt(bytes(blob), b"pw")

    def test_short_blob_raises_header_error(self):
        with pytest.raises(HeaderError):
            decrypt(b"TAIB" + b"\x01" * 5, b"pw")  # way under HEADER_LEN + tag

    def test_unknown_kdf_id_raises_unsupported(self):
        blob = bytearray(encrypt(b"x", b"pw"))
        blob[5] = 99  # corrupt kdf_id to something we don't know
        with pytest.raises(UnsupportedKDFError):
            decrypt(bytes(blob), b"pw")


class TestArgumentValidation:
    def test_non_bytes_plaintext_rejected(self):
        with pytest.raises(TypeError):
            encrypt("string not bytes", b"pw")  # type: ignore[arg-type]

    def test_non_bytes_blob_rejected(self):
        with pytest.raises(TypeError):
            decrypt("string", b"pw")  # type: ignore[arg-type]


# -- KDF selection -----------------------------------------------------


class TestKDFSelection:
    def test_default_kdf_is_scrypt(self):
        blob = encrypt(b"x", b"pw")
        # kdf_id byte is at offset 5
        assert blob[5] == KDF_SCRYPT

    def test_explicit_scrypt_roundtrip(self):
        pt = b"y"
        blob = encrypt(pt, b"pw", kdf_id=KDF_SCRYPT)
        assert decrypt(blob, b"pw") == pt
        assert blob[5] == KDF_SCRYPT

    def test_argon2_kdf_roundtrips_when_implemented(self):
        # If argon2-cffi is installed, we should be able to use it.
        # If not, decrypt should raise UnsupportedKDFError.
        try:
            import argon2  # noqa: F401
        except ImportError:
            pytest.skip("argon2-cffi not installed in this environment")
        blob = encrypt(b"y", b"pw", kdf_id=KDF_ARGON2ID)
        assert decrypt(blob, b"pw") == b"y"
        assert blob[5] == KDF_ARGON2ID
