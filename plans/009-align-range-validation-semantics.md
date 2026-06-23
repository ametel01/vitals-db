# Plan 009: Align range validation with public date-bound semantics

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 1261d71..HEAD -- apps/server/src/services/read-service.ts apps/server/src/__tests__/server.test.ts docs/API_CONTRACT.md packages/queries/src/dates.ts packages/queries/src/__tests__/workouts.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against live code before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: `plans/001-normalize-offset-datetime-filters.md`, `plans/002-bound-public-list-limits.md`
- **Category**: bug
- **Planned at**: commit `1261d71`, 2026-06-14

## Why this matters

Public date bounds accept both date-only values and offset datetimes. The docs
and query helpers treat date-only `to` bounds as a full UTC day, but server
range validation compares every date-only value at midnight. That rejects valid
mixed inputs such as `from=2024-06-01T12:00:00Z&to=2024-06-01`, even though the
`to` date represents the end of June 1 for query purposes. Separately,
`/workouts` does not reject reversed `from`/`to` ranges at all, unlike metrics
and `/workouts/performance-runs`.

## Current state

- `apps/server/src/services/read-service.ts` centralizes query validation.
- `packages/queries/src/dates.ts` normalizes date-only upper bounds to the next
  UTC day with a `<` operator.
- Plan 001 updates query normalization for offset datetimes; execute it first so
  validation and query binding use the same UTC semantics.
- Plan 002 edits `ListQuerySchema.limit`; execute it first to avoid overlapping
  schema edits in `read-service.ts`.

Current date validation excerpt from `apps/server/src/services/read-service.ts:119`:

```ts
function dateInputToTime(value: string): number {
  return new Date(isValidDateOnly(value) ? `${value}T00:00:00.000Z` : value).getTime();
}
```

Current ordered-range check from `apps/server/src/services/read-service.ts:128`:

```ts
function isOrderedRange(value: { from: string; to: string }): boolean {
  return dateInputToTime(value.from) <= dateInputToTime(value.to);
}
```

Current `/workouts` schema from `apps/server/src/services/read-service.ts:167`:

```ts
const ListQuerySchema = z.object({
  type: z.string().min(1).optional(),
  from: DateInputSchema.optional(),
  to: DateInputSchema.optional(),
  limit: z.coerce.number().int().positive().optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});
```

Current `/workouts/performance-runs` schema already has a reversed-range refine
from `apps/server/src/services/read-service.ts:175`:

```ts
const PerformanceRunsQuerySchema = z
  .object({
    from: DateInputSchema.optional(),
    to: DateInputSchema.optional(),
    limit: z.coerce.number().int().positive().optional(),
  })
  .refine(
    (value) =>
      value.from === undefined ||
      value.to === undefined ||
      isOrderedRange({ from: value.from, to: value.to }),
```

Query date-only upper-bound semantics from `packages/queries/src/dates.ts:26`:

```ts
export function normalizeRangeEnd(value: string): { operator: "<" | "<="; value: string } {
  if (!isDateOnly(value)) {
    return { operator: "<=", value };
  }
  ...
  return { operator: "<", value: `${nextDayText} 00:00:00` };
}
```

Relevant server tests from `apps/server/src/__tests__/server.test.ts:96`:

```ts
test("GET /workouts?from&to filters by date range", async () => {
  const res = await app.request("/workouts?from=2024-06-03&to=2024-06-03");
  expect(res.status).toBe(200);
```

Repo conventions to match:

- Invalid query params return `400 { error: "invalid_query", issues: ZodIssue[] }`.
- Route tests live in `apps/server/src/__tests__/server.test.ts`.
- Date-only bounds are documented as full UTC days in README and
  `docs/API_CONTRACT.md`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Server tests | `bun test apps/server/src/__tests__/server.test.ts` | exit 0 |
| Query date tests | `bun test packages/queries/src/__tests__/workouts.test.ts` | exit 0 |
| Lint | `bun run check:ci` | exit 0 |
| Full tests | `bun test` | exit 0 |
| Typecheck | `bun run typecheck` | exit 0; may update ignored `dist/.tsbuildinfo` files |

## Scope

**In scope**:

- `apps/server/src/services/read-service.ts`
- `apps/server/src/__tests__/server.test.ts`
- `docs/API_CONTRACT.md`

**Read-only reference paths**:

- `packages/queries/src/dates.ts`
- `packages/queries/src/__tests__/workouts.test.ts`

**Out of scope**:

- Reworking query SQL.
- Changing response DTOs.
- Changing date-only query semantics.
- Changing list limits; that belongs to Plan 002.
- Changing offset datetime query normalization; that belongs to Plan 001.

## Git workflow

- Branch: `advisor/009-align-range-validation-semantics`
- Commit message style: `fix(server): align range validation semantics`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Add route regressions for the two validation gaps

In `apps/server/src/__tests__/server.test.ts`, add tests near the existing
`/workouts` date-range tests:

- `/workouts?from=2024-06-14&to=2024-06-08` returns `400` and
  `error === "invalid_query"`.
- `/workouts?from=2024-06-03T12:00:00.000Z&to=2024-06-03` returns `200`. The
  body may be empty depending on fixture rows; assert only the status and that
  the JSON parses as `WorkoutSummary[]`.

