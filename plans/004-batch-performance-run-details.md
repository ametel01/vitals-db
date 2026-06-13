# Plan 004: Batch performance run details behind one API call

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report; do not improvise. When done, update the status row for this plan in `plans/README.md`, unless a reviewer tells you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 1040362..HEAD -- apps/web/app/performance/page.tsx apps/web/lib/api.ts apps/server/src/services/read-service.ts apps/server/src/routes/workouts.ts apps/server/src/__tests__/server.test.ts packages/queries/src packages/core/src/dto.ts docs/API_CONTRACT.md`
> If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding. On mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/001-align-verification-gates.md
- **Category**: perf
- **Planned at**: commit `1040362`, 2026-06-13

## Why this matters

The performance page currently makes 16 top-level API calls, then up to 6 additional calls for each of 14 recent runs. On a local server this may be tolerable, but it scales poorly and duplicates query-layer work the API can batch. A single endpoint for recent running workout performance rows will make the page faster and give the contract tests one place to pin the shape.

## Current state

- `apps/web/app/performance/page.tsx` fetches top-level metrics and the workout list:

```ts
apps/web/app/performance/page.tsx:78-112
const [
  reportResult,
  rollingResult,
  ...
  recoveryTimesResult,
  workoutsResult,
] = await Promise.all([
  getAdvancedCompositeReport({ from: chartFrom, to }),
  ...
  getWorkoutRecoveryTimes({ from: chartFrom, to }),
  listWorkouts({ type: "Running", from: chartFrom, to, limit: RUN_LIMIT }),
]);
```

- It then fans out 6 calls per workout:

```ts
apps/web/app/performance/page.tsx:114-129
const runRows =
  workoutsResult.ok && workoutsResult.data.length > 0
    ? await Promise.all(
        workoutsResult.data.map(async (workout) => {
          const [detail, efficiency, stats, events, metadata, routes] = await Promise.all([
            getWorkoutDetail(workout.id),
            getWorkoutEfficiency(workout.id),
            getWorkoutStats(workout.id),
            getWorkoutEvents(workout.id),
            getWorkoutMetadata(workout.id),
            getWorkoutRoutes(workout.id),
          ]);
          return { workout, detail, efficiency, stats, events, metadata, routes };
        }),
      )
    : [];
