import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Db, migrate, openDb } from "@vitals/db";

export interface Fixture {
  dir: string;
  db: Db;
  cleanup: () => Promise<void>;
}

export const WORKOUT_ID = "wk-running-2024-06-01";
export const WORKOUT_ID_WALK = "wk-walking-2024-06-03";
export const WORKOUT_ID_EFFICIENCY = "wk-running-efficiency-2024-06-04";
export const WORKOUT_ID_EFFICIENCY_NO_ALIGNMENT = "wk-running-no-alignment-2024-06-05";
export const WORKOUT_ID_EFFICIENCY_SHORT = "wk-running-efficiency-short-2024-06-06";

export async function makeFixtureDb(): Promise<Fixture> {
  const dir = await mkdtemp(join(tmpdir(), "vitals-server-"));
  const db = await openDb(join(dir, "test.duckdb"));
  await migrate(db);
  return {
    dir,
    db,
    cleanup: async () => {
      db.close();
      await rm(dir, { recursive: true, force: true });
    },
  };
}

export async function seedAll(db: Db): Promise<void> {
  await db.exec("BEGIN TRANSACTION");
  try {
    // Workouts
    await db.run(
      "INSERT INTO workouts (id, type, start_ts, end_ts, duration_sec, source) VALUES (?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?)",
      [
        WORKOUT_ID,
        "Running",
        "2024-06-01 08:00:00",
        "2024-06-01 09:00:00",
        3600,
        "Apple Watch",
        WORKOUT_ID_WALK,
        "Walking",
        "2024-06-03 09:00:00",
        "2024-06-03 09:30:00",
        1800,
        "Apple Watch",
        WORKOUT_ID_EFFICIENCY,
        "Running",
        "2024-06-04 08:00:00",
        "2024-06-04 09:00:00",
        3600,
        "Apple Watch",
        WORKOUT_ID_EFFICIENCY_NO_ALIGNMENT,
        "Running",
        "2024-06-05 08:00:00",
        "2024-06-05 09:00:00",
        3600,
        "Apple Watch",
        WORKOUT_ID_EFFICIENCY_SHORT,
        "Running",
        "2024-06-06 08:00:00",
        "2024-06-06 08:30:00",
        1800,
        "Apple Watch",
      ],
    );

    // HR samples within running workout: first-half avg 110, second-half avg 130
    const hrRows: Array<[string, number]> = [
      ["2024-06-01 08:05:00", 100],
      ["2024-06-01 08:15:00", 110],
      ["2024-06-01 08:25:00", 120],
      ["2024-06-01 08:35:00", 120],
      ["2024-06-01 08:45:00", 130],
      ["2024-06-01 08:55:00", 140],
      ["2024-06-04 08:05:00", 118],
      ["2024-06-04 08:15:00", 122],
      ["2024-06-04 08:25:00", 126],
      ["2024-06-04 08:35:00", 128],
      ["2024-06-04 08:45:00", 130],
      ["2024-06-04 08:55:00", 132],
      ["2024-06-05 08:00:00", 120],
      ["2024-06-05 08:30:00", 128],
      ["2024-06-06 08:05:00", 122],
      ["2024-06-06 08:15:00", 125],
      ["2024-06-06 08:25:00", 128],
    ];
    for (const [ts, bpm] of hrRows) {
      await db.run("INSERT INTO heart_rate (ts, bpm, source) VALUES (?, ?, ?)", [
        ts,
        bpm,
        "Apple Watch",
      ]);
    }

    // Resting HR
    await db.run(
      "INSERT INTO resting_hr (ts, bpm) VALUES (?, ?), (?, ?), (?, ?), (?, ?), (?, ?), (?, ?), (?, ?), (?, ?), (?, ?)",
      [
        "2024-05-29 05:00:00",
        51,
        "2024-05-30 05:00:00",
        52,
        "2024-05-31 05:00:00",
        54,
        "2024-06-01 05:00:00",
        52,
        "2024-06-01 05:30:00",
        54,
        "2024-06-02 05:00:00",
        56,
        "2024-06-03 05:00:00",
        55,
        "2024-06-04 05:00:00",
        57,
        "2024-06-05 05:00:00",
        58,
      ],
    );

    // Sleep
    await db.run(
      "INSERT INTO sleep (start_ts, end_ts, state, raw_state) VALUES " +
        "(?, ?, ?, ?), (?, ?, ?, ?), (?, ?, ?, ?), (?, ?, ?, ?), (?, ?, ?, ?), (?, ?, ?, ?)",
      [
        "2024-05-31 22:30:00",
        "2024-06-01 06:30:00",
        "in_bed",
        "HKCategoryValueSleepAnalysisInBed",
        "2024-05-31 23:00:00",
        "2024-06-01 02:00:00",
        "asleep",
        "HKCategoryValueSleepAnalysisAsleepCore",
        "2024-06-01 02:00:00",
        "2024-06-01 03:00:00",
        "asleep",
        "HKCategoryValueSleepAnalysisAsleepDeep",
        "2024-06-01 03:00:00",
        "2024-06-01 04:00:00",
        "asleep",
        "HKCategoryValueSleepAnalysisAsleepREM",
        "2024-06-01 04:00:00",
        "2024-06-01 06:00:00",
        "asleep",
        "HKCategoryValueSleepAnalysisAsleepCore",
        "2024-06-01 06:00:00",
        "2024-06-01 06:30:00",
        "awake",
        "HKCategoryValueSleepAnalysisAwake",
      ],
    );

    // VO2Max
    await db.run("INSERT INTO performance (ts, vo2max, speed, power) VALUES (?, ?, ?, ?)", [
      "2024-06-01 07:00:00",
      48.0,
      null,
      null,
    ]);
    await db.run("INSERT INTO performance (ts, vo2max, speed, power) VALUES (?, ?, ?, ?)", [
      "2024-06-02 07:00:00",
      51.0,
      null,
      null,
    ]);

    // Running speed (m/s) — day 1 avg 3.5, day 2 avg 3.6
    await db.run("INSERT INTO performance (ts, vo2max, speed, power) VALUES (?, ?, ?, ?)", [
      "2024-06-01 08:00:00",
      null,
      3.0,
      null,
    ]);
    await db.run("INSERT INTO performance (ts, vo2max, speed, power) VALUES (?, ?, ?, ?)", [
      "2024-06-01 08:30:00",
      null,
      4.0,
      null,
    ]);
    await db.run("INSERT INTO performance (ts, vo2max, speed, power) VALUES (?, ?, ?, ?)", [
      "2024-06-02 08:00:00",
      null,
      3.6,
      null,
    ]);
    await db.run("INSERT INTO performance (ts, vo2max, speed, power) VALUES (?, ?, ?, ?)", [
      "2024-06-04 08:05:00",
      null,
      3.6,
      null,
    ]);
    await db.run("INSERT INTO performance (ts, vo2max, speed, power) VALUES (?, ?, ?, ?)", [
      "2024-06-04 08:15:00",
      null,
      3.8,
      null,
    ]);
    await db.run("INSERT INTO performance (ts, vo2max, speed, power) VALUES (?, ?, ?, ?)", [
      "2024-06-04 08:25:00",
      null,
      3.7,
      null,
    ]);
    await db.run("INSERT INTO performance (ts, vo2max, speed, power) VALUES (?, ?, ?, ?)", [
      "2024-06-04 08:35:00",
      null,
      3.5,
      null,
    ]);
    await db.run("INSERT INTO performance (ts, vo2max, speed, power) VALUES (?, ?, ?, ?)", [
      "2024-06-04 08:45:00",
      null,
      3.4,
      null,
    ]);
    await db.run("INSERT INTO performance (ts, vo2max, speed, power) VALUES (?, ?, ?, ?)", [
      "2024-06-04 08:55:00",
      null,
      3.3,
      null,
    ]);
    await db.run("INSERT INTO performance (ts, vo2max, speed, power) VALUES (?, ?, ?, ?)", [
      "2024-06-05 08:10:00",
      null,
      3.7,
      null,
    ]);
    await db.run("INSERT INTO performance (ts, vo2max, speed, power) VALUES (?, ?, ?, ?)", [
      "2024-06-05 08:40:00",
      null,
      3.5,
      null,
    ]);
    await db.run("INSERT INTO performance (ts, vo2max, speed, power) VALUES (?, ?, ?, ?)", [
      "2024-06-06 08:05:00",
      null,
      3.9,
      null,
    ]);
    await db.run("INSERT INTO performance (ts, vo2max, speed, power) VALUES (?, ?, ?, ?)", [
      "2024-06-06 08:15:00",
      null,
      4.0,
      null,
    ]);
    await db.run("INSERT INTO performance (ts, vo2max, speed, power) VALUES (?, ?, ?, ?)", [
      "2024-06-06 08:25:00",
      null,
      3.8,
      null,
    ]);

    // Running power (watts) — day 1 avg 220, day 2 avg 260
    await db.run("INSERT INTO performance (ts, vo2max, speed, power) VALUES (?, ?, ?, ?)", [
      "2024-06-01 09:00:00",
      null,
      null,
      200.0,
    ]);
    await db.run("INSERT INTO performance (ts, vo2max, speed, power) VALUES (?, ?, ?, ?)", [
      "2024-06-01 09:30:00",
      null,
      null,
      240.0,
    ]);
    await db.run("INSERT INTO performance (ts, vo2max, speed, power) VALUES (?, ?, ?, ?)", [
      "2024-06-02 09:00:00",
      null,
      null,
      260.0,
    ]);

    // Walking HR — day 1 avg 90, day 2 avg 95
    await db.run("INSERT INTO walking_hr (ts, bpm) VALUES (?, ?)", ["2024-06-01 10:00:00", 88]);
    await db.run("INSERT INTO walking_hr (ts, bpm) VALUES (?, ?)", ["2024-06-01 14:00:00", 92]);
    await db.run("INSERT INTO walking_hr (ts, bpm) VALUES (?, ?)", ["2024-06-02 10:00:00", 95]);

    // HRV — two samples on day 1 (avg 65), one on day 2 (72)
    await db.run("INSERT INTO hrv (ts, value) VALUES (?, ?)", ["2024-06-01 03:00:00", 60]);
    await db.run("INSERT INTO hrv (ts, value) VALUES (?, ?)", ["2024-06-01 03:30:00", 70]);
    await db.run("INSERT INTO hrv (ts, value) VALUES (?, ?)", ["2024-06-02 03:00:00", 72]);

    // Steps — day 1 total 3500, day 2 total 4100
    await db.run("INSERT INTO steps (ts, count) VALUES (?, ?)", ["2024-06-01 08:00:00", 1200]);
    await db.run("INSERT INTO steps (ts, count) VALUES (?, ?)", ["2024-06-01 12:00:00", 2300]);
    await db.run("INSERT INTO steps (ts, count) VALUES (?, ?)", ["2024-06-02 09:00:00", 4100]);

    // Distance — day 1 total 2250.5, day 2 total 3100.25
    await db.run("INSERT INTO distance (ts, meters) VALUES (?, ?)", ["2024-06-01 08:00:00", 800.0]);
    await db.run("INSERT INTO distance (ts, meters) VALUES (?, ?)", [
      "2024-06-01 12:00:00",
      1450.5,
    ]);
    await db.run("INSERT INTO distance (ts, meters) VALUES (?, ?)", [
      "2024-06-02 09:00:00",
      3100.25,
    ]);

    // Energy — sparse: active-only rows + basal-only rows within the same day
    await db.run("INSERT INTO energy (ts, active_kcal, basal_kcal) VALUES (?, ?, ?)", [
      "2024-06-01 08:00:00",
      120.5,
      null,
    ]);
    await db.run("INSERT INTO energy (ts, active_kcal, basal_kcal) VALUES (?, ?, ?)", [
      "2024-06-01 12:00:00",
      80.0,
      null,
    ]);
    await db.run("INSERT INTO energy (ts, active_kcal, basal_kcal) VALUES (?, ?, ?)", [
      "2024-06-01 23:00:00",
      null,
      1600.0,
    ]);
    await db.run("INSERT INTO energy (ts, active_kcal, basal_kcal) VALUES (?, ?, ?)", [
      "2024-06-02 09:00:00",
      300.0,
      null,
    ]);
    await db.run("INSERT INTO energy (ts, active_kcal, basal_kcal) VALUES (?, ?, ?)", [
      "2024-06-02 23:00:00",
      null,
      1650.0,
    ]);

    await db.exec("COMMIT");
  } catch (err) {
    await db.exec("ROLLBACK");
    throw err;
  }
}
