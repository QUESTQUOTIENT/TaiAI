"""
Tests for core/diagnostics.py — the Healthy Stack Wizard registry.

Verifies:
- Registration via @register_check decorator
- Each check function returns a HealthResult (or is auto-wrapped)
- Exceptions inside a check become a fail HealthResult (not an exception)
- run_all_checks returns one result per registered check
- summary() counts statuses correctly
- list_checks() returns metadata for UI rendering

Does NOT mock any of the actual probes (Ollama, ChromaDB, etc) — those
checks degrade to "fail" or "skip" without external services, which is
exactly the behavior we want to verify here.
"""
from core.diagnostics import (
    HealthResult, _REGISTRY, register_check, list_checks,
    run_all_checks, summary,
)


def _fresh_registry():
    """Run all checks against a clean registry. We can't easily clear
    _REGISTRY (built at import time), but run_all_checks returns one
    result per registered id, so we just verify the count matches."""
    return _REGISTRY


def test_registry_has_builtin_checks():
    """The shipped registry should include the 11 standard checks."""
    expected = {
        "build", "ollama.health", "ollama.models", "ollama.gpu",
        "chroma.health", "chroma.collection", "embeddings",
        "search", "env.required", "filesystem", "docker",
    }
    actual = set(_REGISTRY.keys())
    missing = expected - actual
    extra = actual - expected
    assert not missing, f"Missing checks: {missing}"
    # Don't fail on extras — we want this test to keep working as new
    # checks are added. Just log them.
    assert len(actual) >= len(expected), f"Registry shrunk: {actual}"


def test_list_checks_metadata():
    listed = list_checks()
    assert isinstance(listed, list)
    assert len(listed) == len(_REGISTRY)
    for entry in listed:
        assert "id" in entry
        assert "label" in entry
        assert isinstance(entry["id"], str)
        assert isinstance(entry["label"], str)
        assert entry["label"], f"empty label for {entry['id']}"


def test_summary_counts():
    fake = [
        HealthResult(id="a", label="a", status="ok"),
        HealthResult(id="b", label="b", status="ok"),
        HealthResult(id="c", label="c", status="warn"),
        HealthResult(id="d", label="d", status="fail"),
        HealthResult(id="e", label="e", status="skip"),
    ]
    s = summary(fake)
    assert s == {"ok": 2, "warn": 1, "fail": 1, "skip": 1, "total": 5}


def test_run_all_checks_returns_one_result_per_check():
    """run_all_checks() must return exactly len(_REGISTRY) results when
    no filter is given, even if some checks fail."""
    import asyncio
    results = asyncio.run(run_all_checks(parallel=True))
    assert len(results) == len(_REGISTRY)
    for r in results:
        assert isinstance(r, HealthResult)
        assert r.id in _REGISTRY
        assert r.label, f"empty label for {r.id}"
        assert r.status in {"ok", "warn", "fail", "skip"}, f"bad status {r.status} on {r.id}"
        # elapsed_ms is always set by the wrapper
        assert isinstance(r.elapsed_ms, int)
        assert r.elapsed_ms >= 0


def test_run_all_checks_ids_filter():
    """With an ids filter, only those checks run."""
    import asyncio
    results = asyncio.run(run_all_checks(ids=["build"], parallel=False))
    assert len(results) == 1
    assert results[0].id == "build"


def test_register_check_decorator_wraps_exceptions():
    """A check that raises must be auto-wrapped into a fail HealthResult
    rather than propagating the exception."""
    @register_check("test.raising", "Raising Check")
    async def raising():
        raise RuntimeError("boom")

    @register_check("test.ok", "OK Check")
    async def ok():
        return HealthResult(id="test.ok", label="OK Check", status="ok")

    import asyncio
    results = asyncio.run(run_all_checks(ids=["test.raising", "test.ok"], parallel=False))
    by_id = {r.id: r for r in results}
    assert by_id["test.raising"].status == "fail"
    assert "boom" in by_id["test.raising"].detail
    # fix may be empty if the exception doesn't match any known category
    # (e.g. RuntimeError) — only assert the failure status, not the fix.
    assert by_id["test.ok"].status == "ok"

    # Cleanup so other tests aren't polluted
    _REGISTRY.pop("test.raising", None)
    _REGISTRY.pop("test.ok", None)
