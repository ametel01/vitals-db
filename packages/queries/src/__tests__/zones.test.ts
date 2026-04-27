import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Db } from "@vitals/db";
import {
  getWorkoutZoneBreakdown,
  getWorkoutZones,
  getZoneTimeDistribution,
  getZones,
} from "../zones";
import { type Fixture, WORKOUT_ID, makeFixtureDb, seedWorkoutWithHR } from "./seed";

describe("zones queries", () => {
  let fixture: Fixture;
  let db: Db;

  beforeEach(async () => {
    fixture = await makeFixtureDb();
    db = fixture.db;
    await seedWorkoutWithHR(db);
  });

  afterEach(() => fixture.cleanup());

  test("getZones returns z2_ratio across the full range", async () => {
    const row = await getZones(db, { from: "2024-06-01", to: "2024-06-02" });
    expect(row.z2_ratio).toBeCloseTo(2 / 6, 6);
  });

  test("getZones treats a date-only upper bound as inclusive for the full UTC day", async () => {
    const row = await getZones(db, { from: "2024-06-01", to: "2024-06-01" });
    expect(row.z2_ratio).toBeCloseTo(2 / 6, 6);
  });

  test("getZones returns null ratio when the window has no HR samples", async () => {
    const row = await getZones(db, { from: "2025-01-01", to: "2025-01-02" });
    expect(row.z2_ratio).toBeNull();
  });

  test("getWorkoutZones returns ratio scoped to workout samples", async () => {
    const row = await getWorkoutZones(db, WORKOUT_ID);
    expect(row.z2_ratio).toBeCloseTo(2 / 6, 6);
  });

  test("getWorkoutZones returns null for unknown workout", async () => {
    const row = await getWorkoutZones(db, "does-not-exist");
    expect(row.z2_ratio).toBeNull();
  });

  test("getWorkoutZoneBreakdown returns rows in Z1..Z5 order with counts summing to total", async () => {
    const rows = await getWorkoutZoneBreakdown(db, WORKOUT_ID);
    expect(rows.map((r) => r.zone)).toEqual(["Z1", "Z2", "Z3", "Z4", "Z5"]);
    // Seed samples: 100, 110, 120, 120, 130, 140 -> Z1=2, Z2=2, Z3=2, Z4=0, Z5=0
    const byZone = Object.fromEntries(rows.map((r) => [r.zone, r]));
    expect(byZone.Z1?.sample_count).toBe(2);
    expect(byZone.Z2?.sample_count).toBe(2);
    expect(byZone.Z3?.sample_count).toBe(2);
    expect(byZone.Z4?.sample_count).toBe(0);
    expect(byZone.Z5?.sample_count).toBe(0);
    const totalRatio = rows.reduce((acc, r) => acc + r.ratio, 0);
    expect(totalRatio).toBeCloseTo(1, 6);
    expect(byZone.Z2?.ratio).toBeCloseTo(2 / 6, 6);
  });

  test("getWorkoutZoneBreakdown preserves the scalar z2_ratio contract", async () => {
    const [rows, scalar] = await Promise.all([
      getWorkoutZoneBreakdown(db, WORKOUT_ID),
      getWorkoutZones(db, WORKOUT_ID),
    ]);
    const z2 = rows.find((r) => r.zone === "Z2");
    expect(z2).toBeDefined();
    expect(z2?.ratio).toBeCloseTo(scalar.z2_ratio ?? Number.NaN, 6);
  });

  test("getWorkoutZoneBreakdown returns [] for unknown workout", async () => {
    const rows = await getWorkoutZoneBreakdown(db, "does-not-exist");
    expect(rows).toEqual([]);
  });

  test("getZoneTimeDistribution estimates time spent per zone inside workouts", async () => {
    const rows = await getZoneTimeDistribution(db, { from: "2024-06-01", to: "2024-06-01" });
    expect(rows.map((r) => r.zone)).toEqual(["Z1", "Z2", "Z3", "Z4", "Z5"]);
    const byZone = Object.fromEntries(rows.map((row) => [row.zone, row]));
    expect(byZone.Z1?.duration_sec).toBe(240);
    expect(byZone.Z2?.duration_sec).toBe(240);
    expect(byZone.Z3?.duration_sec).toBe(240);
    expect(byZone.Z4?.duration_sec).toBe(0);
    expect(byZone.Z5?.duration_sec).toBe(0);
    expect(byZone.Z1?.ratio).toBeCloseTo(1 / 3, 6);
  });

  test("getZoneTimeDistribution returns [] when no workout HR intervals exist", async () => {
    const rows = await getZoneTimeDistribution(db, { from: "2025-01-01", to: "2025-01-01" });
    expect(rows).toEqual([]);
  });
});
