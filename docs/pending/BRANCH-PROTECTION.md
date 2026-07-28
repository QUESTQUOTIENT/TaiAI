# Applying the CI patch + enabling branch protection

A corrected runbook. The overall shape — apply patch, push with a token that
has `workflows` scope, then require the checks — is right. Three details below
would have silently produced a rule that enforces nothing, so they are called
out explicitly.

Everything here was verified against this repository's actual workflow files
and a real PR (`gh pr checks 4`).

---

## ⚠️ Three corrections before you start

### 1. Required checks match the `name:` field, not the job ID

Branch protection matches the **check-run name**, which is the job's `name:`
value. It falls back to the job ID only when `name:` is absent. Every job here
sets `name:`, so the job IDs will not match anything.

| Job ID (will NOT work) | Actual check name (use this) |
|---|---|
| `python-syntax` | `Python syntax (compileall)` |
| `python-lint` | `Python lint (ruff, error subset)` |
| `node-syntax` | `JS syntax (node --check)` |
| `python-tests` | `Python tests (pytest)` |
| `audit` | `pip-audit (Python deps)` |

Confirmed against a live PR — GitHub reports exactly these strings:

```console
$ gh pr checks 4
Python syntax (compileall)
JS syntax (node --check)
Python tests (pytest)
pip-audit (Python deps)
...
```

Note the last row especially: the `pip-audit.yml` job ID is `audit`, not
`pip-audit`.

### 2. There are **two** checks starting with `pip-audit` — pick the right one

| Check name | Workflow | Blocking? |
|---|---|---|
| `pip-audit (Python deps)` | `pip-audit.yml` | ✅ **require this one** |
| `pip-audit (advisory)` | `dependency-review.yml` | ❌ `continue-on-error: true` |

The advisory one reports and never fails:

```yaml
  pip-audit:
    name: pip-audit (advisory)
    # Advisory: report known-vulnerable Python deps without blocking the merge.
    continue-on-error: true
```

Requiring it would look like protection while enforcing nothing.

### 3. `pip-audit (Python deps)` is path-filtered — requiring it will deadlock PRs

`pip-audit.yml` only triggers on dependency-file changes:

```yaml
  pull_request:
    branches: [main, dev]
    paths:
      - 'requirements.txt'
      - 'requirements.lock'
```

A required check that does not run stays **"Expected — waiting for status"**
forever, so **every PR that does not touch those two files becomes unmergeable.**

Pick one:

- **Option A (recommended): require only the four `ci.yml` checks.** `ci.yml`
  has no path filter, so all four run on every PR. `pip-audit` still runs
  nightly, on dependency changes, and on pushes to `main` — the coverage that
  actually matters for a CVE scanner.
- **Option B: require all five**, and first remove the `paths:` filter from the
  `pull_request` trigger in `pip-audit.yml` so it runs on every PR (~15s).

The rest of this guide assumes **Option A**.

---

## Step 1 — Apply the patch and push

The patch only touches `.github/workflows/`, so it needs a credential with
`workflows` scope. The automation account that produced this branch is a
GitHub App without it, which is why the patch is staged rather than committed.

```bash
git checkout arena/019fa707-taiai      # the branch this work lives on
git pull

git apply --check docs/pending/ci-workflows.patch   # verify first
git apply docs/pending/ci-workflows.patch

git status                                          # 3 files under .github/workflows/
git diff --stat
```

Commit using Conventional Commits — `ci.yml` enforces the format on PR titles
via `check-title`, and matching it here keeps the history consistent:

```bash
git commit -m "ci: add ruff gate, widen JS syntax check, fix pip-audit, pin actions"
```

Push with a PAT that has the `workflows` scope. Prefer a one-shot push over
rewriting the remote, so the token never persists in `.git/config`:

```bash
git push https://YOUR_PAT@github.com/QUESTQUOTIENT/TaiAI.git arena/019fa707-taiai
```

