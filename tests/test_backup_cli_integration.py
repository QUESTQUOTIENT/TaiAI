"""Integration tests for the encrypted snapshot/restore flow.

We don't shell out to ``scripts/TaiAi-backup`` end-to-end — that would
require a real data/ directory and would race the test runner. Instead we
import the CLI module's functions directly and drive them with
``tmp_path`` fixtures. This exercises:

* ``cmd_snapshot`` writing a tar.gz of a fake data/ tree
* ``cmd_snapshot --encrypt`` rewriting the tarball through AES-GCM
* ``cmd_restore`` auto-decrypting on magic detection
* ``cmd_restore`` refusing a hostile (bomb-shaped) archive
* ``cmd_restore`` requiring --yes
"""

from __future__ import annotations

import importlib.util
import json
import os
import sys
import tarfile
from pathlib import Path

import pytest

from services.backup import MAGIC as BACKUP_MAGIC


# -- load the CLI module without invoking main -------------------------


def _load_cli():
    """Import scripts/TaiAi-backup as a module so we can call its funcs.

    The file has no ``.py`` extension (it's a CLI entry point) so we
    use ``SourceFileLoader`` directly — ``importlib.util.spec_from_file_location``
    rejects extension-less paths.
    """
    import importlib.machinery
    path = Path(__file__).resolve().parent.parent / "scripts" / "TaiAi-backup"
    loader = importlib.machinery.SourceFileLoader("TaiAi_backup_cli", str(path))
    spec = importlib.util.spec_from_loader("TaiAi_backup_cli", loader)
    mod = importlib.util.module_from_spec(spec)
    loader.exec_module(mod)  # type: ignore[union-attr]
    return mod


# -- minimal args namespace (argparse.Namespace is just an object) -----


class _Args:
    def __init__(self, **kw):
        self.__dict__.update(kw)


@pytest.fixture
def cli():
    """CLI module + a clean module-level ``REPO_ROOT`` / ``_DATA_DIR`` /
    ``_BACKUP_DIR`` pointing at tmp_path so we don't touch the real
    repo. We patch the module's globals rather than mocking them
    because they are referenced by closure inside cmd_*."""
    mod = _load_cli()
    return mod


@pytest.fixture
def fake_data_dir(tmp_path, monkeypatch):
    """Build a fake data/ tree with one DB-like file + one json file."""
    data = tmp_path / "data"
    data.mkdir()
    (data / "config.json").write_text('{"hello": "world"}')
    (data / "memory").mkdir()
    (data / "memory" / "notes.json").write_text('[{"id": 1, "text": "note"}]')
    return data


# -- events emitted on the shared bus --------------------------------


