import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Db } from "@vitals/db";
import { getPowerDaily } from "../power";
import { type Fixture, makeFixtureDb, seedSpeedAndPower } from "./seed";

describe("getPowerDaily", () => {
  let fixture: Fixture;
  let db: Db;

  beforeEach(async () => {
    fixture = await makeFixtureDb();
    db = fixture.db;
    await seedSpeedAndPower(db);
  });

  afterEach(() => fixture.cleanup());

  test("averages power by UTC day, ignoring rows where power is null", async () => {
    const rows = await getPowerDaily(db, { from: "2024-05-31", to: "2024-06-03" });
    expect(rows).toEqual([
      { day: "2024-06-01", avg_power: 220 },
      { day: "2024-06-02", avg_power: 260 },
    ]);
  });

  test("treats a date-only upper bound as inclusive for the full UTC day", async () => {
    const rows = await getPowerDaily(db, { from: "2024-06-02", to: "2024-06-02" });
    expect(rows).toEqual([{ day: "2024-06-02", avg_power: 260 }]);
  });

  test("returns [] when window is empty", async () => {
    const rows = await getPowerDaily(db, { from: "2025-01-01", to: "2025-01-08" });
    expect(rows).toEqual([]);
  });
});
