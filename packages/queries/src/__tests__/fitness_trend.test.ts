import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Db } from "@vitals/db";
import { getFitnessTrend } from "../fitness_trend";
import { type Fixture, makeFixtureDb } from "./seed";

describe("getFitnessTrend", () => {
  let fixture: Fixture;
  let db: Db;

  beforeEach(async () => {
    fixture = await makeFixtureDb();
    db = fixture.db;
  });

  afterEach(() => fixture.cleanup());

  test("classifies improving fitness when VO2 is supported by efficiency and power", async () => {
    await seedFitnessWindow(db, {
      baselineDay: "2024-06-01",
      currentDay: "2024-06-08",
      baselineVo2: 48,
      currentVo2: 51,
      baselineSpeed: 3.2,
      currentSpeed: 3.6,
      baselinePower: 220,
      currentPower: 250,
      baselineRhr: 54,
      currentRhr: 51,
    });

    const result = await getFitnessTrend(db, { from: "2024-06-02", to: "2024-06-08" });

    expect(result).toMatchObject({
      answer: "Fitness trend suggests Improving; VO2 Max is supported by workout efficiency",
      action: { kind: "maintain" },
      confidence: "medium",
      sample_quality: "mixed",
    });
  });

  test("calls out an isolated VO2 estimate when workout signals do not confirm it", async () => {
    await seedFitnessWindow(db, {
      baselineDay: "2024-06-01",
      currentDay: "2024-06-08",
      baselineVo2: 48,
      currentVo2: 51,
      baselineSpeed: 3.5,
      currentSpeed: 3.3,
      baselinePower: 240,
      currentPower: 230,
      baselineRhr: 52,
      currentRhr: 55,
    });

    const result = await getFitnessTrend(db, { from: "2024-06-02", to: "2024-06-08" });

    expect(result).toMatchObject({
      answer: "Fitness trend suggests Declining; VO2 Max looks isolated from workout efficiency",
      action: { kind: "run_easier" },
    });
  });
});

interface FitnessSeed {
  baselineDay: string;
  currentDay: string;
  baselineVo2: number;
  currentVo2: number;
  baselineSpeed: number;
  currentSpeed: number;
  baselinePower: number;
  currentPower: number;
  baselineRhr: number;
  currentRhr: number;
}

async function seedFitnessWindow(db: Db, seed: FitnessSeed): Promise<void> {
  await seedPerformanceDay(db, seed.baselineDay, seed.baselineVo2, seed.baselinePower);
  await seedPerformanceDay(db, seed.currentDay, seed.currentVo2, seed.currentPower);
  await seedEfficiencyRun(
    db,
    `baseline-run-${seed.baselineDay}`,
    seed.baselineDay,
    seed.baselineSpeed,
  );
  await seedEfficiencyRun(db, `current-run-${seed.currentDay}`, seed.currentDay, seed.currentSpeed);
  await db.run("INSERT INTO resting_hr (ts, bpm) VALUES (?, ?), (?, ?)", [
    `${seed.baselineDay} 05:00:00`,
    seed.baselineRhr,
    `${seed.currentDay} 05:00:00`,
    seed.currentRhr,
  ]);
}

async function seedPerformanceDay(
  db: Db,
  day: string,
  vo2max: number,
  power: number,
): Promise<void> {
  await db.run(
    "INSERT INTO performance (ts, vo2max, speed, power) VALUES (?, ?, ?, ?), (?, ?, ?, ?)",
    [`${day} 07:00:00`, vo2max, null, null, `${day} 07:30:00`, null, null, power],
  );
}

async function seedEfficiencyRun(db: Db, id: string, day: string, speed: number): Promise<void> {
  await db.run(
    "INSERT INTO workouts (id, type, start_ts, end_ts, duration_sec, source) VALUES (?, ?, ?, ?, ?, ?)",
    [id, "Running", `${day} 08:00:00`, `${day} 09:00:00`, 3600, "Apple Watch"],
  );
  for (const minute of [5, 20, 40, 55]) {
    await db.run("INSERT INTO heart_rate (ts, bpm, source) VALUES (?, ?, ?)", [
      `${day} 08:${String(minute).padStart(2, "0")}:00`,
      124,
      "Apple Watch",
    ]);
    await db.run("INSERT INTO performance (ts, vo2max, speed, power) VALUES (?, ?, ?, ?)", [
      `${day} 08:${String(minute).padStart(2, "0")}:00`,
      null,
      speed,
      null,
    ]);
  }
}
