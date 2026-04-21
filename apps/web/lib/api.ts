import {
  type ActivityPoint,
  ActivityPointSchema,
  type HRPoint,
  HRPointSchema,
  type HRVPoint,
  HRVPointSchema,
  type LoadRow,
  LoadRowSchema,
  type RestingHRPoint,
  RestingHRPointSchema,
  type SleepSummary,
  SleepSummarySchema,
  type VO2MaxPoint,
  VO2MaxPointSchema,
  type WorkoutDetail,
  WorkoutDetailSchema,
  type WorkoutSummary,
  WorkoutSummarySchema,
  type ZonesRow,
  ZonesRowSchema,
} from "@vitals/core";
import { z } from "zod";

const DEFAULT_BASE_URL = "http://localhost:8787";

export const API_BASE_URL = process.env.VITALS_API_URL ?? DEFAULT_BASE_URL;

export interface DateRange {
  from: string;
  to: string;
}

export interface ListWorkoutsParams {
  type?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export type FetchResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number | null; message: string };

function buildUrl(path: string, params: object): string {
  const url = new URL(path, `${API_BASE_URL}/`);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function requestJson<T>(url: string, schema: z.ZodType<T>): Promise<FetchResult<T>> {
  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store" });
  } catch (err) {
    return {
      ok: false,
      status: null,
      message: err instanceof Error ? err.message : "network_error",
    };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, status: response.status, message: "invalid_json" };
  }

  if (!response.ok) {
    const message =
      typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
        ? body.error
        : `http_${response.status}`;
    return { ok: false, status: response.status, message };
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, status: response.status, message: parsed.error.message };
  }
  return { ok: true, data: parsed.data };
}

const WorkoutListSchema = z.array(WorkoutSummarySchema);
const HRPointListSchema = z.array(HRPointSchema);
const RestingHRListSchema = z.array(RestingHRPointSchema);
const LoadListSchema = z.array(LoadRowSchema);
const VO2MaxListSchema = z.array(VO2MaxPointSchema);
const HRVListSchema = z.array(HRVPointSchema);

export function listWorkouts(
  params: ListWorkoutsParams = {},
): Promise<FetchResult<WorkoutSummary[]>> {
  return requestJson(buildUrl("workouts", params), WorkoutListSchema);
}

export function getWorkoutDetail(id: string): Promise<FetchResult<WorkoutDetail>> {
  return requestJson(buildUrl(`workouts/${encodeURIComponent(id)}`, {}), WorkoutDetailSchema);
}

export function getWorkoutHR(id: string): Promise<FetchResult<HRPoint[]>> {
  return requestJson(buildUrl(`workouts/${encodeURIComponent(id)}/hr`, {}), HRPointListSchema);
}

export function getZones(range: DateRange): Promise<FetchResult<ZonesRow>> {
  return requestJson(buildUrl("metrics/zones", range), ZonesRowSchema);
}

export function getRestingHR(range: DateRange): Promise<FetchResult<RestingHRPoint[]>> {
  return requestJson(buildUrl("metrics/resting-hr", range), RestingHRListSchema);
}

export function getSleepSummary(range: DateRange): Promise<FetchResult<SleepSummary>> {
  return requestJson(buildUrl("metrics/sleep", range), SleepSummarySchema);
}

export function getLoad(range: DateRange): Promise<FetchResult<LoadRow[]>> {
  return requestJson(buildUrl("metrics/load", range), LoadListSchema);
}

export function getVO2Max(range: DateRange): Promise<FetchResult<VO2MaxPoint[]>> {
  return requestJson(buildUrl("metrics/vo2max", range), VO2MaxListSchema);
}

export function getHRV(range: DateRange): Promise<FetchResult<HRVPoint[]>> {
  return requestJson(buildUrl("metrics/hrv", range), HRVListSchema);
}

// The server does not expose a weekly activity endpoint in v0.1; the dashboard
// derives it from the workouts list (spec §4.6 / plan M6 route set).
export function deriveWeeklyActivity(workouts: WorkoutSummary[]): ActivityPoint[] {
  const buckets = new Map<string, { count: number; duration: number }>();
  for (const workout of workouts) {
    const week = startOfISOWeek(workout.start_ts);
    const existing = buckets.get(week) ?? { count: 0, duration: 0 };
    existing.count += 1;
    existing.duration += workout.duration_sec;
    buckets.set(week, existing);
  }
  const points = Array.from(buckets.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([week, { count, duration }]) =>
      ActivityPointSchema.parse({
        week,
        workout_count: count,
        total_duration_sec: duration,
      }),
    );
  return points;
}

function startOfISOWeek(isoTimestamp: string): string {
  const d = new Date(isoTimestamp);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diff));
  return monday.toISOString().slice(0, 10);
}
