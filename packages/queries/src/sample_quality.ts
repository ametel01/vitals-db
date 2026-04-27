import {
  type WorkoutSampleQuality,
  type WorkoutSampleQualityIssue,
  WorkoutSampleQualitySchema,
} from "@vitals/core";
import type { Db } from "@vitals/db";

const ALIGN_TOLERANCE_SEC = 60;
const MIN_ENDURANCE_DURATION_SEC = 45 * 60;

interface SampleQualityRow {
  workout_id: string;
  duration_sec: number;
  hr_samples: number | bigint;
  speed_samples: number | bigint;
  power_samples: number | bigint;
  aligned_speed_hr_samples: number | bigint;
  route_count: number | bigint;
  stats_count: number | bigint;
  events_count: number | bigint;
  metadata_count: number | bigint;
}

const SQL_SAMPLE_QUALITY = `WITH
                              w AS (
                                SELECT id, start_ts, end_ts, duration_sec
                                FROM workouts
                                WHERE id = ?
                              )
                            SELECT
                              w.id AS workout_id,
                              w.duration_sec,
                              (
                                SELECT COUNT(*)
                                FROM heart_rate hr
                                WHERE hr.ts BETWEEN w.start_ts AND w.end_ts
                              ) AS hr_samples,
                              (
                                SELECT COUNT(*)
                                FROM performance p
                                WHERE p.speed IS NOT NULL
                                  AND p.ts BETWEEN w.start_ts AND w.end_ts
                              ) AS speed_samples,
                              (
                                SELECT COUNT(*)
                                FROM performance p
                                WHERE p.power IS NOT NULL
                                  AND p.ts BETWEEN w.start_ts AND w.end_ts
                              ) AS power_samples,
                              (
                                SELECT COUNT(*)
                                FROM performance p
                                WHERE p.speed IS NOT NULL
                                  AND p.ts BETWEEN w.start_ts AND w.end_ts
                                  AND EXISTS (
                                    SELECT 1
                                    FROM heart_rate hr
                                    WHERE hr.ts BETWEEN w.start_ts AND w.end_ts
                                      AND ABS(EXTRACT(EPOCH FROM hr.ts) - EXTRACT(EPOCH FROM p.ts)) <= ?
                                  )
                              ) AS aligned_speed_hr_samples,
                              (
                                SELECT COUNT(*)
                                FROM workout_routes wr
                                WHERE wr.workout_id = w.id
                              ) AS route_count,
                              (
                                SELECT COUNT(*)
                                FROM workout_stats ws
                                WHERE ws.workout_id = w.id
                              ) AS stats_count,
                              (
                                SELECT COUNT(*)
                                FROM workout_events we
                                WHERE we.workout_id = w.id
                              ) AS events_count,
                              (
                                SELECT COUNT(*)
                                FROM workout_metadata wm
                                WHERE wm.workout_id = w.id
                              ) AS metadata_count
                            FROM w`;

export async function getWorkoutSampleQuality(
  db: Db,
  workoutId: string,
): Promise<WorkoutSampleQuality | null> {
  const row = await db.get<SampleQualityRow>(SQL_SAMPLE_QUALITY, [workoutId, ALIGN_TOLERANCE_SEC]);
  if (row === null) return null;

  const hrSamples = Number(row.hr_samples);
  const speedSamples = Number(row.speed_samples);
  const powerSamples = Number(row.power_samples);
  const alignedSpeedHrSamples = Number(row.aligned_speed_hr_samples);
  const routeCount = Number(row.route_count);
  const contextCount =
    Number(row.stats_count) + Number(row.events_count) + Number(row.metadata_count) + routeCount;
  const issues: WorkoutSampleQualityIssue[] = [];

  if (row.duration_sec < MIN_ENDURANCE_DURATION_SEC) issues.push("too_short");
  if (hrSamples === 0) issues.push("missing_hr");
  if (speedSamples === 0) issues.push("missing_speed");
  if (powerSamples === 0) issues.push("missing_power");
  if (speedSamples > 0 && hrSamples > 0 && alignedSpeedHrSamples === 0) {
    issues.push("alignment_gap");
  }
  if (routeCount === 0) issues.push("missing_route");
  if (contextCount === 0) issues.push("missing_context");

  const hardIssues = new Set<WorkoutSampleQualityIssue>([
    "too_short",
    "missing_hr",
    "missing_speed",
    "alignment_gap",
  ]);
  const sampleQuality = issues.some((issue) => hardIssues.has(issue))
    ? "poor"
    : issues.length > 0
      ? "mixed"
      : "high";

  return WorkoutSampleQualitySchema.parse({
    workout_id: row.workout_id,
    sample_quality: sampleQuality,
    issues,
    duration_sec: row.duration_sec,
    hr_samples: hrSamples,
    speed_samples: speedSamples,
    power_samples: powerSamples,
    aligned_speed_hr_samples: alignedSpeedHrSamples,
    route_count: routeCount,
    context_count: contextCount,
  });
}
