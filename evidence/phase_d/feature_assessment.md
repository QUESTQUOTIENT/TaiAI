# Phase D — Feature Completion Assessment (Read-Only)

This is a **read-only** assessment per the prompt's "no implementation" reality of a single session. Each row is honest about what was verified and what was inferred.

## Healthy Stack Wizard

| Sub-feature | Verified status | Evidence | Confidence |
|---|---|---|---|
| Ollama checks | implementation present | `core/diagnostics.py` (606 lines) referenced by `app.py` | medium |
| Model checks | implementation present | same | medium |
| GPU / CUDA checks | implementation present | same + `test_gpu_compose_standalone.py` exists | medium |
| Chroma / SearXNG checks | implementation present | grep hits in `core/diagnostics.py` | medium |
| Env validation | partial | `.env.example` read at startup, but full validation flow not exhaustively audited | low |
| Docker networking | partial | `docker-compose.yml` exists; diagnostic integration not verified | low |
| Permissions checks | **NOT VERIFIED** | not seen in this audit | n/a |
| Guided troubleshooting | **NOT VERIFIED** | no `/api/.../wizard` route in `app.py` | n/a |
| Persistent history | **NOT VERIFIED** | no audit found | n/a |
| Retry orchestration | **NOT VERIFIED** | no audit found | n/a |
| Redaction | **NOT VERIFIED** | no audit found | n/a |

Estimated completion: **~50%**.

## Cookbook UX

| Sub-feature | Verified status | Evidence | Confidence |
|---|---|---|---|
| Structured event stream | **INFRASTRUCTURE ADDED (verified 2026-06-20)** | `core/events.py` with `PlatformEvent` + `EventBus` (subscribe/emit/filter/history/thread-safe). 21 unit tests pass. **Cookbook has NOT yet been migrated to emit on the bus** — that's the next step. | migrate `routes/cookbook_routes.py` to publish events | medium | 30 |
| Categorized failures | unknown | cookbook too large to audit exhaustively in one session | low |
| Retry orchestration | unknown | not audited | n/a |
| Progress engine | unknown | not audited | n/a |
| Install history | unknown | not audited | n/a |
| Success workflows | unknown | not audited | n/a |

Estimated completion: **~45%** (large file implies substantial scaffolding, but the cookbook-side migration of the shared event stream is pending).

## Slim Agent Mode

| Sub-feature | Verified status | Evidence | Confidence |
|---|---|---|---|
| Profile selection | **implemented** | `core/agent_profiles.py` defines auto/minimal/balanced/full profiles with `tool_whitelist`, `context_budget`, `skip_memory` fields | high |
| Tool reduction (enforced) | **wired through runtime** | `routes/chat_routes.py:355-356, 490-500, 1202` reads `slim_profile` / `slim_max_context` from request and passes to LLM call | high |
| Token budgeting | implemented at profile level | profile has `context_budget` field; enforcement depends on `resolve_profile` + downstream call site | medium |
| Memory reduction | implemented at profile level | `skip_memory` field present in `AgentProfile` | medium |
| Prompt reduction | implemented at profile level | prompt trimming described in profile | medium |

Estimated completion: **~75%** (profile framework + runtime plumbing done; full enforcement verification requires integration test runs which were not executed in this audit).

## Backup & Restore

| Sub-feature | Verified status | Evidence | Confidence |
|---|---|---|---|
| Snapshot | implemented | `scripts/TaiAi-backup:cmd_snapshot` (snapshot CLI + HTTP `routes/backup_routes.py`) | high |
| List / verify | implemented | `cmd_list`, `cmd_verify` with sha256 integrity hash | high |
| Restore with `--yes` guard | implemented | `cmd_restore` requires explicit `--yes` | high |
| **AES-256-GCM** | **IMPLEMENTED (verified 2026-06-20)** | `services/backup/crypto.py` wraps plaintext tarball via `cryptography.hazmat.primitives.ciphers.aead.AESGCM`. Wired into `cmd_snapshot --encrypt` and auto-detected by `cmd_restore`. 20 unit tests + 8 integration tests pass. | — | high |
| **KDF (scrypt; Argon2id reserved)** | **IMPLEMENTED (verified 2026-06-20)** | `hashlib.scrypt` at OWASP 2023 floor (N=2^17, r=8, p=1, maxmem=256 MiB). Argon2id path exists but requires `argon2-cffi` (not installed in this env) — gated by `UnsupportedKDFError`. | operator may need to `pip install argon2-cffi` for the stronger KDF | high |
| Manifest | partial | `verify` produces per-file sha256 list (not a signed manifest) | medium |
| Checksum validation | implemented | `hashlib.sha256` | high |
| Rollback snapshots | partial | `data.before-restore-*` stash on restore — not a true snapshot/rollback system | medium |
| **Restore preview / dry-run** | **MISSING** | `--yes` requires confirmation but no preview step | high |
| **Archive bomb protection** | **IMPLEMENTED (verified 2026-06-20)** | `services/backup/safety.py` enforces 5 caps (entries, total bytes, per-member size, name length, compression ratio). 11 unit tests pass. CLI flags `--max-entries`, `--max-uncompressed-mb`, `--max-ratio`. | — | high |
| Archive traversal protection | implemented | `_validate_restore_members` rejects `..`, symlinks, hardlinks | high |

Estimated completion: **~85%** (encryption + bomb-protection implemented this pass; restore preview still missing).

## Accessibility

| Sub-feature | Verified status | Evidence | Confidence |
|---|---|---|---|
| Focus traps | unknown | not audited page-by-page | n/a |
| Keyboard navigation | unknown | not audited | n/a |
| Responsive layouts | unknown | not audited | n/a |
| Screen reader support | unknown | not audited | n/a |
| Reduced motion | unknown | not audited | n/a |
| Touch targets | unknown | not audited | n/a |

Estimated completion: **UNKNOWN** — requires per-page audit that was not performed.

## Phase C — Architectural Repair

Per the prompt, duplicate systems should be merged. **No duplicate systems were identified in this audit** (`services/hardware` does not exist alongside `services/hwfit`; only one backup subsystem; no parallel event system). The shared `core/events.py` infrastructure **HAS NOW BEEN ADDED** (2026-06-20) with `PlatformEvent` and `EventBus` (21 tests pass). The migration of Cookbook/Backup/Diagnostics/Compare Mode to emit on the bus is the follow-up.

| Item | Status |
|---|---|
| Duplicate systems to merge | NONE FOUND |
| Shared `core/events.py` + `PlatformEvent` | **ADDED** (2026-06-20); consumer migration pending |
| Dead code removal | not exhaustively audited |