> Do not use `https://USER:PAT@...` with `git remote set-url`: that writes the
> token to `.git/config` in plaintext, where it survives until you remember to
> reset it. If you do use it, follow up with
> `git remote set-url origin https://github.com/QUESTQUOTIENT/TaiAI.git`.
>
> Cleanest alternative — no token in the shell at all:
> ```bash
> gh auth login --scopes workflow     # then just:
> git push origin arena/019fa707-taiai
> ```

### Already using the zip?

`TaiAi-source.zip` was built from a tree with this patch **already applied** —
the App restriction affects `git push`, not a manual upload. If you are
uploading the archive, skip Step 1 entirely.

### Verify the push

```bash
gh run list --branch arena/019fa707-taiai --limit 10
```

You should see `Python lint (ruff, error subset)` appear as a new check.

---

## Step 2 — Merge to `main` first

Branch protection can only require checks that GitHub has **seen before** — the
picker lists names from recent check runs. `Python lint (ruff, error subset)` is
new and will not appear until it has run at least once.

So: open the PR, let CI run, merge to `main`, *then* configure protection.

```bash
gh pr create --base main --head arena/019fa707-taiai \
  --title "fix(ci,deps,tests): restore quality gates, clear 26 CVEs, green the suite" \
  --body-file UPDATE-REPORT.md
```

---

## Step 3 — Enable branch protection

**Settings → Branches → Add branch ruleset** (or classic **Add rule**), pattern
`main`.

Enable **Require status checks to pass before merging**, then add exactly:

```
Python syntax (compileall)
Python lint (ruff, error subset)
JS syntax (node --check)
Python tests (pytest)
```

Type them exactly as shown, including parentheses. If a name does not
autocomplete, it has not run recently — trigger it once and come back.

Also enable **Require branches to be up to date before merging**. Without it a
PR can pass against a stale base and still break `main` on merge.

### Or via CLI

```bash
gh api -X PUT repos/QUESTQUOTIENT/TaiAI/branches/main/protection \
  --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": [
      "Python syntax (compileall)",
      "Python lint (ruff, error subset)",
      "JS syntax (node --check)",
      "Python tests (pytest)"
    ]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null
}
JSON
```

`enforce_admins: false` deliberately leaves you an escape hatch for a genuine
emergency. Set it to `true` once the rule has settled.

---

## Step 4 — Prove the rule actually blocks

Worth doing — a protection rule with a mistyped name looks identical to a
working one until the day it matters.

```bash
git checkout -b test/verify-branch-protection
printf 'def broken(\n' >> src/_protection_probe.py
git add src/_protection_probe.py
git commit -m "test: verify branch protection blocks a syntax error"
git push origin test/verify-branch-protection
gh pr create --base main --fill
```

Expected: `Python syntax (compileall)` and `Python lint (ruff, error subset)`
both go red, and **Merge** is disabled.

Then clean up:

```bash
gh pr close --delete-branch
```

A useful second probe, since it is the exact class of bug that reached `main`
before: append a stray quote to any file under `static/js/` and confirm
`JS syntax (node --check)` catches it. That job now scans all 162 non-vendored
JS files, including the four top-level `static/*.js` the old glob skipped.

---

## Step 5 — Document it

Worth a short note in `CONTRIBUTING.md` (which already covers testing) rather
than `README.md`, since it is contributor-facing:

> PRs to `main` must pass four required checks: Python syntax, Python lint
> (ruff `E9,F63,F7,F82`), JS syntax, and the pytest suite. Run
> `python -m pytest -q` and
> `ruff check --select E9,F63,F7,F82 app.py core routes src services scripts tests`
> locally first.

`UPDATE-REPORT.md` already records the deferred items (Python 3.14 bump,
`filter-repo` rewrite) with reasoning, so no change needed there.

---

## Afterwards

Once the rule is live and green for a week or so:

1. **Ratchet ruff.** Widen `--select` incrementally — `E`/`W` for style,
   then `B` (bugbear). Keep it a gate, never relax it silently.
2. **Reconsider `pip-audit`.** If you want it required, take Option B above.
3. **Revisit `enforce_admins`.** Flip to `true` when comfortable.
