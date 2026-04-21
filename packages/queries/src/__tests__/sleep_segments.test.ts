import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Db } from "@vitals/db";
import { getSleepSegments } from "../sleep_segments";
import { type Fixture, makeFixtureDb, seedSleep } from "./seed";

describe("getSleepSegments", () => {
  let fixture: Fixture;
  let db: Db;

  beforeEach(async () => {
    fixture = await makeFixtureDb();
    db = fixture.db;
    await seedSleep(db);
  });

  afterEach(() => fixture.cleanup());

  test("returns ordered segment rows with night assignment and preserved raw stages", async () => {
    const rows = await getSleepSegments(db, { from: "2024-05-31", to: "2024-06-02" });
    expect(rows).toEqual([
      {
        night: "2024-05-31",
        start_ts: "2024-05-31T22:30:00.000Z",
        end_ts: "2024-06-01T06:30:00.000Z",
        state: "in_bed",
        raw_state: "HKCategoryValueSleepAnalysisInBed",
        stage: null,
        duration_hours: 8,
      },
      {
        night: "2024-05-31",
        start_ts: "2024-05-31T23:00:00.000Z",
        end_ts: "2024-06-01T02:00:00.000Z",
        state: "asleep",
        raw_state: "HKCategoryValueSleepAnalysisAsleepCore",
        stage: "core",
        duration_hours: 3,
      },
      {
        night: "2024-05-31",
        start_ts: "2024-06-01T02:00:00.000Z",
        end_ts: "2024-06-01T03:00:00.000Z",
        state: "asleep",
        raw_state: "HKCategoryValueSleepAnalysisAsleepDeep",
        stage: "deep",
        duration_hours: 1,
      },
      {
        night: "2024-05-31",
        start_ts: "2024-06-01T03:00:00.000Z",
        end_ts: "2024-06-01T04:00:00.000Z",
        state: "asleep",
        raw_state: "HKCategoryValueSleepAnalysisAsleepREM",
        stage: "rem",
        duration_hours: 1,
      },
      {
        night: "2024-05-31",
        start_ts: "2024-06-01T04:00:00.000Z",
        end_ts: "2024-06-01T06:00:00.000Z",
        state: "asleep",
        raw_state: "HKCategoryValueSleepAnalysisAsleepCore",
        stage: "core",
        duration_hours: 2,
      },
      {
        night: "2024-05-31",
        start_ts: "2024-06-01T06:00:00.000Z",
        end_ts: "2024-06-01T06:30:00.000Z",
        state: "awake",
        raw_state: "HKCategoryValueSleepAnalysisAwake",
        stage: null,
        duration_hours: 0.5,
      },
      {
        night: "2024-06-01",
        start_ts: "2024-06-01T21:30:00.000Z",
        end_ts: "2024-06-02T06:30:00.000Z",
        state: "in_bed",
        raw_state: "HKCategoryValueSleepAnalysisInBed",
        stage: null,
        duration_hours: 9,
      },
      {
        night: "2024-06-01",
        start_ts: "2024-06-01T22:00:00.000Z",
        end_ts: "2024-06-01T23:00:00.000Z",
        state: "asleep",
        raw_state: "HKCategoryValueSleepAnalysisAsleepUnspecified",
        stage: "unspecified",
        duration_hours: 1,
      },
      {
        night: "2024-06-01",
        start_ts: "2024-06-01T23:00:00.000Z",
        end_ts: "2024-06-02T02:00:00.000Z",
        state: "asleep",
        raw_state: "HKCategoryValueSleepAnalysisAsleepCore",
        stage: "core",
        duration_hours: 3,
      },
      {
        night: "2024-06-01",
        start_ts: "2024-06-02T02:00:00.000Z",
        end_ts: "2024-06-02T03:00:00.000Z",
        state: "asleep",
        raw_state: "HKCategoryValueSleepAnalysisAsleepDeep",
        stage: "deep",
        duration_hours: 1,
      },
      {
        night: "2024-06-01",
        start_ts: "2024-06-02T03:00:00.000Z",
        end_ts: "2024-06-02T05:00:00.000Z",
        state: "asleep",
        raw_state: "HKCategoryValueSleepAnalysisAsleepREM",
        stage: "rem",
        duration_hours: 2,
      },
      {
        night: "2024-06-01",
        start_ts: "2024-06-02T05:00:00.000Z",
        end_ts: "2024-06-02T06:00:00.000Z",
        state: "asleep",
        raw_state: "HKCategoryValueSleepAnalysisAsleepCore",
        stage: "core",
        duration_hours: 1,
      },
      {
        night: "2024-06-01",
        start_ts: "2024-06-02T06:00:00.000Z",
        end_ts: "2024-06-02T06:30:00.000Z",
        state: "awake",
        raw_state: "HKCategoryValueSleepAnalysisAwake",
        stage: null,
        duration_hours: 0.5,
      },
    ]);
  });

  test("returns null raw detail for pre-0.8.0 rows", async () => {
    await db.run("INSERT INTO sleep (start_ts, end_ts, state) VALUES (?, ?, ?)", [
      "2024-06-05 23:00:00",
      "2024-06-06 05:00:00",
      "asleep",
    ]);

    const rows = await getSleepSegments(db, { from: "2024-06-05", to: "2024-06-05" });
    expect(rows).toEqual([
      {
        night: "2024-06-05",
        start_ts: "2024-06-05T23:00:00.000Z",
        end_ts: "2024-06-06T05:00:00.000Z",
        state: "asleep",
        raw_state: null,
        stage: null,
        duration_hours: 6,
      },
    ]);
  });

  test("returns [] when the window has no sleep rows", async () => {
    const rows = await getSleepSegments(db, { from: "2025-01-01", to: "2025-01-08" });
    expect(rows).toEqual([]);
  });
});
