# Pending CI workflow changes

> **Applying this?** Read
> [`BRANCH-PROTECTION.md`](BRANCH-PROTECTION.md) first. It is the corrected,
> verified runbook for the patch **and** the branch-protection rule, and it
> documents three traps that would otherwise produce a rule enforcing nothing:
> required checks match the `name:` field rather than the job ID, there are two
> different `pip-audit *` checks (one is `continue-on-error`), and
> `pip-audit (Python deps)` is path-filtered so requiring it deadlocks every PR
> that does not touch `requirements.*`.

`ci-workflows.patch` holds the `.github/workflows/` half of the update pass
described in [`../../UPDATE-REPORT.md`](../../UPDATE-REPORT.md).

It is a patch file rather than a normal commit because the automation account
that produced this branch authenticates as a GitHub App without the `workflows`
permission, so the push is rejected:

```
! [remote rejected] refusing to allow a GitHub App to create or update
  workflow `.github/workflows/ci.yml` without `workflows` permission
```

Everything else in the pass — the dependency upgrades, the test fixes, the
source-code bug fixes, `core/degraded.py` — is committed normally. Only these
three workflow files need a maintainer to apply them.

## Apply

```bash
git apply docs/pending/ci-workflows.patch
git add .github/workflows
git commit -m "ci: add ruff gate, widen JS syntax check, fix pip-audit, pin actions"
```

Then verify locally (all of these pass on this branch):

```bash
pip install ruff==0.16.0
ruff check --select E9,F63,F7,F82 app.py core routes src services scripts tests

find static -name '*.js' -not -path 'static/lib/*' -print0 | xargs -0 -n1 node --check

pip install pip-audit
pip-audit --requirement requirements.lock --strict --no-deps
```

## What the patch changes

### `ci.yml`

* **New `python-lint` job** — `ruff --select E9,F63,F7,F82`. Deliberately a
  narrow, high-signal subset (syntax errors, comparison mistakes, statement
  misuse, undefined names) rather than ruff's defaults, so the job can be made
  *required* without forcing a repo-wide reformat. Intended to be ratcheted
  wider over time.

  This subset already found **five live `NameError` bugs** that `compileall`
  cannot see, because each module imports cleanly and only raises when the
  offending line runs: `GET /api/health/deep`, `GET /api/diagnostics`, the
  session-cleanup image sweep, and cookbook log streaming (×2). Those source
  fixes are already committed; this job is what stops them recurring.

* **`node-syntax` now enumerates every non-vendored `.js`** via
  `find static -name '*.js' -not -path 'static/lib/*'` instead of the previous
  hand-written `static/app.js static/js/**/*.js` glob.

  That glob silently skipped the four top-level `static/*.js` files — which is
  how `static/sw.js` shipped with an unbalanced arrow-function body. The
  service worker is registered by both `index.html` and `coding.html`, so PWA
  offline caching was dead and CI structurally could not see it. (The `sw.js`
  fix itself is already committed.)

### `pip-audit.yml`

* `--disable-pip` → `--no-deps`. pip-audit rejects `--disable-pip` outright
  against a lockfile with no hashes:

  ```
  the --disable-pip flag can only be used with a hashed requirements file
  or if the --no-deps flag has been provided
  ```

  The job therefore failed during argument parsing and **had never scanned
  anything** — the ~15s run times in the Actions history are the giveaway. The
  comment in the file already documented `--no-deps`; it just was not in the
  command.

  With the flag corrected the scan runs and, against the dependency bumps
  committed on this branch, reports `No known vulnerabilities found`.

* Hash-pins `actions/checkout` and `actions/setup-python`, and sets
  `persist-credentials: false`.

### `theme-contrast-audit.yml`

* Same hash-pinning and `persist-credentials: false` treatment.

Together these clear every zizmor medium/high finding (`zizmor --persona=regular
.github/workflows/` → 0 high, 0 medium; one low-confidence informational
remains in `docker-publish.yml` for a digest emitted by the preceding trusted
build step).

## Still needs a repo admin

Once applied, enable branch protection on `main` requiring:

`python-syntax` · `python-lint` · `node-syntax` · `python-tests` · `pip-audit`

All five pass on this branch. Until they are *required*, nothing prevents a
regression to the starting state — which is how a syntax error reached `main`
in a script `index.html` loads, and how a security scanner sat red for days
without ever scanning.

---

## Already applied in `TaiAi-source.zip`

The distributable archive built by `build_zip.py` is produced from a tree with
this patch **already applied**. Uploading that zip therefore carries the
workflow fixes with it — the App-token restriction only affects `git push`, not
a manual upload. If you take the zip route you do not need to apply the patch
separately; it is kept here for the git-based path.
