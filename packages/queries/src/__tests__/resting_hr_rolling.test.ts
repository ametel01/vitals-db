import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Db } from "@vitals/db";
import { getRestingHRRolling7d } from "../resting_hr_rolling";
import { type Fixture, makeFixtureDb, seedRestingHR } from "./seed";

describe("getRestingHRRolling7d", () => {
  let fixture: Fixture;
  let db: Db;

  beforeEach(async () => {
    fixture = await makeFixtureDb();
    db = fixture.db;
    await seedRestingHR(db);
  });

  afterEach(() => fixture.cleanup());

  test("computes trailing 7-day averages over the shipped daily resting-HR series", async () => {
    const rows = await getRestingHRRolling7d(db, { from: "2024-06-01", to: "2024-06-03" });
    expect(rows).toEqual([
      { day: "2024-06-01", avg_rhr_7d: 53 },
      { day: "2024-06-02", avg_rhr_7d: 54.5 },
      { day: "2024-06-03", avg_rhr_7d: 164 / 3 },
    ]);
  });

  test("treats a date-only upper bound as inclusive for the full UTC day", async () => {
    const rows = await getRestingHRRolling7d(db, { from: "2024-06-03", to: "2024-06-03" });
    expect(rows).toEqual([{ day: "2024-06-03", avg_rhr_7d: 164 / 3 }]);
  });

  test("keeps the series sparse and does not synthesize empty calendar days", async () => {
    const rows = await getRestingHRRolling7d(db, { from: "2024-06-01", to: "2024-06-10" });
    expect(rows.map((row) => row.day)).toEqual(["2024-06-01", "2024-06-02", "2024-06-03"]);
  });
});
