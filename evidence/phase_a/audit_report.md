# Phase A — Existing Work Audit

> **⚠️ SUPERSEDED — historical record only (added 2026-07-28).**
>
> This report is from an earlier single-session audit pass and its numbers no
> longer describe the repository. It is retained for provenance, not guidance.
>
> Known inaccuracies:
> * Failing-test counts here (in the 135–152 range) reflect a run whose pytest
>   invocation could not even start — `pytest.ini` shadowed `pyproject.toml` and
>   omitted five `area_*` markers, so collection aborted with an INTERNALERROR.
>   Measured on 2026-07-28 after that was fixed: **27 failed + 3 errors**, all of
>   which were test-infrastructure drift rather than broken features. The suite
>   is now **3416 passed / 2 skipped**, stable across three consecutive runs.
> * Absolute paths belonging to the original author's machine have been scrubbed.
>
> For the current, evidence-backed picture see `AUDIT.md` and `UPDATE-PLAN.md`
> at the repository root.


**Repo path:** `D:\tieai-py-dev` (Windows).  
**Reference prompt path** `<attachment path>` — NOT PRESENT on this machine; the working tree IS the previously-modified repository. `TaiAi-source.zip` is the source archive.

## Inventory

| Area | Count | Evidence |
|---|---|---|
| Python source files (project, excl. venv) | ~115 | `find . -name '*.py' -not -path '*/venv/*' -not -path '*/__pycache__/*'` |
| Test files | many (collection succeeded for 3294 tests) | `pytest --collect-only` → 3294 collected |
| Routes (FastAPI) | 50+ in `routes/` | `ls routes/*.py` |
| Services | `docs/`, `faces/`, `hwfit/`, `memory/`, `research/`, `search/`, `shell/`, `stt/`, `tts/`, `youtube/` | `ls services/` |
| MCP servers | `email_server.py`, `image_gen_server.py`, `memory_server.py`, `rag_server.py` | `ls mcp_servers/` |
| Core modules | 12 in `core/` | `ls core/*.py` |

## Stubs / TODOs (verified, venv-excluded)

| Marker | Real count | Notes |
|---|---|---|
| `# TODO/FIXME/XXX/HACK` in comments | **1** | `./src/teacher_escalation.py:17` — Tier 2 self-eval "Not in first cut" |
| `raise NotImplementedError` | **4** | All in test files (`tests/test_memory_provider.py`, `tests/test_builtin_mcp_npx_cache.py`) — intentional test stubs |
| `pass`-only bodies | **432** | Top: `core/database.py` (27, SQLAlchemy declarative patterns), `src/task_scheduler.py` (22), `routes/email_helpers.py` (17) — most are SQLAlchemy/abstract patterns, not stubs. **Not verified individually** that none are silent stubs. |
| `core/events.py` | **MISSING** | No file. No `PlatformEvent` references anywhere. |

## Files Modified by Previous AI Work (heuristic)

Files newer than `pyproject.toml` (Jun 11, 2025 baseline):
`core/agent_profiles.py`, `core/auth.py`, `core/database.py`, `core/diagnostics.py`, `core/middleware.py`, `core/platform_compat.py`, `core/research_presets.py`, `services/hwfit/fit.py`.

This is heuristic; **not verified** what the AI actually changed inside each.

## Per-Feature Status

### Feature: Healthy Stack Wizard

| Item | Status | Evidence | Missing | Risk | Est. % |
|---|---|---|---|---|---|
| Ollama checks | partial | `core/diagnostics.py` exists, mentions ollama in grep | guided troubleshooting, persistent history | medium | 60 |
| Model / GPU / CUDA checks | partial | referenced in `app.py`, `core/diagnostics.py` | orchestration, retry, redaction | medium | 55 |
| Chroma / SearXNG checks | partial | grep hits in `core/diagnostics.py` | per-service guided UI flow | medium | 50 |
| Env validation | partial | `.env.example` exists; core reads it | full validation in wizard | medium | 50 |
| Docker networking | partial | `docker-compose.yml` exists | diagnostic integration | medium | 40 |
| Permissions checks | unknown | not directly verified in this audit | persistence, audit | high | 30 |
| Guided troubleshooting | unknown | not verified | — | high | 20 |
| Persistent history | unknown | not verified | — | high | 15 |
| Retry orchestration | unknown | not verified | — | high | 25 |
| Redaction | unknown | not verified | — | high | 25 |

### Feature: Cookbook UX

| Item | Status | Evidence | Missing | Risk | Est. % |
|---|---|---|---|---|---|
| Structured event stream | **MISSING** | no `PlatformEvent` / `stream_event` in `cookbook_routes.py`; `core/events.py` absent | whole feature | high | 0 |
| Categorized failures | unknown | 3104 lines cookbook — not exhaustively audited | — | medium | 50 |
| Retry orchestration | unknown | not verified | — | high | 30 |
| Progress engine | unknown | not verified | — | high | 30 |
| Install history | unknown | not verified | — | medium | 40 |
| Success workflows | unknown | not verified | — | medium | 40 |

