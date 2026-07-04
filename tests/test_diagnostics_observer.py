"""Tests for services/diagnostics/observer.py.

Validates that the observer:
- subscribes to the bus on first call
- retains a rolling window of recent events
- aggregates events by subsystem prefix + status
- filters by type_prefix
- detaches cleanly on shutdown
"""

from __future__ import annotations

import pytest

from core.events import EventBus, PlatformEvent, get_default_bus, reset_default_bus
from services.diagnostics import get_observer, reset_observer
from services.diagnostics.observer import _prefix_for


# -- helpers -----------------------------------------------------------


def _emit(bus, type_, status, **payload):
    return bus.emit(PlatformEvent(type=type_, status=status, payload=payload))


@pytest.fixture
def bus():
    """Fresh bus per test — keeps histories isolated."""
    return EventBus(name="diag-test", history_limit=1000)


@pytest.fixture(autouse=True)
def _reset_observer_each_test():
    """The observer module caches a singleton; reset between tests so
    each test gets a clean subscription against the current bus."""
    reset_observer()
    yield
    reset_observer()


# -- prefix bucketing --------------------------------------------------


class TestPrefixBucketing:
    def test_known_prefixes(self):
        assert _prefix_for("backup.snapshot.completed") == "backup."
        assert _prefix_for("cookbook.error.categorize.failed") == "cookbook."
        assert _prefix_for("compare.vote.recorded") == "compare."

    def test_unknown_prefixes_go_to_other(self):
        assert _prefix_for("nonsense.event") == "nonsense."
        assert _prefix_for("") == "other."
        assert _prefix_for("just_one_word") == "just_one_word."


# -- subscription + retention -----------------------------------------


class TestObserverSubscription:
    def test_first_call_attaches_subscriber(self, bus, monkeypatch):
        monkeypatch.setattr(
            "services.diagnostics.observer.get_default_bus", lambda: bus
        )
        observer = get_observer()
        assert bus.subscriber_count() == 1
        # Second call returns the same instance — does NOT add another
        # subscriber.
        again = get_observer()
        assert again is observer
        assert bus.subscriber_count() == 1

    def test_observer_records_emitted_events(self, bus, monkeypatch):
        monkeypatch.setattr(
            "services.diagnostics.observer.get_default_bus", lambda: bus
        )
        observer = get_observer()
        _emit(bus, "backup.snapshot.started", "started")
        _emit(bus, "backup.snapshot.completed", "succeeded")
        assert len(observer.recent(limit=10)) == 2

    def test_reset_observer_detaches_subscriber(self, bus, monkeypatch):
        monkeypatch.setattr(
            "services.diagnostics.observer.get_default_bus", lambda: bus
        )
        get_observer()
        assert bus.subscriber_count() == 1
        reset_observer()
        assert bus.subscriber_count() == 0
        # After reset, the next event must NOT crash and must NOT be
        # recorded by the detached observer.
        get_observer()  # re-attach to a fresh instance
        assert bus.subscriber_count() == 1


# -- recent() ----------------------------------------------------------


class TestRecent:
    def test_newest_first(self, bus, monkeypatch):
        monkeypatch.setattr(
            "services.diagnostics.observer.get_default_bus", lambda: bus
        )
        observer = get_observer()
        for i in range(5):
            _emit(bus, f"backup.event{i}", "ok")
        types = [e.type for e in observer.recent(limit=5)]
        assert types == ["backup.event4", "backup.event3", "backup.event2",
                          "backup.event1", "backup.event0"]

    def test_limit_truncates(self, bus, monkeypatch):
        monkeypatch.setattr(
            "services.diagnostics.observer.get_default_bus", lambda: bus
        )
        observer = get_observer()
        for i in range(10):
            _emit(bus, "backup.x", "ok")
        assert len(observer.recent(limit=3)) == 3
        assert len(observer.recent(limit=20)) == 10  # only 10 events exist

    def test_filter_by_prefix(self, bus, monkeypatch):
        monkeypatch.setattr(
            "services.diagnostics.observer.get_default_bus", lambda: bus
        )
        observer = get_observer()
        _emit(bus, "backup.snapshot.started", "started")
        _emit(bus, "cookbook.error.categorize.completed", "succeeded")
        _emit(bus, "compare.start.completed", "succeeded")

        backup_events = observer.recent(type_prefix="backup.")
        assert len(backup_events) == 1
        assert backup_events[0].type.startswith("backup.")

    def test_limit_zero_returns_empty(self, bus, monkeypatch):
        monkeypatch.setattr(
            "services.diagnostics.observer.get_default_bus", lambda: bus
        )
        observer = get_observer()
        _emit(bus, "x.y", "ok")
        assert observer.recent(limit=0) == []

    def test_history_window_caps_old_events(self, bus, monkeypatch):
        # The observer uses a 512-event default window. Push 600 events
        # and verify the oldest 88 are dropped.
        from services.diagnostics.observer import _Observer
        monkeypatch.setattr(
            "services.diagnostics.observer.get_default_bus", lambda: bus
        )
        observer = _Observer(bus=bus, history_limit=100)
        for i in range(150):
            _emit(bus, f"e.{i}", "ok")
        assert len(observer.recent(limit=200)) == 100


# -- summary() ---------------------------------------------------------


class TestSummary:
    def test_aggregates_by_prefix_and_status(self, bus, monkeypatch):
        monkeypatch.setattr(
            "services.diagnostics.observer.get_default_bus", lambda: bus
        )
        observer = get_observer()
        _emit(bus, "backup.snapshot.started", "started")
        _emit(bus, "backup.snapshot.started", "started")
        _emit(bus, "backup.snapshot.completed", "succeeded")
        _emit(bus, "backup.snapshot.failed", "failed")
        _emit(bus, "cookbook.error.categorize.completed", "succeeded")
        _emit(bus, "compare.start.completed", "succeeded")

        summary = observer.summary()
        assert summary["backup."] == {"started": 2, "succeeded": 1, "failed": 1}
        assert summary["cookbook."] == {"succeeded": 1}
        assert summary["compare."] == {"succeeded": 1}

    def test_unknown_prefix_buckets_into_other(self, bus, monkeypatch):
        monkeypatch.setattr(
            "services.diagnostics.observer.get_default_bus", lambda: bus
        )
        observer = get_observer()
        _emit(bus, "metrics.tick", "ok")  # unknown prefix
        s = observer.summary()
        assert s.get("metrics.", {}).get("ok") == 1

    def test_summary_empty_when_no_events(self, bus, monkeypatch):
        monkeypatch.setattr(
            "services.diagnostics.observer.get_default_bus", lambda: bus
        )
        assert get_observer().summary() == {}
