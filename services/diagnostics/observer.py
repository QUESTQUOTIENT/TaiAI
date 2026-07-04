"""services/diagnostics/observer.py — subscribe-side of the events bus.

Three other subsystems emit on the shared :class:`EventBus`:

* Cookbook (routes/cookbook_routes.py)
* Backup CLI (scripts/TaiAi-backup)
* Compare Mode (routes/compare_routes.py)

Diagnostics is the natural *subscriber* — it can't fix problems, but it
can show what's happening across the platform. This module attaches a
single listener to the default bus that retains a rolling window of
recent events and exposes aggregate counts.

Design choices
--------------

* **Single global listener per process.** Adding more is unlikely to add
  value — every subscriber would receive the same events.
* **Rolling window, not unbounded history.** The bus itself retains a
  default 256 events; the observer keeps a separate, slightly larger
  window so the diagnostics UI doesn't lose context during a flurry of
  activity.
* **No mutation of incoming events.** Diagnostics is read-only with
  respect to the bus; it never re-emits or rewrites.

This module is intentionally cheap to import. The subscriber is
attached lazily (on first call to :func:`get_observer`) so a Python
process that never asks for diagnostics (a CLI-only invocation, say)
pays nothing.
"""

from __future__ import annotations

import threading
from collections import Counter
from typing import Dict, List, Optional

from core.events import EventBus, PlatformEvent, get_default_bus


_DEFAULT_HISTORY_LIMIT = 512


class _Observer:
    """Process-global event subscriber that retains recent events.

    The class is private — callers use :func:`get_observer` so the
    attach-to-bus happens exactly once per process.
    """

    def __init__(self, bus: EventBus, history_limit: int = _DEFAULT_HISTORY_LIMIT):
        self._bus = bus
        self._history: List[PlatformEvent] = []
        self._lock = threading.Lock()
        self._history_limit = max(1, int(history_limit))
        # Subscribe on a prefix filter that catches everything from the
        # three known emitters. New emitters should use one of these
        # type prefixes; the observer won't see events outside them.
        # ``"*"`` would also work but this is more explicit about what
        # we're listening for.
        self._unsubscribe = bus.subscribe(self._on_event, type_filter="*")

    def _on_event(self, ev: PlatformEvent) -> None:
        with self._lock:
            self._history.append(ev)
            if len(self._history) > self._history_limit:
                self._history = self._history[-self._history_limit :]

    # -- public API ----------------------------------------------------

    def recent(self, limit: int = 100, type_prefix: Optional[str] = None) -> List[PlatformEvent]:
        """Return up to ``limit`` most recent events, newest first.

        If ``type_prefix`` is set, only events whose ``type`` starts with
        that prefix are returned (e.g. ``"backup."``, ``"cookbook."``,
        ``"compare."``).
        """
        if limit <= 0:
            return []
        with self._lock:
            snapshot = list(self._history)
        if type_prefix is not None:
            snapshot = [e for e in snapshot if e.type.startswith(type_prefix)]
        # newest first
        snapshot.reverse()
        return snapshot[:limit]

    def summary(self) -> Dict[str, Dict[str, int]]:
        """Aggregate event counts by ``{type_prefix: {status: count}}``.

        Example output::

            {
                "backup.":     {"succeeded": 3, "failed": 1, "started": 4},
                "cookbook.":   {"succeeded": 12, "started": 12, "failed": 2},
                "compare.":    {"succeeded": 5, "started": 5},
            }

        Only event-type prefixes we care about appear in the result;
        events outside the known prefixes (e.g. from a future emitter)
        land under ``"other."``.
        """
        buckets: Dict[str, Counter] = {}
        with self._lock:
            snapshot = list(self._history)
        for ev in snapshot:
            bucket = _prefix_for(ev.type)
            buckets.setdefault(bucket, Counter())[ev.status] += 1
        return {k: dict(v) for k, v in buckets.items()}

    def shutdown(self) -> None:
        """Detach the subscriber from the bus. Idempotent."""
        if self._unsubscribe is not None:
            self._unsubscribe()
            self._unsubscribe = None


def _prefix_for(event_type: str) -> str:
    """Map an event type to a bucket name.

    The audit's known emitters use dotted prefixes; we group on the
    first segment. Anything we don't recognise lands in ``"other."``
    so the diagnostics UI can show "unknown events" without missing
    data.
    """
    head = event_type.split(".", 1)[0]
    return head + "." if head else "other."


_observer_lock = threading.Lock()
_observer: Optional[_Observer] = None


def get_observer() -> _Observer:
    """Return the process-global :class:`_Observer`, creating it on first call.

    The observer attaches itself to whatever bus :func:`get_default_bus`
    returns. Tests that want an isolated observer can call
    :func:`reset_observer` first to drop the cached instance.
    """
    global _observer
    if _observer is None:
        with _observer_lock:
            if _observer is None:
                _observer = _Observer(bus=get_default_bus())
    return _observer


def reset_observer() -> None:
    """Drop the cached observer. Intended for tests."""
    global _observer
    with _observer_lock:
        if _observer is not None:
            _observer.shutdown()
        _observer = None
