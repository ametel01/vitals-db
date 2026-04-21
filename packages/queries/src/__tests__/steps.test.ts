import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Db } from "@vitals/db";
import { getStepsDaily } from "../steps";
import { type Fixture, makeFixtureDb, seedSteps } from "./seed";

describe("getStepsDaily", () => {
  let fixture: Fixture;
  let db: Db;

  beforeEach(async () => {
    fixture = await makeFixtureDb();
    db = fixture.db;
    await seedSteps(db);
  });

  afterEach(() => fixture.cleanup());

  test("groups steps by UTC day with summed count", async () => {
    const rows = await getStepsDaily(db, { from: "2024-05-31", to: "2024-06-04" });
    expect(rows).toEqual([
      { day: "2024-06-01", total_steps: 3500 },
      { day: "2024-06-02", total_steps: 4100 },
      { day: "2024-06-03", total_steps: 4300 },
    ]);
  });

  test("treats a date-only upper bound as inclusive for the full UTC day", async () => {
    const rows = await getStepsDaily(db, { from: "2024-06-03", to: "2024-06-03" });
    expect(rows).toEqual([{ day: "2024-06-03", total_steps: 4300 }]);
  });

  test("returns [] when window is empty", async () => {
    const rows = await getStepsDaily(db, { from: "2025-01-01", to: "2025-01-08" });
    expect(rows).toEqual([]);
  });
});