Add a metric-level mixed-bound test near the reversed range tests:

- `/metrics/resting-hr?from=2024-06-01T12:00:00.000Z&to=2024-06-01` returns
  `200`.

The mixed-bound tests should fail before the validation fix because date-only
`to` is compared at midnight.

**Verify**: `bun test apps/server/src/__tests__/server.test.ts` -> new tests
fail before the fix.

### Step 2: Compare ranges using lower-bound and upper-bound semantics

In `apps/server/src/services/read-service.ts`, replace `dateInputToTime` with
helpers that mirror query-bound semantics:

```ts
function dateInputToRangeStartTime(value: string): number {
  return new Date(isValidDateOnly(value) ? `${value}T00:00:00.000Z` : value).getTime();
}

function dateInputToRangeEndTime(value: string): number {
  if (!isValidDateOnly(value)) return new Date(value).getTime();
  const start = new Date(`${value}T00:00:00.000Z`);
  return start.getTime() + 24 * 60 * 60 * 1000 - 1;
}
```

Then update:

```ts
function isOrderedRange(value: { from: string; to: string }): boolean {
  return dateInputToRangeStartTime(value.from) <= dateInputToRangeEndTime(value.to);
}
```

Keep same-day date-only ranges valid. Keep exact same timestamp datetime ranges
valid because non-date-only `to` remains inclusive in query helpers.

**Verify**: `bun test apps/server/src/__tests__/server.test.ts` -> mixed-bound
metric test passes.

### Step 3: Apply the ordered-range refine to `/workouts`

Update `ListQuerySchema` to reject reversed ranges when both optional bounds are
present, using the same optional-bound pattern as `PerformanceRunsQuerySchema`.
If Plan 002 has already added defaults and max limits, preserve those changes.

Expected shape:

```ts
const ListQuerySchema = z
  .object({
    type: z.string().min(1).optional(),
    from: DateInputSchema.optional(),
    to: DateInputSchema.optional(),
    limit: ...,
    offset: z.coerce.number().int().nonnegative().optional(),
  })
  .refine(
    (value) =>
      value.from === undefined ||
      value.to === undefined ||
      isOrderedRange({ from: value.from, to: value.to }),
    {
      message: "Expected to to be on or after from",
      path: ["to"],
    },
  );
```

**Verify**: `bun test apps/server/src/__tests__/server.test.ts` -> reversed
`/workouts` test returns `400 invalid_query`.

### Step 4: Document the workout list range behavior

In `docs/API_CONTRACT.md`, under `GET /workouts`, add a concise note:

- If both `from` and `to` are provided, `to` must not precede `from`; reversed
  ranges return `400 invalid_query`.
- Date-only `to` values keep the existing full UTC day semantics.

Do not pre-document Plan 002's max-limit behavior unless Plan 002 has already
landed.

**Verify**: `rg -n "GET /workouts|reversed|full UTC day|invalid_query" docs/API_CONTRACT.md`
-> the workout section contains the new range note.

### Step 5: Run repo checks

Run focused server tests, query date tests, lint, full tests, and typecheck.

**Verify**:

- `bun test apps/server/src/__tests__/server.test.ts` -> exit 0
- `bun test packages/queries/src/__tests__/workouts.test.ts` -> exit 0
- `bun run check:ci` -> exit 0
- `bun test` -> exit 0
- `bun run typecheck` -> exit 0

## Test plan

- Add server tests for reversed `/workouts` ranges.
- Add server tests for mixed datetime `from` plus date-only `to` on both a
  list route and a metric route.
- Keep existing reversed metric and performance-runs tests passing.
- Run focused server and query date tests, then full repo checks.

## Done criteria

- [ ] `/workouts?from=2024-06-14&to=2024-06-08` returns
  `400 invalid_query`.
- [ ] Mixed datetime `from` plus same-day date-only `to` is accepted when the
  date-only upper bound still represents the full UTC day.
- [ ] Existing exact same-day date-only ranges still work.
- [ ] Plan 001's offset datetime query tests still pass.
- [ ] Plan 002's list-limit schema changes, if present, are preserved.
- [ ] `docs/API_CONTRACT.md` documents workout reversed-range behavior.
- [ ] `bun test apps/server/src/__tests__/server.test.ts` exits 0.
- [ ] `bun test packages/queries/src/__tests__/workouts.test.ts` exits 0.
- [ ] `bun test` exits 0.
- [ ] `bun run check:ci` exits 0.
- [ ] `bun run typecheck` exits 0.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report if:

- Plan 001 has not landed and offset datetime query normalization is still the
  old DuckDB-coercion behavior.
- Plan 002 has changed `ListQuerySchema` in a way that makes the planned refine
  ambiguous.
- Product requirements say `/workouts` should silently return an empty list for
  reversed ranges while metrics reject them.
- Mixed datetime/date-only bounds need local-time rather than UTC-day semantics.

## Maintenance notes

Keep server validation and query-bound normalization in sync. Any future helper
that accepts public date ranges should use the same date-only lower/upper-bound
mental model: `from=YYYY-MM-DD` starts that UTC day, and `to=YYYY-MM-DD` covers
the whole UTC day.
