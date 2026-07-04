"""
TaiAi Slim Agent Mode — adaptive execution profiles.

Phase 1.3.

Maps a model + hardware combination to a Profile that prunes the tool
whitelist, trims the context budget, and (optionally) skips memory retrieval.
Small models on small hardware stop getting 70+ tools they cannot use
anyway; everything still works on the default "full" profile.

Resolution priority:
  1. Explicit `slim` override on the user (per-user setting, future work)
  2. Per-session override (chat options)
  3. Model + hardware detection
  4. Default ("full")
"""
from __future__ import annotations

import logging
import os
import re
from dataclasses import dataclass, field, asdict
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Profile:
    """An execution profile. `id` is the profile name shown in the UI."""
    id: str                              # "auto" | "minimal" | "balanced" | "full"
    label: str                           # "Auto (recommended)"
    tool_whitelist: Optional[List[str]]   # None = all tools available
    max_context_tokens: int              # hard cap for history window
    memory_top_k: int                    # memory retrieval depth
    enable_plan_mode: bool               # default true
    enable_intent_verifier: bool         # default true on cloud, false on local
    enable_cost_estimator: bool          # show running cost
    notes: str = ""

    def to_dict(self) -> Dict:
        return asdict(self)


# Static profiles. The "minimal" profile hard-codes a tiny safe toolset so
# a 7B local model can still drive the agent loop without getting confused.
PROFILES: Dict[str, Profile] = {
    "minimal": Profile(
        id="minimal",
        label="Minimal (small local models)",
        tool_whitelist=["web_search", "read_file", "list_files", "ask_user",
                        "search_chats", "set_mode"],
        max_context_tokens=4_000,
        memory_top_k=2,
        enable_plan_mode=True,
        enable_intent_verifier=False,
        enable_cost_estimator=False,
        notes="For 7B-or-smaller local models. Hard cap on context; verifier off.",
    ),
    "balanced": Profile(
        id="balanced",
        label="Balanced (medium local / small cloud)",
        tool_whitelist=None,  # all standard tools
        max_context_tokens=12_000,
        memory_top_k=4,
        enable_plan_mode=True,
        enable_intent_verifier=True,
        enable_cost_estimator=True,
        notes="Default. All standard tools; verifier on; cost visible.",
    ),
    "full": Profile(
        id="full",
        label="Full (large cloud models)",
        tool_whitelist=None,
        max_context_tokens=64_000,
        memory_top_k=8,
        enable_plan_mode=True,
        enable_intent_verifier=True,
        enable_cost_estimator=True,
        notes="All tools, all features. For 70B+ cloud models.",
    ),
}


# Default profile when nothing else decides.
DEFAULT_PROFILE = "balanced"


# Heuristics: small model names look like "llama3.1:8b", "qwen2.5:7b",
# "mistral:7b-instruct", "phi3:mini", "gemma:2b". Big models look like
# "gpt-4o", "claude-3.5-sonnet", "llama3.1:70b".
_SMALL_MODEL_HINTS = re.compile(
    r"(\b|:|\b-)(mini|small|nano|3b|7b|8b|1\.5b|2b|3\.8b)(\b|:|_|-|$)",
    re.IGNORECASE,
)
_BIG_MODEL_HINTS = re.compile(
    r"(70b|72b|405b|opus|sonnet|haiku|gpt-4|gpt-4o|o1|o3|o4|gemini-1\.5-pro|gemini-2)",
    re.IGNORECASE,
)


def _looks_local(model_id: str, base_url: str) -> bool:
    if not model_id:
        return True
    # Cloud providers
    cloud_hints = ("openai", "anthropic", "azure", "googleapis", "copilot",
                   "openrouter", "groq", "mistral.ai")
    if any(h in base_url.lower() for h in cloud_hints):
        return False
    return True


def _detect_size_class(model_id: str) -> str:
    """Return 'small' / 'medium' / 'large' based on name heuristics."""
    if not model_id:
        return "medium"
    mid = model_id.lower()
    if _BIG_MODEL_HINTS.search(mid):
        return "large"
    if _SMALL_MODEL_HINTS.search(mid):
        return "small"
    # Default to medium if we don't recognize the name
    return "medium"


def _estimate_vram_mb() -> Optional[int]:
    """Best-effort VRAM estimate. Returns None if we can't tell."""
    try:
        import shutil
        if shutil.which("nvidia-smi"):
            import subprocess
            r = subprocess.run(
                ["nvidia-smi", "--query-gpu=memory.total",
                 "--format=csv,noheader,nounits"],
                capture_output=True, text=True, timeout=4,
            )
            if r.returncode == 0:
                total = 0
                for line in r.stdout.strip().splitlines():
                    line = line.strip()
                    if line.isdigit():
                        total += int(line)
                if total:
                    return total
    except Exception as e:  # noqa: BLE001
        logger.debug("vram probe failed: %r", e)
    return None


def _estimate_ram_mb() -> Optional[int]:
    try:
        import shutil
        if shutil.which("free"):
            import subprocess
            r = subprocess.run(
                ["free", "-m"], capture_output=True, text=True, timeout=4,
            )
            if r.returncode == 0:
                # First row: Mem: total used free ...
                for line in r.stdout.splitlines():
                    if line.startswith("Mem:"):
                        parts = line.split()
                        if len(parts) >= 2:
                            try:
                                return int(parts[1])
                            except ValueError:
                                pass
    except Exception as e:  # noqa: BLE001
        logger.debug("ram probe failed: %r", e)
    return None


def resolve_profile(
    model_id: str = "",
    base_url: str = "",
    explicit: Optional[str] = None,
) -> Profile:
    """Pick the right Profile for the current model + hardware.

    - explicit=user-set override (string id) always wins
    - "auto" (None) means: look at model size + VRAM
    - Anything else is treated as a profile id (errors → default)
    """
    if explicit and explicit != "auto":
        prof = PROFILES.get(explicit)
        if prof:
            return prof
        logger.warning("Unknown profile id %r — falling back to %s", explicit, DEFAULT_PROFILE)
        return PROFILES[DEFAULT_PROFILE]

    size = _detect_size_class(model_id)
    is_local = _looks_local(model_id, base_url)

    if not is_local:
        # Cloud — even small cloud models are fast + accurate enough for full.
        return PROFILES["full"]

    vram = _estimate_vram_mb()
    ram = _estimate_ram_mb()

    # Decision matrix
    if size == "small" or (vram is not None and vram < 8_000):
        return PROFILES["minimal"]
    if size == "large" and (vram is None or vram >= 24_000):
        return PROFILES["full"]
    if vram is not None and vram < 16_000:
        return PROFILES["minimal"]
    return PROFILES[DEFAULT_PROFILE]


def explain_choice(model_id: str = "", base_url: str = "") -> Dict[str, object]:
    """Diagnostic helper: show what factors drove the auto-selection.
    Used by the Slim Mode UI to render the "Why this profile?" tooltip."""
    size = _detect_size_class(model_id)
    is_local = _looks_local(model_id, base_url)
    vram = _estimate_vram_mb()
    ram = _estimate_ram_mb()
    return {
        "model_id": model_id,
        "base_url": base_url,
        "size_class": size,
        "is_local": is_local,
        "vram_mb": vram,
        "ram_mb": ram,
        "profile": resolve_profile(model_id, base_url).id,
    }
