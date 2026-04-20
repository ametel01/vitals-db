import { type LoadRow, LoadRowSchema } from "@vitals/core";
import type { Db } from "@vitals/db";
import { type DateRange, normalizeRangeEnd, normalizeRangeStart } from "./dates";

// Spec §4.6: naive `duration_sec * avg_hr` per workout. Returns null avg_hr +
// null load when no HR samples fall within the workout window so callers can
// render "no data" instead of 0.
const SQL_FOR_WORKOUT = `SELECT
                           w.id AS workout_id,
                           w.duration_sec,
                           AVG(hr.bpm) AS avg_hr,
                           CASE
                             WHEN AVG(hr.bpm) IS NULL THEN NULL
                             ELSE w.duration_sec * AVG(hr.bpm)
                           END AS load
                         FROM workouts w
                         LEFT JOIN heart_rate hr
                           ON hr.ts BETWEEN w.start_ts AND w.end_ts
                         WHERE w.id = ?
                         GROUP BY w.id, w.duration_sec`;

interface RawLoadRow {
  workout_id: string;
  duration_sec: number;
  avg_hr: number | null;
  load: number | null;
}

function parseRow(row: RawLoadRow): LoadRow {
  return LoadRowSchema.parse(row);
}

export async function getWorkoutLoad(db: Db, workoutId: string): Promise<LoadRow | null> {
  const row = await db.get<RawLoadRow>(SQL_FOR_WORKOUT, [workoutId]);
  return row === null ? null : parseRow(row);
}

export async function getLoadForRange(db: Db, range: DateRange): Promise<LoadRow[]> {
  const upper = normalizeRangeEnd(range.to);
  const sql = `SELECT
                 w.id AS workout_id,
                 w.duration_sec,
                 AVG(hr.bpm) AS avg_hr,
                 CASE
                   WHEN AVG(hr.bpm) IS NULL THEN NULL
                   ELSE w.duration_sec * AVG(hr.bpm)
                 END AS load
               FROM workouts w
               LEFT JOIN heart_rate hr
                 ON hr.ts BETWEEN w.start_ts AND w.end_ts
               WHERE w.start_ts >= ? AND w.start_ts ${upper.operator} ?
               GROUP BY w.id, w.duration_sec, w.start_ts
               ORDER BY w.start_ts`;
  const rows = await db.all<RawLoadRow>(sql, [normalizeRangeStart(range.from), upper.value]);
  return rows.map(parseRow);
}
