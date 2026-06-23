# Plan 007: Honor CLI help flags before strict argument parsing

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 1261d71..HEAD -- apps/server/src/cli.ts apps/server/src/__tests__/cli.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against live code before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `1261d71`, 2026-06-14

## Why this matters

The CLI advertises help handling for `--help` and `-h`, but strict `parseArgs`
rejects those flags before the code reaches the help branch. This makes the
most common discovery command fail with a stack trace. Fixing it is small, gives
future CLI work a test harness, and avoids confusing users before they even see
the supported commands.

## Current state

- `apps/server/src/cli.ts` owns the `health` CLI entrypoint.
- There is no dedicated CLI test file today; server route tests live under
  `apps/server/src/__tests__/`.
- The current code checks for `--help` and `-h`, but only after strict option
  parsing.

Current excerpt from `apps/server/src/cli.ts:147`:

```ts
export async function main(argv: string[]): Promise<number> {
  const { positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: true,
    options: {},
  });

  const [command, ...rest] = positionals;
  if (command === undefined || command === "help" || command === "--help" || command === "-h") {
    process.stdout.write(USAGE);
    return command === undefined ? 1 : 0;
  }
```

Observed failure at planning time:

```txt
$ bun apps/server/src/cli.ts --help
TypeError: Unknown option '--help'
exit=1
```

Repo conventions to match:

- Tests use Bun test and colocated `apps/server/src/__tests__/*.test.ts` files.
- CLI output uses `process.stdout.write` / `process.stderr.write`, not
  `console.log`.
- Commit messages in recent history use conventional commits, for example
  `fix(server): reject reversed date ranges`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused CLI tests | `bun test apps/server/src/__tests__/cli.test.ts` | exit 0 |
| Manual help check | `bun apps/server/src/cli.ts --help` | prints usage, exits 0 |
| Manual short help check | `bun apps/server/src/cli.ts -h` | prints usage, exits 0 |
| Server tests | `bun test apps/server/src/__tests__` | exit 0 |
| Lint | `bun run check:ci` | exit 0 |
| Full tests | `bun test` | exit 0 |
| Typecheck | `bun run typecheck` | exit 0; may update ignored `dist/.tsbuildinfo` files |

## Scope

**In scope**:

- `apps/server/src/cli.ts`
- `apps/server/src/__tests__/cli.test.ts` (create)

**Out of scope**:

- Adding new CLI commands or flags.
- Changing `ingest`, `crop`, `serve`, or `rebuild` behavior.
- Replacing `node:util` `parseArgs`.
- Changing package scripts.

## Git workflow

- Branch: `advisor/007-honor-cli-help-flags`
- Commit message style: `fix(cli): honor help flags`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Add focused failing CLI help tests

Create `apps/server/src/__tests__/cli.test.ts`. Import `main` from
`../cli`. Add tests for:

- `await main(["help"])` returns `0`
- `await main(["--help"])` returns `0`
- `await main(["-h"])` returns `0`
- `await main([])` returns `1`

It is enough to assert status codes in this plan. Do not snapshot the full
usage text.

Because `main()` writes to stdout/stderr, temporarily stub
`process.stdout.write` and `process.stderr.write` inside the test file and
restore both in `afterEach`. Keep the stubs local to this test file.

**Verify**: `bun test apps/server/src/__tests__/cli.test.ts` -> the `--help`
and `-h` tests fail before the CLI fix.

### Step 2: Handle help flags before strict parsing rejects them

In `apps/server/src/cli.ts`, add a small guard before the `parseArgs` call:

```ts
function isHelpArg(arg: string | undefined): boolean {
  return arg === "help" || arg === "--help" || arg === "-h";
}
```

Then in `main(argv)`, before `parseArgs`, return usage for a single help arg:

```ts
if (argv.length === 1 && isHelpArg(argv[0])) {
  process.stdout.write(USAGE);
  return 0;
}
```

Keep the existing no-argument behavior: no args prints usage and returns `1`.
Keep `strict: true` so unknown options still fail instead of being silently
accepted.

**Verify**: `bun test apps/server/src/__tests__/cli.test.ts` -> exit 0.

### Step 3: Confirm the real CLI path

Run the two CLI commands that currently fail. They must print usage and exit 0:

```bash
bun apps/server/src/cli.ts --help
bun apps/server/src/cli.ts -h
```

**Verify**: both commands print the `Usage:` block and return exit code 0.

### Step 4: Run the server and repo checks

Run the focused server tests, lint, full tests, and typecheck.

**Verify**:

- `bun test apps/server/src/__tests__` -> exit 0
- `bun run check:ci` -> exit 0
- `bun test` -> exit 0
- `bun run typecheck` -> exit 0

## Test plan

- Add `apps/server/src/__tests__/cli.test.ts` as the first CLI unit test file.
- Cover `help`, `--help`, `-h`, and no-argument status behavior.
- Manually verify the executable CLI path for `--help` and `-h`.

## Done criteria

- [ ] `bun apps/server/src/cli.ts --help` exits 0 and prints usage.
- [ ] `bun apps/server/src/cli.ts -h` exits 0 and prints usage.
- [ ] `main([])` still returns 1 after printing usage.
- [ ] Unknown options still fail under strict parsing.
- [ ] `bun test apps/server/src/__tests__/cli.test.ts` exits 0.
- [ ] `bun test apps/server/src/__tests__` exits 0.
- [ ] `bun run check:ci` exits 0.
- [ ] `bun test` exits 0.
- [ ] `bun run typecheck` exits 0.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report if:

- `main()` is no longer the testable CLI entrypoint.
- The repo has gained another CLI parser or command framework.
- Capturing stdout/stderr requires global test setup outside the in-scope files.
- Fixing help flags would require changing behavior for real commands.

## Maintenance notes

Future CLI behavior changes should add tests to `apps/server/src/__tests__/cli.test.ts`
instead of relying on manual command checks. Keep strict parsing for unknown
options unless the CLI intentionally grows subcommand-specific flags.
