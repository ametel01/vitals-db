# Plan 005: Harden workout identity against source collisions

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report; do not improvise. When done, update the status row for this plan in `plans/README.md`, unless a reviewer tells you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 1040362..HEAD -- packages/ingest/src/mappers.ts packages/ingest/src/__tests__/mappers.test.ts packages/ingest/src/__tests__/ingest.test.ts packages/ingest/src/writer.ts README.md`
> If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding. On mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/001-align-verification-gates.md
- **Category**: bug
- **Planned at**: commit `1040362`, 2026-06-13

## Why this matters

Workout rows use a synthetic SHA-1 id. Today that id is derived only from workout activity type and normalized start/end timestamps. If an export contains two same-type workouts with the same time window from different sources, the second workout row is skipped by `ON CONFLICT`, but source-specific child rows can still attach to the same id, blending stats/routes/metadata from distinct workouts.

## Current state

- Dedup keys for records include source, but workout ids do not:

```ts
packages/ingest/src/mappers.ts:67-78
function dedupKey(
  type: string,
  startTs: string,
  endTs: string,
  value: string,
  source: string | null,
): string {
  return `${type}|${startTs}|${endTs}|${value}|${source ?? ""}`;
}

function workoutIdOf(rawType: string, startTs: string, endTs: string): string {
  return createHash("sha1").update(`${rawType}|${startTs}|${endTs}`).digest("hex");
}
```

- `mapWorkout` stores the id and source:

```ts
packages/ingest/src/mappers.ts:473-485
export function mapWorkout(w: ParsedWorkout): MappedInsert {
  const startTsMs = hkDateToMs(w.startDate);
  const endTsMs = hkDateToMs(w.endDate);
  const startTs = formatDuckTs(startTsMs);
  const endTs = formatDuckTs(endTsMs);
  const source = w.sourceName;
  const canonicalType = canonicalWorkoutType(w.workoutActivityType);
  const durationSec = computeWorkoutDurationSec(w, startTsMs, endTsMs);
  const id = workoutIdOf(w.workoutActivityType, startTs, endTs);

  return makeMapped(
    "workouts",
    [id, canonicalType, startTs, endTs, durationSec, source],
```

- Child workout rows reuse the same id derivation:

```ts
packages/ingest/src/mappers.ts:496-515
function workoutIdForParsedWorkout(w: ParsedWorkout): {
  id: string;
  ...
} {
  const startTsMs = hkDateToMs(w.startDate);
  const endTsMs = hkDateToMs(w.endDate);
  const startTs = formatDuckTs(startTsMs);
  const endTs = formatDuckTs(endTsMs);
  return {
    id: workoutIdOf(w.workoutActivityType, startTs, endTs),
    ...
    source: w.sourceName,
  };
}
```

- The writer skips duplicate workout ids:

```ts
packages/ingest/src/writer.ts:19-21
workouts:
  "INSERT INTO workouts (id, type, start_ts, end_ts, duration_sec, source) " +
  "VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING RETURNING id",
```

Repo conventions: ingest tests create temporary DuckDB files, run migrations, ingest fixture XML, and assert row counts with SQL. Mapper tests are small unit tests around `mapRecord`/`mapWorkout`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Mapper tests | `bun test packages/ingest/src/__tests__/mappers.test.ts` | exit 0 |
| Ingest tests | `bun test packages/ingest/src/__tests__/ingest.test.ts` | exit 0 |
| Query/API tests | `bun test packages/queries/src/__tests__ apps/server/src/__tests__/server.test.ts` | exit 0 |
| Full gate | `bun run verify` | exit 0 |

## Scope

**In scope**:
- `packages/ingest/src/mappers.ts`
- `packages/ingest/src/__tests__/mappers.test.ts`
- `packages/ingest/src/__tests__/ingest.test.ts`
- `README.md` if user-facing rebuild notes are needed

**Out of scope**:
- Changing the `workouts` table schema.
- Updating existing database rows in place.
- Changing route ids or adding redirects for already-ingested local databases.
- Changing non-workout record deduplication.

## Git workflow

- Branch: `advisor/005-harden-workout-identity`
- Commit message: `fix(ingest): include source in workout identity`
- Do not push unless the operator asks.

## Steps

### Step 1: Add characterization tests for current collision risk

In `packages/ingest/src/__tests__/mappers.test.ts`, add tests showing the desired new behavior:

- Same type/start/end/source produces the same id.
- Same type/start/end but different `sourceName` produces different ids.
- Same type/start/end/source but different duration still produces the same id, preserving current duplicate-window behavior for duration-only differences.

Use the existing `"workout id remains stable for identical workouts"` test as the pattern.

**Verify**: `bun test packages/ingest/src/__tests__/mappers.test.ts` -> initially fails until Step 2 changes identity.

### Step 2: Include source in workout id derivation

Update `workoutIdOf` in `packages/ingest/src/mappers.ts` to accept `source: string | null` and include it in the hash input. Use the same null convention as `dedupKey`, `source ?? ""`.

Target behavior:

```ts
function workoutIdOf(rawType: string, startTs: string, endTs: string, source: string | null): string {
  return createHash("sha1").update(`${rawType}|${startTs}|${endTs}|${source ?? ""}`).digest("hex");
}
```

Update both call sites:

- `mapWorkout(...)`
- `workoutIdForParsedWorkout(...)`

Do not include duration unless the product decision changes; the current ingest test intentionally treats same-window changed-duration workouts as duplicates.

**Verify**: `bun test packages/ingest/src/__tests__/mappers.test.ts` -> exit 0.

### Step 3: Add an integration test for source collision

In `packages/ingest/src/__tests__/ingest.test.ts`, add a fixture with two running workouts sharing start/end/type but different `sourceName`, each with at least one distinct child context row such as metadata or route. Assert:

- `stats.inserted.workouts` is `2`.
- `SELECT COUNT(*) FROM workouts` is `2`.
- Child rows attach to two distinct `workout_id` values.

Keep the existing `"duplicate workout window with changed duration does not abort ingestion"` test passing; it should still insert one workout when only duration differs.

**Verify**: `bun test packages/ingest/src/__tests__/ingest.test.ts` -> exit 0.

### Step 4: Document rebuild implications

If the id derivation changes, existing local `vitals.duckdb` rows keep old ids until rebuild. Add a short note to `README.md` near the rebuild section:

- New imports use source-aware workout ids.
- To backfill historical workout ids and child context consistency, run `bun run health rebuild`.
- Existing API route ids for old rows can change after rebuild because ids are derived from source/type/time.

**Verify**: `bun run check:ci` -> exit 0.

## Test plan

- Mapper unit tests for id stability and source sensitivity.
- Ingest integration test for same-window different-source workouts.
- Existing ingest duplicate-duration test must continue to pass.
- Run query/API tests to catch downstream assumptions about id format.

Verification: `bun test packages/ingest/src/__tests__/mappers.test.ts packages/ingest/src/__tests__/ingest.test.ts`, `bun test packages/queries/src/__tests__ apps/server/src/__tests__/server.test.ts`, and `bun run verify` -> all exit 0.

## Done criteria

- [ ] Workout id hash includes source.
- [ ] Same-window different-source workouts produce different ids.
- [ ] Same-window same-source changed-duration duplicate behavior remains unchanged.
- [ ] Child workout context rows use the same source-aware id as their parent workout.
- [ ] README documents rebuild/id implications.
- [ ] `bun run verify` exits 0.
- [ ] `git status --short` shows only in-scope files plus `plans/README.md` if you updated the plan status.

## STOP conditions

Stop and report back if:

- Product intent requires merging same-window workouts across sources.
- Existing tests or docs rely on workout ids being stable across source changes.
- Fixing downstream references requires an in-place database migration.
- The live code has already replaced synthetic workout ids with Apple-provided ids.

## Maintenance notes

Workout ids are public in route paths, so changing identity semantics is user-visible after rebuild. Reviewers should confirm the README note is clear and that child context rows cannot attach to a different id derivation than the parent workout.

