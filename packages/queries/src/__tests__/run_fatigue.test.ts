import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Db } from "@vitals/db";
import { getRunFatigueFlag, listRunFatigueFlags } from "../run_fatigue";
import { type Fixture, makeFixtureDb } from "./seed";

describe("run fatigue flags", () => {
  let fixture: Fixture;
  let db: Db;

  beforeEach(async () => {
    fixture = await makeFixtureDb();
    db = fixture.db;
  });

  afterEach(() => fixture.cleanup());

  test("labels a well-sampled drifting run with evidence and a conservative action", async () => {
    await seedRun(db, {
      id: "drift-run",
      day: "2024-06-10",
      firstHr: 118,
      secondHr: 132,
      firstSpeed: 3.3,
      secondSpeed: 3.1,
      withPower: true,
      withContext: true,
    });
    await seedRecovery(db, {
      day: "2024-06-10",
      baselineRhr: 52,
      currentRhr: 51,
      baselineHrv: 60,
      currentHrv: 62,
    });

    const result = await getRunFatigueFlag(db, "drift-run");

    expect(result).toMatchObject({
      workout_id: "drift-run",
      diagnosis: "cardiac_drift",
      result: {
        answer: "Run signal suggests cardiac drift",
        action: { kind: "run_easier" },
        sample_quality: "high",
      },
    });
    expect(result?.result.evidence.map((item) => item.label)).toEqual([
      "HR drift",
      "Decoupling",
      "Pace/power fade",
      "Pre-run recovery",
    ]);
  });

  test("prioritizes poor sample quality over a run diagnosis", async () => {
    await seedRun(db, {
      id: "poor-run",
      day: "2024-06-11",
      firstHr: 118,
      secondHr: 119,
      firstSpeed: null,
      secondSpeed: null,
      withPower: false,
      withContext: false,
    });

    const result = await getRunFatigueFlag(db, "poor-run");

    expect(result).toMatchObject({
      diagnosis: "poor_sample_quality",
      result: {
        action: { kind: "retest" },
        confidence: "low",
        sample_quality: "poor",
      },
    });
  });

  test("lists recent running fatigue flags in workout order", async () => {
    await seedRun(db, {
      id: "first-run",
      day: "2024-06-10",
      firstHr: 118,
      secondHr: 119,
      firstSpeed: 3.2,
      secondSpeed: 3.2,
      withPower: true,
      withContext: true,
    });
    await seedRun(db, {
      id: "second-run",
      day: "2024-06-12",
      firstHr: 118,
      secondHr: 119,
      firstSpeed: 3.2,
      secondSpeed: 3.2,
      withPower: true,
      withContext: true,
    });

    const rows = await listRunFatigueFlags(db, { from: "2024-06-09", to: "2024-06-12" });

    expect(rows.map((row) => row.workout_id)).toEqual(["second-run", "first-run"]);
  });
});

interface RunSeed {
  id: string;
  day: string;
  firstHr: number;
  secondHr: number;
  firstSpeed: number | null;
  secondSpeed: number | null;
  withPower: boolean;
  withContext: boolean;
}

async function seedRun(db: Db, seed: RunSeed): Promise<void> {
  await db.run(
    "INSERT INTO workouts (id, type, start_ts, end_ts, duration_sec, source) VALUES (?, ?, ?, ?, ?, ?)",
    [seed.id, "Running", `${seed.day} 08:00:00`, `${seed.day} 09:00:00`, 3600, "Apple Watch"],
  );
  for (const [minute, bpm] of [
    [5, seed.firstHr],
    [20, seed.firstHr],
    [40, seed.secondHr],
    [55, seed.secondHr],
  ] satisfies Array<[number, number]>) {
    await db.run("INSERT INTO heart_rate (ts, bpm, source) VALUES (?, ?, ?)", [
      `${seed.day} 08:${String(minute).padStart(2, "0")}:00`,
      bpm,
      "Apple Watch",
    ]);
  }
  await seedPerformance(db, seed);
  if (seed.withContext) {
    await db.run(
      "INSERT INTO workout_routes (workout_id, start_ts, end_ts, source, path) VALUES (?, ?, ?, ?, ?)",
      [seed.id, `${seed.day} 08:00:00`, `${seed.day} 09:00:00`, "Apple Watch", "/tmp/run.gpx"],
    );
  }
}

async function seedPerformance(db: Db, seed: RunSeed): Promise<void> {
  for (const [minute, speed, power] of [
    [5, seed.firstSpeed, seed.withPower ? 220 : null],
    [20, seed.firstSpeed, seed.withPower ? 220 : null],
    [40, seed.secondSpeed, seed.withPower ? 210 : null],
    [55, seed.secondSpeed, seed.withPower ? 210 : null],
  ] satisfies Array<[number, number | null, number | null]>) {
    await db.run("INSERT INTO performance (ts, vo2max, speed, power) VALUES (?, ?, ?, ?)", [
      `${seed.day} 08:${String(minute).padStart(2, "0")}:00`,
      null,
      speed,
      power,
    ]);
  }
}

async function seedRecovery(
  db: Db,
  seed: {
    day: string;
    baselineRhr: number;
    currentRhr: number;
    baselineHrv: number;
    currentHrv: number;
  },
): Promise<void> {
  await db.run("INSERT INTO resting_hr (ts, bpm) VALUES (?, ?), (?, ?)", [
    `${addDays(seed.day, -1)} 05:00:00`,
    seed.baselineRhr,
    `${seed.day} 05:00:00`,
    seed.currentRhr,
  ]);
  await db.run("INSERT INTO hrv (ts, value) VALUES (?, ?), (?, ?)", [
    `${addDays(seed.day, -1)} 05:00:00`,
    seed.baselineHrv,
    `${seed.day} 05:00:00`,
    seed.currentHrv,
  ]);
}

function addDays(day: string, offset: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}
