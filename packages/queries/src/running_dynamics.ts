import { type RunningDynamicsPoint, RunningDynamicsPointSchema } from "@vitals/core";
import type { Db } from "@vitals/db";
import { type DateRange, normalizeRangeEnd, normalizeRangeStart, toIsoDate } from "./dates";

export async function getRunningDynamicsDaily(
  db: Db,
  range: DateRange,
): Promise<RunningDynamicsPoint[]> {
  const upper = normalizeRangeEnd(range.to);
  const sql = `SELECT
                 DATE(ts) AS day,
                 AVG(vertical_oscillation_cm) AS avg_vertical_oscillation_cm,
                 AVG(ground_contact_time_ms) AS avg_ground_contact_time_ms,
                 AVG(stride_length_m) AS avg_stride_length_m
               FROM performance
               WHERE ts >= ? AND ts ${upper.operator} ?
                 AND (
                   vertical_oscillation_cm IS NOT NULL
                   OR ground_contact_time_ms IS NOT NULL
                   OR stride_length_m IS NOT NULL
                 )
               GROUP BY DATE(ts)
               ORDER BY day`;
  const rows = await db.all<{
    day: Date;
    avg_vertical_oscillation_cm: number | null;
    avg_ground_contact_time_ms: number | null;
    avg_stride_length_m: number | null;
  }>(sql, [normalizeRangeStart(range.from), upper.value]);
  return rows.map((row) =>
    RunningDynamicsPointSchema.parse({
      day: toIsoDate(row.day),
      avg_vertical_oscillation_cm: row.avg_vertical_oscillation_cm,
      avg_ground_contact_time_ms: row.avg_ground_contact_time_ms,
      avg_stride_length_m: row.avg_stride_length_m,
    }),
  );
}
