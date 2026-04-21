import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  ActivityPointSchema,
  DistancePointSchema,
  EnergyPointSchema,
  HRPointSchema,
  HRVPointSchema,
  LoadRowSchema,
  PowerPointSchema,
  RestingHRPointSchema,
  SleepNightPointSchema,
  SleepSummarySchema,
  SpeedPointSchema,
  StepsPointSchema,
  VO2MaxPointSchema,
  WalkingHRPointSchema,
  WorkoutDetailSchema,
  WorkoutSummarySchema,
  WorkoutZoneBreakdownListSchema,
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

  test("GET /workouts returns Zod-valid summaries in descending start_ts order", async () => {
    const res = await app.request("/workouts");
    expect(res.status).toBe(200);
    const body = await res.json();
    const parsed = z.array(WorkoutSummarySchema).parse(body);
    expect(parsed.map((w) => w.id)).toEqual([WORKOUT_ID_WALK, WORKOUT_ID]);
    const starts = parsed.map((w) => Date.parse(w.start_ts));
    for (let i = 1; i < starts.length; i++) {
      expect(starts[i - 1]).toBeGreaterThanOrEqual(starts[i] ?? 0);
    }
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

  test("GET /workouts/:id returns detail with drift, load, and z2_ratio", async () => {
    const res = await app.request(`/workouts/${WORKOUT_ID}`);
    expect(res.status).toBe(200);
    const detail = WorkoutDetailSchema.parse(await res.json());
    expect(detail.id).toBe(WORKOUT_ID);
    expect(detail.drift_classification).toBe("high");
    expect(detail.drift_pct).not.toBeNull();
    expect(detail.drift_pct).toBeCloseTo(((130 - 110) / 110) * 100, 3);
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

  test("GET /workouts/:id/zones returns the per-zone breakdown in Z1..Z5 order", async () => {
    const res = await app.request(`/workouts/${WORKOUT_ID}/zones`);
    expect(res.status).toBe(200);
    const rows = WorkoutZoneBreakdownListSchema.parse(await res.json());
    expect(rows.map((r) => r.zone)).toEqual(["Z1", "Z2", "Z3", "Z4", "Z5"]);
    const byZone = Object.fromEntries(rows.map((r) => [r.zone, r]));
    expect(byZone.Z1?.sample_count).toBe(2);
    expect(byZone.Z2?.sample_count).toBe(2);
    expect(byZone.Z3?.sample_count).toBe(2);
    expect(byZone.Z2?.ratio).toBeCloseTo(2 / 6, 6);
    const sum = rows.reduce((acc, r) => acc + r.ratio, 0);
    expect(sum).toBeCloseTo(1, 6);
  });

  test("GET /workouts/:id/zones 404s when workout is missing", async () => {
    const res = await app.request("/workouts/does-not-exist/zones");
    expect(res.status).toBe(404);
  });

  test("GET /workouts/:id/zones returns [] for a workout with no HR samples", async () => {
    const res = await app.request(`/workouts/${WORKOUT_ID_WALK}/zones`);
    expect(res.status).toBe(200);
    const rows = WorkoutZoneBreakdownListSchema.parse(await res.json());
    expect(rows).toEqual([]);
  });

  test("GET /metrics/zones validates required from/to", async () => {
    const missing = await app.request("/metrics/zones");
    expect(missing.status).toBe(400);

    const ok = await app.request("/metrics/zones?from=2024-06-01&to=2024-06-01");
    expect(ok.status).toBe(200);
    const parsed = ZonesRowSchema.parse(await ok.json());
    expect(parsed.z2_ratio).toBeCloseTo(2 / 6, 6);
  });

  test("GET /metrics/zones returns null z2_ratio for an empty window", async () => {
    const res = await app.request("/metrics/zones?from=2024-06-05&to=2024-06-05");
    expect(res.status).toBe(200);
    const parsed = ZonesRowSchema.parse(await res.json());
    expect(parsed.z2_ratio).toBeNull();
  });

  test("GET /metrics/resting-hr rejects invalid date ranges before hitting DuckDB", async () => {
    const res = await app.request("/metrics/resting-hr?from=not-a-date&to=2024-06-02");
    expect(res.status).toBe(400);
  });

  test("GET /metrics/zones rejects invalid date ranges", async () => {
    const res = await app.request("/metrics/zones?from=2024-06-01&to=not-a-date");
    expect(res.status).toBe(400);
  });

  test("GET /metrics/sleep rejects invalid date ranges", async () => {
    const res = await app.request("/metrics/sleep?from=nope&to=2024-06-02");
    expect(res.status).toBe(400);
  });

  test("GET /metrics/load rejects invalid date ranges", async () => {
    const res = await app.request("/metrics/load?from=2024-06-01&to=nope");
    expect(res.status).toBe(400);
  });

  test("GET /metrics/vo2max rejects invalid date ranges", async () => {
    const res = await app.request("/metrics/vo2max?from=bad&to=2024-06-02");
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

  test("GET /metrics/load returns per-workout rows with workout_id, duration, avg_hr, load", async () => {
    const res = await app.request("/metrics/load?from=2024-06-01&to=2024-06-03");
    expect(res.status).toBe(200);
    const body = z.array(LoadRowSchema).parse(await res.json());
    expect(body).toHaveLength(2);

    const running = body.find((r) => r.workout_id === WORKOUT_ID);
    expect(running).toBeDefined();
    expect(running?.duration_sec).toBe(3600);
    expect(running?.avg_hr).toBeCloseTo(120, 5);
    expect(running?.load).toBeCloseTo(432_000, 3);

    const walking = body.find((r) => r.workout_id === WORKOUT_ID_WALK);
    expect(walking).toBeDefined();
    expect(walking?.duration_sec).toBe(1800);
    expect(walking?.avg_hr).toBeNull();
    expect(walking?.load).toBeNull();
  });

  test("GET /metrics/vo2max returns daily averages", async () => {
    const res = await app.request("/metrics/vo2max?from=2024-06-01&to=2024-06-02");
    expect(res.status).toBe(200);
    const body = z.array(VO2MaxPointSchema).parse(await res.json());
    expect(body.map((p) => p.day)).toEqual(["2024-06-01", "2024-06-02"]);
    expect(body[0]?.avg_vo2max).toBeCloseTo(48, 5);
  });

  test("GET /metrics/hrv returns daily averages", async () => {
    const res = await app.request("/metrics/hrv?from=2024-06-01&to=2024-06-02");
    expect(res.status).toBe(200);
    const body = z.array(HRVPointSchema).parse(await res.json());
    expect(body.map((p) => p.day)).toEqual(["2024-06-01", "2024-06-02"]);
    expect(body[0]?.avg_hrv).toBeCloseTo(65, 5);
    expect(body[1]?.avg_hrv).toBeCloseTo(72, 5);
  });

  test("GET /metrics/hrv rejects invalid date ranges", async () => {
    const res = await app.request("/metrics/hrv?from=bad&to=2024-06-02");
    expect(res.status).toBe(400);
  });

  test("GET /metrics/hrv returns [] for an empty window", async () => {
    const res = await app.request("/metrics/hrv?from=2025-01-01&to=2025-01-08");
    expect(res.status).toBe(200);
    const body = z.array(HRVPointSchema).parse(await res.json());
    expect(body).toEqual([]);
  });

  test("GET /metrics/activity returns weekly workout aggregation", async () => {
    const res = await app.request("/metrics/activity?from=2024-05-27&to=2024-06-09");
    expect(res.status).toBe(200);
    const body = z.array(ActivityPointSchema).parse(await res.json());
    expect(body).toEqual([
      { week: "2024-05-27", workout_count: 1, total_duration_sec: 3600 },
      { week: "2024-06-03", workout_count: 1, total_duration_sec: 1800 },
    ]);
  });

  test("GET /metrics/activity rejects invalid date ranges", async () => {
    const res = await app.request("/metrics/activity?from=bad&to=2024-06-03");
    expect(res.status).toBe(400);
  });

  test("GET /metrics/steps returns daily totals", async () => {
    const res = await app.request("/metrics/steps?from=2024-06-01&to=2024-06-02");
    expect(res.status).toBe(200);
    const body = z.array(StepsPointSchema).parse(await res.json());
    expect(body).toEqual([
      { day: "2024-06-01", total_steps: 3500 },
      { day: "2024-06-02", total_steps: 4100 },
    ]);
  });

  test("GET /metrics/steps rejects invalid date ranges", async () => {
    const res = await app.request("/metrics/steps?from=bad&to=2024-06-02");
    expect(res.status).toBe(400);
  });

  test("GET /metrics/distance returns daily totals", async () => {
    const res = await app.request("/metrics/distance?from=2024-06-01&to=2024-06-02");
    expect(res.status).toBe(200);
    const body = z.array(DistancePointSchema).parse(await res.json());
    expect(body).toHaveLength(2);
    expect(body[0]?.total_meters).toBeCloseTo(2250.5, 5);
    expect(body[1]?.total_meters).toBeCloseTo(3100.25, 5);
  });

  test("GET /metrics/distance rejects invalid date ranges", async () => {
    const res = await app.request("/metrics/distance?from=2024-06-01&to=bad");
    expect(res.status).toBe(400);
  });

  test("GET /metrics/energy aggregates sparse active/basal columns by day", async () => {
    const res = await app.request("/metrics/energy?from=2024-06-01&to=2024-06-02");
    expect(res.status).toBe(200);
    const body = z.array(EnergyPointSchema).parse(await res.json());
    expect(body).toHaveLength(2);
    expect(body[0]?.day).toBe("2024-06-01");
    expect(body[0]?.active_kcal).toBeCloseTo(200.5, 5);
    expect(body[0]?.basal_kcal).toBeCloseTo(1600, 5);
    expect(body[1]?.day).toBe("2024-06-02");
    expect(body[1]?.active_kcal).toBeCloseTo(300, 5);
    expect(body[1]?.basal_kcal).toBeCloseTo(1650, 5);
  });

  test("GET /metrics/energy rejects invalid date ranges", async () => {
    const res = await app.request("/metrics/energy?from=nope&to=2024-06-02");
    expect(res.status).toBe(400);
  });

  test("GET /metrics/steps returns [] for an empty window", async () => {
    const res = await app.request("/metrics/steps?from=2025-01-01&to=2025-01-08");
    expect(res.status).toBe(200);
    const body = z.array(StepsPointSchema).parse(await res.json());
    expect(body).toEqual([]);
  });

  test("GET /metrics/walking-hr returns daily averages", async () => {
    const res = await app.request("/metrics/walking-hr?from=2024-06-01&to=2024-06-02");
    expect(res.status).toBe(200);
    const body = z.array(WalkingHRPointSchema).parse(await res.json());
    expect(body).toEqual([
      { day: "2024-06-01", avg_walking_hr: 90 },
      { day: "2024-06-02", avg_walking_hr: 95 },
    ]);
  });

  test("GET /metrics/walking-hr rejects invalid date ranges", async () => {
    const res = await app.request("/metrics/walking-hr?from=bad&to=2024-06-02");
    expect(res.status).toBe(400);
  });

  test("GET /metrics/walking-hr returns [] for an empty window", async () => {
    const res = await app.request("/metrics/walking-hr?from=2025-01-01&to=2025-01-08");
    expect(res.status).toBe(200);
    const body = z.array(WalkingHRPointSchema).parse(await res.json());
    expect(body).toEqual([]);
  });

  test("GET /metrics/speed returns daily averages, ignoring null-speed rows", async () => {
    const res = await app.request("/metrics/speed?from=2024-06-01&to=2024-06-02");
    expect(res.status).toBe(200);
    const body = z.array(SpeedPointSchema).parse(await res.json());
    expect(body).toHaveLength(2);
    expect(body[0]?.day).toBe("2024-06-01");
    expect(body[0]?.avg_speed).toBeCloseTo(3.5, 5);
    expect(body[1]?.day).toBe("2024-06-02");
    expect(body[1]?.avg_speed).toBeCloseTo(3.6, 5);
  });

  test("GET /metrics/speed rejects invalid date ranges", async () => {
    const res = await app.request("/metrics/speed?from=bad&to=2024-06-02");
    expect(res.status).toBe(400);
  });

  test("GET /metrics/speed returns [] for an empty window", async () => {
    const res = await app.request("/metrics/speed?from=2025-01-01&to=2025-01-08");
    expect(res.status).toBe(200);
    const body = z.array(SpeedPointSchema).parse(await res.json());
    expect(body).toEqual([]);
  });

  test("GET /metrics/power returns daily averages, ignoring null-power rows", async () => {
    const res = await app.request("/metrics/power?from=2024-06-01&to=2024-06-02");
    expect(res.status).toBe(200);
    const body = z.array(PowerPointSchema).parse(await res.json());
    expect(body).toHaveLength(2);
    expect(body[0]?.day).toBe("2024-06-01");
    expect(body[0]?.avg_power).toBeCloseTo(220, 5);
    expect(body[1]?.day).toBe("2024-06-02");
    expect(body[1]?.avg_power).toBeCloseTo(260, 5);
  });

  test("GET /metrics/power rejects invalid date ranges", async () => {
    const res = await app.request("/metrics/power?from=2024-06-01&to=bad");
    expect(res.status).toBe(400);
  });

  test("GET /metrics/power returns [] for an empty window", async () => {
    const res = await app.request("/metrics/power?from=2025-01-01&to=2025-01-08");
    expect(res.status).toBe(200);
    const body = z.array(PowerPointSchema).parse(await res.json());
    expect(body).toEqual([]);
  });

  test("GET /metrics/sleep/nightly returns one row per night", async () => {
    const res = await app.request("/metrics/sleep/nightly?from=2024-05-31&to=2024-06-01");
    expect(res.status).toBe(200);
    const body = z.array(SleepNightPointSchema).parse(await res.json());
    expect(body).toHaveLength(1);
    expect(body[0]?.day).toBe("2024-05-31");
    expect(body[0]?.asleep_hours).toBeCloseTo(7, 3);
    expect(body[0]?.in_bed_hours).toBeCloseTo(8, 3);
    expect(body[0]?.efficiency).toBeCloseTo(7 / 8, 5);
  });

  test("GET /metrics/sleep/nightly rejects invalid date ranges", async () => {
    const res = await app.request("/metrics/sleep/nightly?from=bad&to=2024-06-01");
    expect(res.status).toBe(400);
  });

  test("GET /metrics/sleep/nightly returns [] for an empty window", async () => {
    const res = await app.request("/metrics/sleep/nightly?from=2025-01-01&to=2025-01-08");
    expect(res.status).toBe(200);
    const body = z.array(SleepNightPointSchema).parse(await res.json());
    expect(body).toEqual([]);
  });

  // 0.7.0 contract pins — these lock the exact top-level key sets on legacy
  // and preferred paths that ship side-by-side, so an accidental payload
  // widening (e.g. surfacing a new zone field on the scalar `/metrics/zones`)
  // fails the suite before it reaches 1.0.0.

  test("GET /metrics/zones keeps exactly the scalar { z2_ratio } shape", async () => {
    const res = await app.request("/metrics/zones?from=2024-06-01&to=2024-06-01");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["z2_ratio"]);
  });

  test("GET /workouts/:id/zones pins the additive breakdown row shape", async () => {
    const res = await app.request(`/workouts/${WORKOUT_ID}/zones`);
    expect(res.status).toBe(200);
    const rows = (await res.json()) as Array<Record<string, unknown>>;
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(["ratio", "sample_count", "zone"]);
    }
  });

  test("GET /metrics/sleep pins the summary top-level keys", async () => {
    const res = await app.request("/metrics/sleep?from=2024-05-31&to=2024-06-01");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["consistency_stddev", "efficiency", "total_hours"]);
  });

  test("GET /metrics/sleep/nightly pins the additive per-night row shape", async () => {
    const res = await app.request("/metrics/sleep/nightly?from=2024-05-31&to=2024-06-01");
    expect(res.status).toBe(200);
    const rows = (await res.json()) as Array<Record<string, unknown>>;
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual([
        "asleep_hours",
        "day",
        "efficiency",
        "in_bed_hours",
      ]);
    }
  });

  test("GET /metrics/activity pins row keys and agrees with /workouts derivation", async () => {
    const activityRes = await app.request("/metrics/activity?from=2024-05-27&to=2024-06-09");
    expect(activityRes.status).toBe(200);
    const activity = z.array(ActivityPointSchema).parse(await activityRes.json());

    for (const row of activity as unknown as Array<Record<string, unknown>>) {
      expect(Object.keys(row).sort()).toEqual(["total_duration_sec", "week", "workout_count"]);
    }

    // Equivalence with the legacy client-side derivation: the server route
    // and a Monday-bucketed sum over /workouts must produce the same
    // (workout_count, total_duration_sec) per ISO week for the same range.
    const workoutsRes = await app.request("/workouts?from=2024-05-27&to=2024-06-09");
    expect(workoutsRes.status).toBe(200);
    const workouts = z.array(WorkoutSummarySchema).parse(await workoutsRes.json());

    const derived = new Map<string, { workout_count: number; total_duration_sec: number }>();
    for (const w of workouts) {
      const d = new Date(w.start_ts);
      const day = d.getUTCDay();
      const diff = day === 0 ? -6 : 1 - day;
      const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diff));
      const week = monday.toISOString().slice(0, 10);
      const prev = derived.get(week) ?? { workout_count: 0, total_duration_sec: 0 };
      prev.workout_count += 1;
      prev.total_duration_sec += w.duration_sec;
      derived.set(week, prev);
    }

    expect(activity).toHaveLength(derived.size);
    for (const point of activity) {
      const d = derived.get(point.week);
      expect(d).toBeDefined();
      if (!d) continue;
      expect(point.workout_count).toBe(d.workout_count);
      expect(point.total_duration_sec).toBe(d.total_duration_sec);
    }
  });
});
