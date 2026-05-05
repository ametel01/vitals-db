import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Db } from "@vitals/db";
import { getWorkoutRecoveryTimes } from "../recovery_time";
import { type Fixture, makeFixtureDb } from "./seed";

describe("getWorkoutRecoveryTimes", () => {
  let fixture: Fixture;
  let db: Db;

  beforeEach(async () => {
    fixture = await makeFixtureDb();
    db = fixture.db;
  });

  afterEach(() => fixture.cleanup());

  test("returns elapsed time from each workout end to the next workout start", async () => {
    await seedRecoveryWorkouts(db);

    const rows = await getWorkoutRecoveryTimes(db, {
      from: "2024-06-01",
      to: "2024-06-03",
    });

    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      workout_id: "first",
      next_workout_id: "second",
      recovery_duration_sec: 23 * 3600,
    });
    expect(rows[1]).toMatchObject({
      workout_id: "second",
      next_workout_id: "third",
      recovery_duration_sec: 22.5 * 3600,
    });
    expect(rows[2]).toMatchObject({
      workout_id: "third",
      next_workout_id: null,
      next_start_ts: null,
      recovery_duration_sec: null,
    });
  });

  test("computes the next workout before applying the requested range", async () => {
    await seedRecoveryWorkouts(db);

    const rows = await getWorkoutRecoveryTimes(db, {
      from: "2024-06-02",
      to: "2024-06-02",
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.workout_id).toBe("second");
    expect(rows[0]?.next_workout_id).toBe("third");
  });
});

async function seedRecoveryWorkouts(db: Db): Promise<void> {
  await db.run(
    "INSERT INTO workouts (id, type, start_ts, end_ts, duration_sec, source) VALUES (?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?)",
    [
      "first",
      "Running",
      "2024-06-01 08:00:00",
      "2024-06-01 09:00:00",
      3600,
      "Apple Watch",
      "second",
      "Walking",
      "2024-06-02 08:00:00",
      "2024-06-02 08:30:00",
      1800,
      "Apple Watch",
      "third",
      "Running",
      "2024-06-03 07:00:00",
      "2024-06-03 08:00:00",
      3600,
      "Apple Watch",
    ],
  );
}