class TestBackupEventsEmitted:
    """Verify the backup CLI emits PlatformEvents on the shared bus.

    Subscribers (cookbook, compare-mode, etc.) need these to correlate
    backup failures with the system activity that triggered them.
    """

    def test_snapshot_emits_started_and_completed(
        self, cli, fake_data_dir, tmp_path, monkeypatch
    ):
        from core.events import EventBus
        bus = EventBus(name="t")
        monkeypatch.setattr(cli, "get_default_bus", lambda: bus)
        out = tmp_path / "snap.tar.gz"
        monkeypatch.setattr(cli, "_DATA_DIR", fake_data_dir)
        monkeypatch.setattr(cli, "_BACKUP_DIR", tmp_path / "backups")
        monkeypatch.setattr(cli, "_REPO_ROOT", tmp_path)
        cli.cmd_snapshot(_Args(
            out=str(out), include_research=True,
            include_attachments=True, encrypt=False,
        ))

        types = [e.type for e in bus.history]
        assert "backup.snapshot.started" in types
        assert "backup.snapshot.completed" in types
        completed = [e for e in bus.history
                     if e.type == "backup.snapshot.completed"][0]
        assert completed.payload["files"] >= 2
        assert completed.payload["encrypted"] is False

    def test_encrypted_snapshot_marks_encrypted_in_completed_event(
        self, cli, fake_data_dir, tmp_path, monkeypatch
    ):
        from core.events import EventBus
        bus = EventBus(name="t")
        monkeypatch.setattr(cli, "get_default_bus", lambda: bus)
        pw_file = tmp_path / "pw.txt"
        pw_file.write_text("a strong passphrase for testing")
        if hasattr(os, "chmod"):
            os.chmod(pw_file, 0o600)

        out = tmp_path / "enc.tar.gz"
        monkeypatch.setattr(cli, "_DATA_DIR", fake_data_dir)
        monkeypatch.setattr(cli, "_BACKUP_DIR", tmp_path / "backups")
        monkeypatch.setattr(cli, "_REPO_ROOT", tmp_path)
        cli.cmd_snapshot(_Args(
            out=str(out), include_research=True,
            include_attachments=True, encrypt=True,
            passphrase_file=str(pw_file),
        ))

        completed = [e for e in bus.history
                     if e.type == "backup.snapshot.completed"][0]
        assert completed.payload["encrypted"] is True

    def test_restore_emits_started_completed(
        self, cli, fake_data_dir, tmp_path, monkeypatch
    ):
        from core.events import EventBus
        bus = EventBus(name="t")
        monkeypatch.setattr(cli, "get_default_bus", lambda: bus)
        # Make a snapshot first.
        out = tmp_path / "snap.tar.gz"
        monkeypatch.setattr(cli, "_DATA_DIR", fake_data_dir)
        monkeypatch.setattr(cli, "_BACKUP_DIR", tmp_path / "backups")
        monkeypatch.setattr(cli, "_REPO_ROOT", tmp_path)
        cli.cmd_snapshot(_Args(
            out=str(out), include_research=True,
            include_attachments=True, encrypt=False,
        ))
        bus.clear_history()

        # Restore into a fresh location.
        restore_root = tmp_path / "restore"
        restore_root.mkdir()
        monkeypatch.setattr(cli, "_REPO_ROOT", restore_root)
        monkeypatch.setattr(cli, "_DATA_DIR", restore_root / "data")
        cli.cmd_restore(_Args(
            path=str(out), yes=True,
            max_entries=cli.RestoreQuotas.max_entries,
            max_uncompressed_mb=cli.RestoreQuotas.max_uncompressed_bytes // (1024 * 1024),
            max_ratio=cli.RestoreQuotas.max_compression_ratio,
            passphrase_file=None,
        ))

        types = [e.type for e in bus.history]
        assert "backup.restore.started" in types
        assert "backup.restore.completed" in types
        completed = [e for e in bus.history
                     if e.type == "backup.restore.completed"][0]
        assert completed.payload["encrypted"] is False

    def test_preview_emits_previewed_event_not_completed(
        self, cli, fake_data_dir, tmp_path, monkeypatch
    ):
        from core.events import EventBus
        bus = EventBus(name="t")
        monkeypatch.setattr(cli, "get_default_bus", lambda: bus)
        out = tmp_path / "snap.tar.gz"
        monkeypatch.setattr(cli, "_DATA_DIR", fake_data_dir)
        monkeypatch.setattr(cli, "_BACKUP_DIR", tmp_path / "backups")
        monkeypatch.setattr(cli, "_REPO_ROOT", tmp_path)
        cli.cmd_snapshot(_Args(
            out=str(out), include_research=True,
            include_attachments=True, encrypt=False,
        ))
        bus.clear_history()

        restore_root = tmp_path / "restore"
        restore_root.mkdir()
        monkeypatch.setattr(cli, "_REPO_ROOT", restore_root)
        monkeypatch.setattr(cli, "_DATA_DIR", restore_root / "data")
        cli.cmd_restore(_Args(
            path=str(out), yes=False, preview=True,
            max_entries=cli.RestoreQuotas.max_entries,
            max_uncompressed_mb=cli.RestoreQuotas.max_uncompressed_bytes // (1024 * 1024),
            max_ratio=cli.RestoreQuotas.max_compression_ratio,
            passphrase_file=None,
        ))

        types = [e.type for e in bus.history]
        # Preview must NOT emit the destructive-completed event.
        assert "backup.restore.previewed" in types
        assert "backup.restore.completed" not in types

    def test_bomb_rejection_emits_quota_failure_event(
        self, cli, tmp_path, monkeypatch
    ):
        from core.events import EventBus
        import io as _io
        bus = EventBus(name="t")
        monkeypatch.setattr(cli, "get_default_bus", lambda: bus)

        bomb = tmp_path / "bomb.tar.gz"
        buf = _io.BytesIO()
        with tarfile.open(fileobj=buf, mode="w:gz") as tar:
            for i in range(15):
                ti = tarfile.TarInfo(name=f"data/f{i}.txt")
                ti.size = 1
                import time as _t
                ti.mtime = int(_t.time())
                tar.addfile(ti, _io.BytesIO(b"x"))
        bomb.write_bytes(buf.getvalue())

        restore_root = tmp_path / "restore"
        restore_root.mkdir()
        monkeypatch.setattr(cli, "_REPO_ROOT", restore_root)
        monkeypatch.setattr(cli, "_DATA_DIR", restore_root / "data")
        with pytest.raises(SystemExit):
            cli.cmd_restore(_Args(
                path=str(bomb), yes=True, preview=False,
                max_entries=10,
                max_uncompressed_mb=cli.RestoreQuotas.max_uncompressed_bytes // (1024 * 1024),
                max_ratio=cli.RestoreQuotas.max_compression_ratio,
                passphrase_file=None,
            ))

        types = [e.type for e in bus.history]
        assert "backup.restore.failed" in types
        failed = [e for e in bus.history
                  if e.type == "backup.restore.failed"][0]
        assert failed.payload["reason"] == "quota:entries"

    def test_cli_works_without_event_bus(self, cli, fake_data_dir, tmp_path, monkeypatch):
        """If core.events is unavailable, backup must still work.

        Some operators run the CLI in stripped-down environments where
        the events module isn't importable. We simulate that by making
        ``get_default_bus`` return ``None`` (the same fallback the CLI
        uses internally).
        """
        monkeypatch.setattr(cli, "get_default_bus", lambda: None)
        out = tmp_path / "snap.tar.gz"
        monkeypatch.setattr(cli, "_DATA_DIR", fake_data_dir)
        monkeypatch.setattr(cli, "_BACKUP_DIR", tmp_path / "backups")
        monkeypatch.setattr(cli, "_REPO_ROOT", tmp_path)
        cli.cmd_snapshot(_Args(
            out=str(out), include_research=True,
            include_attachments=True, encrypt=False,
        ))
        assert out.exists()


