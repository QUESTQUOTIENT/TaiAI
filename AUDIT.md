# TaiAi — Full Application Audit

**Date:** 2026-07-28
**Commit audited:** `362866c` (branch `arena/019fa707-taiai`, from `main`)
**Method:** dependency install → full pytest run → live server boot → live HTTP endpoint probing → OpenAPI surface enumeration → static analysis of the JS/Python tree.

Everything below is backed by something I actually executed, not by reading the README. Where I could not verify a claim, it is marked **UNVERIFIED** rather than guessed.

---

## 1. Executive summary

TaiAi is **not** a prototype dressed up as an app. It is a genuinely large, genuinely working self-hosted AI workspace: ~270k lines, **420 API paths / 497 operations**, and it boots and serves real data on a clean machine with nothing but `pip install -r requirements.txt`.

The honest framing is not "works vs. fake". It is **three tiers**:

| Tier | What it means | Share of the app |
|---|---|---|
| **Tier 1 — Works** | Boots, serves, persists, auth-gated, test-covered. No external service needed. | The majority of the app |
| **Tier 2 — Works, but only if you supply an external dependency** | Code is complete and wired; it is inert until you provide ChromaDB / an LLM / API keys / `tmux` / a GPU. Not prototypes — *unprovisioned*. | Large second chunk |
| **Tier 3 — Genuinely prototype / scaffolding** | Declared but not adopted, or partially migrated, or dead. | Small but real |

**The three findings that matter most**, in priority order:

1. 🔴 **The test suite cannot run at all as CI invokes it.** `python -m pytest -q` dies with `INTERNALERROR ... 'area_services' not found in markers`. CI's `python-tests` job is effectively dead. (§3)
2. 🔴 **A syntax error is shipping in a script loaded by `index.html`.** `static/js/installBanner.js` fails `node --check`. The `node-syntax` CI job *would* catch this — which confirms CI is not gating merges. (§4)
3. 🟠 **27 test failures + 3 errors** once the suite is forced to run, and the failing set *changes between identical runs* — order-dependent test pollution. (§3)

None of these are architecture problems. They are **CI/quality-gate problems**: the safety net is down, so real regressions have landed.

---

## 2. What I verified works — Tier 1

I booted the server (`uvicorn app:app`) on a clean venv and hit live endpoints. These returned real, correctly-shaped responses:

```
200  /                      (SPA shell)
200  /api/health            {"status":"healthy",...}
200  /api/ready             {"ready":true,"checks":{"database":{"ok":true},...}}
200  /api/notes             {"notes":[]}
200  /api/tasks             {"tasks":[]}
200  /api/memory            {"memory":[]}
200  /api/skills            {"skills":[],"count":0}
200  /api/sessions          []
200  /api/presets           (7 real seeded presets w/ system prompts)
200  /api/model-endpoints   []
200  /api/mcp/servers       []
200  /api/email/accounts    {"accounts":[]}
200  /api/tools             (full tool registry, ~dozens of tools enumerated)
200  /api/free-providers    (real provider catalogue w/ key-help URLs)
200  /api/prefs             {}
422  /api/calendar/events   (correct validation error — endpoint is real)
```

**Confirmed working, with evidence:**

