import { type RestingHRPoint, RestingHRPointSchema } from "@vitals/core";
import type { Db } from "@vitals/db";
import { type DateRange, normalizeRangeEnd, normalizeRangeStart, toIsoDate } from "./dates";

// Spec §4.4. DATE(ts) buckets are UTC days (see dates.ts invariant).
export async function getRestingHRDaily(db: Db, range: DateRange): Promise<RestingHRPoint[]> {
  const upper = normalizeRangeEnd(range.to);
  const sql = `SELECT DATE(ts) AS day, AVG(bpm) AS avg_rhr
               FROM resting_hr
               WHERE ts >= ? AND ts ${upper.operator} ?
               GROUP BY DATE(ts)
               ORDER BY day`;
  const rows = await db.all<{ day: Date; avg_rhr: number }>(sql, [
    normalizeRangeStart(range.from),
    upper.value,
  ]);
  return rows.map((row) =>
    RestingHRPointSchema.parse({
      day: toIsoDate(row.day),
      avg_rhr: row.avg_rhr,
    }),
  );
}
