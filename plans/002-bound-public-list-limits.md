# Plan 002: Bound public list limits

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 1261d71..HEAD -- apps/server/src/services/read-service.ts apps/server/src/__tests__/server.test.ts docs/API_CONTRACT.md README.md`
> If any in-scope file changed since this plan was written, compare the "Current state" excerpts against live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: `plans/001-normalize-offset-datetime-filters.md`
- **Category**: security
- **Planned at**: commit `1261d71`, 2026-06-14

## Why this matters

The API exposes list endpoints without a maximum result size. `/workouts/performance-runs` is especially expensive because each returned row carries workout detail, efficiency, stats, events, metadata, and routes. A caller can ask for an arbitrarily large positive `limit`, which creates avoidable load and response-size risk. Adding explicit defaults and maximums makes the API safer and documents the intended contract.

## Current state

- `apps/server/src/services/read-service.ts` validates `limit` as any positive integer.
- `packages/queries/src/workouts.ts` binds the provided `LIMIT ?` but does not enforce a maximum.
- `docs/API_CONTRACT.md` documents optional limits but no max.
- `README.md` says the UI has `/workouts`: "latest 100 workouts", which is a useful default to make explicit.

Current excerpt from `apps/server/src/services/read-service.ts:167`:

```ts
const ListQuerySchema = z.object({
  type: z.string().min(1).optional(),
  from: DateInputSchema.optional(),
  to: DateInputSchema.optional(),
  limit: z.coerce.number().int().positive().optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});
```

Current excerpt from `apps/server/src/services/read-service.ts:175`:

```ts
const PerformanceRunsQuerySchema = z
  .object({
    from: DateInputSchema.optional(),
    to: DateInputSchema.optional(),
    limit: z.coerce.number().int().positive().optional(),
  })
```

Current server tests around limits are light (`apps/server/src/__tests__/server.test.ts:109`):

```ts
test("GET /workouts?limit=x is parsed as a number", async () => {
  const res = await app.request("/workouts?limit=1");
  expect(res.status).toBe(200);
  const body = z.array(WorkoutSummarySchema).parse(await res.json());
  expect(body).toHaveLength(1);
});
```

Repo conventions to match:

- Query validation lives in `createVitalsReadService`, not in route files.
- Invalid query params return `400 { error: "invalid_query", issues: ZodIssue[] }`.
- Tests are route-level in `apps/server/src/__tests__/server.test.ts`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Server tests | `bun test apps/server/src/__tests__/server.test.ts` | exit 0 |
| Lint | `bun run check:ci` | exit 0 |
| Full tests | `bun test` | exit 0 |
| Typecheck | `bun run typecheck` | exit 0; may update ignored build metadata |

## Scope

**In scope**:

- `apps/server/src/services/read-service.ts`
- `apps/server/src/__tests__/server.test.ts`
- `docs/API_CONTRACT.md`
- `README.md`

**Out of scope**:

- Query SQL refactors.
- Pagination response metadata.
- Web UI changes.
- Authentication or rate limiting.

## Git workflow

- Branch: `advisor/002-bound-public-list-limits`
- Commit message style: `fix(server): bound public list limits`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Add limit constants and validation bounds

In `apps/server/src/services/read-service.ts`, add constants near the schemas:

```ts
const DEFAULT_WORKOUT_LIST_LIMIT = 100;
const MAX_WORKOUT_LIST_LIMIT = 500;
const DEFAULT_PERFORMANCE_RUN_LIMIT = 14;
const MAX_PERFORMANCE_RUN_LIMIT = 50;
```

Then update Zod schemas:

- `ListQuerySchema.limit`: `.max(MAX_WORKOUT_LIST_LIMIT).default(DEFAULT_WORKOUT_LIST_LIMIT)` or equivalent behavior that sets the default after parsing.
- `PerformanceRunsQuerySchema.limit`: `.max(MAX_PERFORMANCE_RUN_LIMIT).default(DEFAULT_PERFORMANCE_RUN_LIMIT)` or equivalent.

Keep `offset` optional and non-negative.

**Verify**: `bun test apps/server/src/__tests__/server.test.ts` -> existing tests still pass.

### Step 2: Ensure parsed defaults are passed into query params

Still in `read-service.ts`, make sure `workouts.list` always passes a limit, even when the caller omits it. Make sure `workouts.performanceRuns` also passes its default from the server layer, not only from `packages/queries/src/workout_context.ts`.

Do not remove the query-layer default in `workout_context.ts`; keeping it is harmless defense for direct package callers.

**Verify**: `bun test apps/server/src/__tests__/server.test.ts` -> exit 0.

### Step 3: Add route tests for defaults and max rejection

In `apps/server/src/__tests__/server.test.ts`, add tests near the existing `/workouts` and `/workouts/performance-runs` tests:

- `/workouts?limit=501` returns `400` and `error === "invalid_query"`.
- `/workouts/performance-runs?from=2024-06-01&to=2024-06-06&limit=51` returns `400`.
- Existing `/workouts?limit=1` still returns one row.
- Existing `/workouts/performance-runs?...&limit=2` still returns two rows.

Do not assert that defaults produce exactly 100 or 14 rows unless the seed data makes that stable. It is enough to assert that omitted limits still return 200.

**Verify**: `bun test apps/server/src/__tests__/server.test.ts` -> exit 0 with the new tests.

### Step 4: Document the limits

Update:

- `docs/API_CONTRACT.md` for `GET /workouts`: `limit` is optional, default `100`, max `500`.
- `docs/API_CONTRACT.md` for `GET /workouts/performance-runs`: `limit` is optional, default `14`, max `50`.
- `README.md` API or dashboard wording if needed to keep "latest 100 workouts" aligned with the server default.

**Verify**: `bun run check:ci` -> exit 0.

## Test plan

- Add server tests for over-limit rejection on both public list endpoints.
- Keep existing limit parsing tests.
- Run all server tests, then full repo tests.

## Done criteria

- [ ] `/workouts` has a server default limit and maximum limit.
- [ ] `/workouts/performance-runs` has a server default limit and maximum limit.
- [ ] Over-limit requests return `400 invalid_query`.
- [ ] API docs state defaults and max values.
- [ ] `bun test apps/server/src/__tests__/server.test.ts` exits 0.
- [ ] `bun test` exits 0.
- [ ] `bun run check:ci` exits 0.
- [ ] `bun run typecheck` exits 0.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report if:

- A product requirement says callers must be able to request unbounded list results.
- Zod defaults conflict with `exactOptionalPropertyTypes` in a way that would require broad type changes.
- Existing web pages depend on omitted `/workouts` returning more than 100 rows.

## Maintenance notes

The numeric caps are policy choices. If the dashboard later needs deeper history, prefer adding cursor/pagination metadata or a purpose-built aggregate endpoint instead of raising caps blindly.
