"""
TaiAi Smart Deep Research presets.

Phase 2.10.

Computes a research preset from the user's hardware tier + currently
available models. Tells the research engine: how many sub-questions to
spawn, how many sources per sub-question, max tokens per step, and
which model to use for synthesis.

Profiles are tiered:

  - budget:    3 sub-questions, 2 sources each,   <=2s/token target
  - balanced:  6 sub-questions, 4 sources each,   <=1s/token target
  - deep:      12 sub-questions, 6 sources each,  best available

Each profile chooses a model from the active model list preferring
larger / faster / cheaper depending on the tier.
"""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass, asdict, field
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)


@dataclass
class ResearchPreset:
    id: str
    label: str
    sub_questions: int
    sources_per_question: int
    max_tokens_per_step: int
    preferred_model_keywords: List[str]
    target_latency_seconds: float
    notes: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


PRESETS: Dict[str, ResearchPreset] = {
    "budget": ResearchPreset(
        id="budget",
        label="Budget (3 sub-questions, fast)",
        sub_questions=3,
        sources_per_question=2,
        max_tokens_per_step=2_000,
        preferred_model_keywords=["haiku", "mini", "8b", "7b", "small"],
        target_latency_seconds=2.0,
        notes="Best for quick scans. Small models handle summarization well.",
    ),
    "balanced": ResearchPreset(
        id="balanced",
        label="Balanced (6 sub-questions)",
        sub_questions=6,
        sources_per_question=4,
        max_tokens_per_step=4_000,
        preferred_model_keywords=["sonnet", "gpt-4o", "opus", "70b", "medium"],
        target_latency_seconds=1.0,
        notes="Default. Solid coverage without runaway cost.",
    ),
    "deep": ResearchPreset(
        id="deep",
        label="Deep (12 sub-questions, comprehensive)",
        sub_questions=12,
        sources_per_question=6,
        max_tokens_per_step=8_000,
        preferred_model_keywords=["opus", "sonnet", "gpt-4", "70b", "405b"],
        target_latency_seconds=0.5,
        notes="Comprehensive deep dive. Will burn tokens fast; use sparingly.",
    ),
}


def pick_model(preset: ResearchPreset, available: List[str]) -> Optional[str]:
    """Pick the first available model whose name matches one of the
    preset's preferred keywords (case-insensitive substring match).
    Returns None if no match."""
    if not available:
        return None
    keywords = preset.preferred_model_keywords
    for kw in keywords:
        kwl = kw.lower()
        for m in available:
            if kwl in m.lower():
                return m
    return None


def build_preset(
    tier: str = "balanced",
    available_models: Optional[List[str]] = None,
    hardware_tier: Optional[str] = None,
) -> dict:
    """Return a preset dict, optionally filled with a chosen model.

    `tier`           — "budget" | "balanced" | "deep"
    `available_models` — list of currently-discovered model names; if the
                       preset has preferred keywords and a match is found,
                       it's attached as `chosen_model`.
    `hardware_tier`  — optional "low" | "mid" | "high" used to clamp the
                       preset if the user's hardware can't handle the
                       default tier.
    """
    preset = PRESETS.get(tier) or PRESETS["balanced"]
    out = preset.to_dict()

    # Down-shift if hardware is too small
    if hardware_tier == "low" and tier in ("deep", "balanced"):
        out = PRESETS["budget"].to_dict()
        out["notes"] = (out["notes"] + " | Auto-downshifted to budget for low-end hardware.").strip(" |")

    if available_models:
        chosen = pick_model(out and PRESETS.get(out["id"], preset), available_models)
        if chosen:
            out["chosen_model"] = chosen
        else:
            out["chosen_model"] = None
            out["notes"] = (out.get("notes", "") + " | No preferred model found in your available models.").strip(" |")

    return out
