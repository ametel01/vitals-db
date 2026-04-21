import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Db } from "@vitals/db";
import { getSpeedDaily } from "../speed";
import { type Fixture, makeFixtureDb, seedSpeedAndPower } from "./seed";

describe("getSpeedDaily", () => {
  let fixture: Fixture;
  let db: Db;

  beforeEach(async () => {
    fixture = await makeFixtureDb();
    db = fixture.db;
    await seedSpeedAndPower(db);
  });

  afterEach(() => fixture.cleanup());

  test("averages speed by UTC day, ignoring rows where speed is null", async () => {
    const rows = await getSpeedDaily(db, { from: "2024-05-31", to: "2024-06-03" });
    expect(rows).toEqual([
      { day: "2024-06-01", avg_speed: 3.5 },
      { day: "2024-06-02", avg_speed: 3.6 },
    ]);
  });

  test("treats a date-only upper bound as inclusive for the full UTC day", async () => {
    const rows = await getSpeedDaily(db, { from: "2024-06-02", to: "2024-06-02" });
    expect(rows).toEqual([{ day: "2024-06-02", avg_speed: 3.6 }]);
  });

  test("returns [] when window is empty", async () => {
    const rows = await getSpeedDaily(db, { from: "2025-01-01", to: "2025-01-08" });
    expect(rows).toEqual([]);
  });
});
