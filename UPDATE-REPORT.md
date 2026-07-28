# TaiAi — Update Execution Report

**Date:** 2026-07-28
**Branch:** `arena/019fa707-taiai` · **Baseline:** `362866c` on `main`
**Companion docs:** [`AUDIT.md`](AUDIT.md) (findings) · [`UPDATE-PLAN.md`](UPDATE-PLAN.md) (plan)

> **⚠️ One part of this pass could not be pushed.** The automation account
> authenticates as a GitHub App without the `workflows` permission, so GitHub
> rejects any commit touching `.github/workflows/`. Those three files are
> therefore staged as a patch at
> [`docs/pending/ci-workflows.patch`](docs/pending/ci-workflows.patch) with
> apply instructions in [`docs/pending/README.md`](docs/pending/README.md).
> Everything else — dependency upgrades, test fixes, source bug fixes,
> `core/degraded.py` — is committed normally. The CI changes were written and
> verified locally (ruff clean, 162/162 `node --check`, pip-audit clean,
> zizmor 0 high/medium) before being extracted.

Every claim here was verified by running the thing, not by reading the diff.

---

## 1. Before / after

| Gate | Before | After |
|---|---|---|
| `python -m pytest -q` (CI's command) | **INTERNALERROR — 0 tests ran** | **3433 passed, 2 skipped** |
| Suite determinism | failing set *changed* between identical runs | **identical across 3 consecutive runs** |
| Test failures | 27 failed + 3 errors | **0** |
| `pip-audit --strict` | **crashed on arg parsing — never scanned** | **"No known vulnerabilities found"** |
| Known CVEs | **26 across 4 packages** | **0** |
| `requirements.lock` on Linux | **uninstallable** (`pywin32==312`) | installs |
| `node --check` (non-vendored JS) | **2 files fail**, 4 never checked | **162/162 pass** |
| ruff `E9,F63,F7,F82` | not run | **clean** (5 real bugs fixed) |
| zizmor medium/high | **4 high + 5 medium** | **0** |
| Live boot | 420 paths | **421 paths / 498 ops**, no tracebacks |

`41 files changed, 1517 insertions(+), 3122 deletions(-)` across 5 code commits.

---

## 2. Bugs found *during* execution that the plan missed

The plan was written from static analysis. Executing it surfaced four defects that reading alone did not.

### 🔴 2a. `static/sw.js` — the service worker never parsed

Widening the CI glob (a housekeeping task) exposed a **second** shipped syntax error. `static/sw.js` closed a `.map()` callback with `)` instead of `})`:

```js
    .catch(() => null)
  )          // ← should be })
)
```

It is registered by **both** `index.html:2520` and `coding.html:422`. The file could not parse, so **PWA offline caching has never worked**. CI's old glob (`static/app.js static/js/**/*.js`) skipped all four top-level `static/*.js` files, so it was structurally invisible.

### 🔴 2b. Five latent `NameError`s that `compileall` cannot see

Adding ruff paid for itself immediately. All five are undefined names on live code paths — the modules import fine and only raise when the line executes:

| Location | Bug | User-visible effect |
|---|---|---|
| `app.py` `health_deep()` | `time.strftime()`, no `import time` | `GET /api/health/deep` → 500 for every admin |
| `app.py` `diagnostics_bundle()` | `APP_VERSION` never imported | `GET /api/diagnostics` → 500 |
| `routes/cleanup_routes.py` | `asyncio.to_thread()`, no `import asyncio` | image retention sweep threw on every session cleanup |
| `routes/cookbook_routes.py` ×2 | `_time.time()`, only `_json/_sp/_aio` imported | cookbook log streaming died mid-stream |

Both admin endpoints were **proven broken then proven fixed** by invoking them directly — `diagnostics_bundle()` now returns `app_version 1.0.0`, `health_deep()` runs 11 checks.

### 🟠 2c. `asyncio_mode` — 22 async tests were silently not running

The plan said "merge the configs". Investigating *which* value to keep found that the discarded `pytest.ini` set `asyncio_mode = strict`, which requires an explicit `@pytest.mark.asyncio`. **110 async tests exist; only 88 are marked.** Under `strict` the other 22 (across 15 files including `test_calendar_rrule.py`, `test_upload_multifile.py`) are collected but never executed — passing without running. Kept `auto`, and documented the trap in `pyproject.toml`.

### 🟠 2d. The Dependabot "skipped CI" diagnosis was wrong

`AUDIT.md` §"Why the four Dependabot PRs are all skipped" claimed `pull_request_target` never matched `ci.yml`. **That was incorrect.** `gh pr checks 4` shows CI *does* run on Dependabot PRs; only the deliberately bot-exempt PR title/description checks skip. The 7 red checks on PR #4 were **genuine failures** — the very bugs this branch fixes.

This also removed the need for the plan's riskiest change: no `pull_request_target` edit to `ci.yml` was made, so no write-token exposure was introduced.

---

## 3. What was done, by phase

### Phase 1 — Restore the gates ✅

- **Deleted `pytest.ini`**, merged into `pyproject.toml`. It shadowed `pyproject.toml` and omitted 5 `area_*` markers that `conftest.py` adds under `--strict-markers`, so collection aborted with `INTERNALERROR: 'area_services' not found in markers`. Kept `asyncio_mode=auto` (see §2c).
- **Fixed `static/js/installBanner.js:91`** — quote nesting. Verified beyond `node --check` by evaluating the HTML builder: 2 `<button>` / 2 `</button>`, `style` attribute correctly terminated.
- **Fixed `pip-audit.yml`** — `--disable-pip` → `--no-deps`. The old flag is rejected outright against a hashless lockfile, so the job died in argument parsing having **never scanned anything**. The 15-second CI run times were the tell.
- **Gated `pywin32==312` behind `sys_platform == "win32"`.** Not one of the 123 pins carried an environment marker; the lock was `pip freeze`d on Windows and would not resolve on Linux.

### Phase 2 — Security debt ✅ (26 → 0)

`pypdf 6.13.3→6.14.2` (4 CVEs), `pillow 12.2.0→12.3.0` (20 advisories, transitive via `qrcode[pil]` for 2FA), `mcp 1.27.2→1.28.1`, `pydantic-settings 2.14.1→2.14.2`, `markitdown 0.1.5→0.1.6`.

Note the irony fixed: `pypdf` was pinned `>=6.13.3 # pip-audit-enforced` **for** a security fix, but enforcement was broken (§1) and 6.13.3 had since collected 4 new CVEs. Comment corrected.

All four fix versions confirmed to exist on PyPI before pinning; suite re-run after upgrading to confirm no regressions from the `pydantic`/`mcp` bumps.

### Phase 3 — Trustworthy suite ✅ (27+3 → 0)

The dominant cause was **not** broken features. It was `filterwarnings = error` turning leaked resources into failures against whichever test happened to be running:

- **Unclosed file handles** — 10 sites across 5 files (`json.load(open(p))`, `open(p).read()`).
- **Unclosed sockets** — `test_caldav_redirect_hardening` called `shutdown()` but never `server_close()`.
- **Leaked event loops** — the real prize. Two files shared a `_run()` helper doing `asyncio.new_event_loop().run_until_complete(coro)` with **no close**. GC fired `BaseEventLoop.__del__` at an arbitrary later point, which is why the failing set moved between runs. **This was the main source of order-dependence.**
- **Un-awaited coroutines** in the scheduler test's fake `create_task`.

Also: chromadb pinned to `1.0.20` in both GPU compose files (they had drifted to `:latest`); `_Req` test double taught `query_params`/`headers`/`body()` plus integrity stamping; `crew_members` added to the scheduler test schema; `test_edit_file` moved off hardcoded `/tmp` paths onto `tmp_path`.

**One production bug fixed:** `routes/skills_routes.py` used Pydantic-v1 `body.dict()`, which emits `PydanticDeprecatedSince20` and is **removed in Pydantic v3** → `model_dump()`.

### Phase 4 — First-run experience ✅

The audit's core UX insight: Tier-2 features are complete but *unprovisioned*, and a new user cannot tell that from broken.

Added **`core/degraded.py`** generalising the pattern the built-in Browser MCP server already used well. It separates `NOT_CONFIGURED` (expected on a fresh install) from `DEGRADED` (configured and failing) — collapsing those is precisely what makes a new install look defective. Probes model endpoints, ChromaDB, web search, email, and Cookbook's tmux; renders both a log block and JSON from one definition; every probe wrapped so **reporting can never raise**.

Startup now prints:

```
Setup status: 0/5 subsystems ready. The following are implemented but not yet
provisioned — TaiAi runs fine without them:
  ChromaDB (vector search) is not configured.
    Reason: no ChromaDB responding at localhost:8100 (RuntimeError).
    Impact: Document RAG, semantic memory recall, and vector tool selection
            fall back to keyword matching. Nothing is lost; results are just
            less relevant.
    Fix:    docker compose up -d chromadb
            (or set CHROMADB_HOST / CHROMADB_PORT to an existing instance)
    Notes:  Optional. TaiAi retries the connection automatically every 30s.
  ...
Full detail: GET /api/setup-status
```

Plus `GET /api/setup-status` (authenticated, not admin-gated — no secrets, and the Settings UI needs it for any signed-in user; 401 verified). Only `model_endpoints` is `optional=False`, so unconfigured optional integrations never report the instance as unhealthy. **17 tests.**

### Phase 5 — Hygiene ✅

Untracked `TaiAi-source.zip` (23 MB of a 45 MB repo; regenerable by `build_zip.py`) and gitignored it — **history deliberately left intact**, since a `filter-repo` rewrite breaks every fork for a one-off size win. Deleted `static.bak-cyberpunk/` (verified the **live** `static/cyberpunk.css`, 99 KB, used by `coding.html`, is untouched — only the stale 84 KB `.bak` copy went) and `services/faces/` (1-line docstring, 0 references). Scrubbed 34 leaked author paths (`D:/tieai-py-dev`, `/c/Users/Admin`) from `evidence/`, and marked all four `evidence/` reports **SUPERSEDED** with a dated banner explaining their 135–152 failure counts came from a run where pytest could not start.

### Phase 6.1 — Lint gate ✅

Added a `python-lint` CI job: `ruff --select E9,F63,F7,F82` — bugs only, no style, so it is requireable **without** a repo-wide reformat, and designed to be ratcheted. Rewrote `node-syntax` to enumerate every non-vendored `.js` via `find` instead of a hand-written glob. Also cleared all zizmor medium/high findings (unpinned actions, missing `persist-credentials: false`, mismatched version comments).

---

## 4. Deliberately not done

| Item | Why |
|---|---|
| Python 3.14 bump (Dependabot #2) | README states 3.11+; app verified on 3.11.2 only. Needs explicit 3.12→3.14 testing first — exactly the caution flagged in the plan. |
| `pull_request_target` for `ci.yml` | **Turned out unnecessary** (§2d), which avoids the plan's one security-sensitive change. |
| `git filter-repo` on the zip | Breaks every fork and clone. Untracking stops the bleeding. |
| Regenerating the lock with `--generate-hashes` | Would pull newer transitive deps and risk churn right after greening the suite. Best done as its own change. |
| §6.2 eslint · §6.3 module splits · §6.4 broad excepts · §6.5 Alembic · §6.6 Cookbook validation | P3/XL structural work. §6.6 needs GPU + `tmux` hardware not available here. |
| Branch protection (§1.6) | **Requires a repo admin** — cannot be set from a PR. See below. |

---

## 5. The one thing still required from a human

**Enable branch protection on `main` requiring: `python-syntax`, `python-lint`, `node-syntax`, `python-tests`, `pip-audit`.**

Every one of those now passes and is meaningful. Until they are *required*, nothing prevents a regression back to today's starting state — which is exactly how a syntax error reached `main` in a script `index.html` loads, and how a security scanner sat red for days without scanning anything.

---

## 6. Verification transcript

```
1) bare pytest (CI's exact command)   3433 passed, 2 skipped in 105.93s
2) compileall                         PASS
3) ruff E9,F63,F7,F82                 All checks passed!
4) node --check (162 non-vendored)    PASS
5) pip-audit --strict --no-deps       No known vulnerabilities found
6) zizmor                             0 high, 0 medium (1 informational)
7) theme contrast (WCAG AA)           All pairs >= 4.5:1. PASS
8) live boot                          200 on /, /api/health, /api/ready,
                                      /api/notes, /api/tasks, /api/skills,
                                      /api/tools; 401 on /api/setup-status
                                      (auth working); 0 tracebacks
```
