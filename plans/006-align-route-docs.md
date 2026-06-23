# Plan 006: Align route documentation with the implemented API

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 1261d71..HEAD -- README.md apps/web/README.md docs/API_CONTRACT.md apps/server/src/routes/workouts.ts apps/server/src/routes/metrics.ts package.json`
> If any in-scope file changed since this plan was written, compare the "Current state" excerpts against live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: `plans/002-bound-public-list-limits.md`, `plans/003-hide-internal-500-messages.md`
- **Category**: docs
- **Planned at**: commit `1261d71`, 2026-06-14

## Why this matters

This repo uses docs as an API contract, but the root README's route list has fallen behind the implemented server. The dedicated API contract is closer to reality, while `apps/web/README.md` is still create-next-app boilerplate that suggests wrong commands and files. Keeping docs aligned reduces onboarding cost and prevents executor agents from planning against stale surface area.

## Current state

- `README.md` omits several implemented routes from its API surface list.
- `docs/API_CONTRACT.md` documents many newer routes and should remain the detailed contract.
- `apps/web/README.md` still says to run `npm run dev` and edit `app/page.tsx`, which does not match this Bun workspace or current app layout.
- `package.json` is the source for development commands.

Root README excerpt from `README.md:205`:

```md
## API Surface

The server currently exposes:

- `GET /workouts`
- `GET /workouts/:id`
- `GET /workouts/:id/hr`
- `GET /workouts/:id/zones`
- `GET /workouts/:id/efficiency`
...
- `GET /metrics/recovery-flag`
```

Implemented workout routes from `apps/server/src/routes/workouts.ts:17`:

```ts
app.get("/", async (c) => toHttp(c, await service.workouts.list(c.req.query())));
app.get("/performance-runs", async (c) =>
  toHttp(c, await service.workouts.performanceRuns(c.req.query())),
);
app.get("/:id", async (c) => toHttp(c, await service.workouts.detail(c.req.param("id"))));
app.get("/:id/hr", async (c) => toHttp(c, await service.workouts.hr(c.req.param("id"))));
app.get("/:id/zones", async (c) => toHttp(c, await service.workouts.zones(c.req.param("id"))));
```

Implemented metric routes include `running-dynamics` and composites in `apps/server/src/routes/metrics.ts:46`:

```ts
app.get("/running-dynamics", async (c) =>
  toHttp(c, await service.metrics.runningDynamics(c.req.query())),
);
app.get("/composites/report", async (c) =>
  toHttp(c, await service.metrics.compositesReport(c.req.query())),
);
```

Web README excerpt from `apps/web/README.md:1`:

```md
This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).
```

Repo conventions to match:

- Keep README concise; detailed route params belong in `docs/API_CONTRACT.md`.
- Use Bun commands from root `package.json`.
- Mention `apps/web/AGENTS.md`: Next.js version-specific docs must be read before page code changes.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Docs lint via Biome | `bun run check:ci` | exit 0 |
| Test suite | `bun test` | exit 0 |

## Scope

**In scope**:

- `README.md`
- `apps/web/README.md`
- `docs/API_CONTRACT.md` only if plans 002 or 003 changed limit/error contract and docs need final alignment

**Read-only reference paths**:

- `apps/server/src/routes/workouts.ts`
- `apps/server/src/routes/metrics.ts`
- `package.json`

**Out of scope**:

- Source code changes.
- Adding generated OpenAPI docs.
- Changelog updates unless the maintainer explicitly asks for release prep.

## Git workflow

- Branch: `advisor/006-align-route-docs`
- Commit message style: `docs: align API and web app docs`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Update the root API surface list

In `README.md`, update the `## API Surface` bullet list so it includes every route registered in:

- `apps/server/src/routes/workouts.ts`
- `apps/server/src/routes/metrics.ts`

At minimum, add currently omitted routes:

- `GET /workouts/performance-runs`
- `GET /workouts/:id/stats`
- `GET /workouts/:id/events`
- `GET /workouts/:id/metadata`
- `GET /workouts/:id/routes`
- `GET /metrics/running-dynamics`
- all `/metrics/composites/*` routes listed in `docs/API_CONTRACT.md`

Keep detailed query params out of README and point readers to `docs/API_CONTRACT.md`.

**Verify**: `rg -n "performance-runs|running-dynamics|composites/report|:id/routes" README.md` -> all patterns appear.

### Step 2: Replace the web app boilerplate README

Rewrite `apps/web/README.md` for this repo. Include:

- The app role: Next.js dashboard for `vitals-db`.
- Root-first setup command: `bun install`.
- API server command from repo root: `DB_PATH=./vitals.duckdb bun run health serve`.
- Web dev command from repo root: `bun run --filter @vitals/web dev`.
- `VITALS_API_URL` behavior.
- Main routes: `/`, `/performance`, `/sleep`, `/workouts`, `/workouts/:id`.
- Verification commands relevant to web work: `bun run check:ci`, `bun run typecheck`, `bun run build:web`, `bun test apps/web`.
- Note to read `apps/web/AGENTS.md` before changing Next.js page code.

Do not include create-next-app instructions or npm/yarn/pnpm command variants.

**Verify**: `rg -n "create-next-app|npm run dev|yarn|pnpm|app/page.tsx" apps/web/README.md` -> no matches.

### Step 3: Reconcile detailed API contract after dependent plans

If plans 002 and 003 have landed, ensure `docs/API_CONTRACT.md` reflects:

- `/workouts` and `/workouts/performance-runs` default/max limits.
- `500 { error: "internal_error" }` without a raw `message`.

If those plans have not landed, do not pre-document behavior that is not implemented. Instead, leave a short note in `plans/README.md` that this plan remains blocked on 002/003.

**Verify**: `rg -n "max|internal_error" docs/API_CONTRACT.md` -> contract matches implemented behavior.

### Step 4: Run docs-safe verification

Run Biome and tests. Markdown is not heavily linted by Biome here, but `check:ci` catches JSON/package formatting drift.

**Verify**:

- `bun run check:ci` -> exit 0
- `bun test` -> exit 0

## Test plan

- This is a docs-only plan. Verification is command-based and search-based.
- Use route files as the source of truth for README route bullets.
- Use `package.json` as the source of truth for commands.

## Done criteria

- [ ] README route list includes every implemented workout and metrics route.
- [ ] README still points detailed params and DTOs to `docs/API_CONTRACT.md`.
- [ ] `apps/web/README.md` no longer contains create-next-app boilerplate.
- [ ] `apps/web/README.md` uses Bun workspace commands only.
- [ ] `docs/API_CONTRACT.md` matches implemented limit and 500-error behavior if dependent plans landed.
- [ ] `bun run check:ci` exits 0.
- [ ] `bun test` exits 0.
- [ ] No source files are modified.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report if:

- Route files and `docs/API_CONTRACT.md` disagree in a way that requires code investigation.
- Plans 002 or 003 have not landed but the docs change would need to describe their future behavior.
- Updating docs reveals a missing public route test; do not add tests in this docs-only plan.

## Maintenance notes

When adding routes, update `docs/API_CONTRACT.md` in the same PR as the route and keep README as a concise index. Do not let package-local generated template docs re-enter the repo.