- **Startup & lifecycle** — clean boot, no unhandled exceptions, graceful degradation messages when optional services are absent.
- **Database** — SQLite at `data/app.db`, `/api/ready` reports `database.ok=true`. Hand-rolled startup migrations (`_migrate_add_owner_column`, `_migrate_add_last_message_at_column`, `_migrate_encrypt_email_passwords`, …) in `core/database.py`.
- **Auth** — I ran the server with `AUTH_ENABLED=true` and confirmed real gating: `/api/sessions`, `/api/notes`, `/api/tasks`, `/api/memory`, `/api/skills`, `/api/tools` all returned **401**, while `/api/health` correctly stayed public. This is not decorative.
- **Auth hardening is thoughtful** — `_is_trusted_loopback()` explicitly refuses to trust loopback when proxy-forwarding headers (`cf-connecting-ip`, `x-forwarded-for`, …) are present, specifically to stop a Cloudflare-tunnel visitor inheriting local trust. That is a real threat model, correctly handled.
- **API token auth** — bcrypt-hashed, prefix-indexed, with an invalidatable in-memory cache to avoid linear bcrypt scans per request.
- **Built-in MCP servers** — 4 connected live at boot: `image_gen` (1 tool), `rag` (1), `memory` (1), `email` (**14 tools**). Verified in the server log.
- **Notes, Tasks, Calendar, Memory, Skills, Sessions, Presets, Contacts, Documents, Gallery, Compare, Email, Cookbook, Coding, Vault, Companion** — all present as substantial route modules with live endpoints.
- **3,389 tests pass.** That is a serious, real test suite (3,418 collected), including named security suites for owner-scoping, XSS, SSRF, and path traversal.
- **Python compiles clean** — `compileall` over `app.py core routes src services scripts tests` exits 0.
- **Security tooling is real** — CodeQL (passing, ran 19h ago), Trivy, pip-audit, secret-scan, dependency-review, workflow-security. 12 workflows. SHA-pinned actions, least-privilege `permissions:` blocks.

---

## 3. 🔴 Finding 1 & 3 — the test suite is broken and polluted

### 3a. The suite cannot start

CI runs `python -m pytest -q`. On a clean checkout that produces:

```
INTERNALERROR> Failed: 'area_services' not found in `markers` configuration option
no tests ran in 8.30s
```

**Root cause: two competing pytest configs.**

- `pyproject.toml` declares `[tool.pytest.ini_options]` with the 8 `area_*` markers (`area_routes`, `area_services`, `area_js`, `area_helpers`, `area_unit`, …) and `asyncio_mode = "auto"`.
- `pytest.ini` also exists. **pytest.ini wins** — it takes precedence over `pyproject.toml` and `pyproject.toml` is then ignored entirely.
- `pytest.ini` only declares 6 markers and is missing `area_routes`, `area_services`, `area_js`, `area_helpers`, `area_unit`.
- `tests/conftest.py` `pytest_collection_modifyitems` then calls `getattr(pytest.mark, "area_services")` under `--strict-markers` → hard INTERNALERROR at collection.

`pytest.ini` also sets `asyncio_mode = strict` where `pyproject.toml` sets `auto` — a second, independent divergence.

The conftest docstring even says *"The stable `area_*` markers are declared in `pyproject.toml`"* — so `pytest.ini` is the stale file that should be deleted or merged.

**Fix:** delete `pytest.ini` and fold its unique settings (`filterwarnings`, `testpaths`, `python_files`, the `sub_*`/`slow` markers, `addopts`) into `pyproject.toml`. One config file, one source of truth.

> To get results at all I ran with a patched config adding the 5 missing markers and `asyncio_mode=auto`. All numbers below come from that patched run.

### 3b. Results once forced to run

```
27 failed, 3389 passed, 2 skipped, 3 errors in 106s
```

**Two identical back-to-back runs produced different failing sets.** Run A failed `test_research_service.py::TestResearchOnStringReport::test_sources_parsed_and_deduped`; Run B instead failed `TestDictBackCompat::test_dict_result_still_parsed`. Same for `test_research_utils` (`test_normal_summary` vs `test_copyright_marker`) and `test_caldav_sync_prune_local_events`. **This is order-dependent shared-state pollution** and it means the suite is not trustworthy as a gate even after being fixed to run.

### 3c. Failure causes, classified

