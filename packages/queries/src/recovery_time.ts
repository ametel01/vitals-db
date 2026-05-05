import { type WorkoutRecoveryRow, WorkoutRecoveryRowSchema } from "@vitals/core";
import type { Db } from "@vitals/db";
import { type DateRange, normalizeRangeEnd, normalizeRangeStart, toIsoDateTime } from "./dates";

interface RawRecoveryRow {
  workout_id: string;
  start_ts: Date;
  end_ts: Date;
  next_workout_id: string | null;
  next_start_ts: Date | null;
  recovery_duration_sec: number | null;
}

export async function getWorkoutRecoveryTimes(
  db: Db,
  range: DateRange,
): Promise<WorkoutRecoveryRow[]> {
  const upper = normalizeRangeEnd(range.to);
  const sql = `WITH ordered AS (
                 SELECT
                   id AS workout_id,
                   start_ts,
                   end_ts,
                   LEAD(id) OVER (ORDER BY start_ts, id) AS next_workout_id,
                   LEAD(start_ts) OVER (ORDER BY start_ts, id) AS next_start_ts
                 FROM workouts
               )
               SELECT
                 workout_id,
                 start_ts,
                 end_ts,
                 next_workout_id,
                 next_start_ts,
                 CASE
                   WHEN next_start_ts IS NULL THEN NULL
                   ELSE GREATEST(0, date_diff('second', end_ts, next_start_ts))
                 END::DOUBLE AS recovery_duration_sec
               FROM ordered
               WHERE start_ts >= ? AND start_ts ${upper.operator} ?
               ORDER BY start_ts`;
  const rows = await db.all<RawRecoveryRow>(sql, [normalizeRangeStart(range.from), upper.value]);
  return rows.map((row) =>
    WorkoutRecoveryRowSchema.parse({
      workout_id: row.workout_id,
      start_ts: toIsoDateTime(row.start_ts),
      end_ts: toIsoDateTime(row.end_ts),
      next_workout_id: row.next_workout_id,
      next_start_ts: row.next_start_ts === null ? null : toIsoDateTime(row.next_start_ts),
      recovery_duration_sec: row.recovery_duration_sec,
    }),
  );
}
