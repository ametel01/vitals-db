# Plan 011: Make React Doctor pre-commit failures blocking

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report; do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer dispatched you and told you they maintain
> the index.
>
> **Drift check (run first)**:
> `git diff --stat 1261d71..HEAD -- lefthook.yml scripts/react-doctor-precommit.ts scripts/__tests__/react-doctor-precommit.test.ts package.json .github/workflows/react-doctor.yml`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `1261d71`, 2026-06-23

## Why this matters

The React Doctor pre-commit hook currently detects failures and prints a useful
message, but the failure branch does not exit nonzero. That means warning-level
React regressions can still be committed locally even though CI blocks them at
warning severity. Make the local hook enforce the same policy as CI and add a
small deterministic test so this does not silently regress again.

## Current state

Relevant files:

- `lefthook.yml` - local pre-commit and pre-push hooks.
- `.github/workflows/react-doctor.yml` - CI React Doctor policy.
- `package.json` - owns `postinstall`, `doctor`, and dev dependencies.
- `scripts/` - existing project scripts live here.

Current hook from `lefthook.yml:1`:

```yaml
pre-commit:
  parallel: true
  commands:
    react-doctor:
      run: react_doctor_output=$(mktemp "${TMPDIR:-/tmp}/react-doctor-hook.XXXXXX"); if react-doctor --staged --blocking warning > "$react_doctor_output" 2>&1; then rm -f "$react_doctor_output"; else rm -f "$react_doctor_output"; printf "%s\n" "React Doctor found staged regressions." "Run react-doctor --staged --blocking warning to inspect." "Want them fixed? Ask your agent to run that command and resolve the findings." >&2; fi
```

Current CI policy from `.github/workflows/react-doctor.yml:34`:

```yaml
- uses: millionco/react-doctor@v2
  with:
    blocking: warning
```

Current scripts from `package.json:21`:

```json
"health": "bun apps/server/src/cli.ts",
"fixture": "bun scripts/gen-fixture.ts",
"postinstall": "lefthook install",
"doctor": "npx react-doctor@latest"
```

Repo conventions to match:

- Shell snippets in YAML should be kept short; if logic grows, put it in
  `scripts/`.
- TypeScript scripts should avoid `console.log` because Biome has
  `noConsoleLog` enabled.
- Use `bun:test` for focused tests.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused test | `bun test scripts/__tests__/react-doctor-precommit.test.ts` | hook wrapper tests pass |
| Lint/check | `bun run check:ci` | exit 0, no warnings |
| Typecheck | `bun run typecheck` | exit 0, no TypeScript errors |
| Full tests | `bun test` | all tests pass |

## Scope

**In scope**:

- `lefthook.yml`
- `scripts/react-doctor-precommit.ts` (create)
- `scripts/__tests__/react-doctor-precommit.test.ts` (create)

**Out of scope**:

- Changing `.github/workflows/react-doctor.yml` policy.
- Changing React Doctor dependency versions.
- Changing Biome, TypeScript, or pre-push behavior.
- Fixing any React Doctor findings the hook reports.

## Git workflow

- Branch: `advisor/011-make-react-doctor-hook-blocking`
- Commit style: conventional commits, for example
  `chore: align verification gates`.
- Do not push or open a PR unless the operator explicitly asks.

## Steps

### Step 1: Add failing tests for the hook wrapper

Create `scripts/__tests__/react-doctor-precommit.test.ts`.

Test structure:

- Use `mkdtemp`, `writeFile`, and `rm` from Node built-ins to create a temp
  directory.
- Create a fake executable named `react-doctor` in that temp directory.
- Spawn `bun scripts/react-doctor-precommit.ts` with `PATH` prefixed by the
  temp directory.
- Test a fake `react-doctor` that exits 0: wrapper exits 0.
- Test a fake `react-doctor` that exits 1: wrapper exits 1 and stderr includes
  `React Doctor found staged regressions.`

This test should initially fail because the wrapper file does not exist yet.

**Verify**:
`bun test scripts/__tests__/react-doctor-precommit.test.ts` -> fails before
implementation because the wrapper is missing.

### Step 2: Create a tested React Doctor hook wrapper

Create `scripts/react-doctor-precommit.ts`.

Required behavior:

- Run `react-doctor --staged --blocking warning`.
- Discard the tool's normal output, matching the current hook's behavior.
- If React Doctor exits 0, exit 0.
- If React Doctor exits nonzero, write these exact user-facing lines to stderr:

```text
React Doctor found staged regressions.
Run react-doctor --staged --blocking warning to inspect.
Want them fixed? Ask your agent to run that command and resolve the findings.
```

- Exit with status 1 on failure.
- Avoid `console.log`; use `process.stderr.write`.

**Verify**:
`bun test scripts/__tests__/react-doctor-precommit.test.ts` -> both wrapper
tests pass.

### Step 3: Point lefthook at the wrapper

Update `lefthook.yml` so the `react-doctor` pre-commit command is:

```yaml
run: bun scripts/react-doctor-precommit.ts
```

Keep the `pre-commit.parallel`, `biome`, `typecheck`, and `pre-push.verify`
sections unchanged.

**Verify**:
`rg -n "react-doctor-precommit|React Doctor found staged regressions|exit 1" lefthook.yml scripts`
-> shows the hook calls the wrapper and the wrapper exits nonzero on failure.

### Step 4: Run final verification

Run:

```bash
bun test scripts/__tests__/react-doctor-precommit.test.ts
bun run check:ci
bun run typecheck
bun test
```

Expected result: every command exits 0.

## Test plan

- New `scripts/__tests__/react-doctor-precommit.test.ts` covers success and
  failure using fake `react-doctor` binaries.
- The failure test must assert process exit code 1, not only stderr content.
- Existing CI workflow is not changed; local hook behavior is brought into
  alignment with it.

## Done criteria

- [ ] `lefthook.yml` calls `bun scripts/react-doctor-precommit.ts`.
- [ ] Failed React Doctor runs make the wrapper exit 1.
- [ ] Success React Doctor runs make the wrapper exit 0.
- [ ] `bun test scripts/__tests__/react-doctor-precommit.test.ts` exits 0.
- [ ] `bun run check:ci`, `bun run typecheck`, and `bun test` exit 0.
- [ ] No files outside the in-scope list are modified.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back if:

- `lefthook.yml` no longer has a React Doctor pre-commit command.
- React Doctor CLI flags have changed and `--staged --blocking warning` no
  longer works.
- Testing the wrapper requires staging real source changes.
- The fix appears to require changing CI behavior or dependency versions.
- Any verification command fails twice after a reasonable fix attempt.

## Maintenance notes

- The wrapper intentionally discards React Doctor's detailed output so commits
  get a concise message, matching the existing hook UX. Developers can run the
  printed command to inspect details.
- Reviewers should check that the failure path exits nonzero. That is the bug
  this plan fixes.
- If React Doctor gets replaced later, keep the wrapper tests or an equivalent
  hook-level exit-code test.