| Cause | Tests | Verdict |
|---|---|---|
| **`ResourceWarning: unclosed file` + `filterwarnings=error`** | ~12 (`test_edit_file`, `test_upload_handler_atomicity`, `test_auth_regressions`, `test_vault_password_not_in_argv`) | **Test-code bug, not app bug.** Tests use `open(...).read()` / `json.load(open(...))` without a context manager. `pytest.ini` sets `filterwarnings=error`, so the GC'd file handle becomes a hard failure. Trivial fix: use `with open(...)`. |
| **Stale pinned value** | 4 (`test_gpu_compose_standalone`) | **Real drift.** Test expects `chromadb/chroma:1.0.20`; the GPU compose overlays say `chromadb/chroma:latest`. Base and overlay compose files have diverged. Also a supply-chain smell — `:latest` in a pinned-everything-else repo. |
| **Test double out of sync with route** | 3 (`test_backup_import_*`) | **Real drift.** `routes/backup_routes.py:217` reads `request.query_params` (the `--preview`/`dry_run` feature added in the Phase-F pass); the test's `_Req` stub was never updated → `AttributeError: '_Req' object has no attribute 'query_params'`. The route works; the fake doesn't. |
| **Missing table in test DB** | 3 errors (`test_scheduler_restart_doublefire`) | `no such table: crew_members`. The scheduler *handles* it gracefully at runtime (logs a warning), but the test fixture doesn't create the table. Points at the hand-rolled-migration approach having no schema bootstrap for tests. |
| **Order-dependent pollution** | ~5, varying | Pass in isolation, fail in the full run. Needs `pytest-randomly` + fixture isolation to chase down. |

**Good news:** I found **zero failures that indicate a broken user-facing feature.** Every failure is test-infrastructure drift, not application breakage. But that is exactly what a dead CI gate produces over time.

---

## 4. 🔴 Finding 2 — shipped JS syntax error

`static/js/installBanner.js` **fails `node --check`**:

```
static/js/installBanner.js:91
  'cursor:pointer;font:inherit;padding:4px 6px;font-size:16px;line-height:1;" +
  ^
SyntaxError: Invalid or unexpected token
```

Line 91 — a quote-nesting mistake, `;" +` where it should be `;' +`:

```js
'cursor:pointer;font:inherit;padding:4px 6px;font-size:16px;line-height:1;" +   // ← wrong
  '">✕</button>';
```

This file **is** loaded by the app — `static/index.html:2521`:
```html
<script src="/static/js/installBanner.js" defer></script>
```

**Impact:** the whole IIFE fails to parse, so the PWA install banner never works in any browser. It's `defer` and self-contained, so it doesn't take down the rest of the app — but "installable (PWA)" is a headline README feature and it is broken.

**Most important part:** I reproduced CI's exact glob (`shopt -s globstar; for f in static/app.js static/js/**/*.js; do node --check "$f"; done`) and it flags this file. **The `node-syntax` CI job would catch this and it landed anyway** — independent confirmation that CI is not blocking merges. Combined with §3a (pytest job dead), the repo currently has **no effective automated gate**.

It is the only syntax error in the tree — the other ~50 JS files pass.

---

## 5. Tier 2 — real code, but inert without provisioning

These are **not** prototypes. The code is complete and wired; it simply needs something you must supply. Important to separate these from Tier 3, because a "degraded" log line looks like a broken feature but isn't.

| Feature | Needs | Behaviour without it (verified) |
|---|---|---|
| **Vector RAG / semantic memory / tool index** | ChromaDB on `:8100` | Logs `VectorRAG init failed`, `MemoryVectorStore DEGRADED`, `ToolIndex init failed (will retry in 30.0s)`. **Retries lazily, falls back to keyword search.** Correct degradation. |
| **Chat / Agent / Research / Compare** | An LLM endpoint (local or API) | `/api/model-endpoints` → `[]`, `Discovered 0 model endpoints across 2 hosts`. Routes exist and are live; nothing to talk to. |
| **Cookbook (download/serve)** | `tmux` + GPU + `vllm`/`llama-server` | `tmux` MISSING in my env. 93 `vllm` refs, 63 `llama-server` refs — substantial real integration code. **UNVERIFIED end-to-end** — this is the single hardest thing to validate and the ROADMAP openly flags it as the most fragile area. |
| **Browser MCP** | `npx @playwright/mcp` | Emits an *exemplary* degradation message: reason + impact + exact fix command + "this server is optional". This is how all degradation should read. |
| **Web search** | SearXNG container or Brave/Tavily/Serper/Google PSE key | `/api/search?q=test` → `[]`. Six providers implemented in `services/search/providers.py`. |
| **Email** | IMAP/SMTP account | `/api/email/accounts` → `{"accounts":[]}`. 3,245-line route module + 14 MCP tools. |
| **Calendar sync** | CalDAV server | `caldav` is a core dep; `src/caldav_sync.py` handles Radicale/Nextcloud/Apple/Fastmail. |
| **Local STT** | `faster-whisper` (optional) | Gated. |
| **PDF forms** | `PyMuPDF` (optional, **AGPL**) | Gated, and the AGPL implication is documented honestly in `requirements-optional.txt` + ACKNOWLEDGMENTS. Good license hygiene. |
| **Office/EPUB extraction** | `markitdown` (optional) | Lazy-imported, falls back to an "install to extract" banner. Test skips cleanly. |
| **Stronger backup KDF** | `argon2-cffi` (optional) | scrypt at OWASP-2023 floor is the default; Argon2id gated behind `UnsupportedKDFError`. Test skips cleanly. |

