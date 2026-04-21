#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { type Db, migrate, openDb } from "@vitals/db";
import { type IngestStats, getLastImportFile, ingestFile } from "@vitals/ingest";
import { loadEnv } from "./env";
import { createApp } from "./server";

const USAGE = `Usage:
  health ingest <path>   Migrate, then ingest an Apple Health export incrementally.
  health serve           Start the Hono API on PORT (default 8787).
  health rebuild         Drop analytics data and re-ingest the last imported file.
`;

const ANALYTICS_TABLES = [
  "workouts",
  "heart_rate",
  "resting_hr",
  "hrv",
  "walking_hr",
  "steps",
  "distance",
  "energy",
  "sleep",
  "performance",
] as const;

async function runIngest(path: string): Promise<void> {
  const env = loadEnv();
  const db = await openDb(env.DB_PATH);
  try {
    await migrate(db);
    const stats = await ingestFile(db, path);
    process.stdout.write(`ingest: ${formatStats(stats)}\n`);
  } finally {
    db.close();
  }
}

async function runServe(): Promise<void> {
  const env = loadEnv();
  const db = await openDb(env.DB_PATH);
  await migrate(db);
  const app = createApp({ db });
  const server = Bun.serve({ port: env.PORT, fetch: app.fetch });
  process.stdout.write(`serve: listening on http://localhost:${server.port}\n`);

  const shutdown = (): void => {
    server.stop();
    db.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

async function runRebuild(): Promise<void> {
  const env = loadEnv();
  const db = await openDb(env.DB_PATH);
  try {
    await migrate(db);
    const lastFile = await getLastImportFile(db);
    if (lastFile === null) {
      throw new Error("no previous import recorded; run `health ingest <path>` first");
    }
    await clearAnalytics(db);
    await migrate(db);
    const stats = await ingestFile(db, lastFile, { full: true });
    process.stdout.write(`rebuild: re-ingested ${lastFile} — ${formatStats(stats)}\n`);
  } finally {
    db.close();
  }
}

function formatStats(stats: IngestStats): string {
  const total = Object.values(stats.inserted).reduce((sum, n) => sum + n, 0);
  return `inserted ${total} rows, skipped ${stats.skipped} duplicates`;
}

async function clearAnalytics(db: Db): Promise<void> {
  await db.exec("BEGIN TRANSACTION");
  try {
    for (const table of ANALYTICS_TABLES) {
      await db.exec(`DELETE FROM ${table}`);
    }
    await db.exec("DELETE FROM _ingest_seen");
    await db.run("DELETE FROM _ingest_state WHERE key = ?", ["last_import_ts"]);
    await db.exec("COMMIT");
  } catch (err) {
    await db.exec("ROLLBACK");
    throw err;
  }
}

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

  try {
    switch (command) {
      case "ingest": {
        const path = rest[0];
        if (path === undefined) {
          process.stderr.write("ingest: missing <path>\n");
          return 2;
        }
        await runIngest(path);
        return 0;
      }
      case "serve":
        await runServe();
        return 0;
      case "rebuild":
        await runRebuild();
        return 0;
      default:
        process.stderr.write(`unknown command: ${command}\n${USAGE}`);
        return 2;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`error: ${message}\n`);
    return 1;
  }
}

if (import.meta.main) {
  const code = await main(process.argv.slice(2));
  // `serve` never returns; for one-shot commands we exit with the status code.
  if (code !== 0) process.exit(code);
}
