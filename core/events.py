"""core/events.py — shared event bus for the platform.

Cookbook, Backup, Diagnostics, Research, and Compare Mode all need to publish
structured progress/failure events. Before this module each subsystem rolled
its own ad-hoc log lines or in-memory queues; that made cross-subsystem
correlation (e.g. "which cookbook install triggered this backup?") impossible.

This module provides:

* :class:`PlatformEvent` — the canonical event envelope (id, type, status,
  progress, payload).
* :class:`EventBus` — a small, thread-safe in-process pub/sub. Multiple buses
  are allowed (per-subsystem), but the module also exposes a default singleton
  via :func:`get_default_bus` for the common "everything goes to one place"
  case.

The bus is intentionally tiny: no persistence, no async, no serialization.
Subscribers register sync callables; the bus invokes them under a lock so a
slow subscriber cannot corrupt bus state, but it does not isolate them from
each other. If you need richer semantics (backpressure, dead-letter queue,
event log), wrap the bus — don't extend it.
"""

from __future__ import annotations

import threading
import uuid
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional


@dataclass
class PlatformEvent:
    """Canonical event envelope.

    Fields
    ------
    id : str
        Stable per-event identifier (UUID4 hex). Subscribers can use this for
        dedup if an event is re-delivered.
    type : str
        Dotted event type, e.g. ``"cookbook.install.started"``,
        ``"backup.snapshot.completed"``. Subscribers may filter by exact match
        or by prefix (see :meth:`EventBus.subscribe`).
    status : str
        Coarse lifecycle marker: ``"started"``, ``"progress"``,
        ``"succeeded"``, ``"failed"``, ``"cancelled"``.
    progress : Optional[int]
        0..100 percent completion, when meaningful. ``None`` for events that
        don't have a progress axis.
    payload : dict
        Free-form structured data. Must be JSON-serialisable if you intend to
        persist or forward the event.
    timestamp : str
        ISO-8601 UTC timestamp, set automatically at construction.
    """

    type: str
    status: str
    progress: Optional[int] = None
    payload: Dict[str, Any] = field(default_factory=dict)
    id: str = field(default_factory=lambda: uuid.uuid4().hex)
    timestamp: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )

    def to_dict(self) -> Dict[str, Any]:
        """Return a JSON-safe dict representation."""
        return asdict(self)


# A subscriber is a plain callable taking a PlatformEvent. It must not raise;
# if it does the bus logs and continues — but a raising subscriber masks
# failures from other subscribers, so subscribers should swallow internally.
Subscriber = Callable[["PlatformEvent"], None]


