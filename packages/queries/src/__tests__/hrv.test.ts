import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Db } from "@vitals/db";
import { getHRVDaily } from "../hrv";
import { type Fixture, makeFixtureDb, seedHRV } from "./seed";

describe("getHRVDaily", () => {
  let fixture: Fixture;
  let db: Db;

  beforeEach(async () => {
    fixture = await makeFixtureDb();
    db = fixture.db;
    await seedHRV(db);
  });

  afterEach(() => fixture.cleanup());

  test("groups HRV by UTC day with averaged value", async () => {
    const rows = await getHRVDaily(db, { from: "2024-05-31", to: "2024-06-04" });
    expect(rows).toEqual([
      { day: "2024-06-01", avg_hrv: 65 },
      { day: "2024-06-02", avg_hrv: 72 },
      { day: "2024-06-03", avg_hrv: 68 },
    ]);
  });

  test("treats a date-only upper bound as inclusive for the full UTC day", async () => {
    const rows = await getHRVDaily(db, { from: "2024-06-03", to: "2024-06-03" });
    expect(rows).toEqual([{ day: "2024-06-03", avg_hrv: 68 }]);
  });

  test("returns [] when window is empty", async () => {
    const rows = await getHRVDaily(db, { from: "2025-01-01", to: "2025-01-08" });
    expect(rows).toEqual([]);
  });
});
