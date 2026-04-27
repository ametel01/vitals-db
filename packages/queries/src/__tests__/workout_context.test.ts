import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Db } from "@vitals/db";
import {
  getWorkoutContextSummary,
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
    await db.run("INSERT INTO workout_metadata (workout_id, key, value) VALUES (?, ?, ?)", [
      WORKOUT_ID,
      "Weather",
      "clear",
    ]);
    await db.run(
      "INSERT INTO workout_events (workout_id, type, ts, duration_sec) VALUES (?, ?, ?, ?)",
      [WORKOUT_ID, "HKWorkoutEventTypeSegment", "2024-06-01 08:45:00", 300],
    );
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
      {
        workout_id: WORKOUT_ID,
        type: "HKWorkoutEventTypeSegment",
        ts: "2024-06-01T08:45:00.000Z",
        duration_sec: 300,
      },
    ]);
    expect(await getWorkoutMetadata(db, WORKOUT_ID)).toEqual([
      { workout_id: WORKOUT_ID, key: "HKIndoorWorkout", value: "0" },
      { workout_id: WORKOUT_ID, key: "Weather", value: "clear" },
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

  test("summarizes workout context coverage", async () => {
    expect(await getWorkoutContextSummary(db, WORKOUT_ID)).toEqual({
      workout_id: WORKOUT_ID,
      context_label: "outdoor_route",
      route_count: 1,
      stat_count: 1,
      pause_count: 1,
      segment_count: 1,
      metadata_count: 2,
      has_weather: true,
      has_elevation: false,
    });
  });

  test("infers indoor and unknown context when routes are absent", async () => {
    await db.run(
      "INSERT INTO workouts (id, type, start_ts, end_ts, duration_sec, source) VALUES (?, ?, ?, ?, ?, ?)",
      ["wk-indoor", "Running", "2024-06-02 08:00:00", "2024-06-02 08:45:00", 2700, "Apple Watch"],
    );
    await db.run("INSERT INTO workout_metadata (workout_id, key, value) VALUES (?, ?, ?)", [
      "wk-indoor",
      "HKIndoorWorkout",
      "1",
    ]);
    await db.run(
      "INSERT INTO workouts (id, type, start_ts, end_ts, duration_sec, source) VALUES (?, ?, ?, ?, ?, ?)",
      ["wk-unknown", "Running", "2024-06-03 08:00:00", "2024-06-03 08:45:00", 2700, "Apple Watch"],
    );

    expect(await getWorkoutContextSummary(db, "wk-indoor")).toMatchObject({
      workout_id: "wk-indoor",
      context_label: "indoor",
      route_count: 0,
      metadata_count: 1,
    });
    expect(await getWorkoutContextSummary(db, "wk-unknown")).toMatchObject({
      workout_id: "wk-unknown",
      context_label: "unknown",
      route_count: 0,
      metadata_count: 0,
    });
  });

  test("returns null context summary for unknown workouts", async () => {
    expect(await getWorkoutContextSummary(db, "missing")).toBeNull();
  });
});
