"""
Tests for routes/backup_routes.py — Backup integrity stamp.

Verifies:
- _integrity() produces a stable SHA-256 over canonical JSON
- _verify_integrity() returns True for the payload that produced it
- Tampering with the payload invalidates the stamp
- Missing integrity stamp is rejected
- Bumping a single field in the payload invalidates the stamp
"""
import json

from routes.backup_routes import _integrity, _verify_integrity


def _sample_payload():
    return {
        "version": 2,
        "exported_at": "2026-06-19T15:00:00+00:00",
        "exported_by": "alice",
        "memories": [{"text": "remember this", "category": "fact"}],
        "presets": {"default": {"temperature": 0.7}},
        "skills": [],
        "settings": {"theme": "cyberpunk"},
        "features": {"web_search": True},
        "preferences": {"density": "comfortable"},
    }


def test_integrity_round_trip():
    payload = _sample_payload()
    payload["integrity"] = _integrity(payload)
    ok, reason = _verify_integrity(payload)
    assert ok, f"verify failed: {reason}"
    assert reason == ""


def test_integrity_is_deterministic():
    """Same payload must hash to the same digest (canonical JSON)."""
    p1 = _sample_payload()
    p2 = _sample_payload()
    assert _integrity(p1)["sha256"] == _integrity(p2)["sha256"]


def test_integrity_changes_on_tampering():
    """Adding a memory must change the hash."""
    p = _sample_payload()
    p["integrity"] = _integrity(p)
    ok, _ = _verify_integrity(p)
    assert ok
    p["memories"].append({"text": "injected", "category": "fact"})
    ok, reason = _verify_integrity(p)
    assert not ok
    assert "corrupt" in reason.lower() or "modified" in reason.lower()


def test_integrity_changes_on_field_change():
    """Changing a single character in any field must invalidate the hash."""
    p = _sample_payload()
    p["integrity"] = _integrity(p)
    p["exported_by"] = "mallory"
    ok, _ = _verify_integrity(p)
    assert not ok


def test_integrity_missing_is_rejected():
    p = _sample_payload()
    ok, reason = _verify_integrity(p)
    assert not ok
    assert "missing" in reason.lower() or "unknown" in reason.lower()


def test_integrity_wrong_algorithm_is_rejected():
    p = _sample_payload()
    p["integrity"] = {"algorithm": "md5", "sha256": "0" * 64, "size_bytes": 0}
    ok, reason = _verify_integrity(p)
    assert not ok
    assert "missing" in reason.lower() or "unknown" in reason.lower()
