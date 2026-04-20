import type { Db, PreparedStatement, SqlValue } from "@vitals/db";
import type { AnalyticsTable, MappedInsert } from "./mappers";

export const DEFAULT_BATCH_SIZE = 10_000;

const TABLE_INSERTS: Record<AnalyticsTable, string> = {
  heart_rate: "INSERT INTO heart_rate (ts, bpm, source) VALUES (?, ?, ?)",
  resting_hr: "INSERT INTO resting_hr (ts, bpm) VALUES (?, ?)",
  hrv: "INSERT INTO hrv (ts, value) VALUES (?, ?)",
  walking_hr: "INSERT INTO walking_hr (ts, bpm) VALUES (?, ?)",
  steps: "INSERT INTO steps (ts, count) VALUES (?, ?)",
  distance: "INSERT INTO distance (ts, meters) VALUES (?, ?)",
  energy: "INSERT INTO energy (ts, active_kcal, basal_kcal) VALUES (?, ?, ?)",
  performance: "INSERT INTO performance (ts, vo2max, speed, power) VALUES (?, ?, ?, ?)",
  sleep: "INSERT INTO sleep (start_ts, end_ts, state) VALUES (?, ?, ?)",
  workouts:
    "INSERT INTO workouts (id, type, start_ts, end_ts, duration_sec, source) " +
    "VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING RETURNING id",
};

const SEEN_INSERT_SQL =
  "INSERT INTO _ingest_seen (dedup_key, record_type, start_ts, end_ts, source) " +
  "VALUES (?, ?, ?, ?, ?) ON CONFLICT (dedup_key) DO NOTHING RETURNING dedup_key";

export type InsertedCounts = Record<AnalyticsTable, number>;

export interface IngestStats {
  inserted: InsertedCounts;
  skipped: number;
  maxEndTsMs: number | null;
}

export interface WriterOptions {
  batchSize?: number;
}

function emptyInsertedCounts(): InsertedCounts {
  return {
    heart_rate: 0,
    resting_hr: 0,
    hrv: 0,
    walking_hr: 0,
    steps: 0,
    distance: 0,
    energy: 0,
    performance: 0,
    sleep: 0,
    workouts: 0,
  };
}

interface PreparedWriters {
  seen: PreparedStatement;
  tables: Map<AnalyticsTable, PreparedStatement>;
}

async function prepareWriters(db: Db): Promise<PreparedWriters> {
  const seen = await db.prepare(SEEN_INSERT_SQL);
  const tables = new Map<AnalyticsTable, PreparedStatement>();
  for (const [table, sql] of Object.entries(TABLE_INSERTS) as [AnalyticsTable, string][]) {
    tables.set(table, await db.prepare(sql));
  }
  return { seen, tables };
}

function closeWriters(writers: PreparedWriters): void {
  writers.seen.close();
  for (const stmt of writers.tables.values()) stmt.close();
}

async function tryClaimDedup(seen: PreparedStatement, row: MappedInsert): Promise<boolean> {
  const accepted = await seen.all<{ dedup_key: string }>([
    row.dedupKey,
    row.recordType,
    row.startTs,
    row.endTs,
    row.source,
  ]);
  return accepted.length > 0;
}

async function insertRow(
  writers: PreparedWriters,
  row: MappedInsert,
  stats: IngestStats,
): Promise<void> {
  const stmt = writers.tables.get(row.table);
  if (stmt === undefined) {
    throw new Error(`no prepared insert for table "${row.table}"`);
  }
  if (row.table === "workouts") {
    const inserted = await stmt.all<{ id: string }>(row.values as SqlValue[]);
    if (inserted.length === 0) {
      stats.skipped++;
      return;
    }
  } else {
    await stmt.run(row.values as SqlValue[]);
  }
  stats.inserted[row.table]++;
}

async function processRow(
  writers: PreparedWriters,
  row: MappedInsert,
  stats: IngestStats,
): Promise<void> {
  if (stats.maxEndTsMs === null || row.endTsMs > stats.maxEndTsMs) {
    stats.maxEndTsMs = row.endTsMs;
  }
  const claimed = await tryClaimDedup(writers.seen, row);
  if (!claimed) {
    stats.skipped++;
    return;
  }
  await insertRow(writers, row, stats);
}

export async function writeBatches(
  db: Db,
  rows: AsyncIterable<MappedInsert>,
  opts: WriterOptions = {},
): Promise<IngestStats> {
  const batchSize = opts.batchSize ?? DEFAULT_BATCH_SIZE;
  const stats: IngestStats = {
    inserted: emptyInsertedCounts(),
    skipped: 0,
    maxEndTsMs: null,
  };
  const writers = await prepareWriters(db);

  let transactionOpen = false;
  const begin = async () => {
    await db.exec("BEGIN TRANSACTION");
    transactionOpen = true;
  };
  const commit = async () => {
    if (!transactionOpen) return;
    await db.exec("COMMIT");
    transactionOpen = false;
  };

  try {
    await begin();
    let inBatch = 0;
    for await (const row of rows) {
      await processRow(writers, row, stats);
      inBatch++;
      if (inBatch >= batchSize) {
        await commit();
        inBatch = 0;
        await begin();
      }
    }
    await commit();
  } catch (err) {
    if (transactionOpen) {
      try {
        await db.exec("ROLLBACK");
      } catch {
        // swallow — primary error wins
      }
    }
    throw err;
  } finally {
    closeWriters(writers);
  }

  return stats;
}