The degradation engineering here is a real strength — 45 `except ImportError` guards, and the app never crashes on a missing optional dep.

---

## 6. Tier 3 — genuine prototype / scaffolding

Small list, but these are the honest answers to "what's just there".

### 6a. EventBus — declared, barely adopted 🟠
`core/events.py` (249 lines, 21 passing tests) is well-built. But adoption is **4 files**, and in `cookbook_routes.py` (3,176 lines) it is wired into **exactly one endpoint** — `cookbook_error_categorize`. The repo's own `evidence/phase_f/release_gate.md` admits this: *"only `cookbook_error_categorize` is migrated as a proof point"*, *"Other cookbook endpoints… not yet migrated."*
**Verdict: infrastructure is production-quality; the migration is ~5% done.** A structured event stream that covers one endpoint doesn't yet give you a progress engine or categorized failures.

### 6b. `services/faces/` — empty shell 🔴
```
services/faces/__init__.py  →  1 line, a docstring only:
"""Face detection + embedding service (standalone worker + helpers)."""
```
**Zero implementation.** A directory and a promise. Should be deleted or moved behind a clear "planned" marker.

### 6c. Dead/committed artifacts 🟠
- **`TaiAi-source.zip` — 23 MB, committed to Git.** Half the 45 MB repo. A source tarball inside the source tree is redundant and bloats every clone. Should be a release asset, not a tracked file.
- **`static.bak-cyberpunk/`** — 84 KB of dead CSS + a boot script. A `.bak-` directory in `main`.
- **`idea/`** — 80 KB of prior audit markdown (`AUDIT-REPORT.md`, `PHASE-0-ASSESSMENT.md`, `PHASE-1-DELIVERY.md`) shipped in the repo.
- **`evidence/`** — phase_a/b/d/f audit reports, containing **absolute Windows paths of the original author's machine** (`D:/tieai-py-dev/...`, `/c/Users/Admin/test_after2.out`). Minor info leak, and it makes the reports unusable to anyone else.

### 6d. Stale self-assessments 🟠
`evidence/phase_f/release_gate.md` claims *"137 → 147 pre-existing failing tests"*. I measured **27 failed + 3 errors**. Either things improved a lot or that number was never accurate. Either way the in-repo audit docs are stale and now actively misleading — they should be dated, corrected, or removed.

### 6e. Small stubs (low severity, honestly labelled) 🟢
- `static/js/skills.js:354` — *"Stub returns empty so the surrounding [flow works]"*.
- `static/js/editor/fx/adj-popup.js:667` — *"stubbed so any stale callers don't error"*.
- `static/js/settings.js:2271` — notes `/api/email/config` *"was a no-op stub for most installs"*.

These are deliberate, commented, and defensive. Not a concern — and worth noting the codebase is unusually honest in its comments.

---

## 7. Cross-cutting observations

