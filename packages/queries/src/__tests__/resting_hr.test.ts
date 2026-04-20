import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Db } from "@vitals/db";
import { getRestingHRDaily } from "../resting_hr";
import { type Fixture, makeFixtureDb, seedRestingHR } from "./seed";

describe("getRestingHRDaily", () => {
  let fixture: Fixture;
  let db: Db;

  beforeEach(async () => {
    fixture = await makeFixtureDb();
    db = fixture.db;
    await seedRestingHR(db);
  });

  afterEach(() => fixture.cleanup());

  test("groups RHR by UTC day with averaged bpm", async () => {
    const rows = await getRestingHRDaily(db, { from: "2024-05-31", to: "2024-06-04" });
    expect(rows).toEqual([
      { day: "2024-06-01", avg_rhr: 53 },
      { day: "2024-06-02", avg_rhr: 56 },
      { day: "2024-06-03", avg_rhr: 55 },
    ]);
  });

  test("treats a date-only upper bound as inclusive for the full UTC day", async () => {
    const rows = await getRestingHRDaily(db, { from: "2024-06-03", to: "2024-06-03" });
    expect(rows).toEqual([{ day: "2024-06-03", avg_rhr: 55 }]);
  });

  test("returns [] when window is empty", async () => {
    const rows = await getRestingHRDaily(db, { from: "2025-01-01", to: "2025-01-08" });
    expect(rows).toEqual([]);
  });
});
