import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Db } from "@vitals/db";
import { getDistanceDaily } from "../distance";
import { type Fixture, makeFixtureDb, seedDistance } from "./seed";

describe("getDistanceDaily", () => {
  let fixture: Fixture;
  let db: Db;

  beforeEach(async () => {
    fixture = await makeFixtureDb();
    db = fixture.db;
    await seedDistance(db);
  });

  afterEach(() => fixture.cleanup());

  test("groups distance by UTC day with summed meters", async () => {
    const rows = await getDistanceDaily(db, { from: "2024-05-31", to: "2024-06-04" });
    expect(rows).toEqual([
      { day: "2024-06-01", total_meters: 2250.5 },
      { day: "2024-06-02", total_meters: 3100.25 },
      { day: "2024-06-03", total_meters: 2500 },
    ]);
  });

  test("treats a date-only upper bound as inclusive for the full UTC day", async () => {
    const rows = await getDistanceDaily(db, { from: "2024-06-03", to: "2024-06-03" });
    expect(rows).toEqual([{ day: "2024-06-03", total_meters: 2500 }]);
  });

  test("returns [] when window is empty", async () => {
    const rows = await getDistanceDaily(db, { from: "2025-01-01", to: "2025-01-08" });
    expect(rows).toEqual([]);
  });
});
