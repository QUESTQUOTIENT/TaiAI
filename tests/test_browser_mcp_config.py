"""Regression test for the Browser (Playwright) MCP config.

The browser MCP server is defined in TWO places:
  * src/builtin_mcp.py — what the Python backend actually launches
  * static/js/admin.js — what the UI shows users when they click "Add"

When these two definitions drift, users get a working backend but a
broken UI preset (or vice versa), with no error to point at. This test
fails if either side changes without the other catching up.

Historical context: a previous version of the UI preset was missing
``--caps vision``. The Python backend had it. Users who added the
server through the UI got a configuration that could navigate to many
text-only pages but failed on JS-heavy sites like Google — exactly the
"can't open google.com" symptom.

The two configs must agree on:
  * package name
  * the ``--caps vision`` flag
"""

from __future__ import annotations

import ast
import re
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parent.parent
ADMIN_JS = REPO_ROOT / "static" / "js" / "admin.js"
BUILTIN_MCP_PY = REPO_ROOT / "src" / "builtin_mcp.py"


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _extract_python_args() -> list[str]:
    """Pull the args list out of src/builtin_mcp.py for the browser server."""
    text = _read(BUILTIN_MCP_PY)
    m = re.search(
        r'"builtin_browser"\s*:\s*\{[^}]*"args"\s*:\s*(\[[^\]]+\])',
        text, re.DOTALL,
    )
    assert m, "could not find builtin_browser args in src/builtin_mcp.py"
    return list(ast.literal_eval(m.group(1)))


def _find_entry(text: str, name_literal: str, *, field: str) -> str | None:
    """Return the raw value of ``field`` in the JS object entry whose
    ``name`` equals ``name_literal``.

    Both files are JS-shaped (``{ name: "X", field: "..."}``), so we
    anchor on the name then walk forward looking for the requested
    field. Handles multiline strings (with escaped ``\\n`` and ``\\"``).
    """
    name_idx = text.find(name_literal)
    if name_idx < 0:
        return None
    field_idx = text.find(f"{field}:", name_idx)
    if field_idx < 0:
        return None
    # The field is followed by either an array ``[...]`` (args) or a
    # quoted string. Find the opener.
    rest = text[field_idx + len(field) + 1:].lstrip()
    if rest.startswith("["):
        end = text.find("]", field_idx)
        return text[field_idx: end + 1]
    if rest.startswith('"'):
        # walk forward respecting escapes
        start = field_idx + len(field) + 1 + (len(rest) - len(rest.lstrip()))
        i = start + 1
        while i < len(text):
            ch = text[i]
            if ch == "\\" and i + 1 < len(text):
                i += 2
                continue
            if ch == '"':
                return text[start + 1: i]
            i += 1
    return None


def _extract_js_args() -> list[str]:
    """Pull the args list out of static/js/admin.js for the Browser (Playwright) preset.

    The entry's args span a single line, e.g. ``["-y", "@playwright/mcp@latest",
    "--headless", "--caps", "vision"]``.
    """
    text = _read(ADMIN_JS)
    name_idx = text.find('"Browser (Playwright)"')
    assert name_idx >= 0, "could not find Browser (Playwright) entry in static/js/admin.js"
    args_marker = text.find("args:", name_idx)
    assert args_marker >= 0, "could not find args: after Browser (Playwright) entry"
    bracket_open = text.find("[", args_marker)
    bracket_close = text.find("]", bracket_open)
    assert bracket_open >= 0 and bracket_close > bracket_open, (
        "could not locate args array brackets"
    )
    raw = text[bracket_open + 1:bracket_close]
    items: list[str] = []
    for piece in raw.split(","):
        piece = piece.strip()
        if not piece:
            continue
        if (piece.startswith('"') and piece.endswith('"')) or (
            piece.startswith("'") and piece.endswith("'")
        ):
            items.append(piece[1:-1])
        else:
            items.append(piece)
    return items


def _extract_js_help() -> str:
    """Pull the help string for Browser (Playwright), decoding ``\\n``."""
    text = _read(ADMIN_JS)
    name_idx = text.find('"Browser (Playwright)"')
    assert name_idx >= 0
    help_marker = text.find("help:", name_idx)
    assert help_marker >= 0, "could not find help: after Browser (Playwright) entry"
    # First quote after help:
    first_quote = text.find('"', help_marker)
    assert first_quote >= 0
    i = first_quote + 1
    while i < len(text):
        ch = text[i]
        if ch == "\\" and i + 1 < len(text):
            i += 2
            continue
        if ch == '"':
            break
        i += 1
    raw_help = text[first_quote + 1: i]
    return raw_help.encode("utf-8").decode("unicode_escape", errors="ignore")


class TestBrowserConfigConsistency:
    """The UI preset and the backend launch config must agree."""

    def test_python_args_include_vision_caps(self):
        args = _extract_python_args()
        assert "--caps" in args, f"python config missing --caps: {args}"
        assert "vision" in args, f"python config missing vision value: {args}"

    def test_js_args_include_vision_caps(self):
        """The UI preset is what the user clicks 'Add' on. If it's missing
        ``--caps vision``, the resulting server can't see rendered pages."""
        args = _extract_js_args()
        assert "--caps" in args, f"UI preset missing --caps: {args}"
        assert "vision" in args, f"UI preset missing vision value: {args}"

    def test_js_and_python_args_match(self):
        """Drift detector. The two definitions must agree on every flag,
        otherwise users get a working backend but a broken UI preset
        (or vice versa)."""
        py_args = _extract_python_args()
        js_args = _extract_js_args()
        assert py_args == js_args, (
            "Browser MCP config drift detected.\n"
            f"  src/builtin_mcp.py: {py_args}\n"
            f"  static/js/admin.js: {js_args}\n"
            "These must match. Update both if you change the MCP launch flags."
        )

    def test_both_use_npx_y_for_pinning(self):
        """Both configs must use ``npx -y <pkg>@latest`` so the launch
        survives a fresh install and the package name is what the cache
        probe looks for."""
        for source, args in [("python", _extract_python_args()), ("js", _extract_js_args())]:
            assert "-y" in args, f"{source} config missing -y flag"
            idx = args.index("-y") + 1
            pkg = args[idx]
            assert "@playwright/mcp" in pkg, f"{source} config wrong package: {pkg}"

    def test_help_text_mentions_vision(self):
        """Users who edit the args field need to know why ``--caps vision``
        matters. The help string should mention it so a future operator
        doesn't strip the flag without realising."""
        help_text = _extract_js_help()
        assert "vision" in help_text.lower(), (
            "Browser help text doesn't mention vision — operators may "
            "strip the flag without knowing why it's there."
        )
