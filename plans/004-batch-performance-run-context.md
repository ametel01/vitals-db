# Plan 004: Batch performance-run context lookups

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 1261d71..HEAD -- packages/queries/src/workout_context.ts packages/queries/src/__tests__/workout_context.test.ts apps/server/src/__tests__/server.test.ts`
> If any in-scope file changed since this plan was written, compare the "Current state" excerpts against live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: `plans/002-bound-public-list-limits.md`
- **Category**: perf
- **Planned at**: commit `1261d71`, 2026-06-14

## Why this matters

`/workouts/performance-runs` exists to avoid a web-page waterfall, but the query layer still assembles each row by calling multiple per-workout functions. Even with capped limits, the endpoint performs repeated queries for stats, events, metadata, and routes. Batching those context lookups lowers query count and makes the endpoint scale more predictably while preserving the public DTO.

## Current state

- `packages/queries/src/workout_context.ts` contains both single-workout context readers and the aggregate performance-run reader.
- `getWorkoutPerformanceRunRows` lists running workouts, then maps each workout to six async calls.
- Existing tests assert the aggregate response shape and order.

Current excerpt from `packages/queries/src/workout_context.ts:136`:

```ts
export async function getWorkoutPerformanceRunRows(
  db: Db,
  params: WorkoutPerformanceRunRowsParams = {},
): Promise<WorkoutPerformanceRunRow[]> {
  const listParams: ListWorkoutsParams = {
    type: "Running",
    limit: params.limit ?? DEFAULT_PERFORMANCE_RUN_LIMIT,
  };
  if (params.from !== undefined) listParams.from = params.from;
  if (params.to !== undefined) listParams.to = params.to;
  const workouts = await listWorkouts(db, listParams);

  return Promise.all(
    workouts.map(async (workout) => {
      const [detail, efficiency, stats, events, metadata, routes] = await Promise.all([
        getWorkoutDetail(db, workout.id),
        getWorkoutEfficiency(db, workout.id),
        getWorkoutStats(db, workout.id),
        getWorkoutEvents(db, workout.id),
        getWorkoutMetadata(db, workout.id),
        getWorkoutRoutes(db, workout.id),
      ]);
```

Single-context readers to preserve:

```ts
export async function getWorkoutStats(db: Db, workoutId: string): Promise<WorkoutStat[]> { ... }
export async function getWorkoutEvents(db: Db, workoutId: string): Promise<WorkoutEvent[]> { ... }
export async function getWorkoutMetadata(db: Db, workoutId: string): Promise<WorkoutMetadata[]> { ... }
export async function getWorkoutRoutes(db: Db, workoutId: string): Promise<WorkoutRoute[]> { ... }
```

Repo conventions to match:

- Public DTO parsing uses `WorkoutPerformanceRunRowSchema.parse`.
- Query functions return DTOs, not raw DB rows.
- Tests use fixture DBs in `packages/queries/src/__tests__/workout_context.test.ts`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused tests | `bun test packages/queries/src/__tests__/workout_context.test.ts apps/server/src/__tests__/server.test.ts` | exit 0 |
| Query tests | `bun test packages/queries/src/__tests__` | exit 0 |
| Lint | `bun run check:ci` | exit 0 |
| Full tests | `bun test` | exit 0 |
| Typecheck | `bun run typecheck` | exit 0; may update ignored build metadata |

## Scope

**In scope**:

- `packages/queries/src/workout_context.ts`
- `packages/queries/src/__tests__/workout_context.test.ts`
- `apps/server/src/__tests__/server.test.ts` only if route-level coverage needs adjustment

**Out of scope**:

- Changing `WorkoutPerformanceRunRow` response shape.
- Rewriting `getWorkoutDetail` or `getWorkoutEfficiency`.
- Adding caching, telemetry, or pagination metadata.
- Web page changes.

## Git workflow

- Branch: `advisor/004-batch-performance-run-context`
- Commit message style: `perf(queries): batch performance run context`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Add private batch readers for context arrays

In `packages/queries/src/workout_context.ts`, add private helpers for multiple workout IDs:

- `getWorkoutStatsByWorkoutId(db, workoutIds): Promise<Map<string, WorkoutStat[]>>`
- `getWorkoutEventsByWorkoutId(db, workoutIds): Promise<Map<string, WorkoutEvent[]>>`
- `getWorkoutMetadataByWorkoutId(db, workoutIds): Promise<Map<string, WorkoutMetadata[]>>`
- `getWorkoutRoutesByWorkoutId(db, workoutIds): Promise<Map<string, WorkoutRoute[]>>`

Each helper should:

- Return an empty `Map` immediately when `workoutIds.length === 0`.
- Build placeholders with `workoutIds.map(() => "?").join(", ")`.
- Bind IDs as query parameters, not string interpolation of values.
- Preserve each existing row ordering (`ORDER BY workout_id, type`, `ORDER BY workout_id, ts, type`, `ORDER BY workout_id, key, value`, `ORDER BY workout_id, start_ts`).
- Parse each row with the same Zod schema used by the single-workout helper.

Do not export these helpers unless tests genuinely need direct access.

**Verify**: `bun test packages/queries/src/__tests__/workout_context.test.ts` -> exit 0.

### Step 2: Use batch readers in `getWorkoutPerformanceRunRows`

In `getWorkoutPerformanceRunRows`:

1. Get `workouts` as today.
2. Build `const workoutIds = workouts.map((workout) => workout.id);`.
3. Fetch batched stats/events/metadata/routes once each.
4. Keep `getWorkoutDetail` and `getWorkoutEfficiency` per workout for this plan.
5. When constructing each row, use `statsById.get(workout.id) ?? []` and the same pattern for events, metadata, and routes.

This plan intentionally reduces the context-array fanout first. A later plan can batch detail and efficiency if profiling still shows the endpoint as hot.

**Verify**: `bun test packages/queries/src/__tests__/workout_context.test.ts` -> existing aggregate tests pass.

### Step 3: Add a behavioral test for multi-row context preservation

In `packages/queries/src/__tests__/workout_context.test.ts`, extend the aggregate test or add a new one that seeds two running workouts where one has stats/metadata/routes and one has empty arrays. Assert:

- Response order is unchanged.
- Each row gets only its own context arrays.
- Empty contexts remain empty arrays.

Use the existing test around `getWorkoutPerformanceRunRows` as the structure.

**Verify**: `bun test packages/queries/src/__tests__/workout_context.test.ts` -> exit 0.

### Step 4: Confirm route-level shape is unchanged

Run server tests that parse `WorkoutPerformanceRunRowSchema`. If they fail because ordering or shape changed, fix the query implementation, not the public schema.

**Verify**: `bun test apps/server/src/__tests__/server.test.ts` -> exit 0.

## Test plan

- Preserve all existing workout-context tests.
- Add or strengthen aggregate tests to prove per-workout context arrays are correctly grouped after batching.
- Run server tests to prove public route shape is unchanged.

## Done criteria

- [ ] `getWorkoutPerformanceRunRows` no longer calls `getWorkoutStats`, `getWorkoutEvents`, `getWorkoutMetadata`, or `getWorkoutRoutes` inside the per-workout map.
- [ ] Batched context helpers bind workout IDs as SQL parameters.
- [ ] Empty workout ID lists are handled without invalid SQL.
- [ ] Existing public DTO shape is unchanged.
- [ ] `bun test packages/queries/src/__tests__/workout_context.test.ts apps/server/src/__tests__/server.test.ts` exits 0.
- [ ] `bun test` exits 0.
- [ ] `bun run check:ci` exits 0.
- [ ] `bun run typecheck` exits 0.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report if:

- Batching context arrays requires changing `WorkoutPerformanceRunRow`.
- DuckDB parameter binding does not support the planned placeholder strategy.
- The endpoint still returns incorrect context ownership after two fix attempts.
- You discover that detail/efficiency fanout dominates and batching context arrays alone is not worth landing.

## Maintenance notes

This plan deliberately leaves detail and efficiency batching out of scope. Reviewers should check grouping correctness carefully because cross-attaching metadata or routes to the wrong workout would be worse than the current performance issue.
