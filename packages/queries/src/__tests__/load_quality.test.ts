import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Db } from "@vitals/db";
import { getLoadQuality } from "../load_quality";
import { type Fixture, makeFixtureDb } from "./seed";

describe("getLoadQuality", () => {
  let fixture: Fixture;
  let db: Db;

  beforeEach(async () => {
    fixture = await makeFixtureDb();
    db = fixture.db;
  });

  afterEach(() => fixture.cleanup());

  test("classifies productive aerobic load when load is controlled and Z2 share is high", async () => {
    await seedLoadQualityWindow(db, {
      currentHr: 120,
      baselineHr: 120,
      currentSpeedFirst: 3.2,
      currentSpeedSecond: 3.2,
    });

    const result = await getLoadQuality(db, { from: "2024-06-24", to: "2024-06-30" });

    expect(result).toMatchObject({
      answer: "Load quality signals suggest productive aerobic",
      action: { kind: "maintain" },
      confidence: "high",
      sample_quality: "high",
    });
  });

  test("classifies junk intensity when load is not excessive but Z2 share is low", async () => {
    await seedLoadQualityWindow(db, {
      currentHr: 150,
      baselineHr: 150,
      currentSpeedFirst: 3.2,
      currentSpeedSecond: 3.2,
    });

    const result = await getLoadQuality(db, { from: "2024-06-24", to: "2024-06-30" });

    expect(result).toMatchObject({
      answer: "Load quality signals suggest junk intensity",
      action: { kind: "run_easier" },
    });
  });

  test("classifies high-strain low-quality load when current load jumps", async () => {
    await seedLoadQualityWindow(db, {
      currentHr: 170,
      baselineHr: 110,
      currentSpeedFirst: 3.4,
      currentSpeedSecond: 2.8,
    });

    const result = await getLoadQuality(db, { from: "2024-06-24", to: "2024-06-30" });

    expect(result).toMatchObject({
      answer: "Load quality signals suggest high-strain low-quality",
      action: { kind: "reduce_intensity" },
    });
  });
});

interface LoadQualitySeed {
  currentHr: number;
  baselineHr: number;
  currentSpeedFirst: number;
  currentSpeedSecond: number;
}

async function seedLoadQualityWindow(db: Db, seed: LoadQualitySeed): Promise<void> {
  for (let offset = 27; offset >= 0; offset--) {
    const day = dayFromEnd("2024-06-30", -offset);
    const isCurrent = offset < 7;
    await seedWorkout(db, {
      id: `run-${day}`,
      day,
      hr: isCurrent ? seed.currentHr : seed.baselineHr,
      firstSpeed: isCurrent ? seed.currentSpeedFirst : 3.2,
      secondSpeed: isCurrent ? seed.currentSpeedSecond : 3.2,
    });
  }
}

async function seedWorkout(
  db: Db,
  seed: { id: string; day: string; hr: number; firstSpeed: number; secondSpeed: number },
): Promise<void> {
  await db.run(
    "INSERT INTO workouts (id, type, start_ts, end_ts, duration_sec, source) VALUES (?, ?, ?, ?, ?, ?)",
    [seed.id, "Running", `${seed.day} 08:00:00`, `${seed.day} 09:00:00`, 3600, "Apple Watch"],
  );
  for (const [minute, speed] of [
    [5, seed.firstSpeed],
    [20, seed.firstSpeed],
    [40, seed.secondSpeed],
    [55, seed.secondSpeed],
  ] satisfies Array<[number, number]>) {
    const ts = `${seed.day} 08:${String(minute).padStart(2, "0")}:00`;
    await db.run("INSERT INTO heart_rate (ts, bpm, source) VALUES (?, ?, ?)", [
      ts,
      seed.hr,
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

function dayFromEnd(endDate: string, offsetDays: number): string {
  const date = new Date(`${endDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}
