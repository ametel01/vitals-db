# Plan 003: Hide internal 500 error messages from API clients

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 1261d71..HEAD -- apps/server/src/server.ts apps/server/src/__tests__/server.test.ts docs/API_CONTRACT.md`
> If any in-scope file changed since this plan was written, compare the "Current state" excerpts against live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: MED
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `1261d71`, 2026-06-14

## Why this matters

Unhandled server errors currently return `err.message` to API clients. Those messages can include table names, SQL fragments, file paths, or other implementation details. The API should keep its stable error code while logging enough locally for debugging. This reduces accidental information exposure without changing any successful response shape.

## Current state

- `apps/server/src/server.ts` owns the global Hono `onError` handler.
- Route-level validation errors already use structured `400` responses.
- `docs/API_CONTRACT.md` currently documents `500 { error: "internal_error", message: string }`.

Current excerpt from `apps/server/src/server.ts:15`:

```ts
app.onError((err, c) => {
  const message = err instanceof Error ? err.message : "internal_error";
  return c.json({ error: "internal_error", message }, 500);
});
```

Current contract excerpt from `docs/API_CONTRACT.md:479`:

```md
- `500 { error: "internal_error", message: string }` - unhandled server error
```

Repo conventions to match:

- Biome forbids `console.log`; use `process.stderr.write` if logging is needed.
- Route tests use `app.request(...)` and parse response bodies directly.
- Keep error codes as literal strings already used by the web API client: `invalid_query`, `invalid_params`, `not_found`, `internal_error`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Server tests | `bun test apps/server/src/__tests__/server.test.ts` | exit 0 |
| Lint | `bun run check:ci` | exit 0 |
| Full tests | `bun test` | exit 0 |
| Typecheck | `bun run typecheck` | exit 0; may update ignored build metadata |

## Scope

**In scope**:

- `apps/server/src/server.ts`
- `apps/server/src/__tests__/server.test.ts`
- `docs/API_CONTRACT.md`

**Out of scope**:

- Reworking all route error handling.
- Adding request IDs or structured logging infrastructure.
- Changing `400` or `404` error response shapes.
- Web client error display changes.

## Git workflow

- Branch: `advisor/003-hide-internal-500-messages`
- Commit message style: `fix(server): hide internal error messages`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Add a regression test for 500 response shape

In `apps/server/src/__tests__/server.test.ts`, add a test that creates an app with a stub DB whose query method throws a recognizable private message, for example `"private duckdb failure"`. Request a route that uses the stub, such as `/workouts`.

The test should assert:

- status is `500`
- body equals `{ error: "internal_error" }`
- body does not include the thrown message

Use a narrowly typed stub and cast it to `Db` only inside the test if necessary. Keep the stub local to the test.

**Verify**: `bun test apps/server/src/__tests__/server.test.ts` -> the new test fails before the server change.

### Step 2: Return only the stable 500 error code

In `apps/server/src/server.ts`, change the `onError` response to:

```ts
return c.json({ error: "internal_error" }, 500);
```

Optionally log the original error to stderr for local debugging:

```ts
const message = err instanceof Error ? err.stack ?? err.message : String(err);
process.stderr.write(`internal_error: ${message}\n`);
```

If adding logging makes tests noisy or brittle, skip logging in this plan. Do not use `console.log`.

**Verify**: `bun test apps/server/src/__tests__/server.test.ts` -> exit 0.

### Step 3: Update the API contract

In `docs/API_CONTRACT.md`, update the 500 error line to:

```md
- `500 { error: "internal_error" }` - unhandled server error
```

Do not change `400` or `404` contract text.

**Verify**: `bun run check:ci` -> exit 0.

## Test plan

- Add a route-level test that proves internal exception messages are not serialized.
- Keep existing validation and not-found tests passing.
- Run server tests, lint, and full tests.

## Done criteria

- [ ] Unhandled server errors return exactly `{ error: "internal_error" }`.
- [ ] A regression test proves a thrown private message is not present in the response body.
- [ ] `docs/API_CONTRACT.md` documents the new 500 shape.
- [ ] `bun test apps/server/src/__tests__/server.test.ts` exits 0.
- [ ] `bun test` exits 0.
- [ ] `bun run check:ci` exits 0.
- [ ] `bun run typecheck` exits 0.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report if:

- A downstream client test requires the raw `message` field on 500s.
- The only way to test the behavior requires modifying production route registration outside `server.ts`.
- Logging changes introduce persistent noisy test output that the repo does not already tolerate.

## Maintenance notes

If better observability is needed later, add a request ID and structured server-side logs in a separate plan. Do not reintroduce internal error messages into client responses.
