"""
Build a distributable zip of the TaiAi source tree.

Excludes everything that isn't portable source: the Python virtualenv,
runtime data, logs, Python bytecode, build outputs, Node module trees,
local secrets, the user's local Claude session, and the in-development
"idea" scratch folders. The result is a self-contained tarball that a
new user can unzip and run with the included setup.py + launch script.
"""

import os
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "TaiAi-source.zip"

# Top-level entries (files or directories) we always want to ship.
KEEP_TOP = {
    ".dockerignore",
    ".env.example",
    ".gitattributes",
    ".gitignore",
    ".github",
    "ACKNOWLEDGMENTS.md",
    "AUDIT.md",
    "CONTRIBUTING.md",
    "Dockerfile",
    "LICENSE",
    "README.md",
    "ROADMAP.md",
    "SECURITY.md",
    "THREAT_MODEL.md",
    "UPDATE-PLAN.md",
    "UPDATE-REPORT.md",
    "TaiAi-ui.service",
    "app.py",
    "build-macos-app.sh",
    "build_zip.py",
    "companion",
    "config",
    "core",
    "docker",
    "docker-compose.gpu-amd.yml",
    "docker-compose.gpu-nvidia.yml",
    "docker-compose.yml",
    "docs",
    "find_missing.js",
    "install-service.sh",
    "integrations",
    "launch-windows.ps1",
    "licenses",
    "mcp_servers",
    "package-lock.json",
    "package.json",
    "pyproject.toml",
    "requirements-optional.txt",
    "requirements.lock",
    "requirements.txt",
    "routes",
    "scripts",
    "services",
    "setup.py",
    "src",
    "start-macos.sh",
    "static",
    "tests",
    "update_windows.bat",
}

# Subdirectory names we never want to ship regardless of where they live.
EXCLUDE_DIR_NAMES = {
    "__pycache__",
    ".git",
    ".idea",
    ".vscode",
    ".aider",
    ".claude",
    ".playwright-mcp",
    ".pytest_cache",
    "venv",
    ".venv",
    "node_modules",
    "_scratch",
    "cache",
    "build",
    "dist",
    "static.bak-cyberpunk",
    "theme idea app",
    "coding idea from here",
    "research_data",
    "reports",
    "tasks",
    "logs",
    "data",
    "dev-docs",
    "docs/windows-port",
    "logs",
}

# File-name patterns we exclude. Match against the basename.
EXCLUDE_FILE_PATTERNS = (
    ".DS_Store",
    "Thumbs.db",
    "*.pyc",
    "*.pyo",
    "*.egg-info",
    "*.egg",
    "*.log",
    "*.error.log",
    "*.db",
    "*.sqlite",
    "*.sqlite3",
    "*.swp",
    "*.swo",
    "*.bak",
    "*.cache",
    "*.jpg",
    "*.jpeg",
    "*.png",
    "*.gif",
    "*.bmp",
    "*.webp",
    "*.tiff",
    "*.pdf",
    ".env",
    ".env.bak.*",
    "compound.config.json",
    "search_analytics.json",
    "output.txt.txt",
)

# docs/ gets its own file-ext allow-list because the repo ships demo
# screenshots there that the README links to. Everything else under
# docs/ ships normally.
DOCS_ALLOWED_MEDIA_EXT = {".jpg", ".jpeg", ".png", ".gif", ".webp"}

import fnmatch


# Directories that look excluded by name but must ship anyway. Mirrors the
# carve-outs in .gitignore (lines 20-21): "data" is globally excluded because
# it holds the user's runtime state, but services/hwfit/data/hf_models.json is
# a tracked 486 KB model catalog that Cookbook's hardware-fit scoring needs.
# Without it the catalog loads empty and 13 hwfit tests fail in the shipped
# archive while passing in the repo.
KEEP_DIR_PREFIXES = (
    ("services", "hwfit", "data"),
)


def should_skip_dir(rel_dir: Path) -> bool:
    parts = rel_dir.parts
    for keep in KEEP_DIR_PREFIXES:
        if parts[:len(keep)] == keep:
            return False
    for p in parts:
        if p in EXCLUDE_DIR_NAMES:
            return True
    return False


def should_skip_file(rel_file: Path) -> bool:
    name = rel_file.name
    # The local "/TaiAi" dist folder (.gitignore line 92) is top-level only.
    # Matching it by basename would also drop scripts/TaiAi, the dispatcher
    # that every shipped TaiAi-* subcommand is invoked through.
    if rel_file.parts == ("TaiAi",):
        return True
    # PWA icons are intentional ship assets (manifest.json references them)
    # even though we globally exclude *.png — carve them out before the
    # pattern check runs.
    if rel_file.parts[:1] == ("static",) and name in (
        "icon-192.png", "icon-512.png",
        "icon-maskable-192.png", "icon-maskable-512.png",
    ):
        return False
    for pat in EXCLUDE_FILE_PATTERNS:
        if fnmatch.fnmatch(name, pat):
            # Allow demo media in docs/
            if rel_file.parts[:1] == ("docs",) and Path(name).suffix.lower() in DOCS_ALLOWED_MEDIA_EXT:
                continue
            return True
    return False


def main():
    if OUT.exists():
        OUT.unlink()

    count = 0
    total_bytes = 0

    with zipfile.ZipFile(OUT, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        # Top-level entries — these are the surface of the tarball.
        for entry in sorted(KEEP_TOP):
            src = ROOT / entry
            if not src.exists():
                print(f"  SKIP missing: {entry}")
                continue
            if src.is_file():
                if should_skip_file(Path(entry)):
                    print(f"  SKIP file:    {entry}")
                    continue
                zf.write(src, arcname=f"TaiAi/{entry}")
                count += 1
                total_bytes += src.stat().st_size
                continue
            # Directory walk.
            for path in sorted(src.rglob("*")):
                rel = path.relative_to(ROOT)
                if path.is_dir():
                    if should_skip_dir(rel):
                        # Pruning: we still need to skip the descendants,
                        # so we don't iterate them. rglob already gave us
                        # everything — but we filter in the file branch.
                        continue
                    continue
                if should_skip_dir(rel.parent):
                    continue
                if should_skip_file(rel):
                    continue
                arcname = f"TaiAi/{rel.as_posix()}"
                zf.write(path, arcname=arcname)
                count += 1
                total_bytes += path.stat().st_size

    print(f"Wrote {OUT} ({count} files, {total_bytes / (1024 * 1024):.1f} MB uncompressed)")


if __name__ == "__main__":
    main()
