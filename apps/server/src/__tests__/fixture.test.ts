import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  HRPointSchema,
  RestingHRPointSchema,
  SleepSummarySchema,
  WorkoutDetailSchema,
  WorkoutSummarySchema,
} from "@vitals/core";
import { ingestFile } from "@vitals/ingest";
import { z } from "zod";
import { createApp } from "../server";
import { type Fixture, makeFixtureDb } from "./seed";

const SAMPLE_FIXTURE_PATH = join(import.meta.dir, "..", "..", "..", "..", "fixtures", "sample.xml");

describe("committed sample fixture", () => {
  let fixture: Fixture;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    fixture = await makeFixtureDb();
    await ingestFile(fixture.db, SAMPLE_FIXTURE_PATH, { full: true });
    app = createApp({ db: fixture.db });
  });

  afterEach(() => fixture.cleanup());

  test("keeps Record nodes before Workout nodes per the declared export DTD", async () => {
    const xml = await readFile(SAMPLE_FIXTURE_PATH, "utf8");
    const firstWorkout = xml.indexOf("<Workout ");
    const lastRecord = xml.lastIndexOf("<Record ");

    expect(firstWorkout).toBeGreaterThan(-1);
    expect(lastRecord).toBeGreaterThan(-1);
    expect(firstWorkout).toBeGreaterThan(lastRecord);
  });

  test("powers the MVP API surfaces with non-empty data", async () => {
    const workoutsRes = await app.request("/workouts");
    expect(workoutsRes.status).toBe(200);
    const workouts = z.array(WorkoutSummarySchema).parse(await workoutsRes.json());
    expect(workouts.length).toBeGreaterThan(0);

    const workoutId = workouts[0]?.id;
    expect(workoutId).toBeDefined();

    const detailRes = await app.request(`/workouts/${workoutId}`);
    expect(detailRes.status).toBe(200);
    const detail = WorkoutDetailSchema.parse(await detailRes.json());
    expect(detail.duration_sec).toBeGreaterThan(0);
    expect(detail.drift_pct).not.toBeNull();

    const hrRes = await app.request(`/workouts/${workoutId}/hr`);
    expect(hrRes.status).toBe(200);
    const hrPoints = z.array(HRPointSchema).parse(await hrRes.json());
    expect(hrPoints.length).toBeGreaterThan(0);

    const restingHrRes = await app.request("/metrics/resting-hr?from=2000-01-01&to=2100-01-01");
    expect(restingHrRes.status).toBe(200);
    const restingHr = z.array(RestingHRPointSchema).parse(await restingHrRes.json());
    expect(restingHr.length).toBeGreaterThan(0);

    const sleepRes = await app.request("/metrics/sleep?from=2000-01-01&to=2100-01-01");
    expect(sleepRes.status).toBe(200);
    const sleep = SleepSummarySchema.parse(await sleepRes.json());
    expect(sleep.total_hours).toBeGreaterThan(0);
  });
});
