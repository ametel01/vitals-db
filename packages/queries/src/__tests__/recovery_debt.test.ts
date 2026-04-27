import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Db } from "@vitals/db";
import { getRecoveryDebt } from "../recovery_debt";
import { type Fixture, makeFixtureDb } from "./seed";

describe("getRecoveryDebt", () => {
  let fixture: Fixture;
  let db: Db;

  beforeEach(async () => {
    fixture = await makeFixtureDb();
    db = fixture.db;
  });

  afterEach(() => fixture.cleanup());

  test("distinguishes a one-night sleep dip from accumulating fatigue", async () => {
    await seedRecoveryDebt(db, {
      currentSleepHoursPerNight: 7.4,
      baselineRhr: 52,
      currentRhr: 52,
      baselineHrv: 65,
      currentHrv: 64,
      baselineLoadHr: 120,
      currentLoadHr: 120,
    });

    const result = await getRecoveryDebt(db, { from: "2024-06-24", to: "2024-06-30" });

    expect(result).toMatchObject({
      answer: "Recovery debt signals suggest short-term dip",
      action: { kind: "add_sleep" },
      confidence: "high",
    });
  });

  test("classifies accumulating debt when sleep, recovery markers, and load worsen together", async () => {
    await seedRecoveryDebt(db, {
      currentSleepHoursPerNight: 6.5,
      baselineRhr: 50,
      currentRhr: 57,
      baselineHrv: 70,
      currentHrv: 50,
      baselineLoadHr: 110,
      currentLoadHr: 170,
    });

    const result = await getRecoveryDebt(db, { from: "2024-06-24", to: "2024-06-30" });

    expect(result).toMatchObject({
      answer: "Recovery debt signals suggest accumulating",
      action: { kind: "reduce_intensity" },
      confidence: "high",
    });
    expect(result.evidence[0]?.label).toBe("Debt score");
  });
});

interface RecoveryDebtSeed {
  currentSleepHoursPerNight: number;
  baselineRhr: number;
  currentRhr: number;
  baselineHrv: number;
  currentHrv: number;
  baselineLoadHr: number;
  currentLoadHr: number;
}

async function seedRecoveryDebt(db: Db, seed: RecoveryDebtSeed): Promise<void> {
  for (let offset = 27; offset >= 0; offset--) {
    const day = dayFromEnd("2024-06-30", -offset);
    const isCurrent = offset < 7;
    await seedWorkout(db, `run-${day}`, day, isCurrent ? seed.currentLoadHr : seed.baselineLoadHr);
    if (isCurrent) {
      await seedSleep(db, day, seed.currentSleepHoursPerNight);
    }
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

async function seedWorkout(db: Db, id: string, day: string, bpm: number): Promise<void> {
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

async function seedSleep(db: Db, day: string, asleepHours: number): Promise<void> {
  const endHour = String(Math.floor(asleepHours)).padStart(2, "0");
  await db.run("INSERT INTO sleep (start_ts, end_ts, state, raw_state) VALUES (?, ?, ?, ?)", [
    `${day} 00:00:00`,
    `${day} ${endHour}:00:00`,
    "asleep",
    "HKCategoryValueSleepAnalysisAsleepCore",
  ]);
  await db.run("INSERT INTO sleep (start_ts, end_ts, state, raw_state) VALUES (?, ?, ?, ?)", [
    `${day} 00:00:00`,
    `${day} 08:00:00`,
    "in_bed",
    "HKCategoryValueSleepAnalysisInBed",
  ]);
}

function dayFromEnd(endDate: string, offsetDays: number): string {
  const date = new Date(`${endDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}
