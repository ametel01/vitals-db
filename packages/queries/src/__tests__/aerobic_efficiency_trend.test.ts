import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Db } from "@vitals/db";
import { getAerobicEfficiencyTrend } from "../aerobic_efficiency_trend";
import { type Fixture, makeFixtureDb } from "./seed";

describe("getAerobicEfficiencyTrend", () => {
  let fixture: Fixture;
  let db: Db;

  beforeEach(async () => {
    fixture = await makeFixtureDb();
    db = fixture.db;
  });

  afterEach(() => fixture.cleanup());

  test("compares current fixed-HR pace against baseline with supporting evidence", async () => {
    await seedRun(db, "baseline", "2024-06-03", 3.33);
    await seedRun(db, "current", "2024-06-04", 4.0);
    await db.run("INSERT INTO resting_hr (ts, bpm) VALUES (?, ?), (?, ?)", [
      "2024-06-03 05:00:00",
      55,
      "2024-06-04 05:00:00",
      53,
    ]);

    const result = await getAerobicEfficiencyTrend(db, {
      from: "2024-06-04",
      to: "2024-06-04",
    });

    expect(result).toMatchObject({
      answer: "Aerobic efficiency suggests improvement",
      action: {
        kind: "maintain",
      },
      confidence: "medium",
      sample_quality: "mixed",
      claim_strength: "suggests",
    });
    expect(result.evidence.map((item) => item.label)).toEqual([
      "Fixed-HR pace",
      "Decoupling",
      "Z2 share",
      "Resting HR",
    ]);
    expect(result.evidence[0]?.detail).toContain("Current average 4:10/km vs baseline 5:00/km");
  });

  test("returns a conservative low-confidence result when aligned run data is missing", async () => {
    const result = await getAerobicEfficiencyTrend(db, {
      from: "2024-06-04",
      to: "2024-06-04",
    });

    expect(result).toMatchObject({
      answer: "Aerobic efficiency needs more aligned run data",
      confidence: "low",
      sample_quality: "poor",
      claim_strength: "worth_watching",
      action: {
        kind: "retest",
      },
    });
  });
});

async function seedRun(db: Db, id: string, day: string, speed: number): Promise<void> {
  await db.run(
    "INSERT INTO workouts (id, type, start_ts, end_ts, duration_sec, source) VALUES (?, ?, ?, ?, ?, ?)",
    [id, "Running", `${day} 08:00:00`, `${day} 09:00:00`, 3600, "Apple Watch"],
  );
  const minutes = [5, 15, 25, 35, 45, 55];
  for (const minute of minutes) {
    const ts = `${day} 08:${String(minute).padStart(2, "0")}:00`;
    await db.run("INSERT INTO heart_rate (ts, bpm, source) VALUES (?, ?, ?)", [
      ts,
      122,
      "Apple Watch",
    ]);
    await db.run("INSERT INTO performance (ts, vo2max, speed, power) VALUES (?, ?, ?, ?)", [
      ts,
      null,
      speed,
      null,
    ]);
  }
}
