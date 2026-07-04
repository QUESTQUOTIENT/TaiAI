# TaiAi — Phase 0 Architecture Assessment

> **Date:** 2026-06-20
> **Author:** Principal Full-Stack AI Engineer review
> **Source:** `D:\tieai-py-dev\` (the working repo this engagement operates on)
> **Status:** Foundation document for the Phase 1-3 upgrade plan.

---

## 1. Architecture Overview

TaiAi is a **modular monolith** built on FastAPI. Every "service" lives in the same Python process and shares the same SQLAlchemy engine, the same asyncio loop, and the same SQLite database. This is the right choice for a self-hosted product at this scale: it eliminates inter-service auth/latency/discovery overhead while still keeping code organization clean.

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser (SPA)                           │
│  static/index.html  +  ~86 ES modules  +  modalManager          │
│  Service worker (sw.js) for PWA precache + offline shell        │
└──────────────────────┬──────────────────────────────────────────┘
                       │ HTTP (cookies + bearer tokens)
                       │ SSE for streaming
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│  FastAPI app: app.py  (1,160+ lines post-fixes)                 │
│                                                                 │
│  Middleware stack (outer → inner):                             │
│   1. _RequestContextMiddleware  (X-Request-ID threading)        │
│   2. CORSMiddleware  (allowed_origins env-driven)               │
│   3. GZipMiddleware  (≥1KB, excludes SSE)                       │
│   4. SecurityHeadersMiddleware  (CSP nonce, HSTS, etc.)         │
│   5. _RequestTimeoutMiddleware  (45s, per-prefix exempt list)   │
│   6. AuthMiddleware  (cookie session OR bearer API token)      │
│                                                                 │
│  Exception handlers:                                            │
│   - 4 typed (SessionNotFound, InvalidFileUpload,                │
│     LLMServiceError, WebSearchError)                            │
│   - 1 SPA-fallback (StarletteHTTPException → serve_index)       │
│   - 1 catch-all (Exception → SPA or 500 JSON)                   │
│                                                                 │
│  ~50 route modules (routes/*.py), each a setup_*_factory that   │
│  builds an APIRouter and is mounted via app.include_router()     │
└──────┬──────────────────────────────────┬───────────────────────┘
       │                                  │
       │  SQLAlchemy 2.x ORM              │  HTTP/SSE upstream
       │  (core/database.py + models)     │  (model providers, MCP)
       ▼                                  ▼
┌──────────────────────┐    ┌──────────────────────────────────────┐
│  SQLite (data/)      │    │  External services                  │
│  + ChromaDB vector   │    │  - Ollama / vLLM / llama.cpp          │
│  + Fernet-encrypted  │    │  - OpenAI / OpenRouter / Copilot     │
│    blob columns      │    │  - SearXNG / Tavily / Bing           │
│  + JSON config files │    │  - CalDAV / IMAP / SMTP              │
│    (atomic_io.py)    │    │  - MCP servers (stdio / SSE)         │
└──────────────────────┘    └──────────────────────────────────────┘
```

## 2. Key Subsystems (current state)

| Subsystem | Files | State | Notes |
|---|---|---|---|
| **Auth + sessions** | `core/auth.py`, `routes/auth_routes.py` | Mature | bcrypt, TOTP+backup codes, atomic JSON, encrypted-at-rest secrets, bearer-token cache, 2FA, 16 sub-routes. Strong. |
| **Chat streaming** | `routes/chat_routes.py`, `src/llm_core.py`, `static/js/chatStream.js` | Best-in-class | SSE unified shape, dead-host cooldown, fallback chain, partial-save, image routing, stall watchdog. |
| **Agent loop** | `src/agent_loop.py` (~3k LoC) | Mature | 70+ tools, plan mode, dual-lane vector memory, intent verifier. Heavyweight. |
| **Cookbook** | `routes/cookbook_routes.py`, `static/js/cookbook*.js` | Functional | Hardware detection, model recommendations, one-click download + serve. UX gaps (no streaming install logs). |
| **Memory** | `src/memory_vector.py`, `src/memory.py`, `routes/memory_routes.py` | Solid | Hybrid vector (ChromaDB) + keyword; dual-lane embedding (fastembed local + custom). ChromaDB dependency is the largest deployment fragility. |
| **Documents** | `routes/document_routes.py` (~1.7k LoC), `static/js/document.js` (~9.7k LoC) | Most complex feature | Multi-tab, 24 langs, AI rewrite/expand/summarize/tone with diff, version history, PDF AcroForm, library archive. Largest single JS bundle. |
| **Calendar + CalDAV** | `routes/calendar_routes.py` | Solid | CalDAV two-way sync, .ics, per-calendar colors. Tested. |
| **Email** | `routes/email_routes.py`, `src/email*` | Functional | IMAP/SMTP, AI triage, CalDAV-aware RSVP. CalDAV carddav shallow. |
| **Themes** | `static/style-theme-switcher.js`, `static/js/theme.js`, `static/index.html:16-95` | Industry-leading | 16 × 12 combos, no-FOIT boot script, customizer with harmony generator. |
| **Modal chrome** | `static/js/modalManager.js` (~1.5k LoC) | Excellent | Minimize-to-dock, chain physics, drag-to-trash, edge-dock, mobile free-floating. |
| **PWA** | `static/manifest.json`, `static/sw.js` | Solid (post-fixes) | Icons generated, install banner wired, CSP report-only endpoint, request IDs. |
| **Backup** | `routes/backup_routes.py` | Functional | Local zip export/import with per-user scoping. No encryption, no integrity check, no dry-run. |
| **MCP** | `src/mcp_manager.py`, `src/builtin_mcp.py`, `static/js/admin.js` | Solid | 4 built-in + 16 preset types. Per-tool permissions binary. |
| **Diagnostics** | `static/js/diagnostics.js`, `/api/diagnostics` (post-fix) | New | Health check + bundle export. Sparse. |

