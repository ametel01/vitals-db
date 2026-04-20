import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Db } from "@vitals/db";
import { getWorkoutZones, getZones } from "../zones";
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
});
