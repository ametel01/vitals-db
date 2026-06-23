# Plan 008: Preflight rebuild input before clearing analytics data

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 1261d71..HEAD -- apps/server/src/cli.ts apps/server/src/__tests__/cli.test.ts packages/ingest/src/engine.ts packages/ingest/src/__tests__/ingest.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against live code before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: `plans/007-honor-cli-help-flags.md`
- **Category**: bug
- **Planned at**: commit `1261d71`, 2026-06-14

## Why this matters

`health rebuild` is the command users run after ingest schema changes, including
documented upgrade paths in the README. Today it clears all analytics tables
before proving the saved Apple Health export can still be read and imported. If
the file was moved, truncated, or corrupted, the command fails after deleting
the current local analytics data. A preflight import into a disposable database
keeps the existing database intact when the saved rebuild input is bad.

## Current state

- `apps/server/src/cli.ts` implements `health rebuild`.
- `packages/ingest/src/engine.ts` can ingest a file in `full` mode.
- Ingest integration tests already use temp DuckDB files and temp XML files.
- After Plan 007, `apps/server/src/__tests__/cli.test.ts` exists and can hold
  CLI behavior tests.

Current rebuild excerpt from `apps/server/src/cli.ts:94`:

```ts
async function runRebuild(): Promise<void> {
  const env = loadEnv();
  const db = await openDb(env.DB_PATH);
  try {
    await migrate(db);
    const engine = await createHealthIngestEngine(db);
    const lastFile = (await engine.getCheckpoint()).lastImportFile;
    if (lastFile === null) {
      throw new Error("no previous import recorded; run `health ingest <path>` first");
    }
    await clearAnalytics(db);
    await migrate(db);
    const stats = await engine.ingestFile(lastFile, { mode: "full" });
    process.stdout.write(`rebuild: re-ingested ${lastFile} — ${formatStats(stats)}\n`);
  } finally {
    db.close();
  }
}
```

Current destructive clear from `apps/server/src/cli.ts:132`:

```ts
async function clearAnalytics(db: Db): Promise<void> {
  await db.exec("BEGIN TRANSACTION");
  try {
    for (const table of ANALYTICS_TABLES) {
      await db.exec(`DELETE FROM ${table}`);
    }
    await db.exec("DELETE FROM _ingest_seen");
    await db.run("DELETE FROM _ingest_state WHERE key = ?", ["last_import_ts"]);
    await db.exec("COMMIT");
```

Ingest test pattern from `packages/ingest/src/__tests__/ingest.test.ts:77`:

```ts
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "vitals-ingest-test-"));
  dbPath = join(dir, "test.duckdb");
  xmlPath = join(dir, "export.xml");
  await writeFile(xmlPath, FIXTURE_XML, "utf8");
  db = await openDb(dbPath);
  await migrate(db);
  engine = await createHealthIngestEngine(db);
});
```

Repo conventions to match:

- CLI commands use `loadEnv()` and `DB_PATH`; tests can set `process.env.DB_PATH`
  and must restore it.
- Temp files use `mkdtemp(join(tmpdir(), "..."))` and cleanup with
  `rm(dir, { recursive: true, force: true })`.
- Use `process.stdout.write` / `process.stderr.write`, not `console.log`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused CLI tests | `bun test apps/server/src/__tests__/cli.test.ts` | exit 0 |
| Server tests | `bun test apps/server/src/__tests__` | exit 0 |
| Ingest tests | `bun test packages/ingest/src/__tests__/ingest.test.ts` | exit 0 |
| Lint | `bun run check:ci` | exit 0 |
| Full tests | `bun test` | exit 0 |
| Typecheck | `bun run typecheck` | exit 0; may update ignored `dist/.tsbuildinfo` files |

## Scope

**In scope**:

- `apps/server/src/cli.ts`
- `apps/server/src/__tests__/cli.test.ts`

**Read-only reference paths**:

- `packages/ingest/src/engine.ts`
- `packages/ingest/src/__tests__/ingest.test.ts`

**Out of scope**:

- Rewriting the ingest engine.
- Changing incremental ingest behavior.
- Changing migration files or table schemas.
- Implementing a full atomic database-file swap. This plan only prevents
  avoidable data loss from unreadable or unimportable rebuild input before
  clearing the real database.

## Git workflow

- Branch: `advisor/008-preflight-rebuild-before-clearing`
- Commit message style: `fix(cli): preflight rebuild input`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Add a failing rebuild data-preservation test