# -- snapshot (plaintext) ----------------------------------------------


class TestSnapshotPlaintext:
    def test_snapshot_writes_tar_gz(self, cli, fake_data_dir, tmp_path, monkeypatch):
        out = tmp_path / "snap.tar.gz"
        args = _Args(
            out=str(out),
            include_research=True,
            include_attachments=True,
            encrypt=False,
        )
        # Redirect module-level paths to our tmp tree.
        monkeypatch.setattr(cli, "_DATA_DIR", fake_data_dir)
        monkeypatch.setattr(cli, "_BACKUP_DIR", tmp_path / "backups")
        monkeypatch.setattr(cli, "_REPO_ROOT", tmp_path)

        cli.cmd_snapshot(args)

        assert out.exists()
        assert out.stat().st_size > 0
        # Plaintext snapshot's first 4 bytes must NOT be our magic.
        assert out.read_bytes()[:4] != BACKUP_MAGIC

    def test_snapshot_without_out_uses_default_dir(self, cli, fake_data_dir, tmp_path, monkeypatch):
        monkeypatch.setattr(cli, "_DATA_DIR", fake_data_dir)
        bk = tmp_path / "backups"
        monkeypatch.setattr(cli, "_BACKUP_DIR", bk)
        monkeypatch.setattr(cli, "_REPO_ROOT", tmp_path)
        args = _Args(out=None, include_research=True, include_attachments=True, encrypt=False)
        cli.cmd_snapshot(args)
        assert any(bk.glob("TaiAi-backup-*.tar.gz"))


