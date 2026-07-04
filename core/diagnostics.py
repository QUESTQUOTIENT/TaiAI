"""
TaiAi Diagnostics — central health-check registry.

Phase 1.1: Healthy Stack Wizard.

Every check is a small async-or-sync function that returns a
HealthResult. The Diagnostics tab and /api/health/deep call
`run_all_checks()` to get the full picture; individual checks can be
called by name for retry-button UX in the wizard.

Adding a new check is one decorator + one function. No central registry
to maintain — Python's import system IS the registry.
"""
from __future__ import annotations

import asyncio
import logging
import os
import platform
import shutil
import socket
import time
import traceback
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Any, Awaitable, Callable, Dict, List, Optional

logger = logging.getLogger(__name__)

# Result of a single check.
@dataclass
class HealthResult:
    id: str                           # e.g. "ollama.health"
    label: str                         # human-readable
    status: str                        # "ok" | "warn" | "fail" | "skip"
    detail: str = ""                   # short reason
    fix: str = ""                      # actionable suggestion
    data: Dict[str, Any] = field(default_factory=dict)
    elapsed_ms: int = 0

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


# Each check is registered via @register_check and surfaces in
# run_all_checks(). The decorator runs the function, captures exceptions,
# and ensures a HealthResult is always returned.
_REGISTRY: Dict[str, Callable[[], Awaitable[HealthResult]]] = {}


def register_check(check_id: str, label: str):
    """Decorator. Use as:
        @register_check('ollama.health', 'Ollama server reachable')
        async def check_ollama_health():
            ...
    """
    def decorator(fn):
        # Wrap the function to guarantee a HealthResult and stamp label/id.
        async def wrapper():
            start = time.monotonic()
            try:
                res = await fn()
                if not isinstance(res, HealthResult):
                    res = HealthResult(id=check_id, label=label, status="fail",
                                       detail=f"check returned non-HealthResult: {type(res).__name__}")
            except Exception as e:
                logger.debug("check %s raised: %r", check_id, e)
                res = HealthResult(
                    id=check_id, label=label, status="fail",
                    detail=f"{type(e).__name__}: {e}",
                    fix=_suggest_fix_for_exception(check_id, e),
                )
            res.elapsed_ms = int((time.monotonic() - start) * 1000)
            res.id = res.id or check_id
            res.label = res.label or label
            return res
        _REGISTRY[check_id] = wrapper
        return wrapper
    return decorator


def _suggest_fix_for_exception(check_id: str, e: Exception) -> str:
    msg = str(e).lower()
    if "refused" in msg or "connect" in msg:
        return "Check that the service is running and reachable from this host. " \
               "For Docker, ensure the container is on the same network."
    if "permission" in msg or "eperm" in msg:
        return "File-system permission denied. Check ownership of data/ and that the " \
               "container PUID/PGID matches the host user."
    if "no such file" in msg or "filenotfound" in msg:
        return "A required binary is missing. Re-run the launch script (launch-windows.ps1 / " \
               "start-macos.sh / install-service.sh) which installs it."
    if "timeout" in msg:
        return "Service did not respond in time. Check that the service is healthy, not " \
               "still starting up."
    return ""


def list_checks() -> List[Dict[str, str]]:
    """Return metadata for every registered check. Used by the UI to render
    the wizard's category list before the user clicks Run."""
    out = []
    for cid, fn in _REGISTRY.items():
        # We can't introspect the label without running — but we wrap with
        # _KNOWN_LABELS for the cases we know about. For unknown checks we
        # fall back to a derived label.
        label = _KNOWN_LABELS.get(cid, cid.replace(".", " · ").title())
        out.append({"id": cid, "label": label})
    out.sort(key=lambda c: c["id"])
    return out


# Hardcoded labels so list_checks() doesn't have to run every check just
# to get the human-readable name.
_KNOWN_LABELS: Dict[str, str] = {
    "ollama.health":     "Ollama server reachable",
    "ollama.models":     "Models available",
    "ollama.gpu":        "GPU / CUDA detection",
    "chroma.health":     "ChromaDB reachable",
    "chroma.collection": "ChromaDB collections present",
    "embeddings":        "Embedding pipeline",
    "search":            "Search provider (SearXNG / Tavily)",
    "env.required":      "Required environment variables",
    "filesystem":        "Filesystem permissions",
    "docker":            "Docker networking",
    "build":             "Build info",
}


