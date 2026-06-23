# Plan 012: Label ground contact time correctly in performance mechanics

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report; do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**:
> `git diff --stat 1261d71..HEAD -- apps/web/app/performance/page.tsx apps/web/lib/performance-mechanics.ts apps/web/lib/__tests__/performance-mechanics.test.ts packages/queries/src/running_dynamics.ts packages/ingest/src/mappers.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `1261d71`, 2026-06-23

## Why this matters

The performance page says it is displaying cadence, but the value is derived
from `avg_ground_contact_time_ms`. Ground contact time is not cadence, and
converting it with `60000 / value` produces a misleading "spm" number. Show the
metric the data layer actually provides: ground contact time in milliseconds.

## Current state

Relevant files:

- `apps/web/app/performance/page.tsx` - performance dashboard UI and model
  helpers.
- `packages/queries/src/running_dynamics.ts` - returns running mechanics fields
  from the `performance` table.
- `packages/ingest/src/mappers.ts` - maps Apple Health running dynamics into
  stored columns.
- `apps/web/lib/__tests__/format.test.ts` - exemplar for small pure web helper
  tests.

Current UI helper from `apps/web/app/performance/page.tsx:1044`:

```ts
function buildMechanics(
  result: Awaited<ReturnType<typeof getRunningDynamics>>,
): DashboardModel["mechanics"] {
  if (!result.ok || result.data.length === 0) return [];
  return [
    mechanicsRow(
      result.data,
      "Cadence",
      "avg_ground_contact_time_ms",
      (value) => `${formatNumber(60000 / value, 0)} spm`,
    ),
```

Current query fields from `packages/queries/src/running_dynamics.ts:10`:

```ts
const sql = `SELECT
               DATE(ts) AS day,
               AVG(vertical_oscillation_cm) AS avg_vertical_oscillation_cm,
               AVG(ground_contact_time_ms) AS avg_ground_contact_time_ms,
               AVG(stride_length_m) AS avg_stride_length_m
```

Current ingest mapping from `packages/ingest/src/mappers.ts:401`:

```ts
HKQuantityTypeIdentifierRunningGroundContactTime: () => {
  const raw = parseFiniteNumber(rec.value);
  if (raw === null) return null;
  const normalizedUnit = normalizeUnit(rec.unit);
  const ms = normalizedUnit === "s" || normalizedUnit === "sec" ? raw * 1000 : raw;
  return makeMapped(
    "performance",
    [startTs, null, null, null, null, ms, null],
```

Repo conventions to match:

- Keep web helper tests under `apps/web/lib/__tests__/`.
- Pure helpers should be small, named, and tested directly, like
  `apps/web/lib/__tests__/format.test.ts`.
- If plan 005 has already extracted performance page models, adapt this fix to
  the extracted helper instead of reintroducing page-local logic.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused test | `bun test apps/web/lib/__tests__/performance-mechanics.test.ts` | mechanics tests pass |
| Lint/check | `bun run check:ci` | exit 0, no warnings |
| Typecheck | `bun run typecheck` | exit 0, no TypeScript errors |
| Full tests | `bun test` | all tests pass |

## Scope

**In scope**:

- `apps/web/app/performance/page.tsx`
- `apps/web/lib/performance-mechanics.ts` (create if absent)
- `apps/web/lib/__tests__/performance-mechanics.test.ts` (create if absent)

**Out of scope**:

- Changing ingest or query semantics for running dynamics.
- Adding a new cadence field to the database, DTO, or API.
- Refactoring the whole performance dashboard. That broader extraction is
  already covered by plan 005.
- Changing chart styling or layout beyond labels/values needed for this bug.

## Git workflow

- Branch: `advisor/012-correct-running-mechanics-label`
- Commit style: conventional commits, for example
  `fix(web): label detail table headers`.
- Do not push or open a PR unless the operator explicitly asks.

## Steps

### Step 1: Add a pure helper test for mechanics rows

Create `apps/web/lib/__tests__/performance-mechanics.test.ts`.

Expected behavior to test:

- Given one running dynamics row with
  `avg_ground_contact_time_ms: 305`,
  `avg_stride_length_m: 0.95`, and
  `avg_vertical_oscillation_cm: 10.5`, the helper returns labels:
  `["Ground contact", "Stride length", "Vert. oscillation"]`.
- The ground-contact value is `"305 ms"`, not a cadence value.
- If a mechanics field is null for every row, that row is omitted.

This test should initially fail because the helper does not exist yet.

**Verify**:
`bun test apps/web/lib/__tests__/performance-mechanics.test.ts` -> fails
before implementation because the helper is missing.

### Step 2: Extract and correct the mechanics row builder

Create `apps/web/lib/performance-mechanics.ts` with a pure exported helper.

Suggested API:

```ts
import type { RunningDynamicsPoint } from "@vitals/core";

export interface PerformanceMechanicsRow {
  label: string;
  value: string;
  series: number[];
}

export function buildPerformanceMechanicsRows(
  rows: RunningDynamicsPoint[],
): PerformanceMechanicsRow[] {
  // ...
}
```

Required output:

- `avg_ground_contact_time_ms` -> label `Ground contact`, format as integer
  milliseconds, for example `305 ms`.
- `avg_stride_length_m` -> label `Stride length`, format as meters with 2
  decimals.
- `avg_vertical_oscillation_cm` -> label `Vert. oscillation`, format as
  centimeters with 1 decimal.
- Preserve current behavior of omitting metrics with no finite values.

Do not compute cadence from ground contact time.

**Verify**:
`bun test apps/web/lib/__tests__/performance-mechanics.test.ts` -> all tests
pass.

### Step 3: Wire the performance page to the helper

Update `apps/web/app/performance/page.tsx`:

- Import `buildPerformanceMechanicsRows` from
  `@/lib/performance-mechanics`.
- Replace the current page-local `buildMechanics` body with:

```ts
function buildMechanics(
  result: Awaited<ReturnType<typeof getRunningDynamics>>,
): DashboardModel["mechanics"] {
  return result.ok ? buildPerformanceMechanicsRows(result.data) : [];
}
```

- Remove the old `mechanicsRow` helper if nothing else uses it.
- Ensure there is no `"Cadence"` label and no `60000 / value` conversion left
  in `apps/web/app/performance/page.tsx`.

**Verify**:
`rg -n '"Cadence"|60000 / value|spm' apps/web/app/performance/page.tsx apps/web/lib/performance-mechanics.ts`
-> no matches.

### Step 4: Run final verification

Run:

```bash
bun test apps/web/lib/__tests__/performance-mechanics.test.ts
bun run check:ci
bun run typecheck
bun test
```

Expected result: every command exits 0.

## Test plan

- New `apps/web/lib/__tests__/performance-mechanics.test.ts` covers correct
  labels, correct units, and all-null omission.
- Existing query tests under `packages/queries/src/__tests__/running_dynamics.test.ts`
  continue to cover the API data fields.
- Final verification runs the focused helper test plus repo lint, typecheck,
  and full tests.

## Done criteria

- [ ] The performance page no longer displays ground contact time as cadence.
- [ ] No `60000 / value` cadence conversion remains in the performance page or
  new helper.
- [ ] New mechanics helper tests exist and pass.
- [ ] `bun run check:ci`, `bun run typecheck`, and `bun test` exit 0.
- [ ] No files outside the in-scope list are modified.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back if:

- Plan 005 has already moved `buildMechanics` into another file and the current
  excerpts no longer match.
- The product owner wants true cadence added instead of relabeling ground
  contact time. That requires new ingestion/API design and is out of scope.
- Fixing this requires changing `packages/core`, `packages/queries`, or
  `packages/ingest`.
- Any verification command fails twice after a reasonable fix attempt.

## Maintenance notes

- If true cadence is added later, it should be a separate Apple Health
  identifier/data-model change with DTO and query tests.
- Reviewers should scrutinize that the UI label, unit, and source field all
  describe the same metric.
- Plan 005 can later absorb `apps/web/lib/performance-mechanics.ts` into a
  broader dashboard model module if desired.