# -- snapshot (encrypted) ---------------------------------------------


class TestSnapshotEncrypted:
    def test_encrypted_snapshot_is_not_a_valid_tarball(
        self, cli, fake_data_dir, tmp_path, monkeypatch
    ):
        out = tmp_path / "enc.tar.gz"
        pw_file = tmp_path / "pw.txt"
        pw_file.write_text("hunter2-correct-horse")
        # Skip the chmod check by running on a non-POSIX platform; on POSIX
        # we chmod 600 the file.
        if hasattr(os, "chmod"):
            os.chmod(pw_file, 0o600)

        monkeypatch.setattr(cli, "_DATA_DIR", fake_data_dir)
        monkeypatch.setattr(cli, "_BACKUP_DIR", tmp_path / "backups")
        monkeypatch.setattr(cli, "_REPO_ROOT", tmp_path)
        args = _Args(
            out=str(out),
            include_research=True,
            include_attachments=True,
            encrypt=True,
            passphrase_file=str(pw_file),
        )
        cli.cmd_snapshot(args)

        assert out.exists()
        # The encrypted blob's first 4 bytes MUST be our magic.
        assert out.read_bytes()[:4] == BACKUP_MAGIC
        # And it must NOT be parseable as a gzip tarball.
        with pytest.raises((tarfile.ReadError, OSError, EOFError, Exception)):
            # tarfile.open raises TarError subclasses + gzip.BadGzipFile
            tarfile.open(out, "r:gz").getmembers()


# -- restore (plaintext) ----------------------------------------------


class TestRestorePlaintext:
    def test_round_trip_data_preserved(
        self, cli, fake_data_dir, tmp_path, monkeypatch
    ):
        # 1. snapshot the fake data dir into a tar.gz
        out = tmp_path / "snap.tar.gz"
        monkeypatch.setattr(cli, "_DATA_DIR", fake_data_dir)
        monkeypatch.setattr(cli, "_BACKUP_DIR", tmp_path / "backups")
        monkeypatch.setattr(cli, "_REPO_ROOT", tmp_path)
        cli.cmd_snapshot(_Args(
            out=str(out), include_research=True,
            include_attachments=True, encrypt=False,
        ))

        # 2. move the data dir aside; restore into a fresh location
        restore_root = tmp_path / "restore"
        restore_root.mkdir()
        restore_data = restore_root / "data"
        # Restore writes into <REPO_ROOT>/data, so point there.
        monkeypatch.setattr(cli, "_REPO_ROOT", restore_root)
        monkeypatch.setattr(cli, "_DATA_DIR", restore_data)

        args = _Args(
            path=str(out),
            yes=True,
            max_entries=cli.RestoreQuotas.max_entries,
            max_uncompressed_mb=cli.RestoreQuotas.max_uncompressed_bytes // (1024 * 1024),
            max_ratio=cli.RestoreQuotas.max_compression_ratio,
            passphrase_file=None,
        )
        cli.cmd_restore(args)

        assert (restore_data / "config.json").read_text() == '{"hello": "world"}'
        assert (restore_data / "memory" / "notes.json").read_text() == '[{"id": 1, "text": "note"}]'


# -- restore (encrypted) ---------------------------------------------