async def run_all_checks(ids: Optional[List[str]] = None, parallel: bool = True) -> List[HealthResult]:
    """Run checks (all, or a filtered subset) and return their results.
    By default runs them concurrently with asyncio.gather — most checks
    are network-bound and benefit from parallelism. Set parallel=False
    for ordered output during debugging.
    """
    targets = list(_REGISTRY.items())
    if ids:
        targets = [(cid, fn) for cid, fn in targets if cid in ids]
    if not targets:
        return []
    if parallel and len(targets) > 1:
        results = await asyncio.gather(*[fn() for _cid, fn in targets], return_exceptions=True)
    else:
        results = []
        for _cid, fn in targets:
            try:
                results.append(await fn())
            except Exception as e:  # noqa: BLE001
                results.append(HealthResult(id=_cid, label=_cid, status="fail",
                                            detail=f"{type(e).__name__}: {e}"))
    out: List[HealthResult] = []
    for (_cid, _fn), r in zip(targets, results):
        if isinstance(r, Exception):
            out.append(HealthResult(id=_cid, label=_cid, status="fail",
                                    detail=f"{type(r).__name__}: {r}"))
        else:
            out.append(r)
    return out


def summary(results: List[HealthResult]) -> Dict[str, int]:
    """Aggregate counts. The UI uses this for the top-of-page pill."""
    s = {"ok": 0, "warn": 0, "fail": 0, "skip": 0, "total": len(results)}
    for r in results:
        s[r.status] = s.get(r.status, 0) + 1
    return s


# ════════════════════════════════════════════════════════════════
# BUILT-IN CHECKS
# ════════════════════════════════════════════════════════════════

def _data_dir() -> Path:
    from src.constants import DATA_DIR
    return Path(DATA_DIR)


def _http_get_json(url: str, timeout: float = 3.0) -> Optional[Any]:
    """Synchronous HTTP GET → JSON. Imported lazily so the import graph
    stays small; the wizard runs in an asyncio loop but individual
    checks can be sync. Uses urllib to avoid pulling httpx into the
    core diagnostics surface (httpx is the heavy dependency; urllib is
    stdlib)."""
    import json as _json
    import urllib.request as _req
    try:
        with _req.urlopen(url, timeout=timeout) as r:
            data = r.read()
            return _json.loads(data.decode("utf-8", errors="ignore"))
    except Exception:
        return None


def _tcp_open(host: str, port: int, timeout: float = 2.0) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except Exception:
        return False


@register_check("build", "Build info")
async def check_build() -> HealthResult:
    from src.constants import APP_VERSION
    return HealthResult(
        id="build", label="Build info",
        status="ok",
        detail=f"TaiAi {APP_VERSION} · {platform.python_version()} · {platform.system()} {platform.machine()}",
        data={
            "app_version": APP_VERSION,
            "python": platform.python_version(),
            "platform": platform.platform(),
        },
    )


@register_check("ollama.health", "Ollama server reachable")
async def check_ollama_health() -> HealthResult:
    base = (os.getenv("OLLAMA_BASE_URL")
            or os.getenv("OLLAMA_URL")
            or "http://127.0.0.1:11434/v1").rstrip("/")
    # Ollama's native root returns "Ollama is running"; the OpenAI-compat
    # /v1/models returns the model list. Use the native probe for parity.
    native = base.replace("/v1", "")
    info = _http_get_json(f"{native}/api/version", timeout=2.5)
    if info and isinstance(info, dict) and info.get("version"):
        return HealthResult(
            id="ollama.health", label="Ollama server reachable",
            status="ok",
            detail=f"Ollama {info['version']} at {native}",
            data={"url": native, "version": info.get("version")},
        )
    return HealthResult(
        id="ollama.health", label="Ollama server reachable",
        status="fail",
        detail=f"No response from {native}/api/version",
        fix="Install Ollama (https://ollama.com), start it (`ollama serve`), or set "
            "OLLAMA_BASE_URL to point at a remote Ollama / vLLM / llama.cpp server.",
        data={"url": native},
    )


@register_check("ollama.models", "Models available")
async def check_ollama_models() -> HealthResult:
    base = (os.getenv("OLLAMA_BASE_URL")
            or os.getenv("OLLAMA_URL")
            or "http://127.0.0.1:11434/v1").rstrip("/")
    native = base.replace("/v1", "")
    data = _http_get_json(f"{native}/api/tags", timeout=3.0)
    if data and isinstance(data, dict):
        models = data.get("models") or []
        if not models:
            return HealthResult(
                id="ollama.models", label="Models available",
                status="warn",
                detail=f"Ollama reachable but no models pulled yet.",
                fix="Pull a model with `ollama pull llama3.1:8b` (or use Cookbook → "
                    "Models to browse + download with one click).",
                data={"count": 0, "models": []},
            )
        names = [m.get("name", "?") for m in models[:10]]
        return HealthResult(
            id="ollama.models", label="Models available",
            status="ok",
            detail=f"{len(models)} model(s) — {', '.join(names)}" +
                   ("…" if len(models) > 10 else ""),
            data={"count": len(models), "models": names},
        )
    return HealthResult(
        id="ollama.models", label="Models available",
        status="skip",
        detail="Skipped (Ollama not reachable)",
    )


