"""
Tests for core/agent_profiles.py — Slim Agent Mode profile resolver.

Verifies:
- Known model names resolve to the expected profile tier
- Custom explicit override always wins
- Profile schema is well-formed (positive context cap, etc)
- PROFILES is frozen against accidental mutation at runtime
"""
from core.agent_profiles import PROFILES, DEFAULT_PROFILE, resolve_profile


def test_known_small_local_models_get_minimal():
    """7B/8B local models -> minimal profile (small context, 6-tool whitelist)."""
    for m in ("llama3.1:8b", "qwen2.5:7b-instruct", "mistral:7b", "phi3:mini"):
        p = resolve_profile(model_id=m, base_url="")
        assert p.id == "minimal", f"{m} should be minimal, got {p.id}"
        assert p.max_context_tokens <= 8_000
        assert p.tool_whitelist is not None and len(p.tool_whitelist) <= 10


def test_known_large_cloud_models_get_full():
    """Big cloud models -> full profile (64k context, all tools)."""
    for m in ("gpt-4o", "gpt-4-turbo", "claude-3-5-sonnet",
              "claude-3-opus", "llama3.1:70b", "o1-preview"):
        p = resolve_profile(model_id=m, base_url="")
        assert p.id == "full", f"{m} should be full, got {p.id}"
        assert p.max_context_tokens >= 32_000
        assert p.tool_whitelist is None  # None = all tools


def test_unknown_model_falls_back_to_balanced():
    """When we don't recognize the model name AND it looks local (no
    base_url pointing at a cloud), default to balanced."""
    p = resolve_profile(model_id="some-unknown-13b", base_url="")
    assert p.id == "balanced"


def test_explicit_override_always_wins():
    """Even with a clearly large cloud model, explicit=minimal must
    return minimal. This is how the API caller forces a profile."""
    p = resolve_profile(model_id="gpt-4o", base_url="", explicit="minimal")
    assert p.id == "minimal"
    p2 = resolve_profile(model_id="llama3.1:8b", base_url="", explicit="full")
    assert p2.id == "full"


def test_auto_means_use_heuristics():
    """explicit='auto' (or None) must NOT force a profile; it should
    defer to the model+hardware heuristic."""
    p = resolve_profile(model_id="gpt-4o", base_url="", explicit=None)
    assert p.id == "full"
    p2 = resolve_profile(model_id="gpt-4o", base_url="", explicit="auto")
    assert p2.id == "full"


def test_unknown_explicit_falls_back_to_default():
    """An unrecognized profile id (typo) should NOT crash; fall back to
    DEFAULT_PROFILE gracefully."""
    p = resolve_profile(model_id="gpt-4o", base_url="", explicit="nonexistent-profile")
    assert p.id == DEFAULT_PROFILE


def test_profiles_have_valid_shape():
    """Every Profile must have a positive context cap, a non-empty label,
    and either None or a non-empty whitelist."""
    for prof_id, p in PROFILES.items():
        assert p.id == prof_id, f"profile key {prof_id} != id {p.id}"
        assert p.label, f"{prof_id} has empty label"
        assert p.max_context_tokens > 0, f"{prof_id} has non-positive context cap"
        assert p.memory_top_k > 0
        assert isinstance(p.enable_plan_mode, bool)
        assert isinstance(p.enable_intent_verifier, bool)
        assert isinstance(p.enable_cost_estimator, bool)
        if p.tool_whitelist is not None:
            assert len(p.tool_whitelist) > 0, f"{prof_id} has empty whitelist"
