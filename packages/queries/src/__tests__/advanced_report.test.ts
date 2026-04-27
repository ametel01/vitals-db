import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Db } from "@vitals/db";
import { getAdvancedCompositeReport } from "../advanced_report";
import { type Fixture, makeFixtureDb } from "./seed";

describe("getAdvancedCompositeReport", () => {
  let fixture: Fixture;
  let db: Db;

  beforeEach(async () => {
    fixture = await makeFixtureDb();
    db = fixture.db;
  });

  afterEach(() => fixture.cleanup());

  test("assembles the paid report sections and a top-level conservative recommendation", async () => {
    const report = await getAdvancedCompositeReport(db, { from: "2024-06-01", to: "2024-06-07" });

    expect(report.sections.map((section) => section.key)).toEqual([
      "fitness_direction",
      "easy_run_quality",
      "recovery_state",
      "workout_diagnoses",
    ]);
    expect(report.next_week_recommendation).toMatchObject({
      kind: "retest",
    });
    expect(report.next_week_recommendation.recommendation.startsWith("Next week:")).toBe(true);
  });

  test("summarizes the strongest workout flag in the workout section", async () => {
    await seedRun(db, {
      id: "clean-run",
      day: "2024-06-10",
      firstHr: 118,
      secondHr: 119,
      firstSpeed: 3.2,
      secondSpeed: 3.2,
    });
    await seedRun(db, {
      id: "drift-run",
      day: "2024-06-12",
      firstHr: 118,
      secondHr: 132,
      firstSpeed: 3.3,
      secondSpeed: 3.1,
    });

    const report = await getAdvancedCompositeReport(db, { from: "2024-06-09", to: "2024-06-12" });
    const workouts = report.sections.find((section) => section.key === "workout_diagnoses");

    expect(workouts?.result).toMatchObject({
      answer: "Run signal suggests cardiac drift",
      action: { kind: "run_easier" },
    });
    expect(workouts?.result.evidence[0]).toMatchObject({
      label: "Strongest flag",
      value: "cardiac drift",
    });
  });
});

interface RunSeed {
  id: string;
  day: string;
  firstHr: number;
  secondHr: number;
  firstSpeed: number;
  secondSpeed: number;
}

async function seedRun(db: Db, seed: RunSeed): Promise<void> {
  await db.run(
    "INSERT INTO workouts (id, type, start_ts, end_ts, duration_sec, source) VALUES (?, ?, ?, ?, ?, ?)",
    [seed.id, "Running", `${seed.day} 08:00:00`, `${seed.day} 09:00:00`, 3600, "Apple Watch"],
  );
  await db.run(
    "INSERT INTO workout_routes (workout_id, start_ts, end_ts, source, path) VALUES (?, ?, ?, ?, ?)",
    [seed.id, `${seed.day} 08:00:00`, `${seed.day} 09:00:00`, "Apple Watch", "/tmp/run.gpx"],
  );

  for (const [minute, bpm, speed] of [
    [5, seed.firstHr, seed.firstSpeed],
    [20, seed.firstHr, seed.firstSpeed],
    [40, seed.secondHr, seed.secondSpeed],
    [55, seed.secondHr, seed.secondSpeed],
  ] satisfies Array<[number, number, number]>) {
    await db.run("INSERT INTO heart_rate (ts, bpm, source) VALUES (?, ?, ?)", [
      `${seed.day} 08:${String(minute).padStart(2, "0")}:00`,
      bpm,
      "Apple Watch",
    ]);
    await db.run(
      "INSERT INTO performance (ts, vo2max, speed, power, vertical_oscillation_cm, ground_contact_time_ms, stride_length_m) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [`${seed.day} 08:${String(minute).padStart(2, "0")}:00`, null, speed, 220, 9, 260, 1.1],
    );
  }
}
