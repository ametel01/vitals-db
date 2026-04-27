import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Db } from "@vitals/db";
import { getTrainingStrainVsRecovery } from "../training_strain";
import { type Fixture, makeFixtureDb } from "./seed";

describe("getTrainingStrainVsRecovery", () => {
  let fixture: Fixture;
  let db: Db;

  beforeEach(async () => {
    fixture = await makeFixtureDb();
    db = fixture.db;
  });

  afterEach(() => fixture.cleanup());

  test("classifies productive stress when load is near baseline and recovery is stable", async () => {
    await seedTrainingStrain(db, {
      acuteLoadHr: 120,
      chronicDailyLoadHr: 120,
      baselineRhr: 52,
      currentRhr: 51,
      baselineHrv: 60,
      currentHrv: 63,
    });

    const result = await getTrainingStrainVsRecovery(db, {
      from: "2024-06-24",
      to: "2024-06-30",
    });

    expect(result).toMatchObject({
      answer: "Training stress is productive",
      action: { kind: "push" },
      confidence: "high",
      sample_quality: "high",
    });
    expect(result.evidence[0]).toMatchObject({
      label: "Acute:chronic load",
      value: 1,
    });
  });

  test("classifies excessive stress when acute load rises and recovery worsens", async () => {
    await seedTrainingStrain(db, {
      acuteLoadHr: 180,
      chronicDailyLoadHr: 120,
      baselineRhr: 50,
      currentRhr: 58,
      baselineHrv: 70,
      currentHrv: 45,
    });

    const result = await getTrainingStrainVsRecovery(db, {
      from: "2024-06-24",
      to: "2024-06-30",
    });

    expect(result).toMatchObject({
      answer: "Training stress is excessive",
      action: { kind: "reduce_intensity" },
      confidence: "high",
    });
    expect(result.evidence[1]).toMatchObject({
      label: "Recovery penalty",
      value: 2,
    });
  });
});

interface TrainingStrainSeed {
  acuteLoadHr: number;
  chronicDailyLoadHr: number;
  baselineRhr: number;
  currentRhr: number;
  baselineHrv: number;
  currentHrv: number;
}

async function seedTrainingStrain(db: Db, seed: TrainingStrainSeed): Promise<void> {
  for (let offset = 27; offset >= 0; offset--) {
    const date = dayFromEnd("2024-06-30", -offset);
    const loadHr = offset < 7 ? seed.acuteLoadHr : seed.chronicDailyLoadHr;
    await seedLoadWorkout(db, `load-${date}`, date, loadHr);
  }

  await db.run("INSERT INTO resting_hr (ts, bpm) VALUES (?, ?), (?, ?)", [
    "2024-06-23 05:00:00",
    seed.baselineRhr,
    "2024-06-30 05:00:00",
    seed.currentRhr,
  ]);
  await db.run("INSERT INTO hrv (ts, value) VALUES (?, ?), (?, ?)", [
    "2024-06-23 05:00:00",
    seed.baselineHrv,
    "2024-06-30 05:00:00",
    seed.currentHrv,
  ]);
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

function dayFromEnd(endDate: string, offsetDays: number): string {
  const date = new Date(`${endDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}
