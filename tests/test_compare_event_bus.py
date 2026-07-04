"""Tests for the Compare Mode event-bus migration.

Mirrors the cookbook event tests: import the route module directly,
inject a fresh EventBus, and assert the right events are emitted.
"""

from __future__ import annotations

import importlib.machinery
import importlib.util
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from core.events import EventBus, PlatformEvent, get_default_bus, reset_default_bus


def _load_compare_module():
    """Import routes/compare_routes.py.

    The file's UTF-8 bytes don't decode cleanly under Windows cp1252;
    use ``SourceFileLoader`` directly (same trick as cookbook tests).
    """
    path = Path(__file__).resolve().parent.parent / "routes" / "compare_routes.py"
    loader = importlib.machinery.SourceFileLoader(
        "compare_routes_under_test", str(path)
    )
    spec = importlib.util.spec_from_loader("compare_routes_under_test", loader)
    mod = importlib.util.module_from_spec(spec)
    loader.exec_module(mod)  # type: ignore[union-attr]
    return mod


def _find_route_handler(router, suffix: str, method: str):
    """Return the underlying function behind a @router.<method>(suffix).

    Compare Mode registers its router with ``prefix=/api/compare`` and
    ``{comp_id}`` parameters in the path. We match by suffix rather
    than full path because the FastAPI router stores ``{comp_id}`` as
    the path component.
    """
    for route in router.routes:
        if getattr(route, "path", "").endswith(suffix) and method.upper() in getattr(route, "methods", set()):
            return route.endpoint
    raise LookupError(f"no route for {method} .../{suffix}")


@pytest.fixture
def compare_module():
    return _load_compare_module()


@pytest.fixture
def bus():
    return EventBus(name="test", history_limit=100)


@pytest.fixture
def start_handler(compare_module, bus):
    """Build the router, monkey-patch get_current_user so request.state is irrelevant,
    then return (start_endpoint, bus) so tests can call the endpoint with the bus
    injected via FastAPI's Depends machinery."""
    from core.session_manager import SessionManager

    router = compare_module.setup_compare_routes(
        session_manager=MagicMock(spec=SessionManager),
    )
    return _find_route_handler(router, "/start", "POST"), bus


def _request_with_user(user=None):
    req = MagicMock()
    req.state = MagicMock(current_user=user)
    # The route reads form fields, not body. Build a minimal Form-style
    # request that returns our canned form values from .form().
    req.scope = {"type": "http"}
    return req


# -- happy path ---------------------------------------------------------


class TestCompareStartEvents:
    def test_start_emits_started_and_completed(self, start_handler):
        handler, bus = start_handler
        req = _request_with_user(user="alice")

        # Pass an endpoint URL — the handler validates that at least
        # one of endpoint_a/b or endpoint_a_id/b_id is non-empty.
        result = handler(
            request=req,
            prompt="Compare these models",
            model_a="gpt-4",
            model_b="claude",
            endpoint_a="http://localhost:1234/v1",
            endpoint_b="http://localhost:5678/v1",
            endpoint_a_id="",
            endpoint_b_id="",
            is_blind="true",
            bus=bus,
        )

        types = [e.type for e in bus.history]
        assert "compare.start.started" in types
        assert "compare.start.completed" in types

        started = [e for e in bus.history if e.type == "compare.start.started"][0]
        completed = [e for e in bus.history if e.type == "compare.start.completed"][0]
        assert started.payload["model_a"] == "gpt-4"
        assert started.payload["model_b"] == "claude"
        assert started.payload["is_blind"] == "true"
        assert completed.payload["owner"] == "alice"
        # The completed event must carry the same comparison_id the
        # caller will receive in the response — that's the correlation
        # hook for downstream subscribers.
        assert completed.payload["comparison_id"] == result["id"]


# -- bus resilience -----------------------------------------------------


class TestCompareBusResilience:
    def test_routes_work_when_bus_is_none(self, compare_module):
        """If ``get_default_bus`` returns ``None`` (events module
        absent or bus destroyed), the route handlers must still work
        — events are observability, not a hard dependency.
        """
        from core.session_manager import SessionManager
        router = compare_module.setup_compare_routes(
            session_manager=MagicMock(spec=SessionManager),
        )
        start = _find_route_handler(router, "/start", "POST")

        # FastAPI's Depends will resolve get_default_bus at request time;
        # we simulate the None case by passing bus=None directly.
        req = _request_with_user(user="alice")
        result = start(
            request=req,
            prompt="test",
            model_a="a",
            model_b="b",
            endpoint_a="http://localhost:1234/v1",
            endpoint_b="http://localhost:5678/v1",
            endpoint_a_id="",
            endpoint_b_id="",
            is_blind="false",
            bus=None,
        )
        assert "id" in result

    def test_uses_default_bus_via_dependency(self, compare_module):
        """The handler's signature must declare ``bus: EventBus =
        Depends(get_default_bus)`` so FastAPI wires the default bus
        automatically when the route is mounted."""
        from core.session_manager import SessionManager
        router = compare_module.setup_compare_routes(
            session_manager=MagicMock(spec=SessionManager),
        )
        start = _find_route_handler(router, "/start", "POST")
        import inspect
        sig = inspect.signature(start)
        bus_param = sig.parameters.get("bus")
        assert bus_param is not None
        assert hasattr(bus_param.default, "dependency")
        assert bus_param.default.dependency is get_default_bus
