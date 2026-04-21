import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Db } from "@vitals/db";
import { getSleepNightly } from "../sleep_nightly";
import { type Fixture, makeFixtureDb, seedSleep } from "./seed";

describe("getSleepNightly", () => {
  let fixture: Fixture;
  let db: Db;

  beforeEach(async () => {
    fixture = await makeFixtureDb();
    db = fixture.db;
    await seedSleep(db);
  });

  afterEach(() => fixture.cleanup());

  test("returns one row per night with asleep/in_bed hours and efficiency", async () => {
    const rows = await getSleepNightly(db, { from: "2024-05-31", to: "2024-06-02" });
    expect(rows).toHaveLength(2);
    const night1 = rows.find((r) => r.day === "2024-05-31");
    expect(night1?.asleep_hours).toBeCloseTo(7, 3);
    expect(night1?.in_bed_hours).toBeCloseTo(8, 3);
    expect(night1?.efficiency).toBeCloseTo(7 / 8, 5);
    const night2 = rows.find((r) => r.day === "2024-06-01");
    expect(night2?.asleep_hours).toBeCloseTo(8, 3);
    expect(night2?.in_bed_hours).toBeCloseTo(9, 3);
    expect(night2?.efficiency).toBeCloseTo(8 / 9, 5);
  });

  test("treats a date-only upper bound as inclusive for the full UTC day", async () => {
    const rows = await getSleepNightly(db, { from: "2024-05-31", to: "2024-05-31" });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.day).toBe("2024-05-31");
  });

  test("returns [] when window has no sleep rows", async () => {
    const rows = await getSleepNightly(db, { from: "2025-01-01", to: "2025-01-08" });
    expect(rows).toEqual([]);
  });

  test("returns null efficiency when a night has no in_bed coverage", async () => {
    await db.run("INSERT INTO sleep (start_ts, end_ts, state) VALUES (?, ?, ?)", [
      "2024-06-05 23:00:00",
      "2024-06-06 05:00:00",
      "asleep",
    ]);
    const rows = await getSleepNightly(db, { from: "2024-06-05", to: "2024-06-05" });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.asleep_hours).toBeCloseTo(6, 3);
    expect(rows[0]?.in_bed_hours).toBe(0);
    expect(rows[0]?.efficiency).toBeNull();
  });
});
