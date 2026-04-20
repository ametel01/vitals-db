import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Db } from "@vitals/db";
import { getWorkoutDetail, getWorkoutSummary, listWorkouts } from "../workouts";
import {
  type Fixture,
  WORKOUT_ID,
  makeFixtureDb,
  seedExtraWorkouts,
  seedWorkoutWithHR,
} from "./seed";

describe("workouts queries", () => {
  let fixture: Fixture;
  let db: Db;

  beforeEach(async () => {
    fixture = await makeFixtureDb();
    db = fixture.db;
    await seedWorkoutWithHR(db);
    await seedExtraWorkouts(db);
  });

  afterEach(() => fixture.cleanup());

  test("listWorkouts returns rows ordered newest first", async () => {
    const rows = await listWorkouts(db);
    expect(rows.map((r) => r.id)).toEqual([
      "wk-running-2024-06-08",
      "wk-walking-2024-06-03",
      WORKOUT_ID,
    ]);
  });

  test("listWorkouts filters by type", async () => {
    const rows = await listWorkouts(db, { type: "Running" });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.type === "Running")).toBe(true);
  });

  test("listWorkouts filters by date range", async () => {
    const rows = await listWorkouts(db, { from: "2024-06-02", to: "2024-06-05" });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("wk-walking-2024-06-03");
  });

  test("listWorkouts treats a date-only upper bound as inclusive for the full UTC day", async () => {
    const rows = await listWorkouts(db, { from: "2024-06-08", to: "2024-06-08" });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("wk-running-2024-06-08");
  });

  test("listWorkouts respects limit + offset", async () => {
    const page = await listWorkouts(db, { limit: 1, offset: 1 });
    expect(page).toHaveLength(1);
    expect(page[0]?.id).toBe("wk-walking-2024-06-03");
  });

  test("getWorkoutSummary returns the exact row", async () => {
    const row = await getWorkoutSummary(db, WORKOUT_ID);
    expect(row).toEqual({
      id: WORKOUT_ID,
      type: "Running",
      start_ts: "2024-06-01T08:00:00.000Z",
      end_ts: "2024-06-01T09:00:00.000Z",
      duration_sec: 3600,
      source: "Apple Watch",
    });
  });

  test("getWorkoutSummary returns null for unknown id", async () => {
    expect(await getWorkoutSummary(db, "does-not-exist")).toBeNull();
  });

  test("getWorkoutDetail composes summary + drift + load + z2", async () => {
    const detail = await getWorkoutDetail(db, WORKOUT_ID);
    expect(detail).not.toBeNull();
    expect(detail?.id).toBe(WORKOUT_ID);
    // Drift: first-half avg 110, second-half avg 130 → +18.18%
    expect(detail?.drift_pct).toBeCloseTo(18.1818, 3);
    expect(detail?.drift_classification).toBe("high");
    // Z2 (115-125): 2/6 samples land in-band
    expect(detail?.z2_ratio).toBeCloseTo(2 / 6, 6);
    // load = duration_sec * avg_hr = 3600 * 120 = 432_000
    expect(detail?.load).toBeCloseTo(432_000, 3);
  });

  test("getWorkoutDetail returns null for unknown id", async () => {
    expect(await getWorkoutDetail(db, "does-not-exist")).toBeNull();
  });
});
