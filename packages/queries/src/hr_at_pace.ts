import { type WorkoutHRAtPace, WorkoutHRAtPaceSchema } from "@vitals/core";
import type { Db } from "@vitals/db";
import { type DateRange, normalizeRangeEnd, normalizeRangeStart, toIsoDateTime } from "./dates";

export const DEFAULT_HR_AT_PACE_SEC_PER_KM = 540;
export const DEFAULT_HR_AT_PACE_TOLERANCE_SEC_PER_KM = 30;

const ALIGN_TOLERANCE_SEC = 60;

export interface HRAtPaceParams {
  paceSecPerKm?: number;
  toleranceSecPerKm?: number;
}

interface RawHRAtPaceRow {
  workout_id: string;
  start_ts: Date;
  sample_count: number;
  avg_hr: number | null;
  avg_speed_mps: number | null;
}

function normalizeParams(params: HRAtPaceParams): Required<HRAtPaceParams> {
  return {
    paceSecPerKm: params.paceSecPerKm ?? DEFAULT_HR_AT_PACE_SEC_PER_KM,
    toleranceSecPerKm: params.toleranceSecPerKm ?? DEFAULT_HR_AT_PACE_TOLERANCE_SEC_PER_KM,
  };
}

export async function getHRAtPaceTrend(
  db: Db,
  range: DateRange,
  params: HRAtPaceParams = {},
): Promise<WorkoutHRAtPace[]> {
  const normalized = normalizeParams(params);
  const upper = normalizeRangeEnd(range.to);
  const sql = `WITH
                 scoped_workouts AS (
                   SELECT id, start_ts, end_ts
                   FROM workouts
                   WHERE type = 'Running'
                     AND start_ts >= ?
                     AND start_ts ${upper.operator} ?
                 ),
                 speed_samples AS (
                   SELECT
                     w.id AS workout_id,
                     p.ts,
                     p.speed
                   FROM scoped_workouts w
                   JOIN performance p
                     ON p.speed IS NOT NULL
                    AND p.ts BETWEEN w.start_ts AND w.end_ts
                 ),
                 ranked AS (
                   SELECT
                     s.workout_id,
                     s.ts,
                     s.speed,
                     hr.bpm,
                     ROW_NUMBER() OVER (
                       PARTITION BY s.workout_id, s.ts, s.speed
                       ORDER BY ABS(EXTRACT(EPOCH FROM hr.ts) - EXTRACT(EPOCH FROM s.ts)), hr.ts
                     ) AS rn
                   FROM speed_samples s
                   JOIN scoped_workouts w ON w.id = s.workout_id
                   JOIN heart_rate hr
                     ON hr.ts BETWEEN w.start_ts AND w.end_ts
                    AND ABS(EXTRACT(EPOCH FROM hr.ts) - EXTRACT(EPOCH FROM s.ts)) <= ?
                 ),
                 aligned AS (
                   SELECT workout_id, ts, speed, bpm
                   FROM ranked
                   WHERE rn = 1
                 )
               SELECT
                 w.id AS workout_id,
                 w.start_ts,
                 COUNT(a.bpm) FILTER (
                   WHERE a.speed > 0
                     AND ABS((1000.0 / a.speed) - ?) <= ?
                 )::INTEGER AS sample_count,
                 AVG(a.bpm) FILTER (
                   WHERE a.speed > 0
                     AND ABS((1000.0 / a.speed) - ?) <= ?
                 ) AS avg_hr,
                 AVG(a.speed) FILTER (
                   WHERE a.speed > 0
                     AND ABS((1000.0 / a.speed) - ?) <= ?
                 ) AS avg_speed_mps
               FROM scoped_workouts w
               LEFT JOIN aligned a ON a.workout_id = w.id
               GROUP BY w.id, w.start_ts
               ORDER BY w.start_ts`;
  const rows = await db.all<RawHRAtPaceRow>(sql, [
    normalizeRangeStart(range.from),
    upper.value,
    ALIGN_TOLERANCE_SEC,
    normalized.paceSecPerKm,
    normalized.toleranceSecPerKm,
    normalized.paceSecPerKm,
    normalized.toleranceSecPerKm,
    normalized.paceSecPerKm,
    normalized.toleranceSecPerKm,
  ]);

  return rows.map((row) =>
    WorkoutHRAtPaceSchema.parse({
      workout_id: row.workout_id,
      start_ts: toIsoDateTime(row.start_ts),
      pace_sec_per_km: normalized.paceSecPerKm,
      tolerance_sec_per_km: normalized.toleranceSecPerKm,
      sample_count: row.sample_count,
      avg_hr: row.avg_hr,
      avg_speed_mps: row.avg_speed_mps,
    }),
  );
}

export async function getAverageHRAtPace(
  db: Db,
  range: DateRange,
  params: HRAtPaceParams = {},
): Promise<number | null> {
  const rows = await getHRAtPaceTrend(db, range, params);
  const values = rows.map((row) => row.avg_hr).filter((value): value is number => value !== null);
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
