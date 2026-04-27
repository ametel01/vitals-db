import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Db } from "@vitals/db";
import { getReadinessScore } from "../readiness";
import { type Fixture, makeFixtureDb } from "./seed";

describe("getReadinessScore", () => {
  let fixture: Fixture;
  let db: Db;

  beforeEach(async () => {
    fixture = await makeFixtureDb();
    db = fixture.db;
  });

  afterEach(() => fixture.cleanup());

  test("classifies strained readiness from elevated RHR, suppressed HRV, poor sleep, and load", async () => {
    await seedRecoverySignals(db, {
      baselineRhr: 50,
      currentRhr: 60,
      baselineHrv: 70,
      currentHrv: 40,
      currentSleepHours: 6,
      currentInBedHours: 8,
      baselineLoadHr: 110,
      currentLoadHr: 150,
    });

    const result = await getReadinessScore(db, { from: "2024-06-04", to: "2024-06-04" });

    expect(result).toMatchObject({
      answer: "Readiness is Strained",
      action: { kind: "reduce_intensity" },
      confidence: "high",
      sample_quality: "high",
    });
    expect(result.evidence.map((item) => item.label)).toEqual([
      "Resting HR",
      "HRV",
      "Sleep",
      "Training load",
    ]);
  });

  test("classifies fresh readiness when recovery signals improve", async () => {
    await seedRecoverySignals(db, {
      baselineRhr: 56,
      currentRhr: 50,
      baselineHrv: 45,
      currentHrv: 70,
      currentSleepHours: 8,
      currentInBedHours: 8.5,
      baselineLoadHr: 140,
      currentLoadHr: 100,
    });

    const result = await getReadinessScore(db, { from: "2024-06-04", to: "2024-06-04" });

    expect(result).toMatchObject({
      answer: "Readiness is Fresh",
      action: { kind: "push" },
      confidence: "high",
    });
  });
});

interface RecoverySeed {
  baselineRhr: number;
  currentRhr: number;
  baselineHrv: number;
  currentHrv: number;
  currentSleepHours: number;
  currentInBedHours: number;
  baselineLoadHr: number;
  currentLoadHr: number;
}

async function seedRecoverySignals(db: Db, seed: RecoverySeed): Promise<void> {
  await db.run("INSERT INTO resting_hr (ts, bpm) VALUES (?, ?), (?, ?)", [
    "2024-06-03 05:00:00",
    seed.baselineRhr,
    "2024-06-04 05:00:00",
    seed.currentRhr,
  ]);
  await db.run("INSERT INTO hrv (ts, value) VALUES (?, ?), (?, ?)", [
    "2024-06-03 05:00:00",
    seed.baselineHrv,
    "2024-06-04 05:00:00",
    seed.currentHrv,
  ]);
  await db.run("INSERT INTO sleep (start_ts, end_ts, state, raw_state) VALUES (?, ?, ?, ?)", [
    "2024-06-04 00:00:00",
    `2024-06-04 ${String(Math.floor(seed.currentSleepHours)).padStart(2, "0")}:00:00`,
    "asleep",
    "HKCategoryValueSleepAnalysisAsleepCore",
  ]);
  await db.run("INSERT INTO sleep (start_ts, end_ts, state, raw_state) VALUES (?, ?, ?, ?)", [
    "2024-06-04 00:00:00",
    `2024-06-04 ${String(Math.floor(seed.currentInBedHours)).padStart(2, "0")}:00:00`,
    "in_bed",
    "HKCategoryValueSleepAnalysisInBed",
  ]);
  await seedLoadWorkout(db, "baseline-workout", "2024-06-03", seed.baselineLoadHr);
  await seedLoadWorkout(db, "current-workout", "2024-06-04", seed.currentLoadHr);
}

async function seedLoadWorkout(db: Db, id: string, day: string, bpm: number): Promise<void> {
  await db.run(
    "INSERT INTO workouts (id, type, start_ts, end_ts, duration_sec, source) VALUES (?, ?, ?, ?, ?, ?)",
    [id, "Running", `${day} 08:00:00`, `${day} 09:00:00`, 3600, "Apple Watch"],
  );
  await db.run("INSERT INTO heart_rate (ts, bpm, source) VALUES (?, ?, ?)", [
    `${day} 08:30:00`,
    bpm,
    "Apple Watch",
  ]);
}
