"""Coding tab — full-power build agent.

This is the OpenCode-style "build anything" workspace:
  - Per-project sandboxes under ``data/coding_sandboxes/<id>/``
  - The AI runs a tool-calling loop (bash, read, write, edit, ls, mkdir, rm,
    webfetch) so it can explore the filesystem, write any file, run any
    command, and iterate until the user's request is satisfied.
  - The user also gets a real terminal pane, file tree editor, and
    in-place file editor — so they can drive the build manually or steer
    the AI.

Endpoints (all under /api/coding):
  GET    /health
  GET    /projects                list sandboxes
  POST   /projects                create sandbox (returns id + path)
  DELETE /projects/{id}           remove sandbox
  GET    /projects/{id}/tree      directory listing (JSON tree)
  GET    /projects/{id}/file?path read a file (text or base64 for binary)
  PUT    /projects/{id}/file?path write a file (manual save)
  POST   /projects/{id}/mkdir     make directory
  POST   /projects/{id}/rm        delete file or directory
  POST   /projects/{id}/rename    rename/move file or directory
  POST   /projects/{id}/shell     run a shell command, SSE stream of stdout
  POST   /projects/{id}/shell/stop kill a running command by id
  POST   /generate                stream AI generation (tool loop)

The agent loop uses native function-calling when the upstream supports it
(Anthropic, OpenAI-compatible including tokenrouter). If a model doesn't
support tool calling, the loop falls back to the original
``coding:file`` fence format.
"""
from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
import re
import shlex
import shutil
import subprocess
import sys
import time
import uuid
from pathlib import Path
from typing import Any, AsyncGenerator, Dict, List, Optional, Tuple

from fastapi import APIRouter, Body, HTTPException, Query, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from src.auth_helpers import get_current_user
from src.llm_core import stream_llm

logger = logging.getLogger(__name__)


# ---------- Module-level Pydantic models ------------------------------------
# FastAPI/Pydantic v2 only recognises request-body models when they are defined
# at module scope — inline definitions inside setup_coding_routes() fall back
# to query-param parsing.

class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    template: Optional[str] = None  # 'empty' | 'node' | 'python' | 'static'


class FileWrite(BaseModel):
    path: str
    content: str


class PathReq(BaseModel):
    path: str


class RmReq(BaseModel):
    path: str
    recursive: bool = False


class RenameReq(BaseModel):
    src: str
    dst: str


class ShellStartReq(BaseModel):
    command: str
    cwd: Optional[str] = None


# ---------- Filesystem sandbox ------------------------------------------------

SANDBOX_ROOT = Path("data/coding_sandboxes").resolve()


def _safe_path(project_id: str, rel_path: str) -> Path:
    """Resolve a path inside the project sandbox, preventing escapes.

    Returns an absolute Path. Raises HTTPException(400) if the path escapes.
    """
    if not re.fullmatch(r"[a-zA-Z0-9_-]{4,32}", project_id or ""):
        raise HTTPException(400, "Invalid project id")
    root = (SANDBOX_ROOT / project_id).resolve()
    if not root.exists():
        # Lazy-create — first reference to a fresh project bootstraps the dir
        root.mkdir(parents=True, exist_ok=True)
    # Resolve relative path components but stay inside root
    target = (root / rel_path).resolve() if rel_path else root
    try:
        target.relative_to(root)
    except ValueError:
        raise HTTPException(400, f"Path escapes sandbox: {rel_path!r}")
    return target


def _project_root(project_id: str) -> Path:
    if not re.fullmatch(r"[a-zA-Z0-9_-]{4,32}", project_id or ""):
        raise HTTPException(400, "Invalid project id")
    root = (SANDBOX_ROOT / project_id).resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


def _build_tree(root: Path, max_depth: int = 8) -> Dict[str, Any]:
    """Build a JSON-serialisable file tree for the UI."""
    if not root.exists():
        return {"type": "dir", "name": root.name, "path": "", "children": []}

    def _walk(p: Path, rel: str, depth: int) -> Dict[str, Any]:
        node: Dict[str, Any] = {
            "type": "dir" if p.is_dir() else "file",
            "name": p.name,
            "path": rel,
        }
        if p.is_file():
            try:
                node["size"] = p.stat().st_size
            except OSError:
                node["size"] = 0
        elif p.is_dir() and depth < max_depth:
            children: List[Dict[str, Any]] = []
            try:
                entries = sorted(
                    p.iterdir(),
                    key=lambda x: (not x.is_dir(), x.name.lower()),
                )
            except (PermissionError, OSError):
                entries = []
            for entry in entries:
                if entry.name in (".git", "__pycache__", "node_modules", ".venv", "venv"):
                    continue
                children.append(_walk(entry, str(Path(rel) / entry.name) if rel else entry.name, depth + 1))
            node["children"] = children
        else:
            node["children"] = []
        return node

    return _walk(root, "", 0)


# ---------- Live shell registry ----------------------------------------------

# {project_id: {cmd_id: {"proc": asyncio.subprocess.Process, "stop": asyncio.Event}}}
_SHELL_REGISTRY: Dict[str, Dict[str, Dict[str, Any]]] = {}


def _register_shell(project_id: str, cmd_id: str, proc: subprocess.Popen) -> asyncio.Event:
    _SHELL_REGISTRY.setdefault(project_id, {})
    stop = asyncio.Event()
    _SHELL_REGISTRY[project_id][cmd_id] = {"proc": proc, "stop": stop}
    return stop


def _finish_shell(project_id: str, cmd_id: str) -> None:
    bucket = _SHELL_REGISTRY.get(project_id)
    if bucket and cmd_id in bucket:
        bucket.pop(cmd_id, None)