### Feature: Slim Agent Mode

| Item | Status | Evidence | Missing | Risk | Est. % |
|---|---|---|---|---|---|
| Profile selection | exists | `core/agent_profiles.py` (226 lines), mentions "whitelist, trims the context budget" | — | low | 80 |
| Tool reduction (enforced in execution path) | **NOT VERIFIED** | agent profile file describes intent; the actual execution path (`routes/chat_routes.py`, 81k lines) was not exhaustively audited for enforcement | runtime verification needed | high | 50 |
| Token budgeting | partial | described in `agent_profiles.py` | runtime enforcement evidence | high | 40 |
| Memory reduction | partial | "skips memory retrieval" noted | enforcement | high | 40 |
| Prompt reduction | partial | described | enforced? | high | 40 |

### Feature: Backup & Restore

| Item | Status | Evidence | Missing | Risk | Est. % |
|---|---|---|---|---|---|
| Snapshot | exists | `scripts/TaiAi-backup` (`snapshot`, `list`, `restore`, `verify`) | — | low | 80 |
| Restore | exists | with `--yes` guard | — | low | 80 |
| Verify (sha256) | exists | `routes/backup_routes.py` uses `hashlib.sha256` | — | low | 70 |
| **AES-256-GCM encryption** | **MISSING** | grep for `AESGCM`, `cryptography`, `Crypto`, `argon2` in backup code → **0 hits**. Backup is plaintext gzip tarball. | whole feature | **CRITICAL** | 0 |
| **Argon2 KDF** | **MISSING** | no imports / no usage | whole feature | **CRITICAL** | 0 |
| Archive manifest | partial | `verify` outputs manifest but no signed manifest | signing | high | 30 |
| Checksum validation | exists | sha256 | — | low | 70 |
| Rollback snapshots | partial | `data.before-restore-*` stash exists | atomicity | medium | 60 |
| Restore preview | **MISSING** | no dry-run restore | feature | high | 0 |
| Dry-run | partial | `--yes` required but no preview mode | feature | medium | 30 |
| Archive traversal protection | exists | `_validate_restore_members` rejects `..` and symlinks (`scripts/TaiAi-backup:206`) | — | low | 80 |
| Archive bomb protection | **WEAK** | ratio tracked but **NO size cap** (no `MAX_SIZE` / `MAX_ENTRIES`) | feature | high | 30 |

### Feature: Accessibility

| Item | Status | Evidence | Missing | Risk | Est. % |
|---|---|---|---|---|---|
| Focus traps | unknown | not audited page-by-page | full audit | high | unknown |
| Keyboard navigation | unknown | not audited | full audit | high | unknown |
| Responsive layouts | unknown | not audited | full audit | medium | unknown |
| Screen reader support | unknown | not audited | full audit | high | unknown |
| Reduced motion | unknown | not audited | full audit | medium | unknown |
| Touch targets | unknown | not audited | full audit | medium | unknown |

## Duplicate / Parallel Systems

| Concern | Status | Evidence |
|---|---|---|
| `services/hardware` vs `services/hwfit` | NOT FOUND — no `services/hardware` exists. Single hwfit. | `ls services/` |
| Two parallel backup systems | NOT FOUND — only `scripts/TaiAi-backup` (CLI) + `routes/backup_routes.py` (HTTP). One filesystem-level, one in-app. | grep |
| Two parallel event systems | NOT FOUND — neither system exists. | grep |

## Security Risks Identified

| Severity | Finding | Location |
|---|---|---|
| HIGH | Backup has no encryption — at-rest exposure of secrets, DB, RAG indexes | `scripts/TaiAi-backup`, `routes/backup_routes.py` |
| HIGH | No Argon2 KDF — relies on whatever key the operator passes | backup subsystem |
| HIGH | Archive bomb: no max-size / max-entries cap on extract | `scripts/TaiAi-backup:_extract_restore_members` (verified absent) |
| MEDIUM | 137 test failures, 22 errors — unknown which mask real regressions | test suite |
| MEDIUM | `test_document_editor_scroll.py` collection error (UnicodeDecodeError, cp1252 vs UTF-8) | `tests/test_document_editor_scroll.py` |
| MEDIUM | 1 broken doc collection: `core/events.py` shared event bus absent | project-wide |

## Dead Code / Unused Files

Not exhaustively audited in this pass. `static.bak-cyberpunk/` and `theme idea app/`, `coding idea from here/` look like WIP dumps — **not verified** whether anything imports them.

## Broken Imports

Not exhaustively checked. Test collection succeeded for 3294/3295 tests → most imports resolve. **1 collection error** in `test_document_editor_scroll.py` (encoding issue, not import).

## Summary

- **Estimated overall completion: ~45–55%.**
- Largest gaps: shared event infrastructure (0%), backup encryption (0%), accessibility audit (unknown).
- Test suite passes ~95% but 137 failures + 22 errors hide regressions.
- AI-modified files cannot be enumerated reliably without git history (repo is not a git repo per environment info).
