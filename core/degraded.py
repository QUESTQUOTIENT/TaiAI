"""Structured reporting for subsystems that are present but unprovisioned.

Most of TaiAi's optional surface area — ChromaDB-backed RAG and semantic
memory, web search, model endpoints, email, ntfy — is fully implemented code
that simply has nothing to talk to until the operator supplies a service, an
API key, or a binary. On a bare install those subsystems log things like
``VectorRAG init failed`` and ``MemoryVectorStore DEGRADED`` and then return
empty arrays, which reads to a new user as "this app is hollow" rather than
"this part is not set up yet".

The built-in Browser MCP server already solved this well. Its warning names the
reason, the concrete impact, the exact command to fix it, and the fact that the
whole thing is optional::

    Built-in: Browser is not available.
      Reason: npm package '@playwright/mcp@latest' is not installed in the npx cache.
      Impact: tools provided by this MCP server will be unavailable.
      Fix:    npx -y @playwright/mcp@latest --version
              (run once, then restart TaiAi)
      Notes:  this server is optional; see README.md 'Built-in MCP servers'.

This module generalises that shape so every subsystem can report the same way,
in logs *and* over HTTP, from one definition. It deliberately holds no state,
imports nothing from the app, and never raises: a reporting helper must not be
able to take down the thing it is reporting on.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Optional


class Status(str, Enum):
    """How a subsystem is doing.

    The distinction that matters for the UI is ``NOT_CONFIGURED`` (nothing was
    ever set up — expected on a fresh install, not an error) versus
    ``DEGRADED`` (it *was* configured and is failing — genuinely wrong, worth
    surfacing loudly). Collapsing those two into one "broken" state is exactly
    what makes a fresh install look defective.
    """

    OK = "ok"
    NOT_CONFIGURED = "not_configured"
    DEGRADED = "degraded"
    DISABLED = "disabled"


@dataclass(frozen=True)
class Subsystem:
    """A named capability plus what to do when it is not working.

    ``impact`` should say what the user loses, in product terms, not internal
    terms. ``fix`` should be a command or a settings path that a person can act
    on without reading the source.
    """

    key: str
    label: str
    status: Status
    reason: str = ""
    impact: str = ""
    fix: str = ""
    notes: str = ""
    optional: bool = True
    detail: Dict[str, object] = field(default_factory=dict)

    @property
    def ok(self) -> bool:
        return self.status is Status.OK

    def as_dict(self) -> Dict[str, object]:
        """JSON-serialisable form for ``/api/setup-status``."""
        out: Dict[str, object] = {
            "key": self.key,
            "label": self.label,
            "status": self.status.value,
            "ok": self.ok,
            "optional": self.optional,
        }
        for name in ("reason", "impact", "fix", "notes"):
            value = getattr(self, name)
            if value:
                out[name] = value
        if self.detail:
            out["detail"] = self.detail
        return out

    def as_log_block(self) -> str:
        """Render the Browser-MCP style multi-line operator message."""
        if self.ok:
            return f"{self.label} is available."

        headline = {
            Status.NOT_CONFIGURED: f"{self.label} is not configured.",
            Status.DEGRADED: f"{self.label} is not available.",
            Status.DISABLED: f"{self.label} is disabled.",
        }[self.status]

        lines = [headline]
        for tag, value in (
            ("Reason", self.reason),
            ("Impact", self.impact),
            ("Fix", self.fix),
            ("Notes", self.notes),
        ):
            if not value:
                continue
            first, *rest = str(value).split("\n")
            lines.append(f"  {tag + ':':<8}{first}")
            lines.extend(f"  {'':<8}{cont}" for cont in rest)
        return "\n".join(lines)


def summarize(subsystems: List[Subsystem]) -> Dict[str, object]:
    """Roll a list of subsystems into the ``/api/setup-status`` payload.

    ``ready`` tracks only non-optional subsystems, so an unconfigured optional
    integration never makes the instance look unhealthy.
    """
    required_bad = [s for s in subsystems if not s.optional and not s.ok]
    return {
        "ok": not required_bad,
        "counts": {
            "total": len(subsystems),
            "ok": sum(1 for s in subsystems if s.ok),
            "not_configured": sum(
                1 for s in subsystems if s.status is Status.NOT_CONFIGURED
            ),
            "degraded": sum(1 for s in subsystems if s.status is Status.DEGRADED),
            "disabled": sum(1 for s in subsystems if s.status is Status.DISABLED),
        },
        "subsystems": [s.as_dict() for s in subsystems],
    }


# --- Individual probes ----------------------------------------------------
#
# Every probe is defensive: any unexpected exception becomes a DEGRADED report
# rather than propagating. A status page that can 500 is worse than useless.


def _safe(fn, key: str, label: str) -> Subsystem:
    try:
        return fn()
    except Exception as exc:  # noqa: BLE001 - reporting must never raise
        return Subsystem(
            key=key,
            label=label,
            status=Status.DEGRADED,
            reason=f"probe raised {type(exc).__name__}: {exc}",
            impact="Status for this subsystem could not be determined.",
            fix="Check the application logs for the full traceback.",
        )


def probe_chromadb() -> Subsystem:
    """Vector store behind RAG, semantic memory, and tool selection."""

    def _run() -> Subsystem:
        import os

        host = os.getenv("CHROMADB_HOST", "localhost")
        port = os.getenv("CHROMADB_PORT", "8100")
        try:
            from src.chroma_client import get_chroma_client

            client = get_chroma_client()
            client.heartbeat()
            return Subsystem(
                key="chromadb",
                label="ChromaDB (vector search)",
                status=Status.OK,
                detail={"host": host, "port": port},
            )
        except Exception as exc:  # noqa: BLE001
            return Subsystem(
                key="chromadb",
                label="ChromaDB (vector search)",
                status=Status.NOT_CONFIGURED,
                reason=f"no ChromaDB responding at {host}:{port} ({type(exc).__name__}).",
                impact=(
                    "Document RAG, semantic memory recall, and vector tool "
                    "selection fall back to keyword matching. Nothing is lost; "
                    "results are just less relevant."
                ),
                fix=(
                    "docker compose up -d chromadb\n"
                    "(or set CHROMADB_HOST / CHROMADB_PORT to an existing instance)"
                ),
                notes="Optional. TaiAi retries the connection automatically every 30s.",
                detail={"host": host, "port": port},
            )

    return _safe(_run, "chromadb", "ChromaDB (vector search)")


def probe_model_endpoints() -> Subsystem:
    """At least one LLM endpoint is what makes Chat/Agent/Research usable."""

    def _run() -> Subsystem:
        from core.database import ModelEndpoint, SessionLocal

        db = SessionLocal()
        try:
            count = db.query(ModelEndpoint).count()
        finally:
            db.close()

        if count:
            return Subsystem(
                key="model_endpoints",
                label="Model endpoints",
                status=Status.OK,
                optional=False,
                detail={"count": count},
            )
        return Subsystem(
            key="model_endpoints",
            label="Model endpoints",
            status=Status.NOT_CONFIGURED,
            optional=False,
            reason="no model endpoints have been added yet.",
            impact=(
                "Chat, Agent, Deep Research, and Compare have no model to call, "
                "so they will return errors on use."
            ),
            fix=(
                "Settings -> Models -> Add endpoint (Ollama, vLLM, llama.cpp, "
                "OpenAI, OpenRouter, ...), or use Cookbook to download and serve "
                "a local model."
            ),
            notes="This is the one subsystem TaiAi genuinely needs to be useful.",
            detail={"count": 0},
        )

    return _safe(_run, "model_endpoints", "Model endpoints")


def probe_web_search() -> Subsystem:
    """SearXNG or a third-party search API key."""

    def _run() -> Subsystem:
        import os

        from services.search.providers import _get_provider_key

        for provider in ("brave", "tavily", "serper", "google_pse"):
            try:
                if _get_provider_key(provider):
                    return Subsystem(
                        key="web_search",
                        label="Web search",
                        status=Status.OK,
                        detail={"provider": provider},
                    )
            except Exception:  # noqa: BLE001 - try the next provider
                continue

        instance = os.getenv("SEARXNG_INSTANCE", "")
        if instance:
            return Subsystem(
                key="web_search",
                label="Web search",
                status=Status.OK,
                detail={"provider": "searxng", "instance": instance},
            )

        return Subsystem(
            key="web_search",
            label="Web search",
            status=Status.NOT_CONFIGURED,
            reason="no SearXNG instance and no search-provider API key configured.",
            impact=(
                "Web search returns no results, and Deep Research cannot gather "
                "sources."
            ),
            fix=(
                "docker compose up -d searxng\n"
                "(or add a Brave / Tavily / Serper / Google PSE key in "
                "Settings -> Search)"
            ),
            notes="Optional; everything else works without it.",
        )

    return _safe(_run, "web_search", "Web search")


def probe_email() -> Subsystem:
    """IMAP/SMTP accounts drive the inbox and its AI triage."""

    def _run() -> Subsystem:
        from core.database import EmailAccount, SessionLocal

        db = SessionLocal()
        try:
            count = db.query(EmailAccount).count()
        finally:
            db.close()

        if count:
            return Subsystem(
                key="email",
                label="Email (IMAP/SMTP)",
                status=Status.OK,
                detail={"accounts": count},
            )
        return Subsystem(
            key="email",
            label="Email (IMAP/SMTP)",
            status=Status.NOT_CONFIGURED,
            reason="no email accounts have been added.",
            impact="The Email tab stays empty and AI triage has nothing to act on.",
            fix="Settings -> Email -> Add account (IMAP + SMTP credentials).",
            notes="Optional.",
            detail={"accounts": 0},
        )

    return _safe(_run, "email", "Email (IMAP/SMTP)")


def probe_cookbook_tmux() -> Subsystem:
    """Cookbook shells out to tmux for background downloads and serves."""

    def _run() -> Subsystem:
        import shutil

        path = shutil.which("tmux")
        if path:
            return Subsystem(
                key="cookbook_tmux",
                label="Cookbook (tmux)",
                status=Status.OK,
                detail={"path": path},
            )
        return Subsystem(
            key="cookbook_tmux",
            label="Cookbook (tmux)",
            status=Status.NOT_CONFIGURED,
            reason="the 'tmux' binary was not found on PATH.",
            impact=(
                "Cookbook cannot run model downloads or serve jobs in the "
                "background; those actions will fail when started."
            ),
            fix="apt install tmux   (Debian/Ubuntu)\nbrew install tmux   (macOS)",
            notes="Only needed if you use Cookbook to download or serve local models.",
        )

    return _safe(_run, "cookbook_tmux", "Cookbook (tmux)")


def collect_all() -> List[Subsystem]:
    """Probe every reportable subsystem, cheapest first."""
    return [
        probe_model_endpoints(),
        probe_chromadb(),
        probe_web_search(),
        probe_email(),
        probe_cookbook_tmux(),
    ]
