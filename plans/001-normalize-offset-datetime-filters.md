# Plan 001: Normalize offset datetime filters before DuckDB queries

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 1261d71..HEAD -- packages/queries/src/dates.ts packages/queries/src/__tests__/workouts.test.ts`
> If either in-scope file changed since this plan was written, compare the "Current state" excerpts against live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `1261d71`, 2026-06-14

## Why this matters

The API contract accepts `YYYY-MM-DD` and ISO datetimes with timezone offsets for date bounds. Apple Health rows are UTC-normalized into DuckDB `TIMESTAMP` columns, but DuckDB casts a string like `2024-06-01T00:00:00+08:00` to the wall-clock timestamp `2024-06-01 00:00:00`, ignoring the offset. That means offset datetime requests can silently miss the rows the caller asked for. Fixing this at the query date-normalization boundary keeps all analytics routes consistent without changing response shapes.

## Current state

- `packages/queries/src/dates.ts` centralizes range-bound normalization for most query helpers.
- `packages/queries/src/workouts.ts` calls `normalizeRangeStart` and `normalizeRangeEnd` before binding query params.
- `packages/queries/src/__tests__/workouts.test.ts` already covers date-only inclusivity and is the right place for a regression test.

Current excerpt from `packages/queries/src/dates.ts:15`:

```ts
export interface DateRange {
  /** ISO 8601 date (`YYYY-MM-DD`) or datetime; DuckDB coerces to TIMESTAMP. */
  from: string;
  /** ISO 8601 date (`YYYY-MM-DD`) or datetime; DuckDB coerces to TIMESTAMP. */
  to: string;
}

export function normalizeRangeStart(value: string): string {
  return isDateOnly(value) ? `${value} 00:00:00` : value;
}

export function normalizeRangeEnd(value: string): { operator: "<" | "<="; value: string } {
  if (!isDateOnly(value)) {
    return { operator: "<=", value };
  }
```

Current excerpt from `packages/queries/src/workouts.ts:51`:

```ts
if (params.from !== undefined) {
  clauses.push("start_ts >= ?");
  values.push(normalizeRangeStart(params.from));
}
if (params.to !== undefined) {
  const upper = normalizeRangeEnd(params.to);
  clauses.push(`start_ts ${upper.operator} ?`);
  values.push(upper.value);
}
```

Repo conventions to match:

- TypeScript is strict with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
- Date-only bounds are full UTC days. Keep this behavior: `to=2024-06-08` must become `< 2024-06-09 00:00:00`.
- Tests use Bun test and colocated fixtures. Model the new regression after `packages/queries/src/__tests__/workouts.test.ts:40-50`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused tests | `bun test packages/queries/src/__tests__/workouts.test.ts` | exit 0; all workouts query tests pass |
| Query tests | `bun test packages/queries/src/__tests__` | exit 0 |
| Lint | `bun run check:ci` | exit 0; no fixes applied |
| Full tests | `bun test` | exit 0 |
| Typecheck | `bun run typecheck` | exit 0; may update ignored `dist/.tsbuildinfo` files |

## Scope

**In scope**:

- `packages/queries/src/dates.ts`
- `packages/queries/src/__tests__/workouts.test.ts`

**Out of scope**:

- Server route response shapes.
- Web date formatting.
- Changing the semantics of date-only UTC-day bounds.
- Any migration or database schema change.

## Git workflow

- Branch: `advisor/001-normalize-offset-datetime-filters`
- Commit message style: conventional commits, e.g. `fix(queries): normalize offset datetime filters`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Add a failing offset-datetime regression test

In `packages/queries/src/__tests__/workouts.test.ts`, add a test near the existing date-range tests. Use the existing fixture rows. The seeded `WORKOUT_ID` starts at `2024-06-01T08:00:00.000Z`; querying `from: "2024-06-01T16:00:00+08:00", to: "2024-06-01T17:00:00+08:00"` should include that workout because those offsets correspond to `08:00Z` through `09:00Z`.

Expected assertion shape:

```ts
const rows = await listWorkouts(db, {
  from: "2024-06-01T16:00:00+08:00",
  to: "2024-06-01T17:00:00+08:00",
});
expect(rows.map((row) => row.id)).toContain(WORKOUT_ID);
```

**Verify**: `bun test packages/queries/src/__tests__/workouts.test.ts` -> the new test fails before the fix.

### Step 2: Normalize non-date-only datetime bounds to UTC DuckDB timestamps

In `packages/queries/src/dates.ts`, add a helper that converts ISO datetimes with offsets to the UTC wall-clock string format used by ingest:

```ts
function normalizeDateTimeForDuckDb(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const iso = date.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 23)}`;
}
```

Then update:

- `normalizeRangeStart`: date-only still returns `${value} 00:00:00`; otherwise return `normalizeDateTimeForDuckDb(value)`.
- `normalizeRangeEnd`: date-only behavior unchanged; otherwise return `{ operator: "<=", value: normalizeDateTimeForDuckDb(value) }`.
- `DateRange` comments: say datetime values are normalized to UTC before SQL binding, not that DuckDB handles offset coercion.

**Verify**: `bun test packages/queries/src/__tests__/workouts.test.ts` -> all tests pass, including the new offset test.

### Step 3: Add one route-level regression if direct query coverage is not enough

If the direct query test does not exercise the server path well enough, add a server test in `apps/server/src/__tests__/server.test.ts` and include that file in scope before editing. The test should request `/workouts?from=2024-06-01T16:00:00+08:00&to=2024-06-01T17:00:00+08:00` and assert the matching workout is present. If you add this route-level test, also update the drift check and scope in this plan before committing.

**Verify**: `bun test apps/server/src/__tests__/server.test.ts packages/queries/src/__tests__/workouts.test.ts` -> exit 0.

## Test plan

- Add a regression test for an offset datetime range that maps to a known UTC workout row.
- Keep the existing date-only inclusivity tests passing.
- Run the focused workouts test, then all query tests, then full tests.

## Done criteria

- [ ] Offset datetime range test exists and fails without the code fix.
- [ ] `normalizeRangeStart` and `normalizeRangeEnd` normalize offset datetimes to UTC DuckDB timestamp strings.
- [ ] Date-only full-day behavior is unchanged.
- [ ] `bun test packages/queries/src/__tests__/workouts.test.ts` exits 0.
- [ ] `bun test` exits 0.
- [ ] `bun run check:ci` exits 0.
- [ ] `bun run typecheck` exits 0.
- [ ] No files outside the in-scope list are modified except ignored build metadata from verification.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report if:

- Live `packages/queries/src/dates.ts` no longer has `normalizeRangeStart` and `normalizeRangeEnd`.
- Fixing offset datetimes appears to require changing public response shapes.
- A query helper bypasses `dates.ts` for public API date ranges and the required fix expands beyond the in-scope files.
- Date-only upper bounds stop behaving as full inclusive UTC days.

## Maintenance notes

Reviewers should scrutinize timezone semantics. This repo deliberately stores DuckDB `TIMESTAMP` values as UTC-normalized wall-clock timestamps; do not switch columns to timezone-aware types in this plan. Future query helpers must use `normalizeRangeStart` and `normalizeRangeEnd` for public range filters.