In `apps/server/src/__tests__/cli.test.ts`, add a test that proves a bad saved
import file does not clear existing analytics data.

Test shape:

1. Create a temp directory and temp DB path.
2. Set `process.env.DB_PATH` to the temp DB path and restore the previous value
   in `afterEach`.
3. Write a valid minimal Apple Health XML file with one supported
   `HeartRate` record.
4. Call `await main(["ingest", xmlPath])` and expect `0`.
5. Open the same DB with `openDb`, confirm `SELECT COUNT(*)::INTEGER AS n FROM heart_rate`
   returns `1`, then close it.
6. Overwrite the same `xmlPath` with malformed XML, for example
   `"<HealthData><Record"`.
7. Call `await main(["rebuild"])` and expect `1`.
8. Reopen the DB and assert the `heart_rate` count is still `1`.

Current code will fail this test because `clearAnalytics()` runs before the
malformed file is parsed.

**Verify**: `bun test apps/server/src/__tests__/cli.test.ts` -> the new test
fails before the rebuild fix.

### Step 2: Add a disposable preflight import helper

In `apps/server/src/cli.ts`, import the Node helpers needed for a temp
directory:

```ts
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, parse, resolve } from "node:path";
```

Add a helper near `runRebuild`:

```ts
async function preflightFullImport(path: string): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "vitals-rebuild-preflight-"));
  const db = await openDb(join(dir, "preflight.duckdb"));
  try {
    await migrate(db);
    const engine = await createHealthIngestEngine(db);
    await engine.ingestFile(path, { mode: "full" });
  } finally {
    db.close();
    await rm(dir, { recursive: true, force: true });
  }
}
```

Keep the helper private to `cli.ts`.

**Verify**: `bun run check:ci` -> imports are sorted and no unused symbols
remain.

### Step 3: Run preflight before clearing the real database

In `runRebuild`, after `lastFile` is known and before `clearAnalytics(db)`, call:

```ts
await preflightFullImport(lastFile);
```

Do not move `clearAnalytics` earlier. Do not clear `last_import_file`; rebuild
still needs it to remain available for future attempts.

This doubles rebuild parsing work, but rebuild is an explicit maintenance
command and protecting existing local data is worth the extra time.

**Verify**: `bun test apps/server/src/__tests__/cli.test.ts` -> exit 0.

### Step 4: Confirm ingest behavior is unchanged

Run the existing ingest integration tests. If they fail, the CLI change leaked
into ingest internals and should be backed out.

**Verify**: `bun test packages/ingest/src/__tests__/ingest.test.ts` -> exit 0.

### Step 5: Run repo checks

Run the server tests, full test suite, lint, and typecheck.

**Verify**:

- `bun test apps/server/src/__tests__` -> exit 0
- `bun test` -> exit 0
- `bun run check:ci` -> exit 0
- `bun run typecheck` -> exit 0

## Test plan

- Add a CLI regression test that overwrites the saved last import file with
  malformed XML and proves failed rebuild preserves existing rows.
- Keep Plan 007's help tests passing in the same file.
- Run ingest integration tests to confirm core ingest behavior did not change.

## Done criteria

- [ ] `health rebuild` preflights the saved file in a disposable DB before
  clearing analytics tables in the real DB.
- [ ] If preflight import fails, the real analytics tables are not cleared.
- [ ] The temp preflight DB directory is removed on success and failure.
- [ ] Existing successful rebuild behavior still re-ingests the saved file.
- [ ] `bun test apps/server/src/__tests__/cli.test.ts` exits 0.
- [ ] `bun test packages/ingest/src/__tests__/ingest.test.ts` exits 0.
- [ ] `bun test` exits 0.
- [ ] `bun run check:ci` exits 0.
- [ ] `bun run typecheck` exits 0.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report if:

- Plan 007 has not landed and `apps/server/src/__tests__/cli.test.ts` does not
  exist. Execute Plan 007 first or explicitly create the CLI test harness here.
- Preflight import requires changing `packages/ingest` public APIs.
- The saved `last_import_file` contract has changed or rebuild no longer uses it.
- DuckDB cannot open a second temporary database in the test environment.
- You discover a requirement that rebuild must be single-pass and cannot afford
  a preflight import.

## Maintenance notes

This plan prevents destructive clears when the rebuild input is unreadable or
malformed. It does not make the second, real import fully atomic against every
possible database write failure. If users later need stronger guarantees, plan a
larger staged rebuild that imports into shadow tables or a replacement database
file and swaps only after the full import succeeds.