**Strengths**
- Comment quality is genuinely excellent. Nearly every non-obvious decision explains *why*, often citing the issue number or the attack it prevents. `requirements.txt` justifies each dependency inline.
- Security posture is above average for a self-hosted project: real threat model doc, proxy-aware loopback trust, bcrypt tokens, 2FA (`pyotp`), nh3 HTML sanitization on untrusted LLM output, AES-256-GCM backups with archive-bomb caps, SHA-pinned CI actions.
- Graceful degradation is systematic rather than accidental.
- `pypdf>=6.13.3` is pinned with the CVE ID (`GHSA-jm82-fx9c-mx94`) in a comment. That's disciplined.

**Weaknesses**
- **No effective CI gate** (§3a + §4). This is the root cause of most other findings.
- **`pip-audit` is currently failing** on `main` (last 2 scheduled runs, 22h and 1d ago). Unpatched advisory in the dependency tree — worth triaging.
- **File sizes are extreme.** `static/js/document.js` is 9,776 lines; `slashCommands.js` 6,498; `emailLibrary.js` 5,217; `settings.js` 5,266; `notes.js` 5,124. `routes/email_routes.py` 3,245; `cookbook_routes.py` 3,176. `app.py` is 62 KB with 27 broad `except Exception` blocks. This is the "murky corner" the ROADMAP admits to.
- **No linter/formatter in CI.** No `ruff`, `black`, or `eslint` job — only syntax checks. For 270k lines that's thin.
- **Migrations are hand-rolled**, not Alembic. It works today, but §3c shows it already causes test-fixture schema gaps.

---

## 8. Prioritized recommendations

**P0 — restore the safety net (hours, not days)**
1. Delete `pytest.ini`; merge its unique settings into `pyproject.toml`. Verify bare `python -m pytest -q` runs.
2. Fix `static/js/installBanner.js:91` (`;" +` → `;' +`).
3. Make the `python-tests` CI job **required**. It is currently the only thing standing between the repo and more of §3c.

**P1 — make the suite trustworthy**
4. Fix the ~12 `ResourceWarning` failures with `with open(...)`. Mechanical.
5. Reconcile the chromadb pin across `docker-compose*.yml` (and drop `:latest`).
6. Add `query_params` to the `_Req` test double in `test_backup_import_*`.
7. Create `crew_members` in the scheduler test fixture.
8. Add `pytest-randomly` and chase the order-dependent pollution.
9. Triage the failing `pip-audit`.

**P2 — cleanup / honesty**
10. Untrack `TaiAi-source.zip` (→ release asset); delete `static.bak-cyberpunk/`; delete or implement `services/faces/`.
11. Scrub `D:/tieai-py-dev` and `/c/Users/Admin` paths from `evidence/`; correct or remove the stale failure counts.
12. Either finish the EventBus migration across cookbook or downgrade the claim in the docs.

**P3 — structural**
13. Add `ruff` + `eslint` to CI.
14. Break up the 5k–10k-line JS modules, starting with `document.js`.
15. Consider Alembic.

---

## 9. Bottom line

**What works:** the core application. It boots clean, serves 420 API paths, enforces auth properly, persists to SQLite, connects 4 built-in MCP servers with 17 tools, and passes 3,389 tests. Notes, Tasks, Calendar, Memory, Skills, Sessions, Presets, Email, Documents, Gallery, Compare and Cookbook are all real, substantial, wired-up features — not mockups.

**What's a prototype:** very little, and less than the repo's own audit docs suggest. `services/faces/` is an empty shell. The EventBus is quality infrastructure with ~5% adoption. A handful of small, honestly-commented JS stubs.

**What's actually wrong:** not the architecture — the **quality gates**. The test suite can't start, a syntax error shipped past a CI job that would have caught it, and `pip-audit` is red. The engineering underneath is better than the current CI state implies, which is why fixing P0 (a few hours of work) recovers most of the confidence.

**The most misleading category** is Tier 2: a first-time user on a bare install sees `DEGRADED`, `init failed`, and empty arrays everywhere and reasonably concludes the app is hollow. It isn't — it's unprovisioned. The Browser-MCP degradation message (reason → impact → exact fix → "this is optional") is the model; applying that pattern to ChromaDB, search, and model endpoints would change the whole first-run impression.
