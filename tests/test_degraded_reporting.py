"""Tests for core/degraded.py — the setup-status / degradation reporter.

The point of this module is first-run legibility: a fresh install must be able
to tell the user which capabilities are merely unprovisioned (expected) versus
actually failing (wrong), and give an actionable fix for each. These tests lock
in that contract, plus the hard requirement that a status reporter can never
raise — a status page that 500s is worse than no status page.
"""

import pytest

from core.degraded import Status, Subsystem, collect_all, summarize


def _sub(**kw):
    base = dict(key="k", label="Thing", status=Status.OK)
    base.update(kw)
    return Subsystem(**base)


# ── Rendering ─────────────────────────────────────────────────────────────


def test_ok_subsystem_renders_a_single_available_line():
    assert _sub().as_log_block() == "Thing is available."


def test_log_block_uses_reason_impact_fix_notes_shape():
    """Mirrors the built-in Browser MCP message that this generalises."""
    block = _sub(
        status=Status.NOT_CONFIGURED,
        reason="nothing is listening.",
        impact="Feature X is unavailable.",
        fix="docker compose up -d thing",
        notes="Optional.",
    ).as_log_block()

    lines = block.split("\n")
    assert lines[0] == "Thing is not configured."
    assert "Reason:" in lines[1] and "nothing is listening." in lines[1]
    assert "Impact:" in lines[2]
    assert "Fix:" in lines[3]
    assert "Notes:" in lines[4]


def test_multiline_fix_is_indented_under_its_label():
    block = _sub(
        status=Status.NOT_CONFIGURED,
        fix="first command\nsecond command",
    ).as_log_block()

    lines = block.split("\n")
    fix_line = next(i for i, line in enumerate(lines) if "Fix:" in line)
    continuation = lines[fix_line + 1]
    assert continuation.strip() == "second command"
    # The continuation aligns with the first line's text, not the label.
    assert continuation.startswith(" " * 10)


@pytest.mark.parametrize(
    "status,expected",
    [
        (Status.NOT_CONFIGURED, "Thing is not configured."),
        (Status.DEGRADED, "Thing is not available."),
        (Status.DISABLED, "Thing is disabled."),
    ],
)
def test_headline_distinguishes_each_non_ok_status(status, expected):
    """not_configured must not read like a failure — that distinction is the
    whole reason this module exists."""
    assert _sub(status=status).as_log_block().split("\n")[0] == expected


def test_empty_fields_are_omitted_rather_than_rendered_blank():
    block = _sub(status=Status.DEGRADED, reason="boom").as_log_block()
    assert "Reason:" in block
    for absent in ("Impact:", "Fix:", "Notes:"):
        assert absent not in block


# ── Serialisation ─────────────────────────────────────────────────────────


def test_as_dict_omits_empty_optional_fields():
    payload = _sub().as_dict()
    assert payload["status"] == "ok"
    assert payload["ok"] is True
    for absent in ("reason", "impact", "fix", "notes", "detail"):
        assert absent not in payload


def test_as_dict_round_trips_populated_fields():
    payload = _sub(
        status=Status.DEGRADED,
        reason="r",
        impact="i",
        fix="f",
        notes="n",
        optional=False,
        detail={"host": "localhost"},
    ).as_dict()

    assert payload == {
        "key": "k",
        "label": "Thing",
        "status": "degraded",
        "ok": False,
        "optional": False,
        "reason": "r",
        "impact": "i",
        "fix": "f",
        "notes": "n",
        "detail": {"host": "localhost"},
    }


def test_status_values_are_json_safe_strings():
    """The enum is serialised directly into the HTTP payload."""
    assert Status.OK.value == "ok"
    assert isinstance(Status.DEGRADED.value, str)


# ── Summary semantics ─────────────────────────────────────────────────────


def test_unconfigured_optional_subsystem_does_not_make_the_instance_not_ok():
    """A bare install has no ChromaDB, no search key and no email account. That
    must not be reported as an unhealthy instance."""
    out = summarize([
        _sub(key="a", status=Status.OK, optional=False),
        _sub(key="b", status=Status.NOT_CONFIGURED, optional=True),
    ])
    assert out["ok"] is True


def test_unconfigured_required_subsystem_makes_the_instance_not_ok():
    out = summarize([_sub(key="a", status=Status.NOT_CONFIGURED, optional=False)])
    assert out["ok"] is False


def test_counts_tally_every_status():
    out = summarize([
        _sub(key="a", status=Status.OK),
        _sub(key="b", status=Status.OK),
        _sub(key="c", status=Status.NOT_CONFIGURED),
        _sub(key="d", status=Status.DEGRADED),
        _sub(key="e", status=Status.DISABLED),
    ])
    assert out["counts"] == {
        "total": 5,
        "ok": 2,
        "not_configured": 1,
        "degraded": 1,
        "disabled": 1,
    }


def test_summarize_handles_the_empty_case():
    out = summarize([])
    assert out["ok"] is True
    assert out["counts"]["total"] == 0
    assert out["subsystems"] == []


# ── Probe robustness ──────────────────────────────────────────────────────


def test_collect_all_never_raises_and_is_fully_serialisable():
    """Runs against the real environment (no ChromaDB, no tmux, empty DB here).
    Whatever it finds, it must return well-formed data rather than blow up."""
    import json

    subsystems = collect_all()
    assert subsystems, "expected at least one probed subsystem"

    payload = summarize(subsystems)
    json.dumps(payload)  # must not raise

    for entry in payload["subsystems"]:
        assert entry["key"]
        assert entry["label"]
        assert entry["status"] in {s.value for s in Status}
        # Anything not OK has to tell the user what to do about it.
        if not entry["ok"]:
            assert entry.get("reason"), f"{entry['key']} lacks a reason"
            assert entry.get("impact"), f"{entry['key']} lacks an impact"
            assert entry.get("fix"), f"{entry['key']} lacks a fix"


def test_probe_failure_is_reported_as_degraded_not_propagated(monkeypatch):
    """A probe that explodes must degrade gracefully into a DEGRADED entry."""
    import core.degraded as degraded

    def _boom():
        raise RuntimeError("kaboom")

    monkeypatch.setattr(degraded, "probe_chromadb", lambda: degraded._safe(
        _boom, "chromadb", "ChromaDB (vector search)"
    ))

    result = degraded.probe_chromadb()
    assert result.status is Status.DEGRADED
    assert "RuntimeError" in result.reason
    assert "kaboom" in result.reason
    assert result.fix  # still actionable


def test_model_endpoints_probe_is_marked_required():
    """Everything else is optional; without a model the app cannot do its job."""
    required = [s for s in collect_all() if not s.optional]
    assert [s.key for s in required] == ["model_endpoints"]
