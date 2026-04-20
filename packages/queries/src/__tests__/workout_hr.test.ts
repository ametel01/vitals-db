import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Db } from "@vitals/db";
import { getWorkoutHR } from "../workout_hr";
import { type Fixture, WORKOUT_ID, makeFixtureDb, seedWorkoutWithHR } from "./seed";

describe("getWorkoutHR", () => {
  let fixture: Fixture;
  let db: Db;

  beforeEach(async () => {
    fixture = await makeFixtureDb();
    db = fixture.db;
    await seedWorkoutWithHR(db);
  });

  afterEach(() => fixture.cleanup());

  test("returns HR samples scoped to the workout window, time-ordered", async () => {
    const points = await getWorkoutHR(db, WORKOUT_ID);
    expect(points).toHaveLength(6);
    expect(points.map((p) => p.bpm)).toEqual([100, 110, 120, 120, 130, 140]);
    expect(points[0]?.ts).toBe("2024-06-01T08:05:00.000Z");
    expect(points.at(-1)?.ts).toBe("2024-06-01T08:55:00.000Z");
    expect(points[0]?.source).toBe("Apple Watch");
  });

  test("returns [] for unknown workout id", async () => {
    const points = await getWorkoutHR(db, "does-not-exist");
    expect(points).toEqual([]);
  });

  test("excludes HR samples outside the workout window", async () => {
    await db.run("INSERT INTO heart_rate (ts, bpm, source) VALUES (?, ?, ?)", [
      "2024-06-01 07:00:00",
      180,
      "Apple Watch",
    ]);
    const points = await getWorkoutHR(db, WORKOUT_ID);
    expect(points).toHaveLength(6);
    expect(points.every((p) => p.bpm !== 180)).toBe(true);
  });
});
