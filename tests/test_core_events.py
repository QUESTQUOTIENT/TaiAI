"""Tests for core/events.py — PlatformEvent + EventBus."""

from __future__ import annotations

import threading
import time

import pytest

from core.events import (
    EventBus,
    PlatformEvent,
    _filter_matches,
    get_default_bus,
    reset_default_bus,
)


# -- PlatformEvent -------------------------------------------------------


class TestPlatformEvent:
    def test_defaults_populate_id_and_timestamp(self):
        ev = PlatformEvent(type="cookbook.install.started", status="started")
        assert isinstance(ev.id, str) and len(ev.id) == 32  # uuid4 hex
        assert "T" in ev.timestamp and ev.timestamp.endswith("+00:00")

    def test_to_dict_is_json_safe(self):
        import json

        ev = PlatformEvent(
            type="x",
            status="progress",
            progress=42,
            payload={"a": 1, "b": [1, 2, 3], "c": "ok"},
        )
        d = ev.to_dict()
        # Must round-trip through JSON without errors.
        json.dumps(d)
        assert d["type"] == "x"
        assert d["progress"] == 42

    def test_distinct_events_get_distinct_ids(self):
        ev1 = PlatformEvent(type="x", status="started")
        ev2 = PlatformEvent(type="x", status="started")
        assert ev1.id != ev2.id


# -- EventBus ------------------------------------------------------------


class TestEventBusBasic:
    def test_subscribe_and_emit_calls_subscriber(self):
        bus = EventBus(name="t")
        seen = []

        def cb(ev):
            seen.append(ev)

        bus.subscribe(cb)
        ev = bus.emit(PlatformEvent(type="x", status="started"))
        assert seen == [ev]

    def test_unsubscribe_removes_subscriber(self):
        bus = EventBus(name="t")
        seen = []

        def cb(ev):
            seen.append(ev)

        bus.subscribe(cb)()
        bus.emit(PlatformEvent(type="x", status="started"))
        assert seen == []

    def test_unsubscribe_returns_true_only_when_found(self):
        bus = EventBus(name="t")

        def cb(ev):
            pass

        assert bus.unsubscribe(cb) is False
        bus.subscribe(cb)
        assert bus.unsubscribe(cb) is True

    def test_subscribe_rejects_non_callable(self):
        bus = EventBus(name="t")
        with pytest.raises(TypeError):
            bus.subscribe("not a callable")  # type: ignore[arg-type]

    def test_emit_rejects_non_event(self):
        bus = EventBus(name="t")
        with pytest.raises(TypeError):
            bus.emit({"type": "x"})  # type: ignore[arg-type]

    def test_emit_returns_the_event_for_chaining(self):
        bus = EventBus(name="t")
        ev = bus.emit_dict(type="x", status="started")
        assert isinstance(ev, PlatformEvent)
        assert ev.type == "x"


class TestEventBusFiltering:
    def test_exact_filter_matches_only_same_type(self):
        bus = EventBus(name="t")
        seen = []
        bus.subscribe(lambda e: seen.append(e.type), type_filter="cookbook.install")
        bus.emit_dict(type="cookbook.install", status="started")
        bus.emit_dict(type="cookbook.uninstall", status="started")
        assert seen == ["cookbook.install"]

    def test_dotted_prefix_filter_matches_subtypes(self):
        bus = EventBus(name="t")
        seen = []
        bus.subscribe(lambda e: seen.append(e.type), type_filter="cookbook")
        bus.emit_dict(type="cookbook.install.started", status="started")
        bus.emit_dict(type="cookbook.install.completed", status="succeeded")
        bus.emit_dict(type="backup.snapshot.started", status="started")
        assert seen == ["cookbook.install.started", "cookbook.install.completed"]

    def test_dotted_prefix_does_not_match_unrelated_words(self):
        # "cookbook" must NOT match "cookbookery" (no dot boundary).
        assert _filter_matches("cookbook", "cookbookery") is False
        assert _filter_matches("cookbook", "cookbook.install") is True
        assert _filter_matches("cookbook", "cookbook") is True
        assert _filter_matches("*", "anything.at.all") is True

    def test_multiple_subscribers_all_receive_event(self):
        bus = EventBus(name="t")
        a, b, c = [], [], []
        bus.subscribe(lambda e: a.append(e.id))
        bus.subscribe(lambda e: b.append(e.id), type_filter="cookbook")
        bus.subscribe(lambda e: c.append(e.id), type_filter="backup")
        bus.emit_dict(type="cookbook.x", status="started")
        assert len(a) == 1 and len(b) == 1 and c == []

    def test_subscriber_exception_does_not_break_other_subscribers(self):
        bus = EventBus(name="t")
        seen = []

        def bad(_):
            raise RuntimeError("nope")

        def good(ev):
            seen.append(ev.id)

        bus.subscribe(bad)
        bus.subscribe(good)
        bus.emit_dict(type="x", status="started")
        assert len(seen) == 1  # good subscriber still fired


class TestEventBusHistory:
    def test_history_records_emitted_events(self):
        bus = EventBus(name="t", history_limit=10)
        bus.emit_dict(type="a", status="started")
        bus.emit_dict(type="b", status="progress", progress=50)
        h = bus.history
        assert [e.type for e in h] == ["a", "b"]
        assert h[1].progress == 50

    def test_history_limit_caps_size(self):
        bus = EventBus(name="t", history_limit=3)
        for i in range(5):
            bus.emit_dict(type=f"e{i}", status="started")
        types = [e.type for e in bus.history]
        assert types == ["e2", "e3", "e4"]  # oldest two dropped

    def test_history_disabled_when_limit_zero(self):
        bus = EventBus(name="t", history_limit=0)
        bus.emit_dict(type="x", status="started")
        assert bus.history == []

    def test_clear_history_drops_events(self):
        bus = EventBus(name="t")
        bus.emit_dict(type="x", status="started")
        bus.clear_history()
        assert bus.history == []


class TestEventBusThreadSafety:
    def test_concurrent_emit_does_not_lose_subscribers(self):
        # We don't assert no events lost (that depends on GIL + lock
        # granularity); we assert the bus remains consistent: every emitted
        # event has a recorded id and the subscriber count is unchanged.
        bus = EventBus(name="t")
        seen_ids = []
        seen_lock = threading.Lock()

        def cb(ev):
            with seen_lock:
                seen_ids.append(ev.id)

        bus.subscribe(cb)

        def worker(n: int) -> None:
            for i in range(n):
                bus.emit_dict(type="x", status="started", payload={"i": i})

        threads = [threading.Thread(target=worker, args=(50,)) for _ in range(4)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert len(seen_ids) == 200
        # Subscriber still registered.
        assert bus.subscriber_count() == 1


class TestDefaultBus:
    def setup_method(self):
        reset_default_bus()

    def teardown_method(self):
        reset_default_bus()

    def test_get_default_bus_returns_singleton(self):
        a = get_default_bus()
        b = get_default_bus()
        assert a is b

    def test_reset_default_bus_drops_singleton(self):
        a = get_default_bus()
        reset_default_bus()
        b = get_default_bus()
        assert a is not b