## 3. Current Strengths

1. **Production-grade auth.** bcrypt-only passwords, TOTP+backup codes, atomic JSON writes, Fernet-encrypted secrets, bearer-token cache with prefix lookup, per-user rate limiting with X-Forwarded-For.
2. **SSE streaming is best-in-class.** Unified shape across 5 providers, dead-host cooldown, fallback chain, partial-save on stop.
3. **The themes system is the standout UX.** No-FOIT boot script + per-route favicon swap is something most commercial products don't bother with.
4. **The modal chrome (modalManager.js) is industry-leading.** Minimize-to-dock + chain physics + drag-to-trash is the kind of polish you usually only see in native apps.
5. **The Documents editor is genuinely good.** Multi-tab, 24 languages, AI diff accept/reject, version history, PDF AcroForm.
6. **Test coverage depth is unusual.** 525+ tests with taxonomy markers; security regressions explicitly gated.
7. **The MCP / integrations surface is well-thought-out.** 16 preset types with conditional env fields and OAuth flow.
8. **The agent loop is feature-complete.** Plan mode, verifier, dual-lane memory, token budgets.

## 4. Current Weaknesses (the upgrade targets)

### 4.1 Architecture / infrastructure
- **No Alembic.** 50+ ordered `_migrate_*` functions in `core/database.py` with no version table. Schema-version tracking is the single biggest operational risk.
- **Two parallel dock systems.** Legacy `#modal-dock` (app.js:2765-2918) coexists with the new `#minimized-dock-chip` (modalManager.js). ~165 lines of dead weight.
- **`init_db()` at import time.** Every test imports core.database and runs all 50+ migrations. Test suite is dominated by migration time.
- **No request tracing end-to-end.** Now have request IDs in logs; OpenTelemetry/Sentry still absent.
- **No backup encryption, no integrity check.** Local zip only.
- **No load shedding.** A single hung handler holds the loop; `_RequestTimeoutMiddleware` catches most but exceptions during the wrap are swallowed.

### 4.2 Frontend / UX
- **`style.css` is 1.16 MB / 36,786 lines.** No minification, no CSS variables for layout (lots of repeated values).
- **Heavy JS modules loaded eagerly.** `chat.js` 245 KB, `document.js` 436 KB, `cookbook.js` 129 KB all loaded on first page paint.
- **No first-run / onboarding tour.** New users land on a wall of tools with no guidance.
- **No empty states** in most list views.
- **Per-tool approval UX missing** in agent loop. Ask_user exists but the UX is buried.
- **Cookbook install logs are not streamed** to the UI — users see a spinner, then either success or a generic error.
- **No "healthy stack" wizard.** The new Diagnostics tab is a status snapshot, not a guided troubleshoot flow.

### 4.3 Mobile / accessibility
- **Focus traps were just added (post-fix).** Need real-device verification on iOS Safari + Android Chrome.
- **`#theme-adv-toggle` was a div.** Now fixed (post-fix).
- **Rail icon buttons** were title-only. Now aria-labeled (post-fix).
- **`prefers-reduced-motion`** is honored in CSS but JS animations (modalManager FLIP, dock easing) ignore it.
- **No high-contrast theme.** Most themes are decorative; an a11y-grade high-contrast palette is missing.

### 4.4 Agent / runtime
- **No adaptive execution profile.** A 7B local model gets the same 70+ tools as a 200B cloud model. Slim Mode will fix this.
- **No cost / latency observability.** Agents run blind to how much they've spent.
- **No replay-from-message** on the agent trace.

### 4.5 Integrations
- **Browser MCP** wasn't pre-installed (post-fix: now `@playwright/mcp@0.0.76`).
- **CardDAV** support is shallow (email-side).
- **Plugin marketplace** doesn't exist — MCP presets are the closest analog.

