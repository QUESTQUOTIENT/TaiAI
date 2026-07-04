"""Package marker for the diagnostics service.

Currently exposes the events-bus observer. Future modules (log
forwarder, health aggregator, alert rules engine) will live alongside it.
"""

from .observer import get_observer, reset_observer

__all__ = ["get_observer", "reset_observer"]
