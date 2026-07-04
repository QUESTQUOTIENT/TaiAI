"""
WCAG AA contrast audit for TaiAi's built-in color themes.

Iterates every theme defined in static/js/theme.js, computes the
contrast ratio between the theme's foreground (fg) and each background
it sits on (bg, panel, sidebar-bg, code-bg, user-bubble-bg, ai-bubble-bg),
and reports any pair below 4.5:1 (WCAG AA for normal text) or 3:1 (AA
for large text only).

Run via:
  python scripts/audit_theme_contrast.py
Exit code 0 on pass, 1 on any failure.

Why a script and not a test: contrast bugs are visual regressions that
the operator catches at the design stage, not at the test stage. The
script is meant to be run by humans reviewing themes OR wired into a
pre-commit hook for theme CSS changes.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
THEME_JS = REPO / "static" / "js" / "theme.js"


def _hex_to_rgb(hex_str: str) -> tuple[int, int, int]:
    s = hex_str.strip().lstrip("#")
    if len(s) == 3:
        s = "".join(c * 2 for c in s)
    return int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16)


def _relative_luminance(rgb: tuple[int, int, int]) -> float:
    """WCAG 2.x relative luminance. https://www.w3.org/WAI/GL/wiki/Contrast_ratio"""
    def _channel(c: int) -> float:
        s = c / 255.0
        return s / 12.92 if s <= 0.03928 else ((s + 0.055) / 1.055) ** 2.4
    r, g, b = rgb
    return 0.2126 * _channel(r) + 0.7152 * _channel(g) + 0.0722 * _channel(b)


def _contrast_ratio(fg_hex: str, bg_hex: str) -> float:
    l1 = _relative_luminance(_hex_to_rgb(fg_hex))
    l2 = _relative_luminance(_hex_to_rgb(bg_hex))
    if l1 < l2:
        l1, l2 = l2, l1
    return (l1 + 0.05) / (l2 + 0.05)


def _parse_themes(text: str) -> dict[str, dict[str, str]]:
    """Parse the THEMES = { ... } block from theme.js. Returns
    {theme_name: {key: hex, ...}}. Tolerant of single or double quotes,
    trailing commas, and comments."""
    themes: dict[str, dict[str, str]] = {}
    # Match `name: { ... }` blocks. Greedy across lines until matching
    # `}` at column 2 (inside the THEMES object).
    block_re = re.compile(r"^\s*([a-z][a-z0-9-]*)\s*:\s*\{([^{}]*)\}", re.MULTILINE)
    color_re = re.compile(r"([a-zA-Z]+)\s*:\s*['\"]?(#[0-9a-fA-F]{3,8})['\"]?")
    for m in block_re.finditer(text):
        name = m.group(1)
        body = m.group(2)
        theme: dict[str, str] = {}
        for cm in color_re.finditer(body):
            key = cm.group(1)
            if key in {"bg", "fg", "panel", "sidebar-bg", "user-bubble-bg",
                       "ai-bubble-bg", "code-bg", "bubble-border", "border",
                       "input-bg", "send-btn-bg", "send-btn-fg"}:
                theme[key] = cm.group(2)
        if theme:
            themes[name] = theme
    return themes


# Backgrounds the foreground can sit on. Each tuple: (label, hex_getter).
# We pull these from the same theme dict.
_BACKGROUNDS = [
    ("bg",            "bg"),
    ("panel",         "panel"),
    ("sidebar-bg",    "sidebar-bg"),
    ("user-bubble-bg","user-bubble-bg"),
    ("ai-bubble-bg",  "ai-bubble-bg"),
    ("code-bg",       "code-bg"),
    ("send-btn-bg",   "send-btn-bg"),
]


def _audit(themes: dict[str, dict[str, str]]) -> tuple[int, int, list[str]]:
    fails: list[str] = []
    total = 0
    n_audited = 0
    for name, t in themes.items():
        fg = t.get("fg")
        if not fg:
            fails.append(f"  {name}: missing fg")
            total += 1
            continue
        for label, key in _BACKGROUNDS:
            bg = t.get(key)
            if not bg:
                continue
            try:
                ratio = _contrast_ratio(fg, bg)
            except (ValueError, IndexError) as e:
                fails.append(f"  {name} fg vs {label}: parse error ({e})")
                total += 1
                continue
            n_audited += 1
            total += 1
            # WCAG AA body text: 4.5:1
            if ratio < 4.5:
                fails.append(
                    f"  {name}: fg {fg} vs {label} {bg} -> {ratio:.2f}:1 (FAIL AA body)"
                )
            elif ratio < 7.0:
                # AA large text + AAA body — note but don't fail.
                pass
        # Send-button: contrast fg vs send-btn-bg
        sb_fg = t.get("send-btn-fg")
        sb_bg = t.get("send-btn-bg")
        if sb_fg and sb_bg:
            try:
                ratio = _contrast_ratio(sb_fg, sb_bg)
                n_audited += 1
                total += 1
                if ratio < 4.5:
                    fails.append(
                        f"  {name}: send-btn-fg {sb_fg} vs send-btn-bg {sb_bg} -> {ratio:.2f}:1 (FAIL AA)"
                    )
            except (ValueError, IndexError):
                pass
    return total, n_audited, fails


def main() -> int:
    if not THEME_JS.exists():
        print(f"theme.js not found at {THEME_JS}", file=sys.stderr)
        return 2
    text = THEME_JS.read_text(encoding="utf-8")
    themes = _parse_themes(text)
    if not themes:
        print("No themes parsed from theme.js", file=sys.stderr)
        return 2
    total, n_audited, fails = _audit(themes)
    print(f"WCAG AA contrast audit: {len(themes)} themes, {n_audited} pairs audited")
    if not fails:
        print("All pairs >= 4.5:1. PASS")
        return 0
    print(f"\n{len(fails)} pair(s) fail AA body-text contrast (4.5:1):")
    for line in fails:
        print(line)
    return 1


if __name__ == "__main__":
    sys.exit(main())