def _stop_shell(project_id: str, cmd_id: str) -> bool:
    bucket = _SHELL_REGISTRY.get(project_id)
    if not bucket or cmd_id not in bucket:
        return False
    entry = bucket[cmd_id]
    proc = entry.get("proc")
    entry["stop"].set()
    try:
        if proc and proc.poll() is None:
            proc.kill()
    except Exception:
        pass
    return True


# ---------- Tool registry ----------------------------------------------------

# Each tool is a JSON-Schema-ish function-calling definition. The names and
# argument shapes match what OpenAI / Anthropic / OpenRouter / tokenrouter
# expect. The agent loop dispatches tool calls by name to the handler.

TOOL_DEFS: List[Dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "bash",
            "description": (
                "Run a shell command inside the project sandbox. Returns stdout, "
                "stderr, and exit code. Use this for any terminal work: install "
                "dependencies (`npm install`, `pip install`), run scripts, start "
                "dev servers in the background, run tests, git, etc. Use "
                "`run_in_background=true` for long-running processes (dev "
                "servers, file watchers)."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "command": {
                        "type": "string",
                        "description": "The shell command to execute. Use `;` to chain, `&&` for short-circuit, `|` for pipes.",
                    },
                    "description": {
                        "type": "string",
                        "description": "Short human-readable description of what this command does (5-10 words).",
                    },
                    "run_in_background": {
                        "type": "boolean",
                        "description": "If true, the command runs detached and you receive a process id. Use for dev servers, watchers.",
                        "default": False,
                    },
                    "timeout": {
                        "type": "integer",
                        "description": "Timeout in milliseconds (max 600000).",
                    },
                },
                "required": ["command", "description"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": (
                "Read a file from the project sandbox. Returns the file's text "
                "content (UTF-8) or a base64 marker if it's binary. For files "
                "larger than 4000 lines, prefer using grep/glob to find the "
                "specific section, then read with an offset."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Path relative to project root (e.g. `src/index.js`).",
                    },
                    "offset": {
                        "type": "integer",
                        "description": "1-indexed line number to start from.",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum lines to read.",
                    },
                },
                "required": ["path"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "write_file",
            "description": (
                "Write a file to the project sandbox, creating parent "
                "directories as needed. OVERWRITES existing content. Use this "
                "for new files or full rewrites."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Path relative to project root.",
                    },
                    "content": {
                        "type": "string",
                        "description": "The complete file contents.",
                    },
                },
                "required": ["path", "content"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "edit_file",
            "description": (
                "Find-and-replace edit on a file. The `old_string` must match "
                "exactly (whitespace and all). For unique replacements include "
                "enough surrounding context. If the match isn't unique, expand "
                "the snippet or use replace_all."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Path relative to project root.",
                    },
                    "old_string": {
                        "type": "string",
                        "description": "Exact string to find (must appear exactly once unless replace_all is true).",
                    },
                    "new_string": {
                        "type": "string",
                        "description": "Replacement text.",
                    },
                    "replace_all": {
                        "type": "boolean",
                        "description": "Replace every occurrence.",
                        "default": False,
                    },
                },
                "required": ["path", "old_string", "new_string"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_files",
            "description": "List files and directories at a path inside the sandbox. Returns names + types.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Path relative to project root. Empty = project root.",
                    },
                },
                "required": [],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "mkdir",
            "description": "Create a directory (recursively) inside the sandbox.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Directory path relative to project root."},
                },
                "required": ["path"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "delete_path",
            "description": "Delete a file or directory (recursively) inside the sandbox.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Path to delete."},
                    "recursive": {
                        "type": "boolean",
                        "description": "Required true to delete a non-empty directory.",
                        "default": False,
                    },
                },
                "required": ["path"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "webfetch",
            "description": (
                "Fetch a URL and return its text content. Useful for reading "
                "documentation, checking API responses, downloading assets. "
                "Returns up to 50KB of UTF-8 text."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "HTTP/HTTPS URL to fetch."},
                    "prompt": {
                        "type": "string",
                        "description": "Optional extraction prompt (unused, kept for compatibility).",
                    },
                },
                "required": ["url"],
                "additionalProperties": False,
            },
        },
    },
]

TOOL_NAMES = {t["function"]["name"] for t in TOOL_DEFS}


# ---------- Tool implementations --------------------------------------------

def _tool_bash(project_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
    cmd = (args.get("command") or "").strip()
    if not cmd:
        return {"error": "command is required"}
    description = args.get("description", "")
    run_in_bg = bool(args.get("run_in_background", False))
    timeout_ms = int(args.get("timeout") or 120000)
    cwd = _project_root(project_id)
    if run_in_bg:
        cmd_id = uuid.uuid4().hex[:8]
        try:
            # Detached process — survives tool call returning. Stream goes
            # to a log file the user can tail from the terminal pane.
            log_path = cwd / f".{cmd_id}.log"
            log_fh = open(log_path, "ab", buffering=0)
            if os.name == "nt":
                proc = subprocess.Popen(
                    cmd,
                    cwd=str(cwd),
                    stdin=subprocess.DEVNULL,
                    stdout=log_fh,
                    stderr=log_fh,
                    shell=True,
                    creationflags=getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0),
                )
            else:
                proc = subprocess.Popen(
                    cmd,
                    cwd=str(cwd),
                    stdin=subprocess.DEVNULL,
                    stdout=log_fh,
                    stderr=log_fh,
                    shell=True,
                    start_new_session=True,
                )
            _register_shell(project_id, cmd_id, proc)
            return {
                "command_id": cmd_id,
                "log": str(log_path.relative_to(cwd)).replace("\\", "/"),
                "pid": proc.pid,
                "status": "running",
                "description": description,
            }
        except Exception as e:
            return {"error": f"Failed to start background command: {e}"}
    # Foreground — wait up to timeout
    try:
        result = subprocess.run(
            cmd,
            cwd=str(cwd),
            shell=True,
            capture_output=True,
            text=True,
            timeout=min(max(timeout_ms / 1000.0, 1), 600),
        )
        out = result.stdout or ""
        err = result.stderr or ""
        # Truncate noisy output
        if len(out) > 50_000:
            out = out[:50_000] + f"\n…[truncated, {len(out)-50_000} more chars]"
        if len(err) > 20_000:
            err = err[:20_000] + f"\n…[truncated, {len(err)-20_000} more chars]"
        return {
            "stdout": out,
            "stderr": err,
            "exit_code": result.returncode,
            "description": description,
        }
    except subprocess.TimeoutExpired:
        return {"error": f"Command timed out after {timeout_ms}ms"}
    except Exception as e:
        return {"error": str(e)}