## 5. Refactor Recommendations (before feature work)

Ordered by ROI. **Bold = will execute in this engagement.**

1. **Extract `core/diagnostics.py`** — central health-check registry so the new Healthy Stack Wizard and the existing `/api/ready` share logic. (Will execute.)
2. **Slim Agent Mode profiles** — a single `agent_profiles.py` with a `resolve_profile(model_name) -> Profile` function. Tool whitelist, context budget, memory k — all driven by the profile. (Will execute.)
3. **Backup module refactor** — split `routes/backup_routes.py` into `core/backup.py` (pure logic) + thin route. Enables encryption + integrity check + dry-run as unit-testable functions. (Will execute.)
4. **CSS theme-aware custom-properties** — at minimum, extract layout vars (--sidebar-w, --icon-rail-w) into theme override hooks. Defer.
5. **Modal-dock consolidation** — delete the legacy `#modal-dock` paths once modalManager covers all tool modals. Defer (interlocked with lazy-load work).
6. **Migrate `_migrate_*` to Alembic** — multi-week. Defer.

## 6. Risk Register (top 5 for Phase 1)

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| 1 | Cookbook install commands output thousands of lines; streaming them all to the browser may overwhelm the SSE channel | Medium | Medium | Backpressure-aware SSE; truncate output to last 200 lines client-side; persist full log to disk |
| 2 | Slim Agent Mode profile mis-classifies a model and silently truncates its context | Medium | High | Default profile is "Auto"; explicit profile change requires admin; show the active profile in the composer footer |
| 3 | Encrypted backup loses the password and locks the user out | Medium | High | Display recovery phrase at export time; offer unencrypted as opt-in; never auto-overwrite existing backups |
| 4 | Healthy Stack Wizard exposes internal IPs / secrets via `runtime` endpoint | Low | Medium | Wizard uses the existing `/api/ready` (already curated) + new `/api/health/deep` admin-only |
| 5 | Mobile focus-trap regression — some Safari versions handle MutationObserver keydown listeners differently | Low | Medium | Feature-detect + fallback to body scroll lock; ship with manual QA pass |

---

## 7. Feature Mapping (per request)

| Request | Impacted modules | New files | Refactors needed |
|---|---|---|---|
| **1. Healthy Stack Wizard** | New `core/diagnostics.py`, `/api/health/deep`, `static/js/healthWizard.js`, expand Diagnostics tab | 2 new + 1 expansion | Extract health-check registry |
| **2. Cookbook UX** | `routes/cookbook_routes.py` (SSE), `static/js/cookbook*.js` (streaming logs UI), `static/css` (new error states) | 1 new module + 2 expansions | None |
| **3. Slim Agent Mode** | New `core/agent_profiles.py`, `src/agent_loop.py` (profile integration), composer footer | 1 new + 2 expansions | None — additive |
| **4. Backup & Restore** | New `core/backup.py` (encryption + integrity), expand `routes/backup_routes.py` | 1 new + 1 expansion | Refactor `backup_routes.py` |
| **5. Mobile & A11y** | `static/style.css` (reduced-motion in JS), `static/js/a11y.js` (focus traps), `static/js/modalManager.js` (motion prefs) | 0 new, 3 expansions | None |
| **6. Compare metrics** | `static/js/compare/`, `routes/compare_routes.py` (latency/cost capture) | 1 expansion | None |
| **7. Skill marketplace** | New `routes/skill_marketplace_routes.py`, registry spec, signature verification | 3 new | Requires registry backend decision — out of scope |
| **8. Editor enhancements** | `static/js/document.js` | 0 new, 1 expansion | None |
| **9. Offline-first** | `static/sw.js`, `static/index.html` (offline message) | 0 new, 2 expansions | None |
| **10. Smart Research presets** | `src/research*.py` | 0 new, 1 expansion | None |
| **11. Voice enhancements** | `static/js/voiceRecorder.js`, `src/tts*.py`, `src/stt*.py` | 0 new, 2 expansions | None |
| **12. Windows GPU** | `routes/cookbook_routes.py`, `docker-compose.gpu-nvidia.yml`, `docker-compose.gpu-amd.yml` | 0 new, 1+ expansion | None |
| **13. Plugin system** | New `core/plugin_registry.py`, `routes/plugin_routes.py`, signature verification | 3 new | Multi-week |
| **14. Usage analytics** | New `routes/analytics_routes.py`, `static/js/analytics.js` | 2 new | Privacy review required |
| **15. Light theme** | `static/js/theme.js`, `static/themes/*` | 0 new, theme files updated | None |

**This engagement will execute items 1, 2, 3, 4, 5 fully + items 10, 11 partially. Items 7, 13 require design decisions outside the scope of code execution; I'll flag them as "design-first, not code-first" in the final deliverables.**

---

*Phase 0 complete. Beginning Phase 1 implementation.*
