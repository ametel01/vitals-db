# Plan 003: Resolve dependency audit advisories

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report; do not improvise. When done, update the status row for this plan in `plans/README.md`, unless a reviewer tells you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 1040362..HEAD -- package.json apps/server/package.json apps/web/package.json bun.lock apps/server/src apps/web`
> If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding. On mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S/M
- **Risk**: MED
- **Depends on**: plans/001-align-verification-gates.md
- **Category**: security
- **Planned at**: commit `1040362`, 2026-06-13

## Why this matters

`bun audit` currently fails with 30 advisories: high and moderate advisories under Hono plus a moderate PostCSS advisory through Next. Some Hono advisories may target middleware this repo does not use, but a failing audit means the repo has no clean security baseline and future dependency regressions are harder to spot. This plan updates the affected dependency ranges and verifies the API/web behavior still works.

## Current state

- Server depends on Hono 4.6.14:

```json
apps/server/package.json:15-21
"dependencies": {
  "@vitals/core": "workspace:*",
  "@vitals/db": "workspace:*",
  "@vitals/ingest": "workspace:*",
  "@vitals/queries": "workspace:*",
  "hono": "4.6.14",
  "zod": "3.23.8"
}
```

- Web depends on Next 16.2.6:

```json
apps/web/package.json:11-17
"dependencies": {
  "@vitals/core": "workspace:*",
  "echarts": "5.5.1",
  "next": "16.2.6",
  "react": "19.2.4",
  "react-dom": "19.2.4",
  "zod": "3.23.8"
}
```

- `bun audit` at commit `1040362` reports Hono `<4.12.18` and PostCSS `<8.5.10` via Next.
- The server currently uses Hono only for route registration and JSON responses; no auth/JWT/static middleware appears in `apps/server/src/routes/*` or `apps/server/src/server.ts`.
- The repo uses Bun workspaces and `bun.lock`; do not use npm/pnpm/yarn.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install/update lockfile | `bun update hono next` | exit 0; `bun.lock` changes |
| Security audit | `bun audit` | exit 0 or only advisories documented as not fixable without an upstream release |
| Server tests | `bun test apps/server/src/__tests__/server.test.ts` | exit 0 |
| Web build | `bun run --filter @vitals/web build` | exit 0 |
| Full gate | `bun run verify` | exit 0 |

## Scope

**In scope**:
- `apps/server/package.json`
- `apps/web/package.json`
- `bun.lock`
- Minimal source/test changes needed for Hono or Next API compatibility

**Out of scope**:
- Replacing Hono or Next.
- React/ECharts upgrades unless required by Next peer dependency constraints.
- UI redesign.
- Broad TypeScript or test refactors.

## Git workflow

- Branch: `advisor/003-resolve-audit-advisories`
- Commit message: `fix(deps): resolve audit advisories`
- Do not push unless the operator asks.

## Steps

### Step 1: Update the vulnerable direct dependencies

Run:

```bash
bun update hono next
```

Then inspect `apps/server/package.json`, `apps/web/package.json`, and `bun.lock`. Confirm Hono is at or above `4.12.18`, and confirm Next pulls a PostCSS version at or above `8.5.10` or otherwise removes the advisory.

**Verify**: `bun audit` -> exit 0. If it still reports advisories, continue only if the remaining advisories are unrelated to Hono/Next/PostCSS or require an unavailable upstream fix; otherwise keep updating the affected direct dependency.

### Step 2: Fix minimal compatibility breaks

If TypeScript or tests fail because Hono or Next changed types/APIs, make the smallest compatible source changes. Start with:

- `apps/server/src/server.ts`
- `apps/server/src/routes/metrics.ts`
- `apps/server/src/routes/workouts.ts`
- `apps/web/next.config.ts`
- `apps/web/app/*`

Do not refactor route/service structure. Keep response payloads unchanged.

**Verify**: `bun test apps/server/src/__tests__/server.test.ts` -> exit 0.

### Step 3: Verify the web build on the upgraded Next version

Run:

```bash
bun run --filter @vitals/web build
```

If Next reports a documented config change, update only the affected config or app file. Because `apps/web/AGENTS.md` says this Next version has breaking changes and to read `node_modules/next/dist/docs/`, use those local docs before changing Next-specific code.

**Verify**: `bun run --filter @vitals/web build` -> exit 0.

### Step 4: Run the full gate and audit

Run:

```bash
bun audit
bun run verify
```

Both should exit 0 after plan 001 has aligned `verify`.

**Verify**: both commands exit 0.

## Test plan

- No new tests are required unless compatibility changes alter behavior.
- Existing server contract tests are the main regression suite for Hono routing.
- Existing web build is the main regression suite for Next compatibility.

Verification: `bun audit`, `bun test apps/server/src/__tests__/server.test.ts`, `bun run --filter @vitals/web build`, and `bun run verify` -> all exit 0.

## Done criteria

- [ ] `bun audit` exits 0, or remaining advisories are documented in the PR with why no patched version is available.
- [ ] `apps/server/package.json` no longer pins vulnerable Hono 4.6.14.
- [ ] `apps/web/package.json` no longer resolves the vulnerable PostCSS range through Next.
- [ ] `bun.lock` is updated by Bun, not hand-edited.
- [ ] `bun test apps/server/src/__tests__/server.test.ts` exits 0.
- [ ] `bun run --filter @vitals/web build` exits 0.
- [ ] `bun run verify` exits 0.
- [ ] `git status --short` shows only in-scope files plus `plans/README.md` if you updated the plan status.

## STOP conditions

Stop and report back if:

- Hono or Next requires a major architectural rewrite.
- `bun update hono next` would upgrade React or other major dependencies outside the stated scope.
- `bun audit` still reports high vulnerabilities after all available direct updates.
- The lockfile cannot be regenerated with Bun.

## Maintenance notes

Add `bun audit` to a future CI/security plan only after this baseline is clean; otherwise CI will fail immediately. Reviewers should confirm no advisory is dismissed merely because the vulnerable package is "probably not used" unless the code path is truly unreachable and documented.

