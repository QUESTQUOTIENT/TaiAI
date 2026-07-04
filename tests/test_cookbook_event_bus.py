"""Tests for the cookbook event-bus migration.

We test the route handler ``cookbook_error_categorize`` directly — bypassing
the FastAPI router — so we can:

* inject a fresh :class:`EventBus` to capture emitted events
* bypass ``require_admin`` by passing a request whose auth check returns OK
* skip standing up the full app + database

The handler at ``routes.cookbook_routes.py`` is normally decorated by
``@router.post(...)``; FastAPI's router replaces the function with a
dependency-injection wrapper. We grab the original via the route's
``endpoint`` attribute, which is what FastAPI stores there.
"""

from __future__ import annotations

import importlib.machinery
import importlib.util
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from core.events import EventBus, PlatformEvent, get_default_bus, reset_default_bus


# -- helpers ----------------------------------------------------------


def _load_cookbook_module():
    """Import routes/cookbook_routes.py.

    The file's UTF-8 bytes don't decode cleanly under Windows cp1252; we
    read with explicit UTF-8 to avoid the same codec error that breaks
    ``test_document_editor_scroll.py``.
    """
    path = Path(__file__).resolve().parent.parent / "routes" / "cookbook_routes.py"
    # SourceFileLoader works for files without a ``.py`` extension; use
    # it directly (same trick as the backup integration tests).
    loader = importlib.machinery.SourceFileLoader(
        "cookbook_routes_under_test", str(path)
    )
    spec = importlib.util.spec_from_loader("cookbook_routes_under_test", loader)
    mod = importlib.util.module_from_spec(spec)
    loader.exec_module(mod)  # type: ignore[union-attr]
    return mod


def _find_route_handler(router, path: str, method: str):
    """Return the underlying async function behind @router.<method>(path)."""
    for route in router.routes:
        if getattr(route, "path", None) == path and method.upper() in getattr(route, "methods", set()):
            return route.endpoint
    raise LookupError(f"no route for {method} {path}")


def _make_request(*, body: bytes | None = None, json_body=None, is_admin: bool = True):
    """Build a Starlette Request-like object sufficient for the handler.

    The handler calls ``request.json()`` and ``require_admin(request)``.
    ``require_admin`` checks for an authenticated admin user — we mock it.
    """
    req = MagicMock()
    if json_body is not None:
        # FastAPI's Request.json() is async and returns the parsed dict.
        async def _json():
            return json_body
        req.json = _json
    else:
        async def _json():
            raise ValueError("no body")
        req.json = _json
    # require_admin looks at request.state.user / request.headers; mock OK.
    req.state = MagicMock()
    req.headers = {}
    req.scope = {"type": "http", "user": "admin" if is_admin else None}
    return req


# -- fixtures ---------------------------------------------------------


@pytest.fixture
def cookbook_module():
    return _load_cookbook_module()


@pytest.fixture
def handler(cookbook_module):
    router = cookbook_module.setup_cookbook_routes()
    return _find_route_handler(router, "/api/cookbook/error/categorize", "POST")


@pytest.fixture
def bus():
    """A fresh bus per test — keeps histories isolated."""
    return EventBus(name="test", history_limit=100)


# -- emitted-event tests ---------------------------------------------