class TestRestoreEncrypted:
    def test_encrypted_round_trip_data_preserved(
        self, cli, fake_data_dir, tmp_path, monkeypatch
    ):
        out = tmp_path / "enc.tar.gz"
        pw_file = tmp_path / "pw.txt"
        pw_file.write_text("a strong passphrase for testing")
        if hasattr(os, "chmod"):
            os.chmod(pw_file, 0o600)

        monkeypatch.setattr(cli, "_DATA_DIR", fake_data_dir)
        monkeypatch.setattr(cli, "_BACKUP_DIR", tmp_path / "backups")
        monkeypatch.setattr(cli, "_REPO_ROOT", tmp_path)
        cli.cmd_snapshot(_Args(
            out=str(out), include_research=True,
            include_attachments=True, encrypt=True,
            passphrase_file=str(pw_file),
        ))

        # Restore into a fresh location.
        restore_root = tmp_path / "restore"
        restore_root.mkdir()
        restore_data = restore_root / "data"
        monkeypatch.setattr(cli, "_REPO_ROOT", restore_root)
        monkeypatch.setattr(cli, "_DATA_DIR", restore_data)

        cli.cmd_restore(_Args(
            path=str(out), yes=True,
            max_entries=cli.RestoreQuotas.max_entries,
            max_uncompressed_mb=cli.RestoreQuotas.max_uncompressed_bytes // (1024 * 1024),
            max_ratio=cli.RestoreQuotas.max_compression_ratio,
            passphrase_file=str(pw_file),
        ))

        assert (restore_data / "config.json").read_text() == '{"hello": "world"}'

    def test_encrypted_restore_with_wrong_passphrase_aborts(
        self, cli, fake_data_dir, tmp_path, monkeypatch
    ):
        out = tmp_path / "enc.tar.gz"
        pw_file = tmp_path / "pw.txt"
        pw_file.write_text("the right passphrase")
        if hasattr(os, "chmod"):
            os.chmod(pw_file, 0o600)
        monkeypatch.setattr(cli, "_DATA_DIR", fake_data_dir)
        monkeypatch.setattr(cli, "_BACKUP_DIR", tmp_path / "backups")
        monkeypatch.setattr(cli, "_REPO_ROOT", tmp_path)
        cli.cmd_snapshot(_Args(
            out=str(out), include_research=True,
            include_attachments=True, encrypt=True,
            passphrase_file=str(pw_file),
        ))

        restore_root = tmp_path / "restore"
        restore_root.mkdir()
        restore_data = restore_root / "data"
        monkeypatch.setattr(cli, "_REPO_ROOT", restore_root)
        monkeypatch.setattr(cli, "_DATA_DIR", restore_data)

        wrong_pw = tmp_path / "wrong.txt"
        wrong_pw.write_text("definitely not the right passphrase")
        if hasattr(os, "chmod"):
            os.chmod(wrong_pw, 0o600)

        with pytest.raises(SystemExit):
            cli.cmd_restore(_Args(
                path=str(out), yes=True,
                max_entries=cli.RestoreQuotas.max_entries,
                max_uncompressed_mb=cli.RestoreQuotas.max_uncompressed_bytes // (1024 * 1024),
                max_ratio=cli.RestoreQuotas.max_compression_ratio,
                passphrase_file=str(wrong_pw),
            ))
        # data/ should NOT have been written because decrypt failed
        # before the extraction step.
        assert not restore_data.exists() or not (restore_data / "config.json").exists()


# -- archive-bomb rejection ------------------------------------------


class TestRestoreRefusesBombs:
    def test_huge_member_count_rejected(
        self, cli, fake_data_dir, tmp_path, monkeypatch
    ):
        # Build a tarball with more entries than the cap.
        bomb = tmp_path / "bomb.tar.gz"
        import io
        buf = io.BytesIO()
        with tarfile.open(fileobj=buf, mode="w:gz") as tar:
            for i in range(15):
                ti = tarfile.TarInfo(name=f"data/f{i}.txt")
                ti.size = 1
                import time as _t
                ti.mtime = int(_t.time())
                tar.addfile(ti, io.BytesIO(b"x"))
        bomb.write_bytes(buf.getvalue())

        restore_root = tmp_path / "restore"
        restore_root.mkdir()
        restore_data = restore_root / "data"
        monkeypatch.setattr(cli, "_REPO_ROOT", restore_root)
        monkeypatch.setattr(cli, "_DATA_DIR", restore_data)

        with pytest.raises(SystemExit):
            cli.cmd_restore(_Args(
                path=str(bomb), yes=True,
                max_entries=10,  # the cap we're tripping
                max_uncompressed_mb=cli.RestoreQuotas.max_uncompressed_bytes // (1024 * 1024),
                max_ratio=cli.RestoreQuotas.max_compression_ratio,
                passphrase_file=None,
            ))


