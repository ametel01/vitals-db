import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Db } from "@vitals/db";
import { cropHealthExport } from "./cleanup";
import { type MappedInsert, mapNode } from "./mappers";
import { parseHealthExport } from "./parser";
import { type IngestStats, type WriterOptions, writeBatches } from "./writer";

export const BUFFER_MS = 24 * 60 * 60 * 1000;
const STATE_LAST_TS = "last_import_ts";
const STATE_LAST_FILE = "last_import_file";

export async function getIngestState(db: Db, key: string): Promise<string | null> {
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

export async function getLastImportTs(db: Db): Promise<number | null> {
  const raw = await getIngestState(db, STATE_LAST_TS);
  if (raw === null) return null;
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? null : ms;
}

export async function getLastImportFile(db: Db): Promise<string | null> {
  return getIngestState(db, STATE_LAST_FILE);
}

export async function setLastImportTsMs(db: Db, ms: number): Promise<void> {
  await setIngestState(db, STATE_LAST_TS, new Date(ms).toISOString());
}

export async function setLastImportFile(db: Db, path: string): Promise<void> {
  await setIngestState(db, STATE_LAST_FILE, path);
}

export async function clearIngestState(db: Db): Promise<void> {
  await db.exec("DELETE FROM _ingest_state");
}

export function makeIncrementalFilter(lastTsMs: number | null): (endTsMs: number) => boolean {
  if (lastTsMs === null) return () => true;
  const cutoff = lastTsMs - BUFFER_MS;
  return (endTsMs) => endTsMs >= cutoff;
}

function makeCropCutoffMs(lastTsMs: number | null): number | null {
  return lastTsMs === null ? null : lastTsMs - BUFFER_MS;
}

async function* mapStream(
  stream: ReadableStream<Uint8Array>,
  filter: (endTsMs: number) => boolean,
): AsyncIterable<MappedInsert> {
  for await (const node of parseHealthExport(stream)) {
    const mapped = mapNode(node);
    if (mapped === null) continue;
    if (!filter(mapped.endTsMs)) continue;
    yield mapped;
  }
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
  const lastTsMs = opts.full === true ? null : await getLastImportTs(db);
  const filter = makeIncrementalFilter(lastTsMs);
  const absolutePath = resolve(path);
  const cropCutoffMs = makeCropCutoffMs(lastTsMs);

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
    const writerOpts: WriterOptions =
      opts.batchSize === undefined ? {} : { batchSize: opts.batchSize };
    const stats = await writeBatches(db, mapStream(stream, filter), writerOpts);

    if (stats.maxEndTsMs !== null) {
      const next = lastTsMs === null ? stats.maxEndTsMs : Math.max(lastTsMs, stats.maxEndTsMs);
      await setLastImportTsMs(db, next);
    }
    await setLastImportFile(db, absolutePath);
    return stats;
  } finally {
    if (tempDir !== null) {
      await rm(tempDir, { recursive: true, force: true });
    }
  }
}