class TestCategorizeEvents:
    @pytest.mark.asyncio
    async def test_started_and_completed_events_emitted(self, handler, bus):
        # Patch require_admin to be a no-op so the test doesn't need real auth.
        # We do this by swapping the module attribute the handler closes over.
        import routes.cookbook_routes as cr_mod
        original = cr_mod.require_admin
        cr_mod.require_admin = lambda req: None  # no-op auth
        try:
            req = _make_request(json_body={"text": "permission denied: /var/log/foo"})
            result = await handler(req, bus=bus)
        finally:
            cr_mod.require_admin = original

        # Result shape preserved.
        assert result["category"] == "permission"
        assert "permission" in result["fix"].lower() or "permission" in result["excerpt"]

        # Two events emitted, in order: started then completed.
        events = bus.history
        assert len(events) == 2
        assert events[0].type == "cookbook.error.categorize.started"
        assert events[0].status == "started"
        assert events[1].type == "cookbook.error.categorize.completed"
        assert events[1].status == "succeeded"
        assert events[1].progress == 100
        assert events[1].payload["category"] == "permission"

        # Same id ties the two events together.
        assert events[0].id == events[1].payload["id"]

    @pytest.mark.asyncio
    async def test_invalid_json_emits_failed_event(self, handler, bus):
        import routes.cookbook_routes as cr_mod
        original = cr_mod.require_admin
        cr_mod.require_admin = lambda req: None
        try:
            req = _make_request(json_body=None)  # request.json() raises
            with pytest.raises(Exception):  # HTTPException or its str form
                await handler(req, bus=bus)
        finally:
            cr_mod.require_admin = original

        events = bus.history
        # started + failed
        assert len(events) == 2
        assert events[0].type.endswith(".started")
        assert events[1].type == "cookbook.error.categorize.failed"
        assert events[1].payload["reason"] == "invalid_json"
        assert events[1].payload["id"] == events[0].id

    @pytest.mark.asyncio
    async def test_non_string_text_emits_failed_event(self, handler, bus):
        import routes.cookbook_routes as cr_mod
        original = cr_mod.require_admin
        cr_mod.require_admin = lambda req: None
        try:
            req = _make_request(json_body={"text": 12345})
            with pytest.raises(Exception):
                await handler(req, bus=bus)
        finally:
            cr_mod.require_admin = original

        events = bus.history
        assert any(
            e.type == "cookbook.error.categorize.failed"
            and e.payload.get("reason") == "text_not_string"
            for e in events
        )

    @pytest.mark.asyncio
    async def test_unknown_text_emits_completed_with_unknown_category(self, handler, bus):
        import routes.cookbook_routes as cr_mod
        original = cr_mod.require_admin
        cr_mod.require_admin = lambda req: None
        try:
            req = _make_request(json_body={"text": "completely benign message"})
            result = await handler(req, bus=bus)
        finally:
            cr_mod.require_admin = original

        assert result["category"] == "unknown"
        events = bus.history
        completed = [e for e in events if e.type.endswith(".completed")][0]
        assert completed.payload["category"] == "unknown"

    @pytest.mark.asyncio
    async def test_completed_payload_does_not_leak_full_text(self, handler, bus):
        """The completed event must carry excerpt_len, not the original text.

        Large error blobs (multi-MB tracebacks) shouldn't be replicated
        into every subscriber's history.
        """
        import routes.cookbook_routes as cr_mod
        original = cr_mod.require_admin
        cr_mod.require_admin = lambda req: None
        try:
            req = _make_request(json_body={"text": "permission denied"})
            await handler(req, bus=bus)
        finally:
            cr_mod.require_admin = original

        completed = [e for e in bus.history if e.type.endswith(".completed")][0]
        # The full text must not appear in the payload.
        assert "permission denied" not in str(completed.payload)
        assert "excerpt_len" in completed.payload
        assert completed.payload["excerpt_len"] >= 0

    @pytest.mark.asyncio
    async def test_event_correlation_works_across_subscribers(self, handler, bus):
        """A subscriber filtering on the cookbook prefix sees started+completed."""
        import routes.cookbook_routes as cr_mod
        original = cr_mod.require_admin
        cr_mod.require_admin = lambda req: None
        try:
            req = _make_request(json_body={"text": "cuda out of memory"})
            await handler(req, bus=bus)
        finally:
            cr_mod.require_admin = original

        # Drain events through a cookbook-only subscriber.
        cookbook_events: list[PlatformEvent] = []
        bus.subscribe(lambda e: cookbook_events.append(e), type_filter="cookbook")
        req = _make_request(json_body={"text": "vram exhausted"})
        await handler(req, bus=bus)
        # The second call's events should land in cookbook_events.
        assert any(e.type.endswith(".started") for e in cookbook_events)
        assert any(e.type.endswith(".completed") for e in cookbook_events)


# -- default-bus integration ------------------------------------------


class TestDefaultBusIntegration:
    """The handler's ``bus`` parameter is ``Depends(get_default_bus)``,
    which is only resolved by FastAPI's dependency-injection machinery.
    Calling the handler directly (as we do in the tests above) bypasses
    that machinery — so the default-bus path is exercised in production
    only via the live router. We assert the dependency wiring instead of
    trying to invoke the dependency-free path.
    """

    def test_handler_uses_default_bus_dependency(self, handler):
        """Inspect the handler's signature: ``bus`` should be a FastAPI
        ``Depends(get_default_bus)`` default. This is what guarantees
        that, in production, the handler publishes events to the
        process-wide bus without the route code caring where it came
        from.
        """
        import inspect
        sig = inspect.signature(handler)
        bus_param = sig.parameters.get("bus")
        assert bus_param is not None, "handler must take a bus parameter"
        assert bus_param.default is not inspect.Parameter.empty
        # FastAPI's Depends has a ``dependency`` attribute pointing at
        # the callable it wraps.
        default = bus_param.default
        assert hasattr(default, "dependency"), (
            "bus default should be a FastAPI Depends marker; got "
            f"{type(default).__name__}"
        )
        assert default.dependency is get_default_bus
