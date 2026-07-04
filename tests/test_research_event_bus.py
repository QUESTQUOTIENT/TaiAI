"""Tests for the Research event-bus migration.

Verifies:
- /api/research/cancel/{id} emits events on the shared bus
- /api/research/result/{id} emits events on the shared bus
- /api/research/result/{id} failure paths emit failure events
- The handler uses FastAPI Depends(get_default_bus) idiomatically
"""

from __future__ import annotations

import asyncio
import importlib.machinery
import importlib.util
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from core.events import EventBus, get_default_bus, reset_default_bus


def _load_research_module():
    """Import routes/research_routes.py via SourceFileLoader (handles
    UTF-8 source that doesn't decode under Windows cp1252)."""
    path = Path(__file__).resolve().parent.parent / "routes" / "research_routes.py"
    loader = importlib.machinery.SourceFileLoader(
        "research_routes_under_test", str(path)
    )
    spec = importlib.util.spec_from_loader("research_routes_under_test", loader)
    mod = importlib.util.module_from_spec(spec)
    loader.exec_module(mod)  # type: ignore[union-attr]
    return mod


def _find_route_handler(router, suffix: str, method: str):
    for route in router.routes:
        if getattr(route, "path", "").endswith(suffix) and method.upper() in getattr(route, "methods", set()):
            return route.endpoint
    raise LookupError(f"no route for {method} .../{suffix}")


def _request_with_user(user: str = "alice"):
    req = MagicMock()
    req.state = MagicMock(current_user=user)
    req.scope = {"type": "http"}
    return req


@pytest.fixture
def research_module():
    return _load_research_module()


@pytest.fixture
def bus():
    return EventBus(name="test", history_limit=100)


# -- cancel handler ---------------------------------------------------


class TestResearchCancelEvents:
    def test_cancel_emits_completed_event(
        self, research_module, bus, monkeypatch
    ):
        # The handler calls research_handler.cancel_research(session_id);
        # mock it to return True so the success path fires.
        research_module.research_handler = MagicMock()
        research_module.research_handler.cancel_research.return_value = True
        # ``_owns_in_memory`` reads from ``research_handler._active_tasks``;
        # seed an entry whose owner matches the request user so the
        # not-found branch is bypassed.
        research_module.research_handler._active_tasks = {
            "abc-123": {"owner": "alice"},
        }

        router = research_module.setup_research_routes(
            research_handler=research_module.research_handler,
        )
        cancel = _find_route_handler(router, "/cancel/{session_id}", "POST")
        result = asyncio.run(cancel(
            session_id="abc-123", request=_request_with_user("alice"), bus=bus
        ))
        assert result == {"cancelled": True}

        types = [e.type for e in bus.history]
        assert "research.cancel.completed" in types
        completed = [e for e in bus.history
                     if e.type == "research.cancel.completed"][0]
        assert completed.payload["cancelled"] is True
        assert completed.payload["session_id"] == "abc-123"
        assert completed.payload["owner"] == "alice"

    def test_cancel_not_found_emits_failed_event(
        self, research_module, bus, monkeypatch
    ):
        research_module.research_handler = MagicMock()
        # No active task for this session id, and no on-disk JSON.
        research_module.research_handler._active_tasks = {}
        router = research_module.setup_research_routes(
            research_handler=research_module.research_handler,
        )
        cancel = _find_route_handler(router, "/cancel/{session_id}", "POST")
        with pytest.raises(Exception):
            asyncio.run(cancel(
                session_id="nope", request=_request_with_user(), bus=bus
            ))

        failed = [e for e in bus.history
                  if e.type == "research.cancel.failed"]
        assert len(failed) == 1
        assert failed[0].payload["reason"] == "not_found"


# -- result handler ---------------------------------------------------


class TestResearchResultEvents:
    def test_result_delivered_emits_success_event(
        self, research_module, bus, monkeypatch
    ):
        research_module.research_handler = MagicMock()
        research_module.research_handler.get_result.return_value = "report text"
        research_module.research_handler.get_sources.return_value = [{"url": "x"}]
        research_module.research_handler.get_raw_findings.return_value = [{"f": 1}]
        research_module.research_handler._active_tasks = {
            "s1": {"owner": "bob"},
        }

        router = research_module.setup_research_routes(
            research_handler=research_module.research_handler,
        )
        result_fn = _find_route_handler(router, "/result/{session_id}", "POST")
        asyncio.run(result_fn(
            session_id="s1", request=_request_with_user("bob"), bus=bus
        ))

        delivered = [e for e in bus.history
                      if e.type == "research.result.delivered"]
        assert len(delivered) == 1
        payload = delivered[0].payload
        assert payload["owner"] == "bob"
        assert payload["sources_count"] == 1
        assert payload["raw_findings_count"] == 1
        assert payload["result_len"] == len("report text")

    def test_result_no_result_emits_failed_event(
        self, research_module, bus, monkeypatch
    ):
        research_module.research_handler = MagicMock()
        research_module.research_handler.get_result.return_value = None
        research_module.research_handler._active_tasks = {
            "s1": {"owner": "alice"},
        }

        router = research_module.setup_research_routes(
            research_handler=research_module.research_handler,
        )
        result_fn = _find_route_handler(router, "/result/{session_id}", "POST")
        with pytest.raises(Exception):
            asyncio.run(result_fn(
                session_id="s1", request=_request_with_user(), bus=bus
            ))

        failed = [e for e in bus.history
                  if e.type == "research.result.failed"]
        assert len(failed) == 1
        assert failed[0].payload["reason"] == "no_result"


# -- bus resilience ---------------------------------------------------


class TestResearchBusResilience:
    def test_works_without_bus(self, research_module, monkeypatch):
        """If the bus param resolves to None (events module missing),
        the route still works — events are observability."""
        research_module.research_handler = MagicMock()
        research_module.research_handler.cancel_research.return_value = False
        research_module.research_handler._active_tasks = {
            "x": {"owner": "alice"},
        }
        router = research_module.setup_research_routes(
            research_handler=research_module.research_handler,
        )
        cancel = _find_route_handler(router, "/cancel/{session_id}", "POST")
        result = asyncio.run(cancel(
            session_id="x", request=_request_with_user(), bus=None
        ))
        assert "cancelled" in result

    def test_uses_default_bus_dependency(self, research_module):
        """The handler signature must declare ``bus: EventBus =
        Depends(get_default_bus)`` so FastAPI wires the default bus
        automatically when the route is mounted."""
        research_module.research_handler = MagicMock()
        router = research_module.setup_research_routes(
            research_handler=research_module.research_handler,
        )
        cancel = _find_route_handler(router, "/cancel/{session_id}", "POST")
        import inspect
        sig = inspect.signature(cancel)
        bus_param = sig.parameters.get("bus")
        assert bus_param is not None
        assert hasattr(bus_param.default, "dependency")
        assert bus_param.default.dependency is get_default_bus
