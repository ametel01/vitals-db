import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Db, openDb } from "../connect";
import { migrate } from "../migrate";

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

const INTERNAL_TABLES = ["_migrations", "_ingest_state", "_ingest_seen"] as const;

const EXPECTED_COLUMNS = {
  workouts: [
    ["id", "VARCHAR"],
    ["type", "VARCHAR"],
    ["start_ts", "TIMESTAMP"],
    ["end_ts", "TIMESTAMP"],
    ["duration_sec", "DOUBLE"],
    ["source", "VARCHAR"],
  ],
  heart_rate: [
    ["ts", "TIMESTAMP"],
    ["bpm", "DOUBLE"],
    ["source", "VARCHAR"],
  ],
  resting_hr: [
    ["ts", "TIMESTAMP"],
    ["bpm", "DOUBLE"],
  ],
  hrv: [
    ["ts", "TIMESTAMP"],
    ["value", "DOUBLE"],
  ],
  walking_hr: [
    ["ts", "TIMESTAMP"],
    ["bpm", "DOUBLE"],
  ],
  steps: [
    ["ts", "TIMESTAMP"],
    ["count", "DOUBLE"],
  ],
  distance: [
    ["ts", "TIMESTAMP"],
    ["meters", "DOUBLE"],
  ],
  energy: [
    ["ts", "TIMESTAMP"],
    ["active_kcal", "DOUBLE"],
    ["basal_kcal", "DOUBLE"],
  ],
  sleep: [
    ["start_ts", "TIMESTAMP"],
    ["end_ts", "TIMESTAMP"],
    ["state", "VARCHAR"],
  ],
  performance: [
    ["ts", "TIMESTAMP"],
    ["vo2max", "DOUBLE"],
    ["speed", "DOUBLE"],
    ["power", "DOUBLE"],
  ],
  _migrations: [
    ["id", "VARCHAR"],
    ["applied_at", "TIMESTAMP"],
  ],
  _ingest_state: [
    ["key", "VARCHAR"],
    ["value", "VARCHAR"],
  ],
  _ingest_seen: [
    ["dedup_key", "VARCHAR"],
    ["record_type", "VARCHAR"],
    ["start_ts", "TIMESTAMP"],
    ["end_ts", "TIMESTAMP"],
    ["source", "VARCHAR"],
  ],
} as const;

describe("migrate", () => {
  let dir: string;
  let dbPath: string;
  let db: Db;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vitals-db-test-"));
    dbPath = join(dir, "test.duckdb");
    db = await openDb(dbPath);
  });

  afterEach(async () => {
    db.close();
    await rm(dir, { recursive: true, force: true });
  });

  test("creates all analytics tables from spec §2", async () => {
    await migrate(db);

    const rows = await db.all<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main'",
    );
    const names = new Set(rows.map((r) => r.table_name));
    for (const t of ANALYTICS_TABLES) {
      expect(names.has(t)).toBe(true);
    }
  });

  test("creates internal bookkeeping tables", async () => {
    await migrate(db);

    const rows = await db.all<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main'",
    );
    const names = new Set(rows.map((r) => r.table_name));
    for (const t of INTERNAL_TABLES) {
      expect(names.has(t)).toBe(true);
    }
  });

  test("table columns match the spec and migration contract", async () => {
    await migrate(db);

    for (const [tableName, expectedColumns] of Object.entries(EXPECTED_COLUMNS)) {
      const cols = await db.all<{ column_name: string; data_type: string }>(
        `SELECT column_name, data_type FROM information_schema.columns
         WHERE table_name = ? ORDER BY ordinal_position`,
        [tableName],
      );
      expect(cols).toEqual(
        expectedColumns.map(([columnName, dataType]) => ({
          column_name: columnName,
          data_type: dataType,
        })),
      );
    }
  });

  test("creates hr_ts_idx on heart_rate", async () => {
    await migrate(db);

    const rows = await db.all<{ index_name: string }>(
      "SELECT index_name FROM duckdb_indexes() WHERE table_name = 'heart_rate'",
    );
    expect(rows.some((r) => r.index_name === "hr_ts_idx")).toBe(true);
  });

  test("is idempotent — re-running applies no new migrations", async () => {
    const first = await migrate(db);
    expect(first).toEqual(["001_init"]);

    const second = await migrate(db);
    expect(second).toEqual([]);

    const count = await db.get<{ n: number }>("SELECT COUNT(*)::INTEGER AS n FROM _migrations");
    expect(count?.n).toBe(1);
  });

  test("persists applied migrations across connections", async () => {
    await migrate(db);
    db.close();

    db = await openDb(dbPath);
    const second = await migrate(db);
    expect(second).toEqual([]);
  });
});