# -- safety guards ---------------------------------------------------


class TestRestoreGuards:
    def test_restore_without_yes_fails(
        self, cli, fake_data_dir, tmp_path, monkeypatch
    ):
        out = tmp_path / "snap.tar.gz"
        monkeypatch.setattr(cli, "_DATA_DIR", fake_data_dir)
        monkeypatch.setattr(cli, "_BACKUP_DIR", tmp_path / "backups")
        monkeypatch.setattr(cli, "_REPO_ROOT", tmp_path)
        cli.cmd_snapshot(_Args(
            out=str(out), include_research=True,
            include_attachments=True, encrypt=False,
        ))

        restore_root = tmp_path / "restore"
        restore_root.mkdir()
        monkeypatch.setattr(cli, "_REPO_ROOT", restore_root)
        monkeypatch.setattr(cli, "_DATA_DIR", restore_root / "data")

        with pytest.raises(SystemExit):
            cli.cmd_restore(_Args(
                path=str(out), yes=False,
                max_entries=cli.RestoreQuotas.max_entries,
                max_uncompressed_mb=cli.RestoreQuotas.max_uncompressed_bytes // (1024 * 1024),
                max_ratio=cli.RestoreQuotas.max_compression_ratio,
                passphrase_file=None,
            ))


# -- preview (dry-run) ------------------------------------------------


