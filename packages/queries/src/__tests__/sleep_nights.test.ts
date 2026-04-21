import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Db } from "@vitals/db";
import { getSleepNights } from "../sleep_nights";
import { type Fixture, makeFixtureDb, seedSleep } from "./seed";

describe("getSleepNights", () => {
  let fixture: Fixture;
  let db: Db;

  beforeEach(async () => {
    fixture = await makeFixtureDb();
    db = fixture.db;
    await seedSleep(db);
  });

  afterEach(() => fixture.cleanup());

  test("returns one row per night with totals, timing, efficiency, and stage detail", async () => {
    const rows = await getSleepNights(db, { from: "2024-05-31", to: "2024-06-02" });
    expect(rows).toHaveLength(2);

    expect(rows[0]).toEqual({
      day: "2024-05-31",
      bedtime: "2024-05-31T22:30:00.000Z",
      wake_time: "2024-06-01T06:30:00.000Z",
      asleep_hours: 7,
      in_bed_hours: 8,
      awake_hours: 0.5,
      efficiency: 7 / 8,
      core_hours: 5,
      deep_hours: 1,
      rem_hours: 1,
      unspecified_hours: 0,
    });

    expect(rows[1]).toEqual({
      day: "2024-06-01",
      bedtime: "2024-06-01T21:30:00.000Z",
      wake_time: "2024-06-02T06:30:00.000Z",
      asleep_hours: 8,
      in_bed_hours: 9,
      awake_hours: 0.5,
      efficiency: 8 / 9,
      core_hours: 4,
      deep_hours: 1,
      rem_hours: 2,
      unspecified_hours: 1,
    });
  });

  test("uses a shifted night key so post-midnight sleep stays attached to the bedtime date", async () => {
    await db.run(
      "INSERT INTO sleep (start_ts, end_ts, state, raw_state) VALUES (?, ?, ?, ?), (?, ?, ?, ?), (?, ?, ?, ?)",
      [
        "2024-06-03 23:45:00",
        "2024-06-04 06:45:00",
        "in_bed",
        "HKCategoryValueSleepAnalysisInBed",
        "2024-06-04 00:15:00",
        "2024-06-04 02:15:00",
        "asleep",
        "HKCategoryValueSleepAnalysisAsleepCore",
        "2024-06-04 02:15:00",
        "2024-06-04 06:15:00",
        "asleep",
        "HKCategoryValueSleepAnalysisAsleepREM",
      ],
    );

    const rows = await getSleepNights(db, { from: "2024-06-03", to: "2024-06-04" });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.day).toBe("2024-06-03");
    expect(rows[0]?.bedtime).toBe("2024-06-03T23:45:00.000Z");
    expect(rows[0]?.wake_time).toBe("2024-06-04T06:45:00.000Z");
  });

  test("returns null stage totals for pre-0.8.0 rows without raw_state backfill", async () => {
    await db.run("INSERT INTO sleep (start_ts, end_ts, state) VALUES (?, ?, ?), (?, ?, ?)", [
      "2024-06-05 22:30:00",
      "2024-06-06 06:30:00",
      "in_bed",
      "2024-06-05 23:00:00",
      "2024-06-06 05:00:00",
      "asleep",
    ]);

    const rows = await getSleepNights(db, { from: "2024-06-05", to: "2024-06-05" });
    expect(rows).toEqual([
      {
        day: "2024-06-05",
        bedtime: "2024-06-05T22:30:00.000Z",
        wake_time: "2024-06-06T06:30:00.000Z",
        asleep_hours: 6,
        in_bed_hours: 8,
        awake_hours: 0,
        efficiency: 0.75,
        core_hours: null,
        deep_hours: null,
        rem_hours: null,
        unspecified_hours: null,
      },
    ]);
  });

  test("returns [] when the window has no sleep rows", async () => {
    const rows = await getSleepNights(db, { from: "2025-01-01", to: "2025-01-08" });
    expect(rows).toEqual([]);
  });
});
