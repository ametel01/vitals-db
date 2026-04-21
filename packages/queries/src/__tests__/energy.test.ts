import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Db } from "@vitals/db";
import { getEnergyDaily } from "../energy";
import { type Fixture, makeFixtureDb, seedEnergy } from "./seed";

describe("getEnergyDaily", () => {
  let fixture: Fixture;
  let db: Db;

  beforeEach(async () => {
    fixture = await makeFixtureDb();
    db = fixture.db;
    await seedEnergy(db);
  });

  afterEach(() => fixture.cleanup());

  test("aggregates sparse active/basal columns independently by UTC day", async () => {
    const rows = await getEnergyDaily(db, { from: "2024-05-31", to: "2024-06-04" });
    expect(rows).toEqual([
      { day: "2024-06-01", active_kcal: 200.5, basal_kcal: 1600 },
      { day: "2024-06-02", active_kcal: 300, basal_kcal: 1650 },
      { day: "2024-06-03", active_kcal: 0, basal_kcal: 1700 },
    ]);
  });

  test("treats a date-only upper bound as inclusive for the full UTC day", async () => {
    const rows = await getEnergyDaily(db, { from: "2024-06-03", to: "2024-06-03" });
    expect(rows).toEqual([{ day: "2024-06-03", active_kcal: 0, basal_kcal: 1700 }]);
  });

  test("returns [] when window is empty", async () => {
    const rows = await getEnergyDaily(db, { from: "2025-01-01", to: "2025-01-08" });
    expect(rows).toEqual([]);
  });
});
