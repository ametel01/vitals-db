import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Db } from "@vitals/db";
import { getSleepSummary } from "../sleep";
import { type Fixture, makeFixtureDb, seedSleep } from "./seed";

describe("getSleepSummary", () => {
  let fixture: Fixture;
  let db: Db;

  beforeEach(async () => {
    fixture = await makeFixtureDb();
    db = fixture.db;
  });

  afterEach(() => fixture.cleanup());

  test("sums asleep hours + derives efficiency from raw durations", async () => {
    await seedSleep(db);
    const summary = await getSleepSummary(db, { from: "2024-05-30", to: "2024-06-03" });
    // Night 1: 7h asleep, 8h in_bed. Night 2: 8h asleep, 9h in_bed.
    expect(summary.total_hours).toBeCloseTo(15, 3);
    // efficiency = 15h / 17h ≈ 0.8824
    expect(summary.efficiency).toBeCloseTo(15 / 17, 6);
    // consistency_stddev across two nights > 0 (earliest asleep is 23:00 and 22:00 UTC)
    expect(summary.consistency_stddev).not.toBeNull();
    expect(summary.consistency_stddev ?? 0).toBeGreaterThan(0);
  });

  test("treats a date-only upper bound as inclusive for the full UTC day", async () => {
    await seedSleep(db);
    const summary = await getSleepSummary(db, { from: "2024-06-01", to: "2024-06-01" });
    expect(summary.total_hours).toBeCloseTo(8, 3);
    expect(summary.efficiency).toBeCloseTo(8 / 9, 6);
  });

  test("returns 0 total + null efficiency when no rows in window", async () => {
    const summary = await getSleepSummary(db, { from: "2025-01-01", to: "2025-01-08" });
    expect(summary.total_hours).toBe(0);
    expect(summary.efficiency).toBeNull();
    expect(summary.consistency_stddev).toBeNull();
  });

  test("single-night stddev is null (needs ≥2 samples)", async () => {
    await db.run("INSERT INTO sleep (start_ts, end_ts, state) VALUES (?, ?, ?)", [
      "2024-06-01 23:00:00",
      "2024-06-02 06:00:00",
      "asleep",
    ]);
    const summary = await getSleepSummary(db, { from: "2024-05-30", to: "2024-06-03" });
    expect(summary.total_hours).toBeCloseTo(7, 3);
    expect(summary.consistency_stddev).toBeNull();
  });
});
