import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Db } from "@vitals/db";
import { getWorkoutEfficiency } from "../efficiency";
import {
  type Fixture,
  WORKOUT_EFFICIENCY_ID,
  WORKOUT_EFFICIENCY_NO_ALIGNMENT_ID,
  WORKOUT_EFFICIENCY_SHORT_ID,
  makeFixtureDb,
  seedWorkoutEfficiencyFixtures,
} from "./seed";

describe("getWorkoutEfficiency", () => {
  let fixture: Fixture;
  let db: Db;

  beforeEach(async () => {
    fixture = await makeFixtureDb();
    db = fixture.db;
    await seedWorkoutEfficiencyFixtures(db);
  });

  afterEach(() => fixture.cleanup());

  test("pairs aligned HR and speed samples to compute pace at a fixed HR band", async () => {
    const efficiency = await getWorkoutEfficiency(db, WORKOUT_EFFICIENCY_ID);
    expect(efficiency).not.toBeNull();
    expect(efficiency?.pace_at_hr).toEqual({
      hr_min: 120,
      hr_max: 130,
      sample_count: 4,
      avg_speed_mps: 3.6,
      pace_sec_per_km: 1000 / 3.6,
    });
  });

  test("computes fixed-duration decoupling over the first workout hour", async () => {
    const efficiency = await getWorkoutEfficiency(db, WORKOUT_EFFICIENCY_ID);
    const firstHalfPacePerHr = (1000 / 3.6 + 1000 / 3.8 + 1000 / 3.7) / 3 / ((118 + 122 + 126) / 3);
    const secondHalfPacePerHr =
      (1000 / 3.5 + 1000 / 3.4 + 1000 / 3.3) / 3 / ((128 + 130 + 132) / 3);

    expect(efficiency).not.toBeNull();
    expect(efficiency?.decoupling.window_duration_sec).toBe(3600);
    expect(efficiency?.decoupling.sample_count).toBe(6);
    expect(efficiency?.decoupling.first_half_efficiency).toBeCloseTo(firstHalfPacePerHr, 6);
    expect(efficiency?.decoupling.second_half_efficiency).toBeCloseTo(secondHalfPacePerHr, 6);
    expect(efficiency?.decoupling.decoupling_pct).toBeCloseTo(
      ((secondHalfPacePerHr - firstHalfPacePerHr) / firstHalfPacePerHr) * 100,
      6,
    );
  });

  test("returns null pace and decoupling when HR and speed do not align within tolerance", async () => {
    const efficiency = await getWorkoutEfficiency(db, WORKOUT_EFFICIENCY_NO_ALIGNMENT_ID);
    expect(efficiency).not.toBeNull();
    expect(efficiency?.pace_at_hr.sample_count).toBe(0);
    expect(efficiency?.pace_at_hr.avg_speed_mps).toBeNull();
    expect(efficiency?.pace_at_hr.pace_sec_per_km).toBeNull();
    expect(efficiency?.decoupling.sample_count).toBe(0);
    expect(efficiency?.decoupling.decoupling_pct).toBeNull();
  });

  test("nulls decoupling for workouts shorter than the 45-minute duration gate", async () => {
    const efficiency = await getWorkoutEfficiency(db, WORKOUT_EFFICIENCY_SHORT_ID);
    expect(efficiency).not.toBeNull();
    expect(efficiency?.pace_at_hr.sample_count).toBe(3);
    expect(efficiency?.pace_at_hr.avg_speed_mps).toBeCloseTo(3.9, 6);
    expect(efficiency?.decoupling.window_duration_sec).toBe(1800);
    expect(efficiency?.decoupling.sample_count).toBe(3);
    expect(efficiency?.decoupling.first_half_efficiency).toBeNull();
    expect(efficiency?.decoupling.second_half_efficiency).toBeNull();
    expect(efficiency?.decoupling.decoupling_pct).toBeNull();
  });

  test("returns null for an unknown workout id", async () => {
    expect(await getWorkoutEfficiency(db, "missing")).toBeNull();
  });
});
