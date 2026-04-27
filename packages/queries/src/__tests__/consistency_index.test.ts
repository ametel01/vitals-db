import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Db } from "@vitals/db";
import { getConsistencyIndex } from "../consistency_index";
import { type Fixture, makeFixtureDb } from "./seed";

describe("getConsistencyIndex", () => {
  let fixture: Fixture;
  let db: Db;

  beforeEach(async () => {
    fixture = await makeFixtureDb();
    db = fixture.db;
  });

  afterEach(() => fixture.cleanup());

  test("classifies strong consistency when basics are stable", async () => {
    await seedConsistencyWindow(db, {
      days: [
        "2024-06-08",
        "2024-06-09",
        "2024-06-10",
        "2024-06-11",
        "2024-06-12",
        "2024-06-13",
        "2024-06-14",
      ],
      steps: 8500,
      rhrValues: [52, 52, 53, 52, 53, 52, 52],
      sleepStartHour: 22,
      workouts: 4,
    });

    const result = await getConsistencyIndex(db, { from: "2024-06-08", to: "2024-06-14" });

    expect(result).toMatchObject({
      answer: "Consistency is strong; direction is insufficient_data",
      action: { kind: "maintain" },
      confidence: "high",
    });
  });

  test("classifies inconsistent basics when movement, training, and stability are sparse", async () => {
    await seedConsistencyWindow(db, {
      days: [
        "2024-06-08",
        "2024-06-09",
        "2024-06-10",
        "2024-06-11",
        "2024-06-12",
        "2024-06-13",
        "2024-06-14",
      ],
      steps: 2500,
      rhrValues: [50, 58, 51, 60, 49, 57, 52],
      sleepStartHour: 18,
      workouts: 1,
    });

    const result = await getConsistencyIndex(db, { from: "2024-06-08", to: "2024-06-14" });

    expect(result).toMatchObject({
      answer: "Consistency is inconsistent; direction is insufficient_data",
      action: { kind: "maintain" },
    });
  });
});

async function seedConsistencyWindow(
  db: Db,
  seed: {
    days: string[];
    steps: number;
    rhrValues: number[];
    sleepStartHour: number;
    workouts: number;
  },
): Promise<void> {
  for (const [index, day] of seed.days.entries()) {
    await db.run("INSERT INTO steps (ts, count) VALUES (?, ?)", [`${day} 12:00:00`, seed.steps]);
    await db.run("INSERT INTO resting_hr (ts, bpm) VALUES (?, ?)", [
      `${day} 05:00:00`,
      seed.rhrValues[index] ?? seed.rhrValues.at(-1) ?? 52,
    ]);
    await seedSleep(db, day, seed.sleepStartHour + (index % 2));
  }
  for (let index = 0; index < seed.workouts; index++) {
    const day = seed.days[index] ?? seed.days[0];
    await db.run(
      "INSERT INTO workouts (id, type, start_ts, end_ts, duration_sec, source) VALUES (?, ?, ?, ?, ?, ?)",
      [`workout-${index}`, "Running", `${day} 08:00:00`, `${day} 09:00:00`, 3600, "Apple Watch"],
    );
  }
}

async function seedSleep(db: Db, day: string, startHour: number): Promise<void> {
  const start = `${day} ${String(startHour).padStart(2, "0")}:00:00`;
  const endDate = new Date(`${day}T00:00:00.000Z`);
  endDate.setUTCDate(endDate.getUTCDate() + 1);
  const endDay = endDate.toISOString().slice(0, 10);
  await db.run("INSERT INTO sleep (start_ts, end_ts, state, raw_state) VALUES (?, ?, ?, ?)", [
    start,
    `${endDay} 06:00:00`,
    "asleep",
    "HKCategoryValueSleepAnalysisAsleepCore",
  ]);
}
