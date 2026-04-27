import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Db } from "@vitals/db";
import {
  getWorkoutEvents,
  getWorkoutMetadata,
  getWorkoutRoutes,
  getWorkoutStats,
} from "../workout_context";
import { type Fixture, WORKOUT_ID, makeFixtureDb, seedWorkoutWithHR } from "./seed";

describe("workout context queries", () => {
  let fixture: Fixture;
  let db: Db;

  beforeEach(async () => {
    fixture = await makeFixtureDb();
    db = fixture.db;
    await seedWorkoutWithHR(db);
    await db.run(
      "INSERT INTO workout_stats (workout_id, type, start_ts, end_ts, average, minimum, maximum, sum, unit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        WORKOUT_ID,
        "HKQuantityTypeIdentifierRunningPower",
        "2024-06-01 08:00:00",
        "2024-06-01 09:00:00",
        220,
        180,
        260,
        null,
        "W",
      ],
    );
    await db.run(
      "INSERT INTO workout_events (workout_id, type, ts, duration_sec) VALUES (?, ?, ?, ?)",
      [WORKOUT_ID, "HKWorkoutEventTypePause", "2024-06-01 08:30:00", null],
    );
    await db.run("INSERT INTO workout_metadata (workout_id, key, value) VALUES (?, ?, ?)", [
      WORKOUT_ID,
      "HKIndoorWorkout",
      "0",
    ]);
    await db.run(
      "INSERT INTO workout_routes (workout_id, start_ts, end_ts, source, path) VALUES (?, ?, ?, ?, ?)",
      [
        WORKOUT_ID,
        "2024-06-01 08:00:00",
        "2024-06-01 09:00:00",
        "Apple Watch",
        "/workout-routes/route.gpx",
      ],
    );
  });

  afterEach(() => fixture.cleanup());

  test("reads stats, events, metadata, and route refs", async () => {
    expect(await getWorkoutStats(db, WORKOUT_ID)).toEqual([
      {
        workout_id: WORKOUT_ID,
        type: "HKQuantityTypeIdentifierRunningPower",
        start_ts: "2024-06-01T08:00:00.000Z",
        end_ts: "2024-06-01T09:00:00.000Z",
        average: 220,
        minimum: 180,
        maximum: 260,
        sum: null,
        unit: "W",
      },
    ]);
    expect(await getWorkoutEvents(db, WORKOUT_ID)).toEqual([
      {
        workout_id: WORKOUT_ID,
        type: "HKWorkoutEventTypePause",
        ts: "2024-06-01T08:30:00.000Z",
        duration_sec: null,
      },
    ]);
    expect(await getWorkoutMetadata(db, WORKOUT_ID)).toEqual([
      { workout_id: WORKOUT_ID, key: "HKIndoorWorkout", value: "0" },
    ]);
    expect(await getWorkoutRoutes(db, WORKOUT_ID)).toEqual([
      {
        workout_id: WORKOUT_ID,
        start_ts: "2024-06-01T08:00:00.000Z",
        end_ts: "2024-06-01T09:00:00.000Z",
        source: "Apple Watch",
        path: "/workout-routes/route.gpx",
      },
    ]);
  });
});