def _tool_read_file(project_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
    rel = (args.get("path") or "").strip()
    if not rel:
        return {"error": "path is required"}
    try:
        p = _safe_path(project_id, rel)
    except HTTPException as e:
        return {"error": e.detail}
    if not p.exists():
        return {"error": f"File not found: {rel}"}
    if p.is_dir():
        return {"error": f"Is a directory: {rel}"}
    try:
        size = p.stat().st_size
        if size > 4_000_000:
            return {"error": f"File too large ({size} bytes). Use grep/glob instead."}
        # Try UTF-8 first; fall back to base64 marker
        try:
            text = p.read_text(encoding="utf-8")
            return {"path": rel, "size": size, "encoding": "utf-8", "content": text}
        except UnicodeDecodeError:
            data = base64.b64encode(p.read_bytes()).decode("ascii")
            return {
                "path": rel,
                "size": size,
                "encoding": "base64",
                "content_b64": data,
                "truncated": size > 200_000,
            }
    except Exception as e:
        return {"error": str(e)}


def _tool_write_file(project_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
    rel = (args.get("path") or "").strip()
    content = args.get("content", "")
    if not rel:
        return {"error": "path is required"}
    try:
        p = _safe_path(project_id, rel)
    except HTTPException as e:
        return {"error": e.detail}
    try:
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content, encoding="utf-8")
        return {"path": rel, "bytes_written": len(content.encode("utf-8"))}
    except Exception as e:
        return {"error": str(e)}


def _tool_edit_file(project_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
    rel = (args.get("path") or "").strip()
    old = args.get("old_string", "")
    new = args.get("new_string", "")
    replace_all = bool(args.get("replace_all", False))
    if not rel or not old:
        return {"error": "path and old_string are required"}
    try:
        p = _safe_path(project_id, rel)
    except HTTPException as e:
        return {"error": e.detail}
    if not p.exists():
        return {"error": f"File not found: {rel}"}
    try:
        text = p.read_text(encoding="utf-8")
        count = text.count(old)
        if count == 0:
            return {"error": "old_string not found in file"}
        if count > 1 and not replace_all:
            return {"error": f"old_string matches {count} places; provide more context or set replace_all=true"}
        if replace_all:
            text = text.replace(old, new)
            replacements = count
        else:
            text = text.replace(old, new, 1)
            replacements = 1
        p.write_text(text, encoding="utf-8")
        return {"path": rel, "replacements": replacements}
    except Exception as e:
        return {"error": str(e)}


def _tool_list_files(project_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
    rel = (args.get("path") or "").strip()
    try:
        p = _safe_path(project_id, rel)
    except HTTPException as e:
        return {"error": e.detail}
    if not p.exists():
        return {"error": f"Path not found: {rel or '.'}"}
    if not p.is_dir():
        return {"error": f"Not a directory: {rel or '.'}"}
    try:
        entries = []
        for entry in sorted(p.iterdir(), key=lambda x: (not x.is_dir(), x.name.lower())):
            if entry.name.startswith(".") and entry.name not in (".gitignore", ".env.example"):
                continue
            entries.append({
                "name": entry.name,
                "type": "dir" if entry.is_dir() else "file",
                "size": entry.stat().st_size if entry.is_file() else None,
            })
        return {"path": rel, "entries": entries}
    except Exception as e:
        return {"error": str(e)}


def _tool_mkdir(project_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
    rel = (args.get("path") or "").strip()
    if not rel:
        return {"error": "path is required"}
    try:
        p = _safe_path(project_id, rel)
        p.mkdir(parents=True, exist_ok=True)
        return {"path": rel}
    except HTTPException as e:
        return {"error": e.detail}
    except Exception as e:
        return {"error": str(e)}


def _tool_delete(project_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
    rel = (args.get("path") or "").strip()
    recursive = bool(args.get("recursive", False))
    if not rel:
        return {"error": "path is required"}
    try:
        p = _safe_path(project_id, rel)
    except HTTPException as e:
        return {"error": e.detail}
    if not p.exists():
        return {"error": f"Path not found: {rel}"}
    try:
        if p.is_file() or p.is_symlink():
            p.unlink()
        elif p.is_dir():
            if not recursive:
                # Try empty rmdir first
                try:
                    p.rmdir()
                except OSError:
                    return {"error": f"Directory not empty: {rel} (set recursive=true)"}
            else:
                shutil.rmtree(p)
        return {"path": rel}
    except Exception as e:
        return {"error": str(e)}


def _tool_webfetch(args: Dict[str, Any]) -> Dict[str, Any]:
    url = (args.get("url") or "").strip()
    if not url:
        return {"error": "url is required"}
    if not (url.startswith("http://") or url.startswith("https://")):
        return {"error": "url must be http(s)://"}
    try:
        import httpx
        with httpx.Client(timeout=15.0, follow_redirects=True) as c:
            r = c.get(url, headers={"User-Agent": "TaiAi-Coding/1.0"})
            text = r.text or ""
            if len(text) > 50_000:
                text = text[:50_000] + f"\n…[truncated, {len(text)-50_000} more chars]"
            return {"url": url, "status": r.status_code, "content": text}
    except Exception as e:
        return {"error": str(e)}


TOOL_DISPATCH = {
    "bash": _tool_bash,
    "read_file": _tool_read_file,
    "write_file": _tool_write_file,
    "edit_file": _tool_edit_file,
    "list_files": _tool_list_files,
    "mkdir": _tool_mkdir,
    "delete_path": _tool_delete,
    "webfetch": _tool_webfetch,
}


# ---------- Endpoint --------------------------------------------------------

def setup_coding_routes() -> APIRouter:
    router = APIRouter(prefix="/api/coding", tags=["coding"])

    @router.get("/health")
    async def health():
        return {"ok": True, "ts": int(time.time())}

    # ---------- Projects (sandboxes) --------------------------------------

    @router.get("/projects")
    async def list_projects():
        SANDBOX_ROOT.mkdir(parents=True, exist_ok=True)
        items = []
        for entry in sorted(SANDBOX_ROOT.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True):
            if not entry.is_dir():
                continue
            meta_path = entry / ".taiai-meta.json"
            name = entry.name
            created = None
            try:
                if meta_path.exists():
                    meta = json.loads(meta_path.read_text(encoding="utf-8"))
                    name = meta.get("name", entry.name)
                    created = meta.get("created")
            except Exception:
                pass
            items.append({
                "id": entry.name,
                "name": name,
                "path": str(entry),
                "created": created,
            })
        return {"projects": items}

    @router.post("/projects")
    async def create_project(payload: ProjectCreate):
        SANDBOX_ROOT.mkdir(parents=True, exist_ok=True)
        pid = uuid.uuid4().hex[:12]
        root = _project_root(pid)
        # Write meta
        meta = {"name": payload.name, "created": int(time.time()), "template": payload.template or "empty"}
        (root / ".taiai-meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
        # Bootstrap template files
        if payload.template == "node":
            (root / "package.json").write_text(
                json.dumps({
                    "name": payload.name.lower().replace(" ", "-"),
                    "version": "0.1.0",
                    "private": True,
                    "type": "module",
                    "scripts": {"dev": "node server.js", "start": "node server.js", "test": "node --test"},
                }, indent=2),
                encoding="utf-8",
            )
            (root / "server.js").write_text(
                "import { createServer } from 'node:http';\n"
                "const port = process.env.PORT || 3000;\n"
                "createServer((req, res) => { res.end('Hello from TaiAi!'); }).listen(port, () =>\n"
                "  console.log(`http://localhost:${port}`));\n",
                encoding="utf-8",
            )
            (root / "README.md").write_text(
                f"# {payload.name}\n\nBuilt with TaiAi Coding.\n\n## Run\n\n```\nnpm install\nnpm start\n```\n",
                encoding="utf-8",
            )
        elif payload.template == "python":
            (root / "main.py").write_text(
                'def main():\n    print("Hello from TaiAi!")\n\n'
                'if __name__ == "__main__":\n    main()\n',
                encoding="utf-8",
            )
            (root / "requirements.txt").write_text("", encoding="utf-8")
            (root / "README.md").write_text(
                f"# {payload.name}\n\nBuilt with TaiAi Coding.\n\n## Run\n\n```\npython main.py\n```\n",
                encoding="utf-8",
            )
        elif payload.template == "static":
            (root / "index.html").write_text(
                "<!doctype html>\n<html><head><meta charset=\"utf-8\"><title>"
                f"{payload.name}</title></head><body><h1>Hello from TaiAi!</h1></body></html>\n",
                encoding="utf-8",
            )
            (root / "README.md").write_text(
                f"# {payload.name}\n\nStatic site. Open `index.html` in a browser.\n",
                encoding="utf-8",
            )
        else:
            (root / "README.md").write_text(
                f"# {payload.name}\n\nNew project — ask the AI to build something!\n",
                encoding="utf-8",
            )
        return {"id": pid, "name": payload.name, "path": str(root)}

    @router.delete("/projects/{project_id}")
    async def delete_project(project_id: str):
        root = _project_root(project_id)
        try:
            shutil.rmtree(root)
            return {"ok": True}
        except Exception as e:
            raise HTTPException(500, str(e))

    @router.get("/projects/{project_id}/tree")
    async def project_tree(project_id: str):
        root = _project_root(project_id)
        return _build_tree(root)

    @router.get("/projects/{project_id}/file")
    async def read_project_file(project_id: str, path: str = Query("")):
        try:
            p = _safe_path(project_id, path)
        except HTTPException:
            raise
        if not p.exists():
            raise HTTPException(404, f"Not found: {path}")
        if p.is_dir():
            raise HTTPException(400, f"Is a directory: {path}")
        try:
            size = p.stat().st_size
            if size > 8_000_000:
                raise HTTPException(413, "File too large")
            try:
                text = p.read_text(encoding="utf-8")
                return {"path": path, "size": size, "encoding": "utf-8", "content": text}
            except UnicodeDecodeError:
                data = base64.b64encode(p.read_bytes()).decode("ascii")
                return {"path": path, "size": size, "encoding": "base64", "content_b64": data}
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(500, str(e))

    @router.put("/projects/{project_id}/file")
    async def write_project_file(project_id: str, body: FileWrite):
        try:
            p = _safe_path(project_id, body.path)
        except HTTPException:
            raise
        try:
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(body.content, encoding="utf-8")
            return {"ok": True, "path": body.path, "bytes": len(body.content.encode("utf-8"))}
        except Exception as e:
            raise HTTPException(500, str(e))

    @router.post("/projects/{project_id}/mkdir")
    async def mkdir(project_id: str, body: PathReq):
        try:
            p = _safe_path(project_id, body.path)
            p.mkdir(parents=True, exist_ok=True)
            return {"ok": True, "path": body.path}
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(500, str(e))

    @router.post("/projects/{project_id}/rm")
    async def rm(project_id: str, body: RmReq):
        try:
            p = _safe_path(project_id, body.path)
        except HTTPException:
            raise
        if not p.exists():
            raise HTTPException(404, f"Not found: {body.path}")
        try:
            if p.is_dir() and not body.recursive:
                try:
                    p.rmdir()
                except OSError:
                    raise HTTPException(400, "Directory not empty; set recursive=true")
            elif p.is_dir():
                shutil.rmtree(p)
            else:
                p.unlink()
            return {"ok": True, "path": body.path}
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(500, str(e))

    @router.post("/projects/{project_id}/rename")
    async def rename(project_id: str, body: RenameReq):
        try:
            src = _safe_path(project_id, body.src)
            dst = _safe_path(project_id, body.dst)
        except HTTPException:
            raise
        if not src.exists():
            raise HTTPException(404, f"Not found: {body.src}")
        try:
            dst.parent.mkdir(parents=True, exist_ok=True)
            src.rename(dst)
            return {"ok": True, "src": body.src, "dst": body.dst}
        except Exception as e:
            raise HTTPException(500, str(e))

    # ---------- Live shell -----------------------------------------------

    @router.post("/projects/{project_id}/shell")
    async def start_shell(project_id: str, body: ShellStartReq):
        cmd_id = uuid.uuid4().hex[:8]
        cmd = (body.command or "").strip()
        if not cmd:
            raise HTTPException(400, "command required")
        root = _project_root(project_id)
        cwd_path = root
        if body.cwd:
            try:
                cwd_path = _safe_path(project_id, body.cwd)
            except HTTPException:
                raise
            if not cwd_path.is_dir():
                raise HTTPException(400, "cwd is not a directory")
        log_path = root / f".{cmd_id}.log"

        async def stream():
            try:
                yield _sse("shell_start", {"command_id": cmd_id, "command": cmd, "cwd": str(cwd_path.relative_to(root))})
                # Open the log file and start the process
                with open(log_path, "ab", buffering=0) as log_fh:
                    creationflags = 0
                    if os.name == "nt":
                        creationflags = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
                    proc = await asyncio.create_subprocess_shell(
                        cmd,
                        cwd=str(cwd_path),
                        stdin=asyncio.subprocess.DEVNULL,
                        stdout=asyncio.subprocess.PIPE,
                        stderr=asyncio.subprocess.STDOUT,
                        creationflags=creationflags,
                    )
                    _register_shell(project_id, cmd_id, _fake_popen_from_asyncio(proc))
                    stop_event = _SHELL_REGISTRY[project_id][cmd_id]["stop"]
                    try:
                        # Stream stdout line-by-line
                        assert proc.stdout is not None
                        while True:
                            if stop_event.is_set():
                                try:
                                    proc.kill()
                                except ProcessLookupError:
                                    pass
                                yield _sse("shell_event", {"command_id": cmd_id, "stream": "stderr", "data": "[stopped by user]"})
                                break
                            try:
                                line = await asyncio.wait_for(proc.stdout.readline(), timeout=1.0)
                            except asyncio.TimeoutError:
                                # Probe whether process has exited while waiting
                                if proc.returncode is not None:
                                    break
                                continue
                            if not line:
                                break
                            text = line.decode(errors="replace")
                            log_fh.write(line)
                            yield _sse("shell_event", {"command_id": cmd_id, "stream": "stdout", "data": text})
                    finally:
                        try:
                            await proc.wait()
                        except Exception:
                            pass
                        _finish_shell(project_id, cmd_id)
                rc = proc.returncode if proc.returncode is not None else -1
                yield _sse("shell_exit", {"command_id": cmd_id, "exit_code": rc})
            except asyncio.CancelledError:
                _stop_shell(project_id, cmd_id)
                raise
            except Exception as e:
                yield _sse("shell_event", {"command_id": cmd_id, "stream": "stderr", "data": f"\n[shell error] {e}\n"})
                yield _sse("shell_exit", {"command_id": cmd_id, "exit_code": -1})

        return StreamingResponse(stream(), media_type="text/event-stream")

    @router.post("/projects/{project_id}/shell/{cmd_id}/stop")
    async def stop_shell(project_id: str, cmd_id: str):
        ok = _stop_shell(project_id, cmd_id)
        return {"ok": ok}

    # ---------- Tool-using generate --------------------------------------

    AGENT_ROLES: Dict[str, Dict[str, str]] = {
        "build": {
            "label": "Builder",
            "system": _build_full_agent_system_prompt(),
        },
    }
    DEFAULT_PIPELINE = ["build"]
    _AGENT_SETTINGS_KEY = "coding_agents"

    @router.get("/agents")
    async def list_agents(request: Request):
        owner = get_current_user(request)
        saved = _load_agent_settings()
        cleaned = {k: v for k, v in (saved or {}).items() if k in AGENT_ROLES}
        return {
            "roles": [
                {"role": name, "label": info["label"], "description": "Full-power build agent with tool access."}
                for name, info in AGENT_ROLES.items()
            ],
            "default_pipeline": DEFAULT_PIPELINE,
            "saved": cleaned,
            "owner": owner or "",
        }

    @router.post("/agents")
    async def save_agents(request: Request):
        try:
            body = await request.json()
        except Exception:
            raise HTTPException(400, "Invalid JSON")
        agents = body.get("agents") or {}
        if not isinstance(agents, dict):
            raise HTTPException(400, "agents must be an object")
        cleaned: Dict[str, Any] = {}
        for role, cfg in agents.items():
            if role not in AGENT_ROLES or not isinstance(cfg, dict):
                continue
            cleaned[role] = {
                "endpoint_id": (cfg.get("endpoint_id") or "").strip(),
                "model": (cfg.get("model") or "").strip(),
                "enabled": bool(cfg.get("enabled", True)),
            }
        _save_agent_settings(cleaned)
        return {"ok": True, "saved": cleaned}

    @router.post("/generate")
    async def generate(request: Request):
        try:
            body = await request.json()
        except Exception:
            raise HTTPException(400, "Invalid JSON")
        prompt = (body.get("prompt") or "").strip()
        if not prompt:
            raise HTTPException(400, "prompt is required")
        project_id = (body.get("project_id") or "").strip()
        if not project_id:
            raise HTTPException(400, "project_id is required")

        endpoint_id = (body.get("endpoint_id") or "").strip()
        model_name = (body.get("model") or "").strip()
        url, model, headers = _resolve_endpoint_for_request(
            request, endpoint_id, model_name,
        )
        if not url:
            raise HTTPException(400, "No LLM endpoint configured.")
        if not model:
            model = model_name or ""
        if model_name:
            model = model_name

        session_id = f"coding-{uuid.uuid4().hex[:12]}"
        system_prompt = _build_full_agent_system_prompt(project_id)

        async def stream():
            yield _sse("meta", {
                "session": session_id,
                "model": model,
                "endpoint": url,
                "project_id": project_id,
                "tools": sorted(TOOL_NAMES),
            })
            yield _sse("assistant_start", {"role": "build"})

            messages: List[Dict[str, Any]] = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt},
            ]
            yield _sse("user_prompt", {"text": prompt[:500]})

            max_iter = 60  # safety cap on tool loop
            for it in range(max_iter):
                # Stream one assistant turn
                full_text_parts: List[str] = []
                tool_calls: List[Dict[str, Any]] = []
                async for ev in _stream_one_turn(
                    url=url, model=model, headers=headers, messages=messages,
                ):
                    kind = ev.get("kind")
                    if kind == "text":
                        full_text_parts.append(ev["text"])
                        yield _sse("assistant_delta", {"text": ev["text"]})
                    elif kind == "tool_call":
                        tool_calls.append(ev["call"])
                        yield _sse("tool_call", ev["call"])
                    elif kind == "tool_calls_done":
                        pass
                    elif kind == "error":
                        yield _sse("error", {"message": ev["message"]})
                        yield _sse("done", {"session": session_id, "model": model, "project_id": project_id, "iterations": it})
                        return

                assistant_text = "".join(full_text_parts)
                # Build the assistant message we feed back to the model.
                if tool_calls:
                    messages.append(_build_assistant_tool_message(assistant_text, tool_calls))
                    # Execute each tool
                    for tc in tool_calls:
                        fn_name = tc.get("name")
                        args = tc.get("arguments") or {}
                        if fn_name not in TOOL_DISPATCH:
                            result = {"error": f"Unknown tool: {fn_name}"}
                        else:
                            handler = TOOL_DISPATCH[fn_name]
                            try:
                                if fn_name == "webfetch":
                                    result = handler(args)
                                else:
                                    result = handler(project_id, args)
                            except Exception as e:
                                result = {"error": f"Tool {fn_name} crashed: {e}"}
                        tc_id = tc.get("id") or uuid.uuid4().hex[:12]
                        yield _sse("tool_result", {
                            "id": tc_id,
                            "name": fn_name,
                            "ok": "error" not in result,
                            "result": result,
                        })
                        messages.append({
                            "role": "tool",
                            "tool_call_id": tc_id,
                            "name": fn_name,
                            "content": json.dumps(result, ensure_ascii=False)[:200_000],
                        })
                    # Loop continues — model sees the tool results
                    continue

                # No tool calls — assistant gave a final text answer
                if assistant_text.strip():
                    messages.append({"role": "assistant", "content": assistant_text})
                yield _sse("done", {
                    "session": session_id,
                    "model": model,
                    "project_id": project_id,
                    "iterations": it + 1,
                    "final_text": assistant_text,
                })
                return

            # Hit the iteration cap
            yield _sse("done", {
                "session": session_id,
                "model": model,
                "project_id": project_id,
                "iterations": max_iter,
                "warning": "Reached maximum tool iterations (60). The agent may not have fully finished.",
            })

        return StreamingResponse(stream(), media_type="text/event-stream")

    return router


# ---------- Helpers ----------------------------------------------------------

class _FakePopen:
    """Wraps an asyncio.subprocess.Process to look like subprocess.Popen
    for the registry's kill-on-stop path."""
    def __init__(self, proc):
        self._proc = proc
        self.pid = proc.pid

    def poll(self):
        return self._proc.returncode

    def kill(self):
        try:
            self._proc.kill()
        except ProcessLookupError:
            pass


def _fake_popen_from_asyncio(proc) -> _FakePopen:
    return _FakePopen(proc)


def _sse(event: str, data: Any) -> str:
    payload = json.dumps(data, ensure_ascii=False)
    return f"event: {event}\ndata: {payload}\n\n"


def _load_agent_settings() -> Dict[str, Any]:
    try:
        from src.settings import load_settings
        settings = load_settings()
        v = settings.get(_AGENT_SETTINGS_KEY) if _AGENT_SETTINGS_KEY else None
        return v if isinstance(v, dict) else {}
    except Exception:
        return {}


def _save_agent_settings(agents: Dict[str, Any]) -> None:
    try:
        from src.settings import load_settings, save_settings
        settings = load_settings()
        settings[_AGENT_SETTINGS_KEY] = agents
        save_settings(settings)
    except Exception as e:
        logger.warning("coding: failed to persist agent settings: %s", e)


def _resolve_endpoint_for_request(
    request: Request,
    endpoint_id: str = "",
    model: str = "",
) -> Tuple[Optional[str], Optional[str], Dict[str, str]]:
    owner = get_current_user(request)
    if endpoint_id:
        try:
            from src.endpoint_resolver import resolve_endpoint_by_id
            resolved = resolve_endpoint_by_id(endpoint_id, model, owner=owner)
            if resolved:
                url, m, headers = resolved
                if model:
                    m = model
                return url, m, dict(headers or {})
        except Exception as e:
            logger.debug("coding: explicit endpoint resolve failed: %s", e)
    try:
        from src.endpoint_resolver import resolve_endpoint
        url, m, headers = resolve_endpoint(
            "default", owner=owner,
            fallback_url=None, fallback_model=None, fallback_headers=None,
        )
        if url:
            return url, (model or m or ""), dict(headers or {})
    except Exception:
        pass
    try:
        from core.database import SessionLocal, ModelEndpoint
        from src.auth_helpers import owner_filter
        from src.endpoint_resolver import (
            resolve_endpoint_runtime, build_chat_url, build_headers,
            _first_chat_model, _endpoint_enabled_models,
        )
        db = SessionLocal()
        try:
            q = db.query(ModelEndpoint).filter(ModelEndpoint.is_enabled == True)
            if owner:
                q = owner_filter(q, ModelEndpoint, owner)
            ep = q.first()
            if ep:
                base, api_key = resolve_endpoint_runtime(ep, owner=owner)
                url = build_chat_url(base)
                headers = build_headers(api_key, base)
                chosen = model or _first_chat_model(_endpoint_enabled_models(ep)) or ""
                return url, chosen, dict(headers or {})
        finally:
            db.close()
    except Exception:
        pass
    return None, None, {}


# ---------- LLM streaming with tool-call support ----------------------------

# We bypass src/llm_core.stream_llm for the tool loop because we need the raw
# upstream SSE frames (tool_calls are emitted on a separate channel). Instead
# we POST to the upstream directly and parse the stream ourselves.

async def _stream_one_turn(
    *,
    url: str,
    model: str,
    headers: Dict[str, str],
    messages: List[Dict[str, Any]],
):
    """Yield {'kind':'text'|'tool_call'|'tool_calls_done'|'error', ...}.

    Sends `messages` to the upstream chat/completions endpoint with the tool
    definitions and parses the streaming response. Supports:
      - OpenAI / Ollama OpenAI-compat / tokenrouter (function-calling)
      - Anthropic (tool_use blocks)
    """
    from src.llm_core import _detect_provider, _get_http_client, _build_anthropic_payload, _build_anthropic_headers, _normalize_anthropic_url
    import httpx

    provider = _detect_provider(url)
    payload: Dict[str, Any] = {
        "model": model,
        "messages": messages,
        "stream": True,
        "tools": TOOL_DEFS,
        "tool_choice": "auto",
    }
    payload["stream_options"] = {"include_usage": True}
    h = dict(headers or {})
    h.setdefault("Content-Type", "application/json")
    timeout = httpx.Timeout(connect=10.0, read=600.0, write=60.0, pool=10.0)
    try:
        client = _get_http_client()
        if provider == "anthropic":
            target_url = _normalize_anthropic_url(url)
            ah = _build_anthropic_headers(headers)
            # Convert messages: drop system (Anthropic takes top-level), keep user/assistant/tool
            sys_text = ""
            non_sys = []
            for m in messages:
                if m.get("role") == "system":
                    sys_text += (m.get("content") or "") + "\n\n"
                else:
                    non_sys.append(m)
            ap = _build_anthropic_payload(model, non_sys, temperature=0.4, max_tokens=8192, stream=True)
            ap["system"] = sys_text.strip()
            ap["tools"] = [
                {
                    "name": t["function"]["name"],
                    "description": t["function"]["description"],
                    "input_schema": t["function"]["parameters"],
                }
                for t in TOOL_DEFS
            ]
            async with client.stream("POST", target_url, json=ap, headers=ah, timeout=timeout) as r:
                if r.status_code != 200:
                    raw = (await r.aread()).decode(errors="replace")
                    yield {"kind": "error", "message": f"Anthropic {r.status_code}: {raw[:400]}"}
                    return
                # Parse Anthropic SSE
                tool_buf: Dict[int, Dict[str, Any]] = {}
                pending_text = ""
                async for line in r.aiter_lines():
                    if not line or not line.startswith("data:"):
                        continue
                    payload_line = line[5:].strip()
                    if not payload_line or payload_line == "[DONE]":
                        continue
                    try:
                        ev = json.loads(payload_line)
                    except Exception:
                        continue
                    t = ev.get("type", "")
                    if t == "content_block_start":
                        block = ev.get("content_block") or {}
                        if block.get("type") == "tool_use":
                            tool_buf[ev.get("index", 0)] = {
                                "id": block.get("id") or uuid.uuid4().hex[:12],
                                "name": block.get("name", ""),
                                "arguments_json": "",
                            }
                    elif t == "content_block_delta":
                        idx = ev.get("index", 0)
                        delta = ev.get("delta") or {}
                        if delta.get("type") == "text_delta":
                            text = delta.get("text", "")
                            if text:
                                pending_text += text
                                yield {"kind": "text", "text": text}
                        elif delta.get("type") == "input_json_delta":
                            if idx in tool_buf:
                                tool_buf[idx]["arguments_json"] += delta.get("partial_json", "")
                    elif t == "content_block_stop":
                        idx = ev.get("index", 0)
                        if idx in tool_buf:
                            tb = tool_buf.pop(idx)
                            try:
                                args = json.loads(tb["arguments_json"]) if tb["arguments_json"] else {}
                            except Exception:
                                args = {"_raw": tb["arguments_json"]}
                            yield {"kind": "tool_call", "call": {
                                "id": tb["id"],
                                "name": tb["name"],
                                "arguments": args,
                            }}
                    elif t == "message_stop":
                        if pending_text:
                            pending_text = ""
                        yield {"kind": "tool_calls_done"}
                        return
                yield {"kind": "tool_calls_done"}
                return
        # OpenAI path
        async with client.stream("POST", url, json=payload, headers=h, timeout=timeout) as r:
            if r.status_code != 200:
                raw = (await r.aread()).decode(errors="replace")
                yield {"kind": "error", "message": f"HTTP {r.status_code}: {raw[:400]}"}
                return
            tool_buf: Dict[int, Dict[str, Any]] = {}
            finish_reason = None
            async for line in r.aiter_lines():
                if not line or not line.startswith("data:"):
                    continue
                pl = line[5:].strip()
                if not pl or pl == "[DONE]":
                    break
                try:
                    obj = json.loads(pl)
                except Exception:
                    continue
                for ch in obj.get("choices") or []:
                    delta = ch.get("delta") or {}
                    txt = delta.get("content")
                    if isinstance(txt, str) and txt:
                        yield {"kind": "text", "text": txt}
                    for tc in delta.get("tool_calls") or []:
                        idx = tc.get("index", 0)
                        entry = tool_buf.setdefault(idx, {
                            "id": tc.get("id") or "",
                            "name": tc.get("function", {}).get("name", ""),
                            "arguments": "",
                        })
                        if tc.get("id"):
                            entry["id"] = tc["id"]
                        fn = tc.get("function") or {}
                        if fn.get("name"):
                            entry["name"] = fn["name"]
                        if fn.get("arguments"):
                            entry["arguments"] += fn["arguments"]
                    if ch.get("finish_reason"):
                        finish_reason = ch["finish_reason"]
            for idx, tb in sorted(tool_buf.items()):
                try:
                    args = json.loads(tb["arguments"]) if tb["arguments"] else {}
                except Exception:
                    args = {"_raw": tb["arguments"]}
                yield {"kind": "tool_call", "call": {
                    "id": tb["id"] or uuid.uuid4().hex[:12],
                    "name": tb["name"],
                    "arguments": args,
                }}
            yield {"kind": "tool_calls_done"}
    except Exception as e:
        logger.exception("coding: tool-loop stream failed")
        yield {"kind": "error", "message": str(e)}


def _build_assistant_tool_message(text: str, tool_calls: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Build the assistant message we'll feed back to the model.

    OpenAI: content + tool_calls array with function.arguments as a JSON STRING.
    Anthropic: handled separately because it uses content blocks.
    """
    return {
        "role": "assistant",
        "content": text or "",
        "tool_calls": [
            {
                "id": tc.get("id") or uuid.uuid4().hex[:12],
                "type": "function",
                "function": {
                    "name": tc.get("name", ""),
                    "arguments": json.dumps(tc.get("arguments") or {}, ensure_ascii=False),
                },
            }
            for tc in tool_calls
        ],
    }


def _build_full_agent_system_prompt(project_id: str = "") -> str:
    """Single system prompt for the build agent — has full power."""
    cwd_note = ""
    if project_id:
        cwd_note = (
            f"\nYou are working inside a sandboxed project directory (project id: `{project_id}`). "
            "All file paths you give to tools are RELATIVE to that directory. Do NOT use absolute "
            "paths. You can run any shell command, install any package, start any dev server."
        )
    return (
        "You are TaiAi Coding, a full-power AI software engineer with unrestricted "
        "access to a real terminal, a real filesystem, and the ability to make "
        "HTTP requests. Build, debug, and ship complete applications.\n\n"
        f"{cwd_note}\n\n"
        "## How to work\n\n"
        "1. **Read before you write.** Use `read_file` on existing files before "
        "editing them. Use `list_files` to explore unfamiliar directories.\n"
        "2. **Plan briefly.** For multi-file or multi-step tasks, state your plan "
        "in 2-4 short bullets in your first response, then start executing.\n"
        "3. **Use the right tool.** Use `write_file` for new files / full rewrites, "
        "`edit_file` for surgical edits, `bash` for everything else. Run long-lived "
        "processes (dev servers) with `bash` + `run_in_background=true`.\n"
        "4. **Iterate.** After each non-trivial change, run the relevant check "
        "(`npm run build`, `pytest`, `node --check`, etc.) before moving on.\n"
        "5. **Surface failures.** If a command fails, read its stderr, fix the "
        "underlying issue, and re-run. Do NOT silently swallow errors.\n"
        "6. **Don't ask the user to copy-paste commands.** Run them yourself.\n"
        "7. **Stop when the task is verifiably done.** Run the app, verify the "
        "feature works, summarize what you shipped.\n\n"
        "## Output style\n\n"
        "- Be concise. Show your work via tool calls, not prose.\n"
        "- For code edits, just emit the tool call — no need to repeat the code "
        "in your chat reply.\n"
        "- When you're done, give the user a 3-6 line summary of what was "
        "shipped, how to run it, and any caveats.\n"
    )


# Module-level reference so the closure inside setup_coding_routes works.
_AGENT_SETTINGS_KEY = "coding_agents"
