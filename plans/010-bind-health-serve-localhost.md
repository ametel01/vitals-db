# Plan 010: Bind health serve to localhost by default

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report; do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**:
> `git diff --stat 1261d71..HEAD -- apps/server/src/cli.ts apps/server/src/env.ts apps/server/src/__tests__/env.test.ts README.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `1261d71`, 2026-06-23

## Why this matters

`health serve` exposes personal Apple Health analytics, workout metadata, and
route references. The README tells users the API is on `http://localhost:8787`,
but the current `Bun.serve` call does not pass a hostname. Bun's server docs
state that the default hostname is `0.0.0.0`, which can make the API reachable
from other machines on the local network. Default to loopback and require an
explicit host opt-in for LAN exposure.

## Current state

Relevant files:

- `apps/server/src/cli.ts` - CLI entrypoint; starts the Hono API.
- `apps/server/src/env.ts` - environment parsing for `DB_PATH`, `PORT`, and
  `NODE_ENV`.
- `README.md` - user-facing server startup docs.
- `apps/server/src/__tests__/server.test.ts` - existing Bun test style for the
  server package.

Current serve excerpt from `apps/server/src/cli.ts:79`:

```ts
async function runServe(): Promise<void> {
  const env = loadEnv();
  const db = await openDb(env.DB_PATH);
  await migrate(db);
  const app = createApp({ db });
  const server = Bun.serve({
    port: env.PORT,
    idleTimeout: API_IDLE_TIMEOUT_SECONDS,
    fetch: app.fetch,
  });
  process.stdout.write(`serve: listening on http://localhost:${server.port}\n`);
```

Current env parser from `apps/server/src/env.ts:3`:

```ts
const EnvSchema = z.object({
  DB_PATH: z.string().min(1).default("./vitals.duckdb"),
  PORT: z.coerce.number().int().positive().default(8787),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});
```

Current README wording from `README.md:157`:

```md
DB_PATH=./vitals.duckdb bun run health serve
```

```md
This serves the Hono API on `http://localhost:8787` by default.
```

Repo conventions to match:

- TypeScript is strict, ESM, 2-space indentation, double quotes, semicolons.
- Tests use `bun:test`; see `apps/server/src/__tests__/server.test.ts:54`.
- Public CLI behavior is part of the contract per
  `local-docs/RELEASE_PLAN.md`, so document the env var change in README.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused test | `bun test apps/server/src/__tests__/env.test.ts` | env tests pass |
| Lint/check | `bun run check:ci` | exit 0, no warnings |
| Typecheck | `bun run typecheck` | exit 0, no TypeScript errors |
| Full tests | `bun test` | all tests pass |

## Scope

**In scope**:

- `apps/server/src/env.ts`
- `apps/server/src/cli.ts`
- `apps/server/src/__tests__/env.test.ts` (create if absent)
- `README.md`

**Out of scope**:

- Adding authentication, TLS, CORS, or cookies.
- Changing API routes or response shapes.
- Changing the Next.js web app default `VITALS_API_URL`.
- Touching DuckDB ingest/query behavior.

## Git workflow

- Branch: `advisor/010-bind-health-serve-localhost`
- Commit style: conventional commits, matching recent history such as
  `fix(server): reject reversed date ranges`.
- Do not push or open a PR unless the operator explicitly asks.

## Steps

### Step 1: Add env parser tests

Create `apps/server/src/__tests__/env.test.ts` using `bun:test`.

Test cases:

- `loadEnv({} as NodeJS.ProcessEnv)` returns `HOST: "127.0.0.1"` and
  `PORT: 8787`.
- `loadEnv({ HOST: "0.0.0.0", PORT: "9999" } as NodeJS.ProcessEnv)` preserves
  the explicit host and coerces the port.
- `loadEnv({ HOST: "" } as NodeJS.ProcessEnv)` throws.

Use the style from `apps/server/src/__tests__/server.test.ts`: `describe`,
`test`, `expect`, and direct schema behavior assertions.

**Verify**:
`bun test apps/server/src/__tests__/env.test.ts` -> this should fail before
implementation because `HOST` is not returned yet.

### Step 2: Add HOST to the environment contract

Update `apps/server/src/env.ts`:

- Add `HOST: z.string().min(1).default("127.0.0.1")` to `EnvSchema`.
- Pass `HOST: source.HOST` into `EnvSchema.parse`.
- Keep existing `DB_PATH`, `PORT`, and `NODE_ENV` behavior unchanged.

**Verify**:
`bun test apps/server/src/__tests__/env.test.ts` -> all env tests pass.

### Step 3: Bind Bun.serve to the parsed host

Update `apps/server/src/cli.ts`:

- Change the usage text for `health serve` to mention `HOST` and `PORT`.
- Pass `hostname: env.HOST` to `Bun.serve`.
- Update the startup line to print the actual bound URL. Prefer
  `server.url.toString()` if available in the current Bun type definitions;
  otherwise print `http://${env.HOST}:${server.port}`.