class TestRestorePreview:
    def _setup_snapshot(self, cli, fake_data_dir, tmp_path, monkeypatch,
                        *, encrypt=False, pw_file=None):
        out = tmp_path / ("enc.tar.gz" if encrypt else "snap.tar.gz")
        monkeypatch.setattr(cli, "_DATA_DIR", fake_data_dir)
        monkeypatch.setattr(cli, "_BACKUP_DIR", tmp_path / "backups")
        monkeypatch.setattr(cli, "_REPO_ROOT", tmp_path)
        cli.cmd_snapshot(_Args(
            out=str(out), include_research=True,
            include_attachments=True, encrypt=encrypt,
            passphrase_file=str(pw_file) if pw_file else None,
        ))
        return out

    def test_preview_does_not_write_filesystem(
        self, cli, fake_data_dir, tmp_path, monkeypatch, capsys
    ):
        out = self._setup_snapshot(cli, fake_data_dir, tmp_path, monkeypatch)
        capsys.readouterr()  # discard the snapshot's emit output
        restore_root = tmp_path / "restore"
        restore_root.mkdir()
        restore_data = restore_root / "data"
        monkeypatch.setattr(cli, "_REPO_ROOT", restore_root)
        monkeypatch.setattr(cli, "_DATA_DIR", restore_data)

        cli.cmd_restore(_Args(
            path=str(out), yes=False, preview=True,
            max_entries=cli.RestoreQuotas.max_entries,
            max_uncompressed_mb=cli.RestoreQuotas.max_uncompressed_bytes // (1024 * 1024),
            max_ratio=cli.RestoreQuotas.max_compression_ratio,
            passphrase_file=None,
        ))

        # CRITICAL: preview must not have written anything.
        assert not restore_data.exists()
        out_text = capsys.readouterr().out
        import json as _json
        report = _json.loads(out_text.strip())
        assert report["preview"] is True
        assert report["ok"] is True
        assert report["encrypted"] is False
        assert report["files"] >= 2  # config.json + memory/notes.json
        # Sample shows the entries that would have been written.
        names = {entry["name"] for entry in report["sample"]}
        assert "data/config.json" in names
        assert "data/memory/notes.json" in names

    def test_preview_does_not_require_yes(
        self, cli, fake_data_dir, tmp_path, monkeypatch
    ):
        # The whole point of --preview: it's safe, so the destructive
        # --yes confirmation is intentionally not required.
        out = self._setup_snapshot(cli, fake_data_dir, tmp_path, monkeypatch)
        restore_root = tmp_path / "restore"
        restore_root.mkdir()
        monkeypatch.setattr(cli, "_REPO_ROOT", restore_root)
        monkeypatch.setattr(cli, "_DATA_DIR", restore_root / "data")

        cli.cmd_restore(_Args(
            path=str(out), yes=False, preview=True,
            max_entries=cli.RestoreQuotas.max_entries,
            max_uncompressed_mb=cli.RestoreQuotas.max_uncompressed_bytes // (1024 * 1024),
            max_ratio=cli.RestoreQuotas.max_compression_ratio,
            passphrase_file=None,
        ))  # no SystemExit → good

    def test_preview_with_encrypted_backup_works(
        self, cli, fake_data_dir, tmp_path, monkeypatch, capsys
    ):
        pw_file = tmp_path / "pw.txt"
        pw_file.write_text("a strong passphrase for testing")
        if hasattr(os, "chmod"):
            os.chmod(pw_file, 0o600)
        out = self._setup_snapshot(
            cli, fake_data_dir, tmp_path, monkeypatch,
            encrypt=True, pw_file=pw_file,
        )
        capsys.readouterr()  # discard snapshot emit
        restore_root = tmp_path / "restore"
        restore_root.mkdir()
        monkeypatch.setattr(cli, "_REPO_ROOT", restore_root)
        monkeypatch.setattr(cli, "_DATA_DIR", restore_root / "data")

        cli.cmd_restore(_Args(
            path=str(out), yes=False, preview=True,
            max_entries=cli.RestoreQuotas.max_entries,
            max_uncompressed_mb=cli.RestoreQuotas.max_uncompressed_bytes // (1024 * 1024),
            max_ratio=cli.RestoreQuotas.max_compression_ratio,
            passphrase_file=str(pw_file),
        ))
        import json as _json
        report = _json.loads(capsys.readouterr().out.strip())
        assert report["preview"] is True
        assert report["encrypted"] is True
        # And nothing was written.
        assert not (restore_root / "data").exists()

    def test_preview_still_enforces_quotas(
        self, cli, tmp_path, monkeypatch
    ):
        # Build a hostile archive (too many entries) and verify
        # --preview still refuses it — preview must not be a way to
        # bypass safety checks.
        import io as _io
        bomb = tmp_path / "bomb.tar.gz"
        buf = _io.BytesIO()
        with tarfile.open(fileobj=buf, mode="w:gz") as tar:
            for i in range(15):
                ti = tarfile.TarInfo(name=f"data/f{i}.txt")
                ti.size = 1
                import time as _t
                ti.mtime = int(_t.time())
                tar.addfile(ti, _io.BytesIO(b"x"))
        bomb.write_bytes(buf.getvalue())

        restore_root = tmp_path / "restore"
        restore_root.mkdir()
        monkeypatch.setattr(cli, "_REPO_ROOT", restore_root)
        monkeypatch.setattr(cli, "_DATA_DIR", restore_root / "data")

        with pytest.raises(SystemExit):
            cli.cmd_restore(_Args(
                path=str(bomb), yes=False, preview=True,
                max_entries=10,
                max_uncompressed_mb=cli.RestoreQuotas.max_uncompressed_bytes // (1024 * 1024),
                max_ratio=cli.RestoreQuotas.max_compression_ratio,
                passphrase_file=None,
            ))
