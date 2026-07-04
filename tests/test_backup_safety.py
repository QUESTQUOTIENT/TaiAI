"""Tests for services/backup/safety.py — archive-bomb quotas."""

from __future__ import annotations

import io
import tarfile
import time

import pytest

from services.backup.safety import (
    QuotaViolation,
    RestoreQuotas,
    enforce_quotas,
)


def _make_tarinfo(name: str, size: int) -> tarfile.TarInfo:
    """Build a TarInfo with the given name + size (no actual payload)."""
    ti = tarfile.TarInfo(name=name)
    ti.size = size
    ti.mtime = int(time.time())
    ti.mode = 0o644
    ti.type = tarfile.REGTYPE
    return ti


def _make_real_tarball(entries: list[tuple[str, int]]) -> bytes:
    """Build a real gzipped tarball with the given (name, size) entries.

    Useful for end-to-end tests of the ratio / byte-budget checks against an
    actually-decompressible archive, not just TarInfo stubs.
    """
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        for name, size in entries:
            payload = b"\x00" * size
            ti = tarfile.TarInfo(name=name)
            ti.size = size
            ti.mtime = int(time.time())
            ti.mode = 0o644
            tar.addfile(ti, io.BytesIO(payload))
    return buf.getvalue()


# -- defaults -----------------------------------------------------------


class TestDefaults:
    def test_default_quotas_are_generous_but_not_unbounded(self):
        q = RestoreQuotas()
        assert q.max_entries == 100_000
        # Default uncompressed budget is 8 GiB — i.e. not the unsigned
        # maxint that would let any archive pass silently.
        assert 0 < q.max_uncompressed_bytes < 1 << 40
        assert q.max_compression_ratio == 100.0
        assert 0 < q.max_member_size < 1 << 40


# -- passing cases ------------------------------------------------------


class TestPassing:
    def test_empty_member_list_passes(self):
        assert enforce_quotas([], compressed_size=0) == 0

    def test_small_archive_passes(self):
        members = [_make_tarinfo("data/x.txt", 100)]
        assert enforce_quotas(members, compressed_size=1000) == 100

    def test_real_tarball_with_reasonable_ratio_passes(self):
        blob = _make_real_tarball([("data/a.txt", 1000), ("data/b.txt", 2000)])
        # 3000 uncompressed bytes / however-many compressed bytes → well
        # under the default 100x ratio cap.
        with tarfile.open(fileobj=io.BytesIO(blob), mode="r:gz") as tar:
            total = enforce_quotas(tar.getmembers(), compressed_size=len(blob))
        assert total == 3000

    def test_compressed_size_zero_skips_ratio_check(self):
        # 10 "GB" of virtual bytes in 1 byte compressed would normally
        # blow the ratio budget; passing compressed_size=0 disables the
        # check entirely (e.g. streaming use case).
        big = _make_tarinfo("data/x", 10 * 1024 * 1024 * 1024)
        members = [big]
        # With a real compressed-size budget, the byte cap (8 GiB default)
        # would also trip — so tighten that too.
        q = RestoreQuotas(
            max_uncompressed_bytes=20 * 1024 * 1024 * 1024,
            max_member_size=20 * 1024 * 1024 * 1024,
        )
        assert enforce_quotas(members, compressed_size=0, quotas=q) == 10 * 1024 * 1024 * 1024


# -- failing cases ------------------------------------------------------


class TestEntryCountCap:
    def test_too_many_entries_raises(self):
        members = [_make_tarinfo(f"data/f{i}.txt", 1) for i in range(11)]
        q = RestoreQuotas(max_entries=10)
        with pytest.raises(QuotaViolation) as exc:
            enforce_quotas(members, compressed_size=0, quotas=q)
        assert exc.value.code == "entries"
        assert "11" in str(exc.value) and "10" in str(exc.value)


class TestByteCap:
    def test_total_uncompressed_exceeds_cap(self):
        members = [_make_tarinfo("data/a", 1000), _make_tarinfo("data/b", 1000)]
        q = RestoreQuotas(max_uncompressed_bytes=1500)
        with pytest.raises(QuotaViolation) as exc:
            enforce_quotas(members, compressed_size=0, quotas=q)
        assert exc.value.code == "bytes"


class TestPerMemberCap:
    def test_oversized_single_member_rejected(self):
        members = [_make_tarinfo("data/big", 5 * 1024 * 1024 * 1024)]
        q = RestoreQuotas(max_member_size=1024 * 1024 * 1024)  # 1 GiB
        with pytest.raises(QuotaViolation) as exc:
            enforce_quotas(members, compressed_size=0, quotas=q)
        assert exc.value.code == "member_size"
        assert "data/big" in str(exc.value)


class TestNameLengthCap:
    def test_long_name_rejected(self):
        long_name = "data/" + ("x" * 2000)
        members = [_make_tarinfo(long_name, 10)]
        q = RestoreQuotas(max_name_length=1024)
        with pytest.raises(QuotaViolation) as exc:
            enforce_quotas(members, compressed_size=0, quotas=q)
        assert exc.value.code == "name"


class TestRatioCap:
    def test_archive_bomb_rejected_by_ratio(self):
        # 1 MiB compressed / 10 GiB uncompressed = ~10000x — well over the
        # default 100x cap.
        big = _make_tarinfo("data/z", 10 * 1024 * 1024 * 1024)
        q = RestoreQuotas(
            max_uncompressed_bytes=20 * 1024 * 1024 * 1024,
            max_member_size=20 * 1024 * 1024 * 1024,
        )
        with pytest.raises(QuotaViolation) as exc:
            enforce_quotas([big], compressed_size=1024 * 1024, quotas=q)
        assert exc.value.code == "ratio"
        assert "ratio" in str(exc.value).lower()


# -- end-to-end on a real bomb-shaped tarball --------------------------


class TestRealArchiveBomb:
    def test_classic_bomb_is_rejected(self):
        # Classic zip-bomb shape: tiny compressed, huge uncompressed.
        # We can't actually allocate 10 GB of zeros, so use a sparse
        # TarInfo with a 10 GB size but a 1 KiB compressed representation.
        members = [_make_tarinfo("data/bomb", 10 * 1024 * 1024 * 1024)]
        # Override compressed-size to a tiny value so the ratio fires
        # *before* the byte cap.
        with pytest.raises(QuotaViolation):
            enforce_quotas(members, compressed_size=1024)