- Keep `idleTimeout: API_IDLE_TIMEOUT_SECONDS`.

Target shape:

```ts
const server = Bun.serve({
  hostname: env.HOST,
  port: env.PORT,
  idleTimeout: API_IDLE_TIMEOUT_SECONDS,
  fetch: app.fetch,
});
```

**Verify**:
`bun run check:ci` -> exit 0, no warnings.

### Step 4: Document the opt-in network exposure

Update `README.md`:

- In "Start The Dashboard", keep the default example as-is.
- State that `health serve` binds to `127.0.0.1` by default.
- Add an explicit LAN example such as
  `HOST=0.0.0.0 PORT=9999 DB_PATH=./vitals.duckdb bun run health serve`.
- Add `HOST` to "Useful Environment Variables" with default `127.0.0.1`.
- Avoid implying that `PORT` alone changes network exposure.

**Verify**:
`rg -n "HOST|127\\.0\\.0\\.1|0\\.0\\.0\\.0" README.md apps/server/src/env.ts apps/server/src/cli.ts`
-> shows the new env contract, serve binding, and README docs.

### Step 5: Run final verification

Run:

```bash
bun test apps/server/src/__tests__/env.test.ts
bun run check:ci
bun run typecheck
bun test
```

Expected result: every command exits 0.

## Test plan

- New `apps/server/src/__tests__/env.test.ts` covers default host, override
  host, existing port coercion, and rejecting an empty host.
- Existing server route tests are not changed; this plan changes server
  binding only, not Hono route behavior.
- Final verification runs the focused env test plus repo lint, typecheck, and
  full tests.

## Done criteria

- [ ] `apps/server/src/env.ts` returns `HOST: "127.0.0.1"` by default.
- [ ] `apps/server/src/cli.ts` passes `hostname: env.HOST` to `Bun.serve`.
- [ ] README documents default loopback binding and explicit LAN opt-in.
- [ ] `bun test apps/server/src/__tests__/env.test.ts` exits 0.
- [ ] `bun run check:ci`, `bun run typecheck`, and `bun test` exit 0.
- [ ] No files outside the in-scope list are modified.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back if:

- `apps/server/src/cli.ts` no longer uses `Bun.serve` directly.
- `apps/server/src/env.ts` has moved away from Zod parsing.
- The Bun type definitions in this repo do not accept a `hostname` serve
  option.
- The fix appears to require adding authentication, TLS, or route-level access
  control.
- Any verification command fails twice after a reasonable fix attempt.

## Maintenance notes

- This plan deliberately does not make the API private or authenticated. It
  only changes the default bind address.
- Reviewers should check that README examples do not encourage accidental LAN
  exposure.
- Future deployment work should revisit host binding, auth, and reverse-proxy
  assumptions together.
