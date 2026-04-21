import { type DistancePoint, DistancePointSchema } from "@vitals/core";
import type { Db } from "@vitals/db";
import { type DateRange, normalizeRangeEnd, normalizeRangeStart, toIsoDate } from "./dates";

// Spec §1.B. DATE(ts) buckets are UTC days (see dates.ts invariant).
export async function getDistanceDaily(db: Db, range: DateRange): Promise<DistancePoint[]> {
  const upper = normalizeRangeEnd(range.to);
  const sql = `SELECT DATE(ts) AS day, COALESCE(SUM(meters), 0) AS total_meters
               FROM distance
               WHERE ts >= ? AND ts ${upper.operator} ?
               GROUP BY DATE(ts)
               ORDER BY day`;
  const rows = await db.all<{ day: Date; total_meters: number }>(sql, [
    normalizeRangeStart(range.from),
    upper.value,
  ]);
  return rows.map((row) =>
    DistancePointSchema.parse({
      day: toIsoDate(row.day),
      total_meters: row.total_meters,
    }),
  );
}
