"""Tests for the code-navigation tools (grep, glob, ls) + read_file line range.

Originally these tests built their scratch repo under ``tempfile.mkdtemp(dir="/tmp", ...)``.
On Linux that path is on the tool's path allowlist (``_tool_path_roots`` adds
``/tmp``) so the tests passed. On Windows there is no ``/tmp`` and Python's
tempfile silently falls back to ``tempfile.gettempdir()`` — which *is* on
the allowlist via the ``TMPDIR`` env var — but the tests still failed with
"path is outside the allowed roots". Root cause: the production ``GrepTool``
path was using ``shutil.which("rg")`` and ripgrep on Windows behaves
differently (path handling + line endings + binary-mode file open). The
fallback path triggered a different exception that the tool wrapper turned
into ``exit_code=1`` with no error message.

The fix below: catch the tool errors and surface them in test output
instead of just "exit_code == 1", and add a debug-only test that prints
the resolved allowlist so future breakage is obvious.
"""

import asyncio
import json
import os
import shutil
import tempfile
from unittest.mock import MagicMock

import pytest

from src.tool_execution import _direct_fallback


def _run(tool, content):
    r = asyncio.run(_direct_fallback(tool, content))
    if r is None:
        raise AssertionError(f"{tool} returned None — not in TOOL_HANDLERS?")
    return r


@pytest.fixture
def repo():
    """Build a small scratch repo under the system temp dir.

    On Linux, the production ``_tool_path_roots()`` includes ``/tmp``
    explicitly, so building under system temp works without patching.
    On Windows, ``/tmp`` doesn't exist; tempfile falls back to the
    user's ``TMPDIR`` which is also on the allowlist.
    """
    root = tempfile.mkdtemp(prefix="codenav_")
    try:
        with open(os.path.join(root, "a.py"), "w") as f:
            f.write("import os\n# needle here\nprint('x')\n")
        os.mkdir(os.path.join(root, "sub"))
        with open(os.path.join(root, "sub", "b.txt"), "w") as f:
            f.write("nothing\nNEEDLE upper\n")
        os.mkdir(os.path.join(root, "node_modules"))
        with open(os.path.join(root, "node_modules", "dep.py"), "w") as f:
            f.write("needle in dep\n")
        g = os.path.join(root, ".git")
        os.mkdir(g)
        with open(os.path.join(g, "config"), "w") as f:
            f.write("needle in git\n")
        yield root
    finally:
        shutil.rmtree(root, ignore_errors=True)


# ── grep ──────────────────────────────────────────────────────────────────


def test_grep_finds_match(repo):
    r = _run("grep", json.dumps({"pattern": "needle", "path": repo}))
    assert r.get("exit_code") == 0, f"grep failed: {r}"
    assert "a.py:2:" in r["output"]


def test_grep_skips_junk_dirs(repo):
    r = _run("grep", json.dumps({"pattern": "needle", "path": repo}))
    assert r.get("exit_code") == 0, f"grep failed: {r}"
    assert "node_modules" not in r["output"]
    assert ".git" not in r["output"]


def test_grep_ignore_case(repo):
    r = _run("grep", json.dumps({"pattern": "needle", "ignore_case": True, "path": repo}))
    assert r.get("exit_code") == 0, f"grep failed: {r}"
    assert "b.txt:2:" in r["output"]


def test_grep_glob_filter(repo):
    r = _run("grep", json.dumps({"pattern": "needle", "ignore_case": True, "glob": "*.py", "path": repo}))
    assert r.get("exit_code") == 0, f"grep failed: {r}"
    assert "a.py" in r["output"]
    assert "b.txt" not in r["output"]


def test_grep_no_match(repo):
    r = _run("grep", json.dumps({"pattern": "zzzznotfound", "path": repo}))
    assert r.get("exit_code") == 0
    assert "No matches" in r["output"]


def test_grep_requires_pattern(repo):
    r = _run("grep", "{}")
    assert r.get("exit_code") == 1
    assert "pattern is required" in r["error"]


def test_grep_path_outside_roots_rejected(repo):
    r = _run("grep", json.dumps({"pattern": "x", "path": "/etc"}))
    assert r.get("exit_code") == 1
    assert "outside the allowed roots" in r["error"]


def test_grep_python_fallback_when_no_rg(repo, monkeypatch):
    """When ripgrep isn't installed, GrepTool falls back to a Python
    walker. Force ``shutil.which("rg")`` to return ``None`` and verify
    the fallback still works."""
    monkeypatch.setattr(shutil, "which", lambda name: None)
    r = _run("grep", json.dumps({"pattern": "needle", "path": repo}))
    assert r.get("exit_code") == 0, f"grep (no rg) failed: {r}"
    assert "a.py:2:" in r["output"]
    assert "node_modules" not in r["output"]
    assert ".git" not in r["output"]


# ── glob ──────────────────────────────────────────────────────────────────


def test_glob_py(repo):
    r = _run("glob", json.dumps({"pattern": "*.py", "path": repo}))
    assert r.get("exit_code") == 0, f"glob failed: {r}"
    assert "a.py" in r["output"]


def test_glob_recursive_skips_junk(repo):
    r = _run("glob", json.dumps({"pattern": "**/*.py", "path": repo}))
    assert r.get("exit_code") == 0, f"glob failed: {r}"
    assert "a.py" in r["output"]
    assert "node_modules" not in r["output"]


def test_glob_requires_pattern(repo):
    r = _run("glob", "{}")
    assert r.get("exit_code") == 1


# ── ls ────────────────────────────────────────────────────────────────────


def test_ls_lists_entries(repo):
    r = _run("ls", json.dumps({"path": repo}))
    assert r.get("exit_code") == 0, f"ls failed: {r}"
    assert "a.py" in r["output"]
    assert "sub" in r["output"]
    assert ".git" not in r["output"]


def test_ls_path_outside_rejected(repo):
    r = _run("ls", json.dumps({"path": "/etc"}))
    assert r.get("exit_code") == 1
    assert "outside the allowed roots" in r["error"]


# ── read_file line range ───────────────────────────────────────────────────


def test_read_file_offset_limit(repo):
    p = os.path.join(repo, "lines.txt")
    with open(p, "w") as f:
        f.write("\n".join(f"line{i}" for i in range(1, 11)) + "\n")
    r = _run("read_file", json.dumps({"path": p, "offset": 3, "limit": 2}))
    assert r.get("exit_code") == 0, f"read_file failed: {r}"
    assert r["output"] == "line3\nline4\n"


def test_read_file_plain_path_backcompat(repo):
    r = _run("read_file", os.path.join(repo, "a.py"))
    assert r.get("exit_code") == 0
    assert "needle" in r["output"]


# ── allowlist observability ───────────────────────────────────────────────


def test_allowlist_includes_repo_realpath(repo):
    """The scratch repo must be reachable via ``_tool_path_roots()`` —
    otherwise every test in this file would fail with the same opaque
    "exit_code == 1" we hit on Windows. Failing this test means the
    fixture setup is wrong, not the tool itself.
    """
    from src.tool_execution import _tool_path_roots
    roots = _tool_path_roots()
    real_repo = os.path.realpath(repo)
    # Either the repo realpath is itself a root, or it sits under one.
    if real_repo in roots:
        return
    for r in roots:
        try:
            common = os.path.commonpath([real_repo, r])
        except ValueError:
            continue
        if common == r:
            return
    raise AssertionError(
        f"scratch repo {real_repo} is not under any tool-path allowlist root: {roots}"
    )
