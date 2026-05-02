import {
  type WorkoutDecoupling,
  WorkoutDecouplingSchema,
  type WorkoutEfficiency,
  WorkoutEfficiencySchema,
  type WorkoutPaceAtHR,
  WorkoutPaceAtHRSchema,
} from "@vitals/core";
import type { Db } from "@vitals/db";
import { getWorkoutSummary } from "./workouts";

const DEFAULT_HR_MIN = 120;
const DEFAULT_HR_MAX = 130;
const ALIGN_TOLERANCE_SEC = 60;
const DECOUPLING_TARGET_WINDOW_SEC = 60 * 60;
const DECOUPLING_MIN_WINDOW_SEC = 45 * 60;

const SQL_ALIGNED_SAMPLES = `WITH
                               w AS (
                                 SELECT start_ts, end_ts
                                 FROM workouts
                                 WHERE id = ?
                               ),
                               speed_samples AS (
                                 SELECT p.ts AS ts, p.speed
                                 FROM performance p, w
                                 WHERE p.speed IS NOT NULL
                                   AND p.ts BETWEEN w.start_ts AND w.end_ts
                               ),
                               ranked AS (
                                 SELECT
                                   s.ts,
                                   s.speed,
                                   hr.bpm,
                                   ROW_NUMBER() OVER (
                                     PARTITION BY s.ts, s.speed
                                     ORDER BY ABS(EXTRACT(EPOCH FROM hr.ts) - EXTRACT(EPOCH FROM s.ts)), hr.ts
                                   ) AS rn
                                 FROM speed_samples s
                                 CROSS JOIN w
                                 JOIN heart_rate hr
                                   ON hr.ts BETWEEN w.start_ts AND w.end_ts
                                  AND ABS(EXTRACT(EPOCH FROM hr.ts) - EXTRACT(EPOCH FROM s.ts)) <= ?
                               )
                             SELECT ts, speed, bpm
                             FROM ranked
                             WHERE rn = 1
                             ORDER BY ts`;

interface AlignedSampleRow {
  ts: Date;
  speed: number;
  bpm: number;
}

export interface WorkoutEfficiencyParams {
  hrMin?: number;
  hrMax?: number;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function paceSecPerKm(speedMps: number): number {
  return 1000 / speedMps;
}

function buildPaceAtHR(samples: AlignedSampleRow[], hrMin: number, hrMax: number): WorkoutPaceAtHR {
  const matched = samples.filter(
    (sample) => sample.bpm >= hrMin && sample.bpm <= hrMax && sample.speed > 0,
  );
  const avgSpeed = average(matched.map((sample) => sample.speed));
  return WorkoutPaceAtHRSchema.parse({
    hr_min: hrMin,
    hr_max: hrMax,
    sample_count: matched.length,
    avg_speed_mps: avgSpeed,
    pace_sec_per_km: avgSpeed === null || avgSpeed <= 0 ? null : 1000 / avgSpeed,
  });
}

function buildDecoupling(
  samples: AlignedSampleRow[],
  workoutStartTs: string,
  durationSec: number,
): WorkoutDecoupling {
  const windowDurationSec = Math.min(durationSec, DECOUPLING_TARGET_WINDOW_SEC);
  const startMs = Date.parse(workoutStartTs);
  const windowEndMs = startMs + windowDurationSec * 1000;
  const windowSamples = samples.filter((sample) => {
    const tsMs = sample.ts.getTime();
    return tsMs >= startMs && tsMs <= windowEndMs && sample.speed > 0;
  });

  if (windowDurationSec < DECOUPLING_MIN_WINDOW_SEC) {
    return WorkoutDecouplingSchema.parse({
      window_duration_sec: windowDurationSec,
      sample_count: windowSamples.length,
      first_half_efficiency: null,
      second_half_efficiency: null,
      decoupling_pct: null,
    });
  }

  const midpointMs = startMs + (windowDurationSec * 1000) / 2;
  const firstHalf = windowSamples.filter((sample) => sample.ts.getTime() < midpointMs);
  const secondHalf = windowSamples.filter((sample) => sample.ts.getTime() >= midpointMs);

  const firstAvgHr = average(firstHalf.map((sample) => sample.bpm));
  const firstAvgPace = average(firstHalf.map((sample) => paceSecPerKm(sample.speed)));
  const secondAvgHr = average(secondHalf.map((sample) => sample.bpm));
  const secondAvgPace = average(secondHalf.map((sample) => paceSecPerKm(sample.speed)));

  const firstEfficiency =
    firstAvgPace === null || firstAvgHr === null || firstAvgHr <= 0
      ? null
      : firstAvgPace / firstAvgHr;
  const secondEfficiency =
    secondAvgPace === null || secondAvgHr === null || secondAvgHr <= 0
      ? null
      : secondAvgPace / secondAvgHr;
  const decouplingPct =
    firstEfficiency === null || secondEfficiency === null || firstEfficiency === 0
      ? null
      : ((secondEfficiency - firstEfficiency) / firstEfficiency) * 100;

  return WorkoutDecouplingSchema.parse({
    window_duration_sec: windowDurationSec,
    sample_count: windowSamples.length,
    first_half_efficiency: firstEfficiency,
    second_half_efficiency: secondEfficiency,
    decoupling_pct: decouplingPct,
  });
}

// 0.9.0 adds a dedicated efficiency view rather than widening WorkoutDetail.
// Pace-at-HR only uses aligned workout-level speed + HR samples; missing
// alignments yield null KPIs rather than false zeroes. Decoupling compares
// pace-per-heartbeat ratios over the first 45-60 minutes only, preserving the
// older whole-workout drift query as a separate metric with unchanged semantics.
export async function getWorkoutEfficiency(
  db: Db,
  workoutId: string,
  params: WorkoutEfficiencyParams = {},
): Promise<WorkoutEfficiency | null> {
  const workout = await getWorkoutSummary(db, workoutId);
  if (workout === null) return null;

  const hrMin = params.hrMin ?? DEFAULT_HR_MIN;
  const hrMax = params.hrMax ?? DEFAULT_HR_MAX;
  const samples = await db.all<AlignedSampleRow>(SQL_ALIGNED_SAMPLES, [
    workoutId,
    ALIGN_TOLERANCE_SEC,
  ]);

  return WorkoutEfficiencySchema.parse({
    pace_at_hr: buildPaceAtHR(samples, hrMin, hrMax),
    decoupling: buildDecoupling(samples, workout.start_ts, workout.duration_sec),
  });
}