class EventBus:
    """Thread-safe in-process pub/sub.

    Parameters
    ----------
    name : str
        Human-readable label for the bus, used in log/exception messages.
    history_limit : int
        How many recent events to keep in :attr:`history`. ``0`` disables
        history (e.g. for sensitive subsystems).
    """

    def __init__(self, name: str = "default", history_limit: int = 256) -> None:
        self.name = name
        self._subscribers: List[tuple[str, Subscriber]] = []
        self._lock = threading.Lock()
        self._history: List[PlatformEvent] = []
        self._history_limit = max(0, int(history_limit))

    # -- subscription ------------------------------------------------------

    def subscribe(
        self,
        subscriber: Subscriber,
        type_filter: str = "*",
    ) -> Callable[[], None]:
        """Register ``subscriber`` for events whose ``type`` matches ``type_filter``.

        The filter is matched as an exact string or as a prefix followed by
        ``.`` — so ``"cookbook"`` matches ``"cookbook.install.started"`` but
        not ``"cookbookery"``. Use ``"*"`` (the default) for all events.

        Returns an ``unsubscribe`` callable the caller should keep to remove
        the subscription later (important for tests and short-lived request
        handlers).
        """
        if not callable(subscriber):
            raise TypeError("subscriber must be callable")
        with self._lock:
            self._subscribers.append((type_filter, subscriber))

        def _unsubscribe() -> None:
            self.unsubscribe(subscriber, type_filter)

        return _unsubscribe

    def unsubscribe(self, subscriber: Subscriber, type_filter: str = "*") -> bool:
        """Remove a previously-registered subscriber. Returns True if removed."""
        with self._lock:
            for i, (tf, sub) in enumerate(self._subscribers):
                if tf == type_filter and sub is subscriber:
                    del self._subscribers[i]
                    return True
            return False

    # -- emit --------------------------------------------------------------

    def emit(self, event: PlatformEvent) -> PlatformEvent:
        """Publish ``event``. Returns it (so callers can chain).

        Subscriber exceptions are swallowed and logged via :mod:`logging` so a
        single bad subscriber cannot break the publish path.
        """
        if not isinstance(event, PlatformEvent):
            raise TypeError(f"emit() expects PlatformEvent, got {type(event).__name__}")

        with self._lock:
            # Take a snapshot of the subscriber list under the lock so we
            # don't hold the lock while calling user code.
            snapshot = list(self._subscribers)
            if self._history_limit > 0:
                self._history.append(event)
                if len(self._history) > self._history_limit:
                    self._history = self._history[-self._history_limit :]

        for type_filter, sub in snapshot:
            if not _filter_matches(type_filter, event.type):
                continue
            try:
                sub(event)
            except Exception:  # noqa: BLE001 — subscriber isolation is intentional
                # Lazy import: logging may not be configured at module import.
                import logging
                logging.getLogger(__name__).exception(
                    "subscriber %r raised while handling event %s on bus %r",
                    sub,
                    event.id,
                    self.name,
                )
        return event

    def emit_dict(
        self,
        type: str,
        status: str,
        progress: Optional[int] = None,
        payload: Optional[Dict[str, Any]] = None,
    ) -> PlatformEvent:
        """Convenience: build + emit a :class:`PlatformEvent` from kwargs."""
        return self.emit(
            PlatformEvent(
                type=type,
                status=status,
                progress=progress,
                payload=dict(payload or {}),
            )
        )

    # -- introspection -----------------------------------------------------

    @property
    def history(self) -> List[PlatformEvent]:
        """Return a copy of recent events (oldest first)."""
        with self._lock:
            return list(self._history)

    def subscriber_count(self, type_filter: Optional[str] = None) -> int:
        """Count subscribers, optionally filtered by ``type_filter``."""
        with self._lock:
            if type_filter is None:
                return len(self._subscribers)
            return sum(1 for tf, _ in self._subscribers if tf == type_filter)

    def clear_history(self) -> None:
        """Drop all retained events. Subscribers are not affected."""
        with self._lock:
            self._history.clear()


def _filter_matches(filter_: str, event_type: str) -> bool:
    """Match an event type against a subscription filter.

    Rules
    -----
    * ``"*"`` matches everything.
    * Exact equality matches.
    * Otherwise the filter is treated as a dotted prefix; it matches when
      ``event_type == filter_`` or starts with ``filter_ + "."``.
    """
    if filter_ == "*":
        return True
    if filter_ == event_type:
        return True
    return event_type.startswith(filter_ + ".")


# -- default singleton ----------------------------------------------------

_default_bus: Optional[EventBus] = None
_default_bus_lock = threading.Lock()


def get_default_bus() -> EventBus:
    """Return the process-wide default :class:`EventBus`.

    Created lazily on first call so import order doesn't matter. The default
    bus keeps the last 256 events in history.
    """
    global _default_bus
    if _default_bus is None:
        with _default_bus_lock:
            if _default_bus is None:
                _default_bus = EventBus(name="platform", history_limit=256)
    return _default_bus


def reset_default_bus() -> None:
    """Drop the default bus. Intended for tests; do not call from app code."""
    global _default_bus
    with _default_bus_lock:
        _default_bus = None
