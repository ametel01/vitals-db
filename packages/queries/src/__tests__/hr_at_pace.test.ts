import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Db } from "@vitals/db";
import { getAverageHRAtPace, getHRAtPaceTrend } from "../hr_at_pace";
import {
  type Fixture,
  WORKOUT_EFFICIENCY_ID,
  WORKOUT_EFFICIENCY_NO_ALIGNMENT_ID,
  makeFixtureDb,
  seedWorkoutEfficiencyFixtures,
} from "./seed";

describe("HR at same pace queries", () => {
  let fixture: Fixture;
  let db: Db;

  beforeEach(async () => {
    fixture = await makeFixtureDb();
    db = fixture.db;
    await seedWorkoutEfficiencyFixtures(db);
  });

  afterEach(() => fixture.cleanup());

  test("computes average HR for aligned samples near the target pace", async () => {
    const targetPace = 1000 / 3.6;
    const rows = await getHRAtPaceTrend(
      db,
      { from: "2024-06-04", to: "2024-06-06" },
      { paceSecPerKm: targetPace, toleranceSecPerKm: 10 },
    );

    const row = rows.find((candidate) => candidate.workout_id === WORKOUT_EFFICIENCY_ID);
    expect(row).toBeDefined();
    expect(row?.pace_sec_per_km).toBe(targetPace);
    expect(row?.tolerance_sec_per_km).toBe(10);
    expect(row?.sample_count).toBe(3);
    expect(row?.avg_hr).toBeCloseTo((118 + 126 + 128) / 3, 6);
    expect(row?.avg_speed_mps).toBeCloseTo((3.6 + 3.7 + 3.5) / 3, 6);
  });

  test("keeps running workouts with no qualifying aligned samples as null rows", async () => {
    const rows = await getHRAtPaceTrend(
      db,
      { from: "2024-06-05", to: "2024-06-05" },
      { paceSecPerKm: 1000 / 3.6, toleranceSecPerKm: 10 },
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      workout_id: WORKOUT_EFFICIENCY_NO_ALIGNMENT_ID,
      sample_count: 0,
      avg_hr: null,
      avg_speed_mps: null,
    });
  });

  test("averages workout-level HR-at-pace rows for composite callers", async () => {
    const avg = await getAverageHRAtPace(
      db,
      { from: "2024-06-04", to: "2024-06-06" },
      { paceSecPerKm: 1000 / 3.6, toleranceSecPerKm: 10 },
    );

    expect(avg).toBeCloseTo((118 + 126 + 128) / 3, 6);
  });
});
