import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Db, migrate, openDb } from "@vitals/db";

export interface Fixture {
  dir: string;
  db: Db;
  cleanup: () => Promise<void>;
}

export async function makeFixtureDb(): Promise<Fixture> {
  const dir = await mkdtemp(join(tmpdir(), "vitals-queries-"));
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

export const WORKOUT_ID = "wk-running-2024-06-01";

export async function seedWorkoutWithHR(db: Db): Promise<void> {
  await db.exec("BEGIN TRANSACTION");
  try {
    await db.run(
      "INSERT INTO workouts (id, type, start_ts, end_ts, duration_sec, source) VALUES (?, ?, ?, ?, ?, ?)",
      [WORKOUT_ID, "Running", "2024-06-01 08:00:00", "2024-06-01 09:00:00", 3600, "Apple Watch"],
    );
    // First half (08:00:00 - 08:30:00): avg 110
    // Second half (08:30:00 - 09:00:00): avg 130 (≈18% drift → classified "high")
    const hrRows: Array<[string, number]> = [
      ["2024-06-01 08:05:00", 100],
      ["2024-06-01 08:15:00", 110],
      ["2024-06-01 08:25:00", 120],
      ["2024-06-01 08:35:00", 120],
      ["2024-06-01 08:45:00", 130],
      ["2024-06-01 08:55:00", 140],
    ];
    for (const [ts, bpm] of hrRows) {
      await db.run("INSERT INTO heart_rate (ts, bpm, source) VALUES (?, ?, ?)", [
        ts,
        bpm,
        "Apple Watch",
      ]);
    }
    await db.exec("COMMIT");
  } catch (err) {
    await db.exec("ROLLBACK");
    throw err;
  }
}

export async function seedRestingHR(db: Db): Promise<void> {
  const rows: Array<[string, number]> = [
    ["2024-06-01 05:00:00", 52],
    ["2024-06-01 05:30:00", 54], // day avg = 53
    ["2024-06-02 05:00:00", 56], // day avg = 56
    ["2024-06-03 05:00:00", 55], // day avg = 55
  ];
  for (const [ts, bpm] of rows) {
    await db.run("INSERT INTO resting_hr (ts, bpm) VALUES (?, ?)", [ts, bpm]);
  }
}

export async function seedSleep(db: Db): Promise<void> {
  // Apple's real export shape: InBed brackets one or more AsleepX intervals.
  // Night 1 (2024-05-31 → 2024-06-01): in_bed 8h, asleep 7h
  await db.run("INSERT INTO sleep (start_ts, end_ts, state) VALUES (?, ?, ?), (?, ?, ?)", [
    "2024-05-31 22:30:00",
    "2024-06-01 06:30:00",
    "in_bed",
    "2024-05-31 23:00:00",
    "2024-06-01 06:00:00",
    "asleep",
  ]);
  // Night 2 (2024-06-01 → 2024-06-02): in_bed 9h, asleep 8h
  await db.run("INSERT INTO sleep (start_ts, end_ts, state) VALUES (?, ?, ?), (?, ?, ?)", [
    "2024-06-01 21:30:00",
    "2024-06-02 06:30:00",
    "in_bed",
    "2024-06-01 22:00:00",
    "2024-06-02 06:00:00",
    "asleep",
  ]);
}

export async function seedPerformance(db: Db): Promise<void> {
  await db.run(
    "INSERT INTO performance (ts, vo2max, speed, power) VALUES (?, ?, ?, ?), (?, ?, ?, ?), (?, ?, ?, ?)",
    [
      "2024-06-01 07:00:00",
      48.0,
      null,
      null,
      "2024-06-01 07:30:00",
      50.0,
      null,
      null, // day avg = 49
      "2024-06-02 07:00:00",
      51.0,
      null,
      null, // day avg = 51
    ],
  );
}

export async function seedWalkingHR(db: Db): Promise<void> {
  const rows: Array<[string, number]> = [
    ["2024-06-01 10:00:00", 88],
    ["2024-06-01 14:00:00", 92], // day avg = 90
    ["2024-06-02 10:00:00", 95], // day avg = 95
    ["2024-06-03 10:00:00", 87], // day avg = 87
  ];
  for (const [ts, bpm] of rows) {
    await db.run("INSERT INTO walking_hr (ts, bpm) VALUES (?, ?)", [ts, bpm]);
  }
}

export async function seedSpeedAndPower(db: Db): Promise<void> {
  // Sparse rows: speed-only, power-only, and mixed — mirrors the production
  // shape where each `performance` row carries at most one measurement.
  const rows: Array<[string, number | null, number | null, number | null]> = [
    ["2024-06-01 08:00:00", null, 3.0, null],
    ["2024-06-01 08:30:00", null, 4.0, null], // speed day avg = 3.5
    ["2024-06-01 09:00:00", null, null, 200.0],
    ["2024-06-01 09:30:00", null, null, 240.0], // power day avg = 220
    ["2024-06-02 08:00:00", null, 3.6, null], // speed day avg = 3.6
    ["2024-06-02 09:00:00", null, null, 260.0], // power day avg = 260
  ];
  for (const [ts, vo2max, speed, power] of rows) {
    await db.run("INSERT INTO performance (ts, vo2max, speed, power) VALUES (?, ?, ?, ?)", [
      ts,
      vo2max,
      speed,
      power,
    ]);
  }
}

export async function seedHRV(db: Db): Promise<void> {
  const rows: Array<[string, number]> = [
    ["2024-06-01 03:00:00", 60],
    ["2024-06-01 03:30:00", 70], // day avg = 65
    ["2024-06-02 03:00:00", 72], // day avg = 72
    ["2024-06-03 03:00:00", 68], // day avg = 68
  ];
  for (const [ts, value] of rows) {
    await db.run("INSERT INTO hrv (ts, value) VALUES (?, ?)", [ts, value]);
  }
}

export async function seedSteps(db: Db): Promise<void> {
  const rows: Array<[string, number]> = [
    ["2024-06-01 08:00:00", 1200],
    ["2024-06-01 12:00:00", 2300], // day total = 3500
    ["2024-06-02 09:00:00", 4100], // day total = 4100
    ["2024-06-03 07:30:00", 2500],
    ["2024-06-03 19:00:00", 1800], // day total = 4300
  ];
  for (const [ts, count] of rows) {
    await db.run("INSERT INTO steps (ts, count) VALUES (?, ?)", [ts, count]);
  }
}

export async function seedDistance(db: Db): Promise<void> {
  const rows: Array<[string, number]> = [
    ["2024-06-01 08:00:00", 800.0],
    ["2024-06-01 12:00:00", 1450.5], // day total = 2250.5
    ["2024-06-02 09:00:00", 3100.25], // day total = 3100.25
    ["2024-06-03 07:30:00", 500.0],
    ["2024-06-03 19:00:00", 2000.0], // day total = 2500
  ];
  for (const [ts, meters] of rows) {
    await db.run("INSERT INTO distance (ts, meters) VALUES (?, ?)", [ts, meters]);
  }
}

export async function seedEnergy(db: Db): Promise<void> {
  // Sparse: some rows carry only active_kcal, others only basal_kcal.
  const rows: Array<[string, number | null, number | null]> = [
    ["2024-06-01 08:00:00", 120.5, null],
    ["2024-06-01 12:00:00", 80.0, null],
    ["2024-06-01 23:00:00", null, 1600.0], // day: active = 200.5, basal = 1600
    ["2024-06-02 09:00:00", 300.0, null],
    ["2024-06-02 23:00:00", null, 1650.0], // day: active = 300, basal = 1650
    ["2024-06-03 23:00:00", null, 1700.0], // day: active = 0, basal = 1700
  ];
  for (const [ts, active, basal] of rows) {
    await db.run("INSERT INTO energy (ts, active_kcal, basal_kcal) VALUES (?, ?, ?)", [
      ts,
      active,
      basal,
    ]);
  }
}

export async function seedExtraWorkouts(db: Db): Promise<void> {
  await db.run(
    "INSERT INTO workouts (id, type, start_ts, end_ts, duration_sec, source) VALUES (?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?)",
    [
      "wk-walking-2024-06-03",
      "Walking",
      "2024-06-03 09:00:00",
      "2024-06-03 09:30:00",
      1800,
      "Apple Watch",
      "wk-running-2024-06-08",
      "Running",
      "2024-06-08 08:00:00",
      "2024-06-08 08:45:00",
      2700,
      "Apple Watch",
    ],
  );
}
