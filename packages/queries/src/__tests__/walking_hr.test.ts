import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Db } from "@vitals/db";
import { getWalkingHRDaily } from "../walking_hr";
import { type Fixture, makeFixtureDb, seedWalkingHR } from "./seed";

describe("getWalkingHRDaily", () => {
  let fixture: Fixture;
  let db: Db;

  beforeEach(async () => {
    fixture = await makeFixtureDb();
    db = fixture.db;
    await seedWalkingHR(db);
  });

  afterEach(() => fixture.cleanup());

  test("groups walking HR by UTC day with averaged bpm", async () => {
    const rows = await getWalkingHRDaily(db, { from: "2024-05-31", to: "2024-06-04" });
    expect(rows).toEqual([
      { day: "2024-06-01", avg_walking_hr: 90 },
      { day: "2024-06-02", avg_walking_hr: 95 },
      { day: "2024-06-03", avg_walking_hr: 87 },
    ]);
  });

  test("treats a date-only upper bound as inclusive for the full UTC day", async () => {
    const rows = await getWalkingHRDaily(db, { from: "2024-06-03", to: "2024-06-03" });
    expect(rows).toEqual([{ day: "2024-06-03", avg_walking_hr: 87 }]);
  });

  test("returns [] when window is empty", async () => {
    const rows = await getWalkingHRDaily(db, { from: "2025-01-01", to: "2025-01-08" });
    expect(rows).toEqual([]);
  });
});
