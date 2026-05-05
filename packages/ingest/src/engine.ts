import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Db } from "@vitals/db";
import { cropHealthExport } from "./cleanup";
import { type MappedInsert, mapNodeRows } from "./mappers";
import { parseHealthExport } from "./parser";
import { type InsertedCounts, type WriterOptions, writeBatches } from "./writer";

export const DEFAULT_REPLAY_BUFFER_MS = 24 * 60 * 60 * 1000;

const STATE_LAST_TS = "last_import_ts";
const STATE_LAST_FILE = "last_import_file";

export interface IngestPolicy {
  mode: "incremental" | "full";
  batchSize?: number;
  replayBufferMs?: number;
}

export interface IngestCheckpoint {
  lastImportTsMs: number | null;
  lastImportFile: string | null;
}

export interface IngestRunResult {
  inserted: InsertedCounts;
  skipped: number;
  maxEndTsMs: number | null;
  checkpointAfter: IngestCheckpoint;
}

export interface HealthIngestEngine {
  ingestFile(path: string, policy?: IngestPolicy): Promise<IngestRunResult>;
  getCheckpoint(): Promise<IngestCheckpoint>;
  clearCheckpoint(): Promise<void>;
}

async function getIngestState(db: Db, key: string): Promise<string | null> {
  const row = await db.get<{ value: string }>("SELECT value FROM _ingest_state WHERE key = ?", [
    key,
  ]);
  return row ? row.value : null;
}

async function setIngestState(db: Db, key: string, value: string): Promise<void> {
  await db.run(
    "INSERT INTO _ingest_state (key, value) VALUES (?, ?) " +
      "ON CONFLICT (key) DO UPDATE SET value = excluded.value",
    [key, value],
  );
}

async function getCheckpoint(db: Db): Promise<IngestCheckpoint> {
  const rawTs = await getIngestState(db, STATE_LAST_TS);
  const lastImportTsMs = rawTs === null ? null : Date.parse(rawTs);
  const lastImportFile = await getIngestState(db, STATE_LAST_FILE);
  return {
    lastImportTsMs: Number.isNaN(lastImportTsMs) ? null : lastImportTsMs,
    lastImportFile,
  };
}

async function setCheckpoint(db: Db, checkpoint: IngestCheckpoint): Promise<void> {
  if (checkpoint.lastImportTsMs !== null) {
    await setIngestState(db, STATE_LAST_TS, new Date(checkpoint.lastImportTsMs).toISOString());
  }
  if (checkpoint.lastImportFile !== null) {
    await setIngestState(db, STATE_LAST_FILE, checkpoint.lastImportFile);
  }
}

function makeIncrementalFilter(
  lastTsMs: number | null,
  replayBufferMs: number,
): (endTsMs: number) => boolean {
  if (lastTsMs === null) return () => true;
  const cutoff = lastTsMs - replayBufferMs;
  return (endTsMs) => endTsMs >= cutoff;
}

async function* mapStream(
  stream: ReadableStream<Uint8Array>,
  filter: (endTsMs: number) => boolean,
): AsyncIterable<MappedInsert> {
  for await (const node of parseHealthExport(stream)) {
    for (const mapped of mapNodeRows(node)) {
      if (!filter(mapped.endTsMs)) continue;
      yield mapped;
    }
  }
}

function asWriterOptions(policy: IngestPolicy): WriterOptions {
  return policy.batchSize === undefined ? {} : { batchSize: policy.batchSize };
}

export async function createHealthIngestEngine(db: Db): Promise<HealthIngestEngine> {
  return {
    async ingestFile(
      path: string,
      policy: IngestPolicy = { mode: "incremental" },
    ): Promise<IngestRunResult> {
      const replayBufferMs = policy.replayBufferMs ?? DEFAULT_REPLAY_BUFFER_MS;
      const checkpointBefore = await getCheckpoint(db);
      const lastTsMs = policy.mode === "full" ? null : checkpointBefore.lastImportTsMs;
      const filter = makeIncrementalFilter(lastTsMs, replayBufferMs);
      const absolutePath = resolve(path);
      const cropCutoffMs = lastTsMs === null ? null : lastTsMs - replayBufferMs;

      let importPath = path;
      let tempDir: string | null = null;

      if (cropCutoffMs !== null) {
        tempDir = await mkdtemp(join(tmpdir(), "vitals-crop-"));
        const croppedPath = join(tempDir, "import.xml");
        await cropHealthExport(path, { cutoffMs: cropCutoffMs, outputPath: croppedPath });
        importPath = croppedPath;
      }

      try {
        const stream = Bun.file(importPath).stream();
        const stats = await writeBatches(db, mapStream(stream, filter), asWriterOptions(policy));
        const nextTsMs =
          stats.maxEndTsMs === null
            ? checkpointBefore.lastImportTsMs
            : checkpointBefore.lastImportTsMs === null
              ? stats.maxEndTsMs
              : Math.max(checkpointBefore.lastImportTsMs, stats.maxEndTsMs);
        const checkpointAfter: IngestCheckpoint = {
          lastImportTsMs: nextTsMs,
          lastImportFile: absolutePath,
        };
        await setCheckpoint(db, checkpointAfter);
        return {
          inserted: stats.inserted,
          skipped: stats.skipped,
          maxEndTsMs: stats.maxEndTsMs,
          checkpointAfter,
        };
      } finally {
        if (tempDir !== null) {
          await rm(tempDir, { recursive: true, force: true });
        }
      }
    },

    async getCheckpoint(): Promise<IngestCheckpoint> {
      return getCheckpoint(db);
    },

    async clearCheckpoint(): Promise<void> {
      await db.exec("DELETE FROM _ingest_state");
    },
  };
}
