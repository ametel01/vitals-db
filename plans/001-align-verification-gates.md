# Plan 001: Align the local and CI verification gates

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report; do not improvise. When done, update the status row for this plan in `plans/README.md`, unless a reviewer tells you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 1040362..HEAD -- package.json .github/workflows/ci.yml lefthook.yml README.md`
> If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding. On mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `1040362`, 2026-06-13

## Why this matters

This repo has a real quality gate, but the local and CI definitions do not currently match. CI installs `latest` Bun even though `package.json` pins Bun 1.3.13, and CI runs `build` after `check:ci`, `typecheck`, and `test` while the local `verify` script stops before `build`. Executors and humans should have one command that means "what CI will enforce."

## Current state

- `package.json` defines the canonical scripts and package manager:

```json
package.json:6-17
"packageManager": "bun@1.3.13",
"scripts": {
  "lint": "biome lint .",
  "format": "biome format --write .",
  "check": "biome check .",
  "check:ci": "biome check --error-on-warnings .",
  "typecheck": "tsc -b --pretty",
  "test": "bun test",
  "build": "bun run typecheck && bun run build:web",
  "build:web": "bun run --filter @vitals/web build",
  "verify": "bun run check:ci && bun run typecheck && bun run test",
```

- `.github/workflows/ci.yml` currently installs latest Bun and expands the gate inline:

```yaml
.github/workflows/ci.yml:10-16
- uses: oven-sh/setup-bun@v2
  with: { bun-version: latest }
- run: bun install --frozen-lockfile
- run: bun run check:ci
- run: bun run typecheck
- run: bun run test
- run: bun run build
```

- `lefthook.yml` runs typecheck in pre-commit and verify in pre-push:

```yaml
lefthook.yml:9-14
typecheck:
  run: bun run typecheck
pre-push:
  commands:
    verify:
      run: bun run verify
```

- `README.md` lists checks but not the canonical CI-equivalent command:

````markdown
README.md:228-234
## Development Checks

```bash
bun test
bun run typecheck
bun run check
```
````

Repo conventions: TypeScript/Bun monorepo, Biome formatting, conventional commits in git history such as `fix(web): upgrade Next for RSC CVE` and `chore: add React Doctor automation`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Check formatting/lint | `bun run check:ci` | exit 0; "No fixes applied" |
| Typecheck | `bun run typecheck` | exit 0 |
| Test | `bun test` | exit 0; all tests pass |
| Build | `bun run build` | exit 0 |
| Full gate after this plan | `bun run verify` | exit 0 and includes build |

## Scope

**In scope**:
- `package.json`
- `.github/workflows/ci.yml`
- `lefthook.yml`
- `README.md`

**Out of scope**:
- Dependency upgrades; that is plan 003.
- Source code changes under `apps/` or `packages/`.
- Any formatter rewrite of unrelated files.

## Git workflow

- Branch: `advisor/001-align-verification-gates`
- Commit message: `chore: align verification gates`
- Do not push unless the operator asks.

## Steps

### Step 1: Make `verify` match CI

In `package.json`, update the scripts so `bun run verify` runs the full CI-equivalent gate exactly once per phase. Prefer this shape:

```json
"build": "bun run typecheck && bun run build:web",
"verify": "bun run check:ci && bun run typecheck && bun run test && bun run build:web",
```

This avoids running `typecheck` twice inside `verify` while preserving the existing `build` script behavior for direct build calls.

**Verify**: `bun run verify` -> exit 0; it runs Biome, TypeScript, tests, and `@vitals/web` build.

### Step 2: Pin CI to the repo's package manager version and call `verify`

In `.github/workflows/ci.yml`, replace `bun-version: latest` with the pinned version from `package.json`, currently `1.3.13`. Replace the separate check/typecheck/test/build steps with `bun run verify`.

Target shape:

```yaml
- uses: oven-sh/setup-bun@v2
  with: { bun-version: 1.3.13 }
- run: bun install --frozen-lockfile
- run: bun run verify
```

**Verify**: `bun run check:ci` -> exit 0.

### Step 3: Keep Lefthook aligned

Review `lefthook.yml`. Keep the pre-commit `typecheck` fast enough for staged work, but ensure pre-push still calls `bun run verify`. If you change `typecheck` semantics, keep the hook command pointing at the same script name; do not introduce a second typecheck command that can drift.

**Verify**: `bun run typecheck` -> exit 0.

### Step 4: Update the README development checks

In `README.md`, update "Development Checks" so it names `bun run verify` as the CI-equivalent command, then lists narrower commands for iteration:

```bash
bun run verify
bun run check:ci
bun run typecheck
bun test
bun run build
```

Mention that CI runs `bun install --frozen-lockfile` followed by `bun run verify`.

**Verify**: `bun run check:ci` -> exit 0.

## Test plan

- No new unit tests are needed for script/workflow edits.
- Run the full local gate after changes.

Verification: `bun run verify` -> exit 0.

## Done criteria

- [ ] `package.json` has one CI-equivalent `verify` script that includes the web build.
- [ ] `.github/workflows/ci.yml` uses Bun `1.3.13`, not `latest`.
- [ ] `.github/workflows/ci.yml` invokes `bun run verify`.
- [ ] `README.md` documents `bun run verify`.
- [ ] `bun run verify` exits 0.
- [ ] `git status --short` shows only in-scope files plus `plans/README.md` if you updated the plan status.

## STOP conditions

Stop and report back if:

- `bun run verify` fails because Next/Bun 1.3.13 cannot build the current app.
- CI and `package.json` need different Bun versions for a documented reason.
- The repository has already introduced a new `ci` or `verify` convention that supersedes this plan.
- Fixing the gate requires dependency upgrades; hand off to plan 003 instead of mixing scopes.

## Maintenance notes

When Bun or Next is upgraded, update both `packageManager` and CI together. Reviewers should reject future changes that add CI-only checks without adding them to `verify`, unless the README explicitly explains why the command cannot run locally.
