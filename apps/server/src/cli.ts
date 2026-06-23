#!/usr/bin/env bun
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, parse, resolve } from "node:path";
import { parseArgs } from "node:util";
import { type Db, migrate, openDb } from "@vitals/db";
import {
  BUFFER_MS,
  type IngestRunResult,
  createHealthIngestEngine,
  cropHealthExport,
} from "@vitals/ingest";
import { loadEnv } from "./env";
import { createApp } from "./server";

const USAGE = `Usage:
  health ingest <path>   Migrate, then ingest an Apple Health export incrementally.
  health crop <in> [out] Crop an Apple Health export to data newer than the last import window.
  health serve           Start the Hono API on HOST:PORT (default 127.0.0.1:8787).
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
  "workout_stats",
  "workout_events",
  "workout_metadata",
  "workout_routes",
] as const;

const API_IDLE_TIMEOUT_SECONDS = 60;

async function runIngest(path: string): Promise<void> {
  const env = loadEnv();
  const db = await openDb(env.DB_PATH);
  try {
    await migrate(db);
    const engine = await createHealthIngestEngine(db);
    const stats = await engine.ingestFile(path, { mode: "incremental" });
    process.stdout.write(`ingest: ${formatStats(stats)}\n`);
  } finally {
    db.close();
  }
}

function defaultCropPath(inputPath: string): string {
  const parts = parse(resolve(inputPath));
  return resolve(parts.dir, `${parts.name}.cropped${parts.ext || ".xml"}`);
}

async function runCrop(inputPath: string, outputPath?: string): Promise<void> {
  const env = loadEnv();
  const db = await openDb(env.DB_PATH);
  try {
    await migrate(db);
    const engine = await createHealthIngestEngine(db);
    const lastTsMs = (await engine.getCheckpoint()).lastImportTsMs;
    if (lastTsMs === null) {
      throw new Error("no previous import recorded; run `health ingest <path>` first");
    }
    const cropPath = outputPath === undefined ? defaultCropPath(inputPath) : outputPath;
    const result = await cropHealthExport(inputPath, {
      cutoffMs: lastTsMs - BUFFER_MS,
      outputPath: cropPath,
    });
    process.stdout.write(`crop: wrote ${result.outputPath} — ${formatCropStats(result.stats)}\n`);
  } finally {
    db.close();
  }
}

async function runServe(): Promise<void> {
  const env = loadEnv();
  const db = await openDb(env.DB_PATH);
  await migrate(db);
  const app = createApp({ db });
  const server = Bun.serve({
    hostname: env.HOST,
    port: env.PORT,
    idleTimeout: API_IDLE_TIMEOUT_SECONDS,
    fetch: app.fetch,
  });
  const listeningUrl = `http://${env.HOST}:${server.port}`;
  process.stdout.write(`serve: listening on ${listeningUrl}\n`);

  const shutdown = (): void => {
    server.stop();
    db.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

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
    await preflightFullImport(lastFile);
    await clearAnalytics(db);
    await migrate(db);
    const stats = await engine.ingestFile(lastFile, { mode: "full" });
    process.stdout.write(`rebuild: re-ingested ${lastFile} — ${formatStats(stats)}\n`);
  } finally {
    db.close();
  }
}

function formatStats(stats: IngestRunResult): string {
  const total = Object.values(stats.inserted).reduce((sum, n) => sum + n, 0);
  return `inserted ${total} rows, skipped ${stats.skipped} duplicates`;
}

function formatCropStats(stats: {
  nodesSeen: number;
  nodesKept: number;
  droppedBeforeCutoff: number;
  droppedUnsupported: number;
  droppedUserEntered: number;
}): string {
  const dropped = stats.droppedBeforeCutoff + stats.droppedUnsupported + stats.droppedUserEntered;
  return (
    `kept ${stats.nodesKept}/${stats.nodesSeen} nodes, dropped ${dropped} ` +
    `(old ${stats.droppedBeforeCutoff}, unsupported ${stats.droppedUnsupported}, manual ${stats.droppedUserEntered})`
  );
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

function isHelpArg(arg: string | undefined): arg is string {
  return arg === "help" || arg === "--help" || arg === "-h";
}

export async function main(argv: string[]): Promise<number> {
  if (argv.length === 1 && isHelpArg(argv[0])) {
    process.stdout.write(USAGE);
    return 0;
  }

  const { positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: true,
    options: {},
  });

  const [command, ...rest] = positionals;
  if (command === undefined) {
    process.stdout.write(USAGE);
    return 1;
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
      case "crop": {
        const inputPath = rest[0];
        if (inputPath === undefined) {
          process.stderr.write("crop: missing <in>\n");
          return 2;
        }
        await runCrop(inputPath, rest[1]);
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
