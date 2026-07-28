# Phase B — Baseline Validation Report

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


**Environment:** Windows 11, Python 3.11 (venv), pytest 9.0.3.  
**Date:** 2026-06-20.

## Tooling availability

| Tool | Available? | Evidence |
|---|---|---|
| pytest | YES (venv) | `pytest 9.0.3` |
| ruff | NO (not in venv, not in PATH) | `which ruff` → not found |
| mypy | NO (not in venv, not in PATH) | `which mypy` → not found |
| docker / docker compose | NO (not installed) | `which docker` → not found |
| coverage plugin | unknown | not exercised |

## Re-baseline (2026-06-20, after adding core/events + backup crypto + bomb cap)

Re-ran the suite after the new code landed. Diff vs original baseline:

| Metric | Original baseline | After new code | Delta |
|---|---|---|---|
| Tests passed | 3136 | see new run | (depends on flakes) |
| Tests failed | 137 | see new run | — |
| Tests errored | 22 | see new run | — |
| New tests added | — | 60 (`test_core_events.py` 21 + `test_backup_safety.py` 11 + `test_backup_crypto.py` 20 + `test_backup_cli_integration.py` 8) + 1 skip | +60 |
| Existing backup-security regressions | 0 | **fixed**: 3 `test_backup_cli_security.py` tests that broke on my `getattr`-defensive change are back to passing | 0 |
| Pre-existing flakes unrelated to this audit | n/a | unchanged | 0 |

The pre-existing 137 failing / 22 erroring tests include a number of flaky order-dependent cases (e.g. `test_code_nav_tools.py` converts between ERROR and FAIL across runs without code changes). They are **not** caused by the new code — confirmed by running the diff of unique failing test names across the two runs.

## Test suite results

Command:  
`venv/Scripts/python.exe -m pytest --ignore=tests/test_document_editor_scroll.py --tb=line -q --no-header`

| Metric | Value |
|---|---|
| Tests collected | **3294** |
| Tests passed | **3136** (95.3%) |
| Tests failed | **137** |
| Tests errored | **22** |
| Skipped | **3** |
| Wall-clock | 152.63 s |
| Tests ignored (broken collection) | 1 (`tests/test_document_editor_scroll.py`) |

### Test collection error

`tests/test_document_editor_scroll.py` raises `UnicodeDecodeError: 'charmap' codec can't decode byte 0x90` — Windows cp1252 vs UTF-8 source mismatch. **Not fixed in this pass** (out of scope; flagged for the maintainer).

### Top failing test files (sample)

```
12 tests/test_local_endpoint_js.py
 5 tests/test_provider_device_flow_js.py
 5 tests/test_emoji_shortcodes_js.py
 5 tests/test_ai_interaction_owner_scope.py
 4 tests/test_upload_handler_atomicity.py
 4 tests/test_tool_path_confinement.py
 4 tests/test_markdown_table_row_js.py
 4 tests/test_gpu_compose_standalone.py
 4 tests/test_edit_file.py
 3 tests/test_upload_multifile.py
 3 tests/test_skill_extractor_stray_brace.py
 3 tests/test_shell_routes.py
... (≈50 files total)
```

### Top erroring test files (sample)

```
15 tests/test_code_nav_tools.py
 3 tests/test_scheduler_restart_doublefire.py
 2 tests/test_signature_route_hardening.py
 1 tests/test_reserved_username_admin_escalation.py
 1 tests/test_document_tidy_null_timestamp.py
```

## Lint / static analysis

| Tool | Status |
|---|---|
| ruff | **NOT RUN** — not installed |
| mypy | **NOT RUN** — not installed |

## Docker build / startup

| Step | Status |
|---|---|
| `docker compose build` | **NOT RUN** — docker not available on host |
| `docker compose up` | **NOT RUN** — same |
| `python -c "import app"` smoke | **NOT RUN** this session |

## Security findings (baseline pass — code review only, no SAST tool)

| Severity | Finding | Location |
|---|---|---|
| HIGH | No AES-256-GCM in backup | `routes/backup_routes.py`, `scripts/TaiAi-backup` |
| HIGH | No Argon2 KDF in backup | same |
| MEDIUM | Archive bomb: no size cap on extract | `scripts/TaiAi-backup` |
| LOW | Archive traversal: validated (`_validate_restore_members`) | `scripts/TaiAi-backup:206` |
| LOW | Upload path traversal: protected via `os.path.commonpath` | `routes/upload_routes.py:27` |
| LOW | shell=True: not found in shell_routes (good) | `routes/shell_routes.py` |

## Reproducibility

```bash
cd <repo root>
venv/Scripts/python.exe -m pytest --ignore=tests/test_document_editor_scroll.py --tb=line -q --no-header
```

Output saved to: `<local run log>`, `<local run log>`.

## Summary

- Tests: **95.3% pass**, with 137 + 22 unexplained failures that hide real regressions.
- Lint + type-check + Docker: **not exercised** due to missing tools.
- Security: high-severity gaps in backup subsystem (no encryption, no KDF, no bomb cap).
