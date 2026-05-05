import type { Db } from "@vitals/db";
import { DEFAULT_REPLAY_BUFFER_MS, type IngestPolicy, createHealthIngestEngine } from "./engine";
import type { IngestStats, WriterOptions } from "./writer";

export const BUFFER_MS = DEFAULT_REPLAY_BUFFER_MS;

export async function getIngestState(db: Db, key: string): Promise<string | null> {
  const engine = await createHealthIngestEngine(db);
  const checkpoint = await engine.getCheckpoint();
  if (key === "last_import_ts") {
    return checkpoint.lastImportTsMs === null
      ? null
      : new Date(checkpoint.lastImportTsMs).toISOString();
  }
  if (key === "last_import_file") {
    return checkpoint.lastImportFile;
  }
  const row = await db.get<{ value: string }>("SELECT value FROM _ingest_state WHERE key = ?", [
    key,
  ]);
  return row?.value ?? null;
}

export async function getLastImportTs(db: Db): Promise<number | null> {
  const engine = await createHealthIngestEngine(db);
  return (await engine.getCheckpoint()).lastImportTsMs;
}

export async function getLastImportFile(db: Db): Promise<string | null> {
  const engine = await createHealthIngestEngine(db);
  return (await engine.getCheckpoint()).lastImportFile;
}

export async function setLastImportTsMs(db: Db, ms: number): Promise<void> {
  await db.run(
    "INSERT INTO _ingest_state (key, value) VALUES ('last_import_ts', ?) " +
      "ON CONFLICT (key) DO UPDATE SET value = excluded.value",
    [new Date(ms).toISOString()],
  );
}

export async function setLastImportFile(db: Db, path: string): Promise<void> {
  await db.run(
    "INSERT INTO _ingest_state (key, value) VALUES ('last_import_file', ?) " +
      "ON CONFLICT (key) DO UPDATE SET value = excluded.value",
    [path],
  );
}

export async function clearIngestState(db: Db): Promise<void> {
  const engine = await createHealthIngestEngine(db);
  await engine.clearCheckpoint();
}

export function makeIncrementalFilter(lastTsMs: number | null): (endTsMs: number) => boolean {
  if (lastTsMs === null) return () => true;
  const cutoff = lastTsMs - BUFFER_MS;
  return (endTsMs) => endTsMs >= cutoff;
}

export interface IngestFileOptions extends WriterOptions {
  /** Bypass the incremental filter and reprocess the whole file. */
  full?: boolean;
}

export async function ingestFile(
  db: Db,
  path: string,
  opts: IngestFileOptions = {},
): Promise<IngestStats> {
  const engine = await createHealthIngestEngine(db);
  const policyBase: IngestPolicy = {
    mode: opts.full === true ? "full" : "incremental",
  };
  const policy =
    opts.batchSize === undefined ? policyBase : { ...policyBase, batchSize: opts.batchSize };
  const result = await engine.ingestFile(path, policy);
  return {
    inserted: result.inserted,
    skipped: result.skipped,
    maxEndTsMs: result.maxEndTsMs,
  };
}
