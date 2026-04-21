import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  HRPointSchema,
  LoadRowSchema,
  RestingHRPointSchema,
  SleepSummarySchema,
  VO2MaxPointSchema,
  WorkoutDetailSchema,
  WorkoutSummarySchema,
  ZonesRowSchema,
} from "@vitals/core";
import { z } from "zod";
import { createApp } from "../server";
import { type Fixture, WORKOUT_ID, WORKOUT_ID_WALK, makeFixtureDb, seedAll } from "./seed";

describe("Hono server", () => {
  let fixture: Fixture;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    fixture = await makeFixtureDb();
    await seedAll(fixture.db);
    app = createApp({ db: fixture.db });
  });

  afterEach(() => fixture.cleanup());

  test("GET /workouts returns Zod-valid summaries", async () => {
    const res = await app.request("/workouts");
    expect(res.status).toBe(200);
    const body = await res.json();
    const parsed = z.array(WorkoutSummarySchema).parse(body);
    expect(parsed.map((w) => w.id)).toEqual([WORKOUT_ID_WALK, WORKOUT_ID]);
  });

  test("GET /workouts?type=Running filters", async () => {
    const res = await app.request("/workouts?type=Running");
    expect(res.status).toBe(200);
    const body = z.array(WorkoutSummarySchema).parse(await res.json());
    expect(body).toHaveLength(1);
    expect(body[0]?.id).toBe(WORKOUT_ID);
  });

  test("GET /workouts?from&to filters by date range", async () => {
    const res = await app.request("/workouts?from=2024-06-03&to=2024-06-03");
    expect(res.status).toBe(200);
    const body = z.array(WorkoutSummarySchema).parse(await res.json());
    expect(body).toHaveLength(1);
    expect(body[0]?.id).toBe(WORKOUT_ID_WALK);
  });

  test("GET /workouts rejects invalid date filters", async () => {
    const res = await app.request("/workouts?from=not-a-date&to=2024-06-03");
    expect(res.status).toBe(400);
  });

  test("GET /workouts?limit=x is parsed as a number", async () => {
    const res = await app.request("/workouts?limit=1");
    expect(res.status).toBe(200);
    const body = z.array(WorkoutSummarySchema).parse(await res.json());
    expect(body).toHaveLength(1);
  });

  test("GET /workouts/:id returns detail", async () => {
    const res = await app.request(`/workouts/${WORKOUT_ID}`);
    expect(res.status).toBe(200);
    const detail = WorkoutDetailSchema.parse(await res.json());
    expect(detail.id).toBe(WORKOUT_ID);
    expect(detail.drift_classification).toBe("high");
    expect(detail.z2_ratio).toBeCloseTo(2 / 6, 6);
    expect(detail.load).toBeCloseTo(432_000, 3);
  });

  test("GET /workouts/:id 404s when missing", async () => {
    const res = await app.request("/workouts/does-not-exist");
    expect(res.status).toBe(404);
  });

  test("GET /workouts/:id/hr returns HR points", async () => {
    const res = await app.request(`/workouts/${WORKOUT_ID}/hr`);
    expect(res.status).toBe(200);
    const body = z.array(HRPointSchema).parse(await res.json());
    expect(body).toHaveLength(6);
    expect(body[0]?.bpm).toBe(100);
  });

  test("GET /workouts/:id/hr 404s when workout is missing", async () => {
    const res = await app.request("/workouts/does-not-exist/hr");
    expect(res.status).toBe(404);
  });

  test("GET /metrics/zones validates required from/to", async () => {
    const missing = await app.request("/metrics/zones");
    expect(missing.status).toBe(400);

    const ok = await app.request("/metrics/zones?from=2024-06-01&to=2024-06-01");
    expect(ok.status).toBe(200);
    const parsed = ZonesRowSchema.parse(await ok.json());
    expect(parsed.z2_ratio).toBeCloseTo(2 / 6, 6);
  });

  test("GET /metrics rejects invalid date ranges before hitting DuckDB", async () => {
    const res = await app.request("/metrics/resting-hr?from=not-a-date&to=2024-06-02");
    expect(res.status).toBe(400);
  });

  test("GET /metrics/resting-hr returns daily averages", async () => {
    const res = await app.request("/metrics/resting-hr?from=2024-06-01&to=2024-06-02");
    expect(res.status).toBe(200);
    const body = z.array(RestingHRPointSchema).parse(await res.json());
    expect(body).toHaveLength(2);
    expect(body[0]?.day).toBe("2024-06-01");
    expect(body[0]?.avg_rhr).toBeCloseTo(53, 5);
    expect(body[1]?.avg_rhr).toBeCloseTo(56, 5);
  });

  test("GET /metrics/sleep returns a summary", async () => {
    const res = await app.request("/metrics/sleep?from=2024-05-31&to=2024-06-01");
    expect(res.status).toBe(200);
    const body = SleepSummarySchema.parse(await res.json());
    expect(body.total_hours).toBeCloseTo(7, 3);
    expect(body.efficiency).toBeCloseTo(7 / 8, 3);
  });

  test("GET /metrics/load returns per-workout rows", async () => {
    const res = await app.request("/metrics/load?from=2024-06-01&to=2024-06-03");
    expect(res.status).toBe(200);
    const body = z.array(LoadRowSchema).parse(await res.json());
    expect(body).toHaveLength(2);
    const running = body.find((r) => r.workout_id === WORKOUT_ID);
    expect(running?.load).toBeCloseTo(432_000, 3);
  });

  test("GET /metrics/vo2max returns daily averages", async () => {
    const res = await app.request("/metrics/vo2max?from=2024-06-01&to=2024-06-02");
    expect(res.status).toBe(200);
    const body = z.array(VO2MaxPointSchema).parse(await res.json());
    expect(body.map((p) => p.day)).toEqual(["2024-06-01", "2024-06-02"]);
    expect(body[0]?.avg_vo2max).toBeCloseTo(48, 5);
  });
});
