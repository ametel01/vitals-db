import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Db } from "@vitals/db";
import { getRecoveryFlag } from "../recovery_flag";
import { type Fixture, makeFixtureDb } from "./seed";

describe("getRecoveryFlag", () => {
  let fixture: Fixture;
  let db: Db;

  beforeEach(async () => {
    fixture = await makeFixtureDb();
    db = fixture.db;
  });

  afterEach(() => fixture.cleanup());

  test("returns red when multiple recovery signals are strained", async () => {
    await seedRecoveryFlagSignals(db, {
      baselineRhr: 50,
      currentRhr: 58,
      baselineHrv: 70,
      currentHrv: 45,
      currentSleepHours: 6,
    });

    const flag = await getRecoveryFlag(db, { from: "2024-06-04", to: "2024-06-04" });

    expect(flag.flag).toBe("red");
    expect(flag.score).toBeGreaterThanOrEqual(3);
    expect(flag.reasons).toContain("Resting HR is elevated versus baseline.");
    expect(flag.reasons).toContain("HRV is suppressed versus baseline.");
    expect(flag.reasons).toContain("Sleep is below the recovery target.");
  });

  test("returns green when recovery markers are within baseline range", async () => {
    await seedRecoveryFlagSignals(db, {
      baselineRhr: 54,
      currentRhr: 52,
      baselineHrv: 60,
      currentHrv: 66,
      currentSleepHours: 8,
    });

    const flag = await getRecoveryFlag(db, { from: "2024-06-04", to: "2024-06-04" });

    expect(flag.flag).toBe("green");
    expect(flag.score).toBe(0);
    expect(flag.reasons).toEqual(["Recovery markers are within baseline range."]);
  });
});

interface RecoveryFlagSeed {
  baselineRhr: number;
  currentRhr: number;
  baselineHrv: number;
  currentHrv: number;
  currentSleepHours: number;
}

async function seedRecoveryFlagSignals(db: Db, seed: RecoveryFlagSeed): Promise<void> {
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
    `2024-06-04 ${String(seed.currentSleepHours).padStart(2, "0")}:00:00`,
    "asleep",
    "HKCategoryValueSleepAnalysisAsleepCore",
  ]);
}
