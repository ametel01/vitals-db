import { type ActivityPoint, ActivityPointSchema } from "@vitals/core";
import type { Db } from "@vitals/db";
import { type DateRange, normalizeRangeEnd, normalizeRangeStart, toIsoDate } from "./dates";

// Weekly activity remains workouts-only in v0.4. Movement metrics (steps,
// distance, energy) are surfaced via separate daily routes.
export async function getWeeklyActivity(db: Db, range: DateRange): Promise<ActivityPoint[]> {
  const upper = normalizeRangeEnd(range.to);
  const sql = `SELECT
                 DATE_TRUNC('week', start_ts)::DATE AS week,
                 COUNT(*)::INTEGER AS workout_count,
                 COALESCE(SUM(duration_sec), 0)::DOUBLE AS total_duration_sec
               FROM workouts
               WHERE start_ts >= ? AND start_ts ${upper.operator} ?
               GROUP BY DATE_TRUNC('week', start_ts)
               ORDER BY week`;
  const rows = await db.all<{ week: Date; workout_count: number; total_duration_sec: number }>(
    sql,
    [normalizeRangeStart(range.from), upper.value],
  );
  return rows.map((row) =>
    ActivityPointSchema.parse({
      week: toIsoDate(row.week),
      workout_count: row.workout_count,
      total_duration_sec: row.total_duration_sec,
    }),
  );
}
