import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Db } from "@vitals/db";
import { getWorkoutSampleQuality } from "../sample_quality";
import {
  type Fixture,
  WORKOUT_EFFICIENCY_ID,
  WORKOUT_EFFICIENCY_NO_ALIGNMENT_ID,
  WORKOUT_EFFICIENCY_SHORT_ID,
  makeFixtureDb,
  seedWorkoutEfficiencyFixtures,
} from "./seed";

describe("getWorkoutSampleQuality", () => {
  let fixture: Fixture;
  let db: Db;

  beforeEach(async () => {
    fixture = await makeFixtureDb();
    db = fixture.db;
    await seedWorkoutEfficiencyFixtures(db);
  });

  afterEach(() => fixture.cleanup());

  test("returns high quality when workout samples and context are complete", async () => {
    await addPowerAndContext(db, WORKOUT_EFFICIENCY_ID);

    expect(await getWorkoutSampleQuality(db, WORKOUT_EFFICIENCY_ID)).toEqual({
      workout_id: WORKOUT_EFFICIENCY_ID,
      sample_quality: "high",
      issues: [],
      duration_sec: 3600,
      hr_samples: 6,
      speed_samples: 6,
      power_samples: 2,
      aligned_speed_hr_samples: 6,
      route_count: 1,
      context_count: 2,
    });
  });

  test("marks missing power and context as mixed quality", async () => {
    expect(await getWorkoutSampleQuality(db, WORKOUT_EFFICIENCY_ID)).toMatchObject({
      workout_id: WORKOUT_EFFICIENCY_ID,
      sample_quality: "mixed",
      issues: ["missing_power", "missing_route", "missing_context"],
      hr_samples: 6,
      speed_samples: 6,
      aligned_speed_hr_samples: 6,
    });
  });

  test("marks alignment gaps and short workouts as poor quality", async () => {
    expect(await getWorkoutSampleQuality(db, WORKOUT_EFFICIENCY_NO_ALIGNMENT_ID)).toMatchObject({
      workout_id: WORKOUT_EFFICIENCY_NO_ALIGNMENT_ID,
      sample_quality: "poor",
      issues: ["missing_power", "alignment_gap", "missing_route", "missing_context"],
      aligned_speed_hr_samples: 0,
    });

    expect(await getWorkoutSampleQuality(db, WORKOUT_EFFICIENCY_SHORT_ID)).toMatchObject({
      workout_id: WORKOUT_EFFICIENCY_SHORT_ID,
      sample_quality: "poor",
      issues: ["too_short", "missing_power", "missing_route", "missing_context"],
      duration_sec: 1800,
    });
  });

  test("returns null for unknown workouts", async () => {
    expect(await getWorkoutSampleQuality(db, "missing")).toBeNull();
  });
});

async function addPowerAndContext(db: Db, workoutId: string): Promise<void> {
  await db.run("INSERT INTO performance (ts, vo2max, speed, power) VALUES (?, ?, ?, ?)", [
    "2024-06-04 08:10:00",
    null,
    null,
    220,
  ]);
  await db.run("INSERT INTO performance (ts, vo2max, speed, power) VALUES (?, ?, ?, ?)", [
    "2024-06-04 08:40:00",
    null,
    null,
    230,
  ]);
  await db.run(
    "INSERT INTO workout_routes (workout_id, start_ts, end_ts, source, path) VALUES (?, ?, ?, ?, ?)",
    [workoutId, "2024-06-04 08:00:00", "2024-06-04 09:00:00", "Apple Watch", "route.gpx"],
  );
  await db.run(
    "INSERT INTO workout_stats (workout_id, type, start_ts, end_ts, average, minimum, maximum, sum, unit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      workoutId,
      "HKQuantityTypeIdentifierRunningPower",
      "2024-06-04 08:00:00",
      "2024-06-04 09:00:00",
      225,
      210,
      240,
      null,
      "W",
    ],
  );
}
