import { type VO2MaxPoint, VO2MaxPointSchema } from "@vitals/core";
import type { Db } from "@vitals/db";
import { type DateRange, normalizeRangeEnd, normalizeRangeStart, toIsoDate } from "./dates";

// Spec §4.7. `performance` stores one sparse row per source identifier
// (vo2max/speed/power), so filtering to NOT NULL gives the vo2max-only slice.
export async function getVO2MaxDaily(db: Db, range: DateRange): Promise<VO2MaxPoint[]> {
  const upper = normalizeRangeEnd(range.to);
  const sql = `SELECT DATE(ts) AS day, AVG(vo2max) AS avg_vo2max
               FROM performance
               WHERE vo2max IS NOT NULL AND ts >= ? AND ts ${upper.operator} ?
               GROUP BY DATE(ts)
               ORDER BY day`;
  const rows = await db.all<{ day: Date; avg_vo2max: number }>(sql, [
    normalizeRangeStart(range.from),
    upper.value,
  ]);
  return rows.map((row) =>
    VO2MaxPointSchema.parse({
      day: toIsoDate(row.day),
      avg_vo2max: row.avg_vo2max,
    }),
  );
}
