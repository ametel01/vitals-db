import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Db } from "@vitals/db";
import { getWorkoutDrift } from "../drift";
import { type Fixture, WORKOUT_ID, makeFixtureDb, seedWorkoutWithHR } from "./seed";

describe("getWorkoutDrift", () => {
  let fixture: Fixture;
  let db: Db;

  beforeEach(async () => {
    fixture = await makeFixtureDb();
    db = fixture.db;
  });

  afterEach(() => fixture.cleanup());

  test("classifies an 18% drift as high", async () => {
    await seedWorkoutWithHR(db);
    const drift = await getWorkoutDrift(db, WORKOUT_ID);
    expect(drift.first_avg).toBeCloseTo(110, 3);
    expect(drift.second_avg).toBeCloseTo(130, 3);
    expect(drift.drift_pct).toBeCloseTo(18.1818, 3);
    expect(drift.classification).toBe("high");
  });

  test("returns null drift + 'unknown' for a workout with no HR samples", async () => {
    await db.run(
      "INSERT INTO workouts (id, type, start_ts, end_ts, duration_sec, source) VALUES (?, ?, ?, ?, ?, ?)",
      ["empty-workout", "Running", "2024-07-01 08:00:00", "2024-07-01 09:00:00", 3600, null],
    );
    const drift = await getWorkoutDrift(db, "empty-workout");
    expect(drift.first_avg).toBeNull();
    expect(drift.second_avg).toBeNull();
    expect(drift.drift_pct).toBeNull();
    expect(drift.classification).toBe("unknown");
  });

  test("classifies <3% drift as stable", async () => {
    await db.run(
      "INSERT INTO workouts (id, type, start_ts, end_ts, duration_sec, source) VALUES (?, ?, ?, ?, ?, ?)",
      ["stable-workout", "Running", "2024-07-01 08:00:00", "2024-07-01 09:00:00", 3600, null],
    );
    await db.run("INSERT INTO heart_rate (ts, bpm, source) VALUES (?, ?, ?), (?, ?, ?)", [
      "2024-07-01 08:15:00",
      120,
      null,
      "2024-07-01 08:45:00",
      121,
      null,
    ]);
    const drift = await getWorkoutDrift(db, "stable-workout");
    expect(drift.classification).toBe("stable");
  });

  test("classifies ~4% drift as moderate", async () => {
    await db.run(
      "INSERT INTO workouts (id, type, start_ts, end_ts, duration_sec, source) VALUES (?, ?, ?, ?, ?, ?)",
      ["moderate-workout", "Running", "2024-07-01 08:00:00", "2024-07-01 09:00:00", 3600, null],
    );
    await db.run("INSERT INTO heart_rate (ts, bpm, source) VALUES (?, ?, ?), (?, ?, ?)", [
      "2024-07-01 08:15:00",
      100,
      null,
      "2024-07-01 08:45:00",
      104,
      null,
    ]);
    const drift = await getWorkoutDrift(db, "moderate-workout");
    expect(drift.classification).toBe("moderate");
  });

  test("returns null drift + 'unknown' for unknown workout id", async () => {
    const drift = await getWorkoutDrift(db, "missing");
    expect(drift.drift_pct).toBeNull();
    expect(drift.classification).toBe("unknown");
  });
});
