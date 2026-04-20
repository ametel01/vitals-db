import type { DriftClassification } from "@vitals/core";
import type { Db } from "@vitals/db";

// Spec §4.3: split a workout into equal-time halves and compare avg HR. The
// null/unknown path is handled in SQL so the caller gets a single deterministic
// shape even when a workout has no HR samples (plan M5 failure-modes rule).
const SQL = `WITH
               w AS (
                 SELECT start_ts, end_ts,
                   EXTRACT(EPOCH FROM start_ts) AS s_s,
                   EXTRACT(EPOCH FROM end_ts) AS e_s
                 FROM workouts WHERE id = ?
               ),
               h AS (
                 SELECT hr.bpm, EXTRACT(EPOCH FROM hr.ts) AS t_s, w.s_s, w.e_s
                 FROM heart_rate hr, w
                 WHERE hr.ts BETWEEN w.start_ts AND w.end_ts
               ),
               halves AS (
                 SELECT
                   AVG(CASE WHEN t_s < (s_s + e_s) / 2 THEN bpm END) AS first_avg,
                   AVG(CASE WHEN t_s >= (s_s + e_s) / 2 THEN bpm END) AS second_avg,
                   COUNT(*)::INTEGER AS total
                 FROM h
               )
             SELECT
               first_avg,
               second_avg,
               total,
               CASE
                 WHEN total = 0
                   OR first_avg IS NULL
                   OR second_avg IS NULL
                   OR first_avg = 0
                 THEN NULL
                 ELSE (second_avg - first_avg) / first_avg * 100.0
               END AS drift_pct
             FROM halves`;

export interface WorkoutDrift {
  first_avg: number | null;
  second_avg: number | null;
  drift_pct: number | null;
  classification: DriftClassification;
}

function classify(driftPct: number | null): DriftClassification {
  if (driftPct === null) return "unknown";
  const abs = Math.abs(driftPct);
  if (abs < 3) return "stable";
  if (abs < 6) return "moderate";
  return "high";
}

export async function getWorkoutDrift(db: Db, workoutId: string): Promise<WorkoutDrift> {
  const row = await db.get<{
    first_avg: number | null;
    second_avg: number | null;
    total: number;
    drift_pct: number | null;
  }>(SQL, [workoutId]);

  const firstAvg = row?.first_avg ?? null;
  const secondAvg = row?.second_avg ?? null;
  const driftPct = row?.drift_pct ?? null;
  return {
    first_avg: firstAvg,
    second_avg: secondAvg,
    drift_pct: driftPct,
    classification: classify(driftPct),
  };
}
