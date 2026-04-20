import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Db } from "@vitals/db";
import { getVO2MaxDaily } from "../vo2max";
import { type Fixture, makeFixtureDb, seedPerformance } from "./seed";

describe("getVO2MaxDaily", () => {
  let fixture: Fixture;
  let db: Db;

  beforeEach(async () => {
    fixture = await makeFixtureDb();
    db = fixture.db;
    await seedPerformance(db);
  });

  afterEach(() => fixture.cleanup());

  test("averages vo2max by UTC day", async () => {
    const rows = await getVO2MaxDaily(db, { from: "2024-05-31", to: "2024-06-03" });
    expect(rows).toEqual([
      { day: "2024-06-01", avg_vo2max: 49 },
      { day: "2024-06-02", avg_vo2max: 51 },
    ]);
  });

  test("treats a date-only upper bound as inclusive for the full UTC day", async () => {
    const rows = await getVO2MaxDaily(db, { from: "2024-06-02", to: "2024-06-02" });
    expect(rows).toEqual([{ day: "2024-06-02", avg_vo2max: 51 }]);
  });

  test("ignores rows where vo2max is null (sparse performance table)", async () => {
    await db.run("INSERT INTO performance (ts, vo2max, speed, power) VALUES (?, ?, ?, ?)", [
      "2024-06-01 08:00:00",
      null,
      3.5,
      null,
    ]);
    const rows = await getVO2MaxDaily(db, { from: "2024-05-31", to: "2024-06-03" });
    expect(rows.find((r) => r.day === "2024-06-01")?.avg_vo2max).toBe(49);
  });
});
