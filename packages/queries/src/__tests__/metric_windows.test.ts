import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Db } from "@vitals/db";
import { getMetricWindowComparisons } from "../metric_windows";
import {
  type Fixture,
  makeFixtureDb,
  seedDistance,
  seedEnergy,
  seedHRV,
  seedPerformance,
  seedRestingHR,
  seedSleep,
  seedSpeedAndPower,
  seedSteps,
  seedWalkingHR,
  seedWorkoutWithHR,
} from "./seed";

describe("getMetricWindowComparisons", () => {
  let fixture: Fixture;
  let db: Db;

  beforeEach(async () => {
    fixture = await makeFixtureDb();
    db = fixture.db;
    await seedRestingHR(db);
    await seedHRV(db);
    await seedSleep(db);
    await seedSteps(db);
    await seedDistance(db);
    await seedEnergy(db);
    await seedPerformance(db);
    await seedSpeedAndPower(db);
    await seedWalkingHR(db);
    await seedWorkoutWithHR(db);
  });

  afterEach(() => fixture.cleanup());

  test("returns today, 7-day, and 30-day values for the supported daily metrics", async () => {
    const rows = await getMetricWindowComparisons(db, "2024-06-03");
    const byMetric = new Map(rows.map((row) => [row.metric, row]));

    expect(rows.map((row) => row.metric)).toEqual([
      "resting_hr",
      "hrv",
      "sleep_hours",
      "steps",
      "active_energy",
      "walking_hr",
      "vo2max",
      "distance",
      "running_speed",
      "running_power",
      "training_load",
      "z2_minutes",
    ]);
    expect(byMetric.get("steps")?.today).toBe(4300);
    expect(byMetric.get("steps")?.avg_7d).toBeCloseTo((3500 + 4100 + 4300) / 7, 6);
    expect(byMetric.get("resting_hr")?.today).toBe(55);
    expect(byMetric.get("active_energy")?.today).toBeNull();
    expect(byMetric.get("distance")?.delta_today_vs_7d).not.toBeNull();
  });
});
