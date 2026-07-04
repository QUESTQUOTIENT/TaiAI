"""services/backup/safety.py — restore-time safety checks.

Restore takes a tarball from disk and writes it into ``data/``. A malicious
or accidentally-oversized archive can:

* Extract far more bytes than its compressed size ("archive bomb",
  e.g. a 10 KB gzip that decompresses to 10 PB).
* Contain millions of tiny entries and exhaust inodes / directory
  entries even if total bytes look fine.
* Use absurdly deep or wide path names that break the filesystem.

This module enforces simple, conservative budgets *before* any extract
happens, so a hostile archive is rejected up front rather than halfway
through (when partial state is already on disk). The defaults are tuned
for ``data/`` directories in the multi-GB range; CLI flags override them.

What is **not** in scope here:

* Traversal/symlink protection — lives in
  ``scripts/TaiAi-backup:_validate_restore_members``. (Tested separately.)
* Encryption / decryption — lives in ``services/backup/crypto.py``.

Keeping these concerns separate lets us swap any of them (e.g. swap the
quota algorithm) without touching the others.
"""

from __future__ import annotations

import tarfile
from dataclasses import dataclass
from typing import Iterable


@dataclass(frozen=True)
class RestoreQuotas:
    """Restore-time limits. All values are inclusive (≤ passes, > fails).

    Parameters
    ----------
    max_entries : int
        Hard cap on member count in the tarball. Default 100,000.
    max_uncompressed_bytes : int
        Hard cap on the sum of member sizes (uncompressed). Default 8 GiB.
    max_compression_ratio : float
        Cap on ``uncompressed_bytes / compressed_bytes``. Default 100
        (a 10 MB archive cannot decompress to more than ~1 GB).
    max_member_size : int
        Cap on the size of any single member. Default 2 GiB.
    max_name_length : int
        Cap on the length of any member name. Default 1024 bytes.
    """

    max_entries: int = 100_000
    max_uncompressed_bytes: int = 8 * 1024 * 1024 * 1024  # 8 GiB
    max_compression_ratio: float = 100.0
    max_member_size: int = 2 * 1024 * 1024 * 1024  # 2 GiB
    max_name_length: int = 1024


class QuotaViolation(Exception):
    """Raised when a tarball violates :class:`RestoreQuotas`.

    The error message is safe to surface to a CLI user; it names the
    offending value and the budget it crossed.
    """

    def __init__(self, message: str, *, code: str) -> None:
        super().__init__(message)
        self.message = message
        self.code = code  # e.g. "entries", "bytes", "ratio", "member_size", "name"


def enforce_quotas(
    members: Iterable[tarfile.TarInfo],
    compressed_size: int,
    quotas: RestoreQuotas | None = None,
) -> int:
    """Return total uncompressed bytes if all quotas pass; raise otherwise.

    Parameters
    ----------
    members
        Iterable of :class:`tarfile.TarInfo`. Typically ``tar.getmembers()``.
    compressed_size
        Size in bytes of the compressed archive on disk. Used for the
        compression-ratio check. Pass ``0`` to skip the ratio check (e.g.
        when reading from a stream where the compressed size is unknown).
    quotas
        Budgets to enforce. ``None`` means use defaults.

    Returns
    -------
    int
        Total uncompressed bytes across all members. Useful for reporting.

    Raises
    ------
    QuotaViolation
        If any budget is exceeded. The exception's ``code`` attribute lets
        callers branch on which limit tripped (e.g. for distinct exit
        codes).
    """
    q = quotas or RestoreQuotas()

    members_list = list(members)
    total_uncompressed = 0

    if len(members_list) > q.max_entries:
        raise QuotaViolation(
            f"archive has {len(members_list)} entries; budget is {q.max_entries}",
            code="entries",
        )

    for m in members_list:
        if m.size > q.max_member_size:
            raise QuotaViolation(
                f"entry {m.name!r} is {m.size} bytes; per-member budget is {q.max_member_size}",
                code="member_size",
            )
        if len(m.name) > q.max_name_length:
            raise QuotaViolation(
                f"entry name length {len(m.name)} exceeds budget {q.max_name_length}",
                code="name",
            )
        total_uncompressed += m.size

    if total_uncompressed > q.max_uncompressed_bytes:
        raise QuotaViolation(
            f"archive uncompressed total {total_uncompressed} bytes exceeds budget {q.max_uncompressed_bytes}",
            code="bytes",
        )

    if compressed_size > 0 and q.max_compression_ratio > 0:
        ratio = total_uncompressed / max(compressed_size, 1)
        if ratio > q.max_compression_ratio:
            raise QuotaViolation(
                f"compression ratio {ratio:.1f}x exceeds budget {q.max_compression_ratio:.1f}x "
                f"(uncompressed {total_uncompressed} / compressed {compressed_size})",
                code="ratio",
            )

    return total_uncompressed
