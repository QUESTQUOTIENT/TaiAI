"""
Tests for core/research_presets.py — Smart Deep Research presets.

Verifies:
- All 3 tiers are well-formed (positive sub_questions, sources_per_question)
- pick_model prefers keywords in order
- build_preset with hardware_tier=low downshifts to budget
- chosen_model is None when no models match (graceful)
"""
from core.research_presets import PRESETS, build_preset, pick_model
from core.agent_profiles import Profile  # for type compat


def test_presets_have_valid_shape():
    for pid, p in PRESETS.items():
        assert p.id == pid
        assert p.label
        assert p.sub_questions > 0, f"{pid} sub_questions <= 0"
        assert p.sources_per_question > 0
        assert p.max_tokens_per_step > 0
        assert p.target_latency_seconds > 0
        assert len(p.preferred_model_keywords) > 0


def test_tiers_are_distinct():
    """Budget < Balanced < Deep."""
    assert PRESETS["budget"].sub_questions < PRESETS["balanced"].sub_questions
    assert PRESETS["balanced"].sub_questions < PRESETS["deep"].sub_questions
    assert PRESETS["budget"].target_latency_seconds > PRESETS["deep"].target_latency_seconds


def test_pick_model_prefers_first_matching_keyword():
    """Given a list with both a small + large model, the budget tier
    should pick the small one (matches 'haiku' / 'mini' / '7b' keywords)."""
    available = ["llama3.1:8b", "gpt-4o", "claude-3-5-sonnet"]
    assert pick_model(PRESETS["budget"], available) == "llama3.1:8b"
    # The deep tier prefers opus / sonnet / 70b. With claude available, it wins.
    assert pick_model(PRESETS["deep"], available) == "claude-3-5-sonnet"
    # And balanced (sonnet / gpt-4o / 70b) also picks sonnet.
    assert pick_model(PRESETS["balanced"], available) == "claude-3-5-sonnet"


def test_pick_model_returns_none_when_no_match():
    """If none of the available models match any preferred keyword,
    return None rather than picking arbitrarily."""
    p = pick_model(PRESETS["deep"], ["some-random-model-xyz", "another-one"])
    assert p is None


def test_pick_model_handles_empty_list():
    assert pick_model(PRESETS["balanced"], []) is None


def test_build_preset_balanced_default():
    out = build_preset(tier="balanced", available_models=["gpt-4o"])
    assert out["id"] == "balanced"
    assert out["chosen_model"] == "gpt-4o"
    assert out["sub_questions"] == PRESETS["balanced"].sub_questions


def test_build_preset_low_hardware_downshifts_to_budget():
    """On low-end hardware, ANY tier should be downgraded to budget.
    The notes field should record this."""
    for tier in ("deep", "balanced"):
        out = build_preset(tier=tier, available_models=["gpt-4o"], hardware_tier="low")
        assert out["id"] == "budget", f"{tier} + low hw should be budget, got {out['id']}"
        assert "downshift" in out["notes"].lower()


def test_build_preset_high_hardware_keeps_deep():
    """On high-end hardware, deep tier stays deep."""
    out = build_preset(tier="deep", available_models=["gpt-4o"], hardware_tier="high")
    assert out["id"] == "deep"
    assert "downshift" not in out["notes"].lower()


def test_build_preset_no_models_means_no_chosen():
    """When no models match, chosen_model is None and notes explains."""
    out = build_preset(tier="balanced", available_models=["mystery-model"])
    assert out["chosen_model"] is None
    assert "no preferred model" in out["notes"].lower() or "no preferred" in out["notes"].lower()


def test_build_preset_unknown_tier_falls_back():
    """If tier is misspelled, fall back to balanced."""
    out = build_preset(tier="super-deep-ultra", available_models=["gpt-4o"])
    assert out["id"] == "balanced"
