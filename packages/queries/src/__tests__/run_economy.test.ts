import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Db } from "@vitals/db";
import { getRunEconomyScore } from "../run_economy";
import { type Fixture, makeFixtureDb } from "./seed";

describe("getRunEconomyScore", () => {
  let fixture: Fixture;
  let db: Db;

  beforeEach(async () => {
    fixture = await makeFixtureDb();
    db = fixture.db;
  });

  afterEach(() => fixture.cleanup());

  test("attributes improved economy to fitness when speed-per-watt and speed-per-bpm improve", async () => {
    await seedEconomyRun(db, {
      id: "baseline-run",
      day: "2024-06-01",
      speed: 3.0,
      power: 240,
      hr: 140,
      verticalOscillation: 9.0,
      groundContactTime: 280,
      strideLength: 1.1,
    });
    await seedEconomyRun(db, {
      id: "current-run",
      day: "2024-06-08",
      speed: 3.4,
      power: 235,
      hr: 135,
      verticalOscillation: 9.0,
      groundContactTime: 280,
      strideLength: 1.1,
    });

    const result = await getRunEconomyScore(db, { from: "2024-06-02", to: "2024-06-08" });

    expect(result).toMatchObject({
      answer: "Run economy signals point to fitness",
      action: { kind: "maintain" },
      confidence: "high",
    });
  });

  test("attributes worse economy to mechanics when mechanics penalty rises", async () => {
    await seedEconomyRun(db, {
      id: "baseline-run",
      day: "2024-06-01",
      speed: 3.2,
      power: 240,
      hr: 140,
      verticalOscillation: 9.0,
      groundContactTime: 280,
      strideLength: 1.1,
    });
    await seedEconomyRun(db, {
      id: "current-run",
      day: "2024-06-08",
      speed: 3.2,
      power: 240,
      hr: 140,
      verticalOscillation: 11.5,
      groundContactTime: 330,
      strideLength: 0.9,
    });

    const result = await getRunEconomyScore(db, { from: "2024-06-02", to: "2024-06-08" });

    expect(result).toMatchObject({
      answer: "Run economy signals point to mechanics",
      action: { kind: "watch" },
    });
  });
});

async function seedEconomyRun(
  db: Db,
  seed: {
    id: string;
    day: string;
    speed: number;
    power: number;
    hr: number;
    verticalOscillation: number;
    groundContactTime: number;
    strideLength: number;
  },
): Promise<void> {
  await db.run(
    "INSERT INTO workouts (id, type, start_ts, end_ts, duration_sec, source) VALUES (?, ?, ?, ?, ?, ?)",
    [seed.id, "Running", `${seed.day} 08:00:00`, `${seed.day} 09:00:00`, 3600, "Apple Watch"],
  );
  for (const minute of [5, 20, 40, 55]) {
    const ts = `${seed.day} 08:${String(minute).padStart(2, "0")}:00`;
    await db.run("INSERT INTO heart_rate (ts, bpm, source) VALUES (?, ?, ?)", [
      ts,
      seed.hr,
      "Apple Watch",
    ]);
    await db.run(
      "INSERT INTO performance (ts, vo2max, speed, power, vertical_oscillation_cm, ground_contact_time_ms, stride_length_m) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [
        ts,
        null,
        seed.speed,
        seed.power,
        seed.verticalOscillation,
        seed.groundContactTime,
        seed.strideLength,
      ],
    );
  }
}
