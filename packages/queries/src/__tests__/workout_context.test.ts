import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Db } from "@vitals/db";
import {
  getWorkoutContextSummary,
  getWorkoutEvents,
  getWorkoutMetadata,
  getWorkoutPerformanceRunRows,
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

  test("batches recent running performance rows with context arrays", async () => {
    await db.run(
      "INSERT INTO workouts (id, type, start_ts, end_ts, duration_sec, source) VALUES (?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?)",
      [
        "wk-running-newer",
        "Running",
        "2024-06-02 08:00:00",
        "2024-06-02 08:45:00",
        2700,
        "Apple Watch",
        "wk-walking-newer",
        "Walking",
        "2024-06-03 08:00:00",
        "2024-06-03 08:45:00",
        2700,
        "Apple Watch",
      ],
    );

    const rows = await getWorkoutPerformanceRunRows(db, {
      from: "2024-06-01",
      to: "2024-06-03",
      limit: 1,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.workout.id).toBe("wk-running-newer");
    expect(rows[0]?.workout.type).toBe("Running");
    expect(rows[0]?.detail.id).toBe("wk-running-newer");
    expect(rows[0]?.efficiency.pace_at_hr.sample_count).toBe(0);
    expect(rows[0]?.stats).toEqual([]);
    expect(rows[0]?.events).toEqual([]);
    expect(rows[0]?.metadata).toEqual([]);
    expect(rows[0]?.routes).toEqual([]);

    const allRows = await getWorkoutPerformanceRunRows(db, {
      from: "2024-06-01",
      to: "2024-06-03",
      limit: 10,
    });
    expect(allRows.map((row) => row.workout.id)).toEqual(["wk-running-newer", WORKOUT_ID]);
    expect(allRows[1]?.stats).toHaveLength(1);
    expect(allRows[1]?.events).toHaveLength(2);
    expect(allRows[1]?.metadata).toHaveLength(2);
    expect(allRows[1]?.routes).toHaveLength(1);
  });

  test("separates context arrays by workout id across multiple rows", async () => {
    await db.run(
      "INSERT INTO workouts (id, type, start_ts, end_ts, duration_sec, source) VALUES (?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?)",
      [
        "wk-running-full-context",
        "Running",
        "2024-06-02 08:00:00",
        "2024-06-02 09:00:00",
        3600,
        "Apple Watch",
        "wk-running-empty-context",
        "Running",
        "2024-06-03 07:00:00",
        "2024-06-03 07:45:00",
        2700,
        "Apple Watch",
      ],
    );
    await db.run(
      "INSERT INTO workout_stats (workout_id, type, start_ts, end_ts, average, minimum, maximum, sum, unit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        "wk-running-full-context",
        "HKQuantityTypeIdentifierRunningPower",
        "2024-06-02 08:00:00",
        "2024-06-02 09:00:00",
        210,
        190,
        250,
        null,
        "W",
      ],
    );
    await db.run(
      "INSERT INTO workout_events (workout_id, type, ts, duration_sec) VALUES (?, ?, ?, ?)",
      ["wk-running-full-context", "HKWorkoutEventTypePause", "2024-06-02 08:40:00", null],
    );
    await db.run("INSERT INTO workout_metadata (workout_id, key, value) VALUES (?, ?, ?)", [
      "wk-running-full-context",
      "HKIndoorWorkout",
      "0",
    ]);
    await db.run(
      "INSERT INTO workout_routes (workout_id, start_ts, end_ts, source, path) VALUES (?, ?, ?, ?, ?)",
      [
        "wk-running-full-context",
        "2024-06-02 08:00:00",
        "2024-06-02 09:00:00",
        "Apple Watch",
        "/workout-routes/full.gpx",
      ],
    );

    const rows = await getWorkoutPerformanceRunRows(db, {
      from: "2024-06-01",
      to: "2024-06-04",
    });
    const byId = new Map(rows.map((row) => [row.workout.id, row]));

    expect(byId.get("wk-running-empty-context")?.stats).toEqual([]);
    expect(byId.get("wk-running-empty-context")?.events).toEqual([]);
    expect(byId.get("wk-running-empty-context")?.metadata).toEqual([]);
    expect(byId.get("wk-running-empty-context")?.routes).toEqual([]);
    expect(byId.get("wk-running-full-context")?.stats).toHaveLength(1);
    expect(byId.get("wk-running-full-context")?.events).toHaveLength(1);
    expect(byId.get("wk-running-full-context")?.metadata).toHaveLength(1);
    expect(byId.get("wk-running-full-context")?.routes).toHaveLength(1);
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