@register_check("ollama.gpu", "GPU / CUDA detection")
async def check_gpu() -> HealthResult:
    """Best-effort GPU probe. Tries multiple sources in order:
    1. `nvidia-smi` on PATH (NVIDIA)
    2. `rocm-smi` on PATH (AMD)
    3. PyTorch CUDA availability if torch is importable
    4. Ollama's own /api/ps endpoint (best signal — server-side VRAM)
    """
    # Source 1: nvidia-smi
    nv = shutil.which("nvidia-smi")
    if nv:
        import subprocess
        try:
            r = subprocess.run([nv, "--query-gpu=name,memory.total,driver_version",
                                "--format=csv,noheader,nounits"],
                               capture_output=True, text=True, timeout=5)
            if r.returncode == 0 and r.stdout.strip():
                lines = [l.strip() for l in r.stdout.strip().splitlines() if l.strip()]
                gpus = []
                for line in lines:
                    parts = [p.strip() for p in line.split(",")]
                    if len(parts) >= 3:
                        gpus.append({"name": parts[0], "vram_mb": int(float(parts[1])), "driver": parts[2]})
                total_vram = sum(g["vram_mb"] for g in gpus)
                return HealthResult(
                    id="ollama.gpu", label="GPU / CUDA detection",
                    status="ok",
                    detail=f"{len(gpus)}× NVIDIA GPU · {total_vram} MB total VRAM",
                    data={"vendor": "nvidia", "gpus": gpus, "total_vram_mb": total_vram},
                )
        except Exception as e:  # noqa: BLE001
            logger.debug("nvidia-smi failed: %r", e)

    # Source 2: rocm-smi
    if shutil.which("rocm-smi"):
        return HealthResult(
            id="ollama.gpu", label="GPU / CUDA detection",
            status="ok",
            detail="AMD GPU detected via rocm-smi (VRAM details unavailable in probe).",
            data={"vendor": "amd"},
        )

    # Source 3: PyTorch
    try:
        import torch  # type: ignore
        if torch.cuda.is_available():
            count = torch.cuda.device_count()
            name = torch.cuda.get_device_name(0) if count else "?"
            return HealthResult(
                id="ollama.gpu", label="GPU / CUDA detection",
                status="ok",
                detail=f"PyTorch sees {count}× CUDA device · {name}",
                data={"vendor": "nvidia", "via": "pytorch", "count": count, "name": name},
            )
    except ImportError:
        pass
    except Exception as e:  # noqa: BLE001
        logger.debug("torch.cuda probe failed: %r", e)

    return HealthResult(
        id="ollama.gpu", label="GPU / CUDA detection",
        status="warn",
        detail="No NVIDIA or AMD GPU detected on this host.",
        fix="If you have an NVIDIA GPU, install the driver + CUDA toolkit. " +
            "For AMD, install ROCm. Otherwise the agent runs on CPU only — " +
            "consider smaller models via Slim Agent Mode.",
        data={"vendor": None},
    )


@register_check("chroma.health", "ChromaDB reachable")
async def check_chroma_health() -> HealthResult:
    host = os.getenv("CHROMADB_HOST", "127.0.0.1")
    port = int(os.getenv("CHROMADB_PORT", "8100"))
    if not _tcp_open(host, port, timeout=2.0):
        return HealthResult(
            id="chroma.health", label="ChromaDB reachable",
            status="fail",
            detail=f"Cannot connect to {host}:{port}",
            fix="Start ChromaDB: `docker compose up -d chromadb`, or set " +
                "CHROMADB_HOST / CHROMADB_PORT to point at a remote instance.",
            data={"host": host, "port": port},
        )
    # Heartbeat via the v1 API
    info = _http_get_json(f"http://{host}:{port}/api/v1/heartbeat", timeout=2.5)
    if info and isinstance(info, dict) and ("nanosecond heartbeat" in info or "heartbeat" in info):
        return HealthResult(
            id="chroma.health", label="ChromaDB reachable",
            status="ok",
            detail=f"ChromaDB at {host}:{port} is healthy.",
            data={"host": host, "port": port},
        )
    return HealthResult(
        id="chroma.health", label="ChromaDB reachable",
        status="warn",
        detail=f"TCP reachable but heartbeat did not respond cleanly.",
        data={"host": host, "port": port},
    )


