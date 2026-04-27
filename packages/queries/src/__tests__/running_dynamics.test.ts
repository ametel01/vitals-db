import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Db } from "@vitals/db";
import { getRunningDynamicsDaily } from "../running_dynamics";
import { type Fixture, makeFixtureDb, seedSpeedAndPower } from "./seed";

describe("getRunningDynamicsDaily", () => {
  let fixture: Fixture;
  let db: Db;

  beforeEach(async () => {
    fixture = await makeFixtureDb();
    db = fixture.db;
    await seedSpeedAndPower(db);
  });

  afterEach(() => fixture.cleanup());

  test("averages running mechanics by UTC day", async () => {
    const rows = await getRunningDynamicsDaily(db, { from: "2024-06-01", to: "2024-06-02" });
    expect(rows).toEqual([
      {
        day: "2024-06-01",
        avg_vertical_oscillation_cm: 10.5,
        avg_ground_contact_time_ms: 305,
        avg_stride_length_m: 0.95,
      },
    ]);
  });
});
