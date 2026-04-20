import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Db } from "@vitals/db";
import { getWeeklyActivity } from "../activity";
import { type Fixture, makeFixtureDb, seedExtraWorkouts, seedWorkoutWithHR } from "./seed";

describe("getWeeklyActivity", () => {
  let fixture: Fixture;
  let db: Db;

  beforeEach(async () => {
    fixture = await makeFixtureDb();
    db = fixture.db;
    await seedWorkoutWithHR(db);
    await seedExtraWorkouts(db);
  });

  afterEach(() => fixture.cleanup());

  test("aggregates workouts by ISO week (Monday)", async () => {
    const rows = await getWeeklyActivity(db, { from: "2024-05-27", to: "2024-06-14" });
    // 2024-06-01 (Sat) and 2024-06-03 (Mon) bucket into weeks starting
    // 2024-05-27 and 2024-06-03 respectively; 2024-06-08 (Sat) into 2024-06-03.
    expect(rows).toEqual([
      { week: "2024-05-27", workout_count: 1, total_duration_sec: 3600 },
      { week: "2024-06-03", workout_count: 2, total_duration_sec: 1800 + 2700 },
    ]);
  });

  test("treats a date-only upper bound as inclusive for the full UTC day", async () => {
    const rows = await getWeeklyActivity(db, { from: "2024-06-08", to: "2024-06-08" });
    expect(rows).toEqual([{ week: "2024-06-03", workout_count: 1, total_duration_sec: 2700 }]);
  });

  test("returns [] when window has no workouts", async () => {
    const rows = await getWeeklyActivity(db, { from: "2025-01-01", to: "2025-01-31" });
    expect(rows).toEqual([]);
  });
});