@register_check("chroma.collection", "ChromaDB collections present")
async def check_chroma_collections() -> HealthResult:
    """Skip-friendly: only runs if chroma.health was ok."""
    host = os.getenv("CHROMADB_HOST", "127.0.0.1")
    port = int(os.getenv("CHROMADB_PORT", "8100"))
    if not _tcp_open(host, port, timeout=1.0):
        return HealthResult(
            id="chroma.collection", label="ChromaDB collections present",
            status="skip",
            detail="Skipped (ChromaDB not reachable)",
        )
    cols = _http_get_json(f"http://{host}:{port}/api/v1/collections", timeout=2.5)
    if cols is None:
        return HealthResult(
            id="chroma.collection", label="ChromaDB collections present",
            status="warn",
            detail="Collections endpoint did not respond.",
        )
    if isinstance(cols, list):
        names = [c.get("name", "?") for c in cols][:8]
        return HealthResult(
            id="chroma.collection", label="ChromaDB collections present",
            status="ok",
            detail=f"{len(cols)} collection(s) — {', '.join(names) or '(empty)'}",
            data={"count": len(cols), "names": names},
        )
    return HealthResult(
        id="chroma.collection", label="ChromaDB collections present",
        status="warn",
        detail="Collections response was not a list.",
    )


@register_check("embeddings", "Embedding pipeline")
async def check_embeddings() -> HealthResult:
    """Verify a local embedding provider is loadable. Falls through to
    OpenAI if TaiAi_OPENAI_KEY is set."""
    from src.constants import EMBEDDING_PROVIDER
    provider = (os.getenv("TaiAi_EMBEDDING_PROVIDER") or EMBEDDING_PROVIDER or "fastembed").lower()
    if provider in ("openai", "openai-compatible"):
        if os.getenv("OPENAI_API_KEY") or os.getenv("TaiAi_OPENAI_KEY"):
            return HealthResult(
                id="embeddings", label="Embedding pipeline",
                status="ok",
                detail=f"Embedding provider = {provider} (API key set).",
                data={"provider": provider},
            )
        return HealthResult(
            id="embeddings", label="Embedding pipeline",
            status="warn",
            detail="Embedding provider = openai but no API key configured.",
            fix="Set OPENAI_API_KEY or switch to `TaiAi_EMBEDDING_PROVIDER=fastembed` " +
                "for a local-only pipeline.",
            data={"provider": provider},
        )
    # fastembed (default) — try importing
    try:
        from fastembed import TextEmbedding  # type: ignore  # noqa: F401
        return HealthResult(
            id="embeddings", label="Embedding pipeline",
            status="ok",
            detail="Embedding provider = fastembed (local ONNX).",
            data={"provider": "fastembed"},
        )
    except ImportError:
        return HealthResult(
            id="embeddings", label="Embedding pipeline",
            status="fail",
            detail="fastembed is not installed (pip install fastembed).",
            fix="Re-run `pip install -r requirements.txt` — fastembed is in the " +
                "core dependencies list.",
            data={"provider": provider},
        )


@register_check("search", "Search provider")
async def check_search() -> HealthResult:
    searxng = os.getenv("SEARXNG_URL")
    if searxng:
        if _http_get_json(f"{searxng.rstrip('/')}/healthz", timeout=2.0) is not None:
            return HealthResult(
                id="search", label="Search provider",
                status="ok",
                detail=f"SearXNG at {searxng} responded healthy.",
                data={"provider": "searxng", "url": searxng},
            )
        return HealthResult(
            id="search", label="Search provider",
            status="warn",
            detail=f"SEARXNG_URL set ({searxng}) but /healthz did not respond.",
            fix="Start SearXNG: `docker compose up -d searxng`. Or remove SEARXNG_URL " +
                "to fall back to DuckDuckGo.",
            data={"provider": "searxng"},
        )
    tavily = os.getenv("TAVILY_API_KEY")
    if tavily:
        return HealthResult(
            id="search", label="Search provider",
            status="ok",
            detail="Tavily API key configured (uses cloud search).",
            data={"provider": "tavily"},
        )
    bing = os.getenv("BING_SEARCH_API_KEY")
    if bing:
        return HealthResult(
            id="search", label="Search provider",
            status="ok",
            detail="Bing Search API key configured.",
            data={"provider": "bing"},
        )
    return HealthResult(
        id="search", label="Search provider",
        status="warn",
        detail="No search provider configured — Deep Research will fall back to DuckDuckGo.",
        fix="Set SEARXNG_URL (recommended for self-host) or TAVILY_API_KEY in .env.",
        data={"provider": None},
    )