```

- The server already exposes per-workout context routes:

```ts
apps/server/src/routes/workouts.ts:24-29
app.get("/:id/stats", async (c) => toHttp(c, await service.workouts.stats(c.req.param("id"))));
app.get("/:id/events", async (c) => toHttp(c, await service.workouts.events(c.req.param("id"))));
app.get("/:id/metadata", async (c) =>
  toHttp(c, await service.workouts.metadata(c.req.param("id"))),
);
app.get("/:id/routes", async (c) => toHttp(c, await service.workouts.routes(c.req.param("id"))));
```

Repo conventions: API response DTOs live in `packages/core/src/dto.ts`; query functions live in `packages/queries/src`; server service adapts query functions in `apps/server/src/services/read-service.ts`; web API helpers in `apps/web/lib/api.ts` validate responses with Zod.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused query/API tests | `bun test packages/queries/src/__tests__ apps/server/src/__tests__/server.test.ts` | exit 0 |
| Web API format/tests | `bun test apps/web/lib/__tests__/format.test.ts` | exit 0 |
| Web build | `bun run --filter @vitals/web build` | exit 0 |
| Full gate | `bun run verify` | exit 0 |

## Scope

**In scope**:
- `packages/core/src/dto.ts`
- `packages/core/src/__tests__/dto.test.ts`
- `packages/queries/src/workout_context.ts` or a new focused query module
- `packages/queries/src/__tests__/workout_context.test.ts` or a new focused test
- `packages/queries/src/index.ts`
- `apps/server/src/services/read-service.ts`
- `apps/server/src/routes/workouts.ts`
- `apps/server/src/__tests__/server.test.ts`
- `apps/web/lib/api.ts`
- `apps/web/app/performance/page.tsx`
- `docs/API_CONTRACT.md`

**Out of scope**:
- Removing the existing per-workout detail/context routes; keep them backward compatible.
- Changing existing `WorkoutDetail`, `WorkoutStat`, `WorkoutEvent`, `WorkoutMetadata`, or `WorkoutRoute` DTO shapes.
- UI redesign of the performance page.

## Git workflow

- Branch: `advisor/004-batch-performance-run-details`
- Commit message: `perf(web): batch performance run details`
- Do not push unless the operator asks.

## Steps

### Step 1: Add a batched DTO

In `packages/core/src/dto.ts`, add a DTO for one performance run row. It should include:

- `workout: WorkoutSummarySchema`
- `detail: WorkoutDetailSchema`
- `efficiency: WorkoutEfficiencySchema`
- `stats: z.array(WorkoutStatSchema)`
- `events: z.array(WorkoutEventSchema)`
- `metadata: z.array(WorkoutMetadataSchema)`
- `routes: z.array(WorkoutRouteSchema)`

Export the inferred type and an array schema. Add round-trip tests in `packages/core/src/__tests__/dto.test.ts` using existing fixture style.

**Verify**: `bun test packages/core/src/__tests__/dto.test.ts` -> exit 0.

### Step 2: Add a query/service that batches recent running rows

Add a query function that accepts `{ from, to, limit }` and returns the new row type. Keep behavior equivalent to the page today:

- Running workouts only.
- Descending start time.
- Default limit should match `RUN_LIMIT` (`14`) unless the caller supplies a validated limit.
- For each workout, include the same detail/efficiency/stats/events/metadata/routes data as the six current calls.

You may compose existing query functions initially. If you can batch SQL cleanly without changing behavior, do so, but correctness and tests matter more than micro-optimization in this plan.

**Verify**: `bun test packages/queries/src/__tests__/workout_context.test.ts packages/queries/src/__tests__/workouts.test.ts` -> exit 0.

### Step 3: Expose one server route

Add `GET /workouts/performance-runs` before `GET /workouts/:id` in `apps/server/src/routes/workouts.ts` so it is not captured as an id. Validate query params with the same date and limit conventions as `listWorkouts`.

Important: because Hono route ordering can matter, register the literal route before parameter routes.

Add server tests asserting:

- `GET /workouts/performance-runs?from=2024-06-01&to=2024-06-06&limit=2` returns status 200 and two or fewer Zod-valid rows.
- The row has all seven top-level keys.
- Invalid dates return `400 invalid_query`.

**Verify**: `bun test apps/server/src/__tests__/server.test.ts` -> exit 0.

### Step 4: Switch the performance page to one run-details call

In `apps/web/lib/api.ts`, add `getPerformanceRunRows(range, { limit })` that calls `workouts/performance-runs` and validates with the new array schema.

In `apps/web/app/performance/page.tsx`:

- Replace `workoutsResult` and the `runRows` fan-out with one `performanceRunsResult`.
- Keep `PerformanceRunRow` local type shape compatible with existing child components, or simplify it if the new DTO allows that cleanly.
- Existing components should keep rendering the same table and cards.
- Error handling should still show "Could not load running workouts" when the batched call fails.

**Verify**: `bun run --filter @vitals/web build` -> exit 0.

### Step 5: Document the new route

In `docs/API_CONTRACT.md`, document `GET /workouts/performance-runs`, including query params and response shape. State that it is additive and does not replace the per-workout routes.

**Verify**: `bun run check:ci` -> exit 0.

## Test plan

- DTO round-trip test for the new row schema in `packages/core/src/__tests__/dto.test.ts`.
- Query test for the batched rows in `packages/queries/src/__tests__`.
- Server contract test for the new route in `apps/server/src/__tests__/server.test.ts`.
- Existing performance page build verifies TypeScript compatibility.

Verification: `bun test packages/core/src/__tests__/dto.test.ts packages/queries/src/__tests__/workout_context.test.ts apps/server/src/__tests__/server.test.ts`, `bun run --filter @vitals/web build`, and `bun run verify` -> all exit 0.

## Done criteria

- [ ] Performance page no longer maps workouts to six per-workout API calls.
- [ ] A new batched route returns validated performance run rows.
- [ ] Existing per-workout routes still pass their tests.
- [ ] API contract documents the new route.
- [ ] `bun run --filter @vitals/web build` exits 0.
- [ ] `bun run verify` exits 0.
- [ ] `git status --short` shows only in-scope files plus `plans/README.md` if you updated the plan status.

## STOP conditions

Stop and report back if:

- Adding a batched route requires changing existing public DTOs.
- The literal route conflicts with `/:id` in a way that cannot be solved by ordering.
- The page has already been refactored away from this request fan-out.
- A proper batched implementation requires a broader query-layer redesign.

## Maintenance notes

If the performance page adds more per-run panels, prefer extending the batched row intentionally instead of reintroducing per-run fan-out. Reviewers should look for route ordering, Zod schema coverage, and whether the new endpoint preserves existing per-workout contract behavior.

