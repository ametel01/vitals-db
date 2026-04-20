import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Db } from "@vitals/db";
import { getLoadForRange, getWorkoutLoad } from "../load";
import { type Fixture, WORKOUT_ID, makeFixtureDb, seedWorkoutWithHR } from "./seed";

describe("load queries", () => {
  let fixture: Fixture;
  let db: Db;

  beforeEach(async () => {
    fixture = await makeFixtureDb();
    db = fixture.db;
    await seedWorkoutWithHR(db);
  });

  afterEach(() => fixture.cleanup());

  test("getWorkoutLoad returns duration * avg_hr", async () => {
    const row = await getWorkoutLoad(db, WORKOUT_ID);
    expect(row).not.toBeNull();
    expect(row?.avg_hr).toBeCloseTo(120, 3);
    expect(row?.load).toBeCloseTo(3600 * 120, 3);
    expect(row?.duration_sec).toBe(3600);
  });

  test("getWorkoutLoad returns null avg_hr + load when no HR samples in window", async () => {
    await db.run(
      "INSERT INTO workouts (id, type, start_ts, end_ts, duration_sec, source) VALUES (?, ?, ?, ?, ?, ?)",
      ["no-hr-workout", "Running", "2024-07-01 08:00:00", "2024-07-01 09:00:00", 3600, null],
    );
    const row = await getWorkoutLoad(db, "no-hr-workout");
    expect(row?.avg_hr).toBeNull();
    expect(row?.load).toBeNull();
  });

  test("getWorkoutLoad returns null for unknown workout", async () => {
    expect(await getWorkoutLoad(db, "missing")).toBeNull();
  });

  test("getLoadForRange returns one row per workout in the window", async () => {
    await db.run(
      "INSERT INTO workouts (id, type, start_ts, end_ts, duration_sec, source) VALUES (?, ?, ?, ?, ?, ?)",
      ["wk-other", "Running", "2024-06-02 08:00:00", "2024-06-02 09:00:00", 3600, null],
    );
    const rows = await getLoadForRange(db, { from: "2024-06-01", to: "2024-06-03" });
    expect(rows).toHaveLength(2);
    expect(rows[0]?.workout_id).toBe(WORKOUT_ID);
    expect(rows[1]?.workout_id).toBe("wk-other");
    expect(rows[1]?.avg_hr).toBeNull();
    expect(rows[1]?.load).toBeNull();
  });

  test("getLoadForRange treats a date-only upper bound as inclusive for the full UTC day", async () => {
    const rows = await getLoadForRange(db, { from: "2024-06-01", to: "2024-06-01" });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.workout_id).toBe(WORKOUT_ID);
  });
});