@register_check("env.required", "Required environment variables")
async def check_env_required() -> HealthResult:
    required = ["TaiAi_SECRET_KEY"]
    missing = [k for k in required if not os.getenv(k)]
    recommended = ["OLLAMA_BASE_URL", "CHROMADB_HOST"]
    rec_missing = [k for k in recommended if not os.getenv(k)]
    if missing:
        return HealthResult(
            id="env.required", label="Required environment variables",
            status="fail",
            detail=f"Missing required: {', '.join(missing)}",
            fix="Re-run setup.py to regenerate the .env, or set the missing variables manually.",
            data={"missing": missing, "recommended_missing": rec_missing},
        )
    if rec_missing:
        return HealthResult(
            id="env.required", label="Required environment variables",
            status="warn",
            detail=f"Recommended (not set): {', '.join(rec_missing)}",
            fix="Defaults will be used but explicit values are recommended for production.",
            data={"missing": [], "recommended_missing": rec_missing},
        )
    return HealthResult(
        id="env.required", label="Required environment variables",
        status="ok",
        detail="All required + recommended variables set.",
    )


@register_check("filesystem", "Filesystem permissions")
async def check_filesystem() -> HealthResult:
    dd = _data_dir()
    issues: List[str] = []
    # data/ writable?
    try:
        test = dd / ".healthcheck.tmp"
        test.write_text("ok", encoding="utf-8")
        test.unlink()
    except Exception as e:  # noqa: BLE001
        issues.append(f"data/ not writable: {e}")
    # logs/ writable?
    log_dir = Path(os.getenv("TaiAi_LOG_DIR", "logs")).resolve()
    try:
        log_dir.mkdir(parents=True, exist_ok=True)
        test = log_dir / ".healthcheck.tmp"
        test.write_text("ok", encoding="utf-8")
        test.unlink()
    except Exception as e:  # noqa: BLE001
        issues.append(f"logs/ not writable: {e}")
    # disk space
    try:
        usage = shutil.disk_usage(str(dd))
        free_gb = usage.free / (1024 ** 3)
        if free_gb < 1.0:
            issues.append(f"Only {free_gb:.1f} GB free on data/ volume — risk of out-of-disk.")
        elif free_gb < 5.0:
            issues.append(f"{free_gb:.1f} GB free — consider pruning old backups / generated images.")
    except Exception as e:  # noqa: BLE001
        issues.append(f"disk_usage probe failed: {e}")

    if issues:
        sev = "fail" if any("not writable" in i for i in issues) else "warn"
        return HealthResult(
            id="filesystem", label="Filesystem permissions",
            status=sev,
            detail="; ".join(issues),
            fix="Fix the path with `chown -R $PUID:$PGID` (Docker) or adjust the bind mount.",
            data={"issues": issues},
        )
    return HealthResult(
        id="filesystem", label="Filesystem permissions",
        status="ok",
        detail="data/, logs/ writable; ample free disk.",
    )


@register_check("docker", "Docker networking")
async def check_docker() -> HealthResult:
    """Detect whether we're inside Docker and whether the host network
    shortcuts (host.docker.internal, etc.) work. Only meaningful when
    running in a container; on bare-metal this returns 'skip'."""
    in_docker = os.path.exists("/.dockerenv")
    if not in_docker:
        # Try cgroup hint
        try:
            with open("/proc/1/cgroup", "r", encoding="utf-8", errors="ignore") as fh:
                cg = fh.read()
            in_docker = any(m in cg for m in ("docker", "containerd", "kubepods"))
        except Exception:
            in_docker = False
    if not in_docker:
        return HealthResult(
            id="docker", label="Docker networking",
            status="skip",
            detail="Not running in Docker (bare-metal install).",
        )
    # Test host.docker.internal — works on Docker Desktop (Mac/Win) and recent Linux
    if _tcp_open("host.docker.internal", 11434, timeout=1.5):
        return HealthResult(
            id="docker", label="Docker networking",
            status="ok",
            detail="Running in Docker; host.docker.internal:11434 reachable.",
            data={"in_docker": True},
        )
    return HealthResult(
        id="docker", label="Docker networking",
        status="warn",
        detail="Running in Docker but host.docker.internal:11434 is not reachable.",
        fix="If Ollama runs on the host, use the docker-compose override with " +
            "`network_mode: host` (Linux) or set OLLAMA_BASE_URL to the host IP.",
        data={"in_docker": True},
    )
