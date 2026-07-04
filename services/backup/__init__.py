"""Package marker for the backup service."""

from .safety import RestoreQuotas, QuotaViolation, enforce_quotas

# Crypto is optional — only import lazily so missing cryptography or
# argon2-cffi doesn't take down the safety-only path.
try:
    from .crypto import (
        AuthenticationFailedError,
        CryptoError,
        HeaderError,
        MAGIC,
        UnsupportedKDFError,
        decrypt,
        encrypt,
    )
except ImportError:  # pragma: no cover
    decrypt = encrypt = None  # type: ignore[assignment]
    AuthenticationFailedError = CryptoError = HeaderError = None  # type: ignore[assignment]
    UnsupportedKDFError = None  # type: ignore[assignment]
    MAGIC = b""  # type: ignore[assignment]

__all__ = [
    "RestoreQuotas",
    "QuotaViolation",
    "enforce_quotas",
    "decrypt",
    "encrypt",
    "AuthenticationFailedError",
    "CryptoError",
    "HeaderError",
    "UnsupportedKDFError",
    "MAGIC",
]
