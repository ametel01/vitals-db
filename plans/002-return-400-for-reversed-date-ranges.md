# Plan 002: Return `400 invalid_query` for reversed date ranges

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report; do not improvise. When done, update the status row for this plan in `plans/README.md`, unless a reviewer tells you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 1040362..HEAD -- apps/server/src/services/read-service.ts apps/server/src/__tests__/server.test.ts docs/API_CONTRACT.md`
> If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding. On mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/001-align-verification-gates.md
- **Category**: bug
- **Planned at**: commit `1040362`, 2026-06-13

## Why this matters

The HTTP API validates date syntax but not date ordering at the service boundary. Composite endpoints call `buildCompositeWindows`, which throws when `to` is before `from`; `createApp` turns that into a `500 internal_error`. The API contract promises invalid query input returns `400 invalid_query`, so reversed ranges should be rejected before query code runs.

## Current state

- `apps/server/src/services/read-service.ts` validates date shape only:

```ts
apps/server/src/services/read-service.ts:116-119
const RangeSchema = z.object({
  from: DateInputSchema,
  to: DateInputSchema,
});
```

- Every range route uses `parseRange`:

```ts
apps/server/src/services/read-service.ts:240-242
function parseRange(raw: Record<string, string>): DateRange | InvalidQuery {
  const result = RangeSchema.safeParse(raw);
  return result.success ? result.data : invalidQuery(result.error.issues);
}
```

- Composite queries currently throw on reversed ranges:

```ts
packages/queries/src/composite_windows.ts:26-31
export function buildCompositeWindows(range: DateRange): CompositeWindows {
  const currentStart = startOfUtcDay(parseDateInput(range.from));
  const currentEnd = startOfUtcDay(parseDateInput(range.to));
  if (currentEnd < currentStart) {
    throw new Error("Date range end must be on or after start");
  }
```

- The server turns uncaught errors into `500` and includes the error message:

```ts
apps/server/src/server.ts:15-17
app.onError((err, c) => {
  const message = err instanceof Error ? err.message : "internal_error";
  return c.json({ error: "internal_error", message }, 500);
});
```

- The contract says invalid query params return `400`:

```markdown
docs/API_CONTRACT.md:86-88
Unless a route documents a different query shape, routes under `/metrics`
require both `from` and `to`. Invalid or missing values return `400` with
`{ error: "invalid_query", issues: ZodIssue[] }`.
```

Repo conventions: server routes convert `ServiceResult<T>` with `{ ok: false, error: "invalid_query", issues }`; tests in `apps/server/src/__tests__/server.test.ts` use `app.request(...)`, assert status, and parse JSON with Zod schemas.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused API tests | `bun test apps/server/src/__tests__/server.test.ts` | exit 0; all server tests pass |
| Full tests | `bun test` | exit 0; all tests pass |
| Lint/check | `bun run check:ci` | exit 0 |
| Typecheck | `bun run typecheck` | exit 0 |
| Full gate | `bun run verify` | exit 0 |

## Scope

**In scope**:
- `apps/server/src/services/read-service.ts`
- `apps/server/src/__tests__/server.test.ts`
- `docs/API_CONTRACT.md` only if you need to clarify that `to >= from` is required

**Out of scope**:
- `packages/queries/src/composite_windows.ts`; keep its defensive throw.
- `apps/server/src/server.ts`; do not hide all internal errors as a substitute for validation.
- Changing any successful response shape.

## Git workflow

- Branch: `advisor/002-reversed-date-ranges`
- Commit message: `fix(server): reject reversed date ranges`
- Do not push unless the operator asks.

## Steps

### Step 1: Add range-order validation to `RangeSchema`

In `apps/server/src/services/read-service.ts`, add a helper that normalizes `YYYY-MM-DD` and offset datetimes to UTC day/order semantics. The simplest safe target is:

- Parse date-only values as `${value}T00:00:00.000Z`.
- Parse datetime values with `new Date(value)` after `DateInputSchema` has accepted them.
- Compare `from.getTime() <= to.getTime()`.
- Add a `.refine(...)` to `RangeSchema` with `path: ["to"]` and message `Expected to to be on or after from`.

Keep `ToDateSchema` unchanged.

**Verify**: `bun test apps/server/src/__tests__/server.test.ts` -> existing tests still pass or fail only because reversed-range tests are not added yet.

### Step 2: Add server contract tests for reversed ranges

In `apps/server/src/__tests__/server.test.ts`, add tests near the existing invalid date range tests. Cover at least:

- `GET /metrics/composites/report?from=2024-06-14&to=2024-06-08` returns status `400` and body `{ error: "invalid_query", issues: [...] }`.
- `GET /metrics/recovery-flag?from=2024-06-14&to=2024-06-08` returns status `400`.
- One raw metric route such as `/metrics/resting-hr?from=2024-06-14&to=2024-06-08` returns status `400`; before this plan it returned `200 []`.

Use the existing pattern:

```ts
const res = await app.request("/metrics/zones?from=2024-06-01&to=not-a-date");
expect(res.status).toBe(400);
```

**Verify**: `bun test apps/server/src/__tests__/server.test.ts` -> exit 0 and the new tests pass.

### Step 3: Clarify the API contract if needed

If the contract does not already state ordering, add one sentence under the metrics date-bound section: "`to` must be on or after `from`; reversed ranges return `400 invalid_query`." Keep the existing error shape unchanged.

**Verify**: `bun run check:ci` -> exit 0.

## Test plan

- New tests in `apps/server/src/__tests__/server.test.ts` for reversed ranges on composite, recovery flag, and raw metric routes.
- Existing invalid-date tests should still pass.
- Existing `packages/queries/src/__tests__/composite_windows.test.ts` should remain unchanged; it documents the low-level defensive throw.

Verification: `bun test apps/server/src/__tests__/server.test.ts` and `bun run verify` -> both exit 0.

## Done criteria

- [ ] Reversed `from`/`to` returns `400 invalid_query` for every route using `parseRange`.
- [ ] Composite and recovery endpoints no longer leak `"Date range end must be on or after start"` as `500`.
- [ ] Missing or malformed date inputs still return `400 invalid_query`.
- [ ] `bun test apps/server/src/__tests__/server.test.ts` exits 0.
- [ ] `bun run verify` exits 0.
- [ ] `git status --short` shows only in-scope files plus `plans/README.md` if you updated the plan status.

## STOP conditions

Stop and report back if:

- The live service no longer has a shared `RangeSchema`/`parseRange` path.
- Matching current behavior requires some endpoints to accept reversed ranges intentionally.
- The fix requires changing `packages/queries` public APIs.
- Tests reveal existing clients depend on `200 []` for reversed ranges.

## Maintenance notes

Future endpoints that accept `{ from, to }` should use the shared `RangeSchema` path. Reviewers should check that new routes do not call composite query helpers directly with unvalidated raw query objects.

