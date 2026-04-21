import { type WalkingHRPoint, WalkingHRPointSchema } from "@vitals/core";
import type { Db } from "@vitals/db";
import { type DateRange, normalizeRangeEnd, normalizeRangeStart, toIsoDate } from "./dates";

// Spec §1.A / §1.D. DATE(ts) buckets are UTC days (see dates.ts invariant).
// Mirrors resting_hr / hrv daily-average shape.
export async function getWalkingHRDaily(db: Db, range: DateRange): Promise<WalkingHRPoint[]> {
  const upper = normalizeRangeEnd(range.to);
  const sql = `SELECT DATE(ts) AS day, AVG(bpm) AS avg_walking_hr
               FROM walking_hr
               WHERE ts >= ? AND ts ${upper.operator} ?
               GROUP BY DATE(ts)
               ORDER BY day`;
  const rows = await db.all<{ day: Date; avg_walking_hr: number }>(sql, [
    normalizeRangeStart(range.from),
    upper.value,
  ]);
  return rows.map((row) =>
    WalkingHRPointSchema.parse({
      day: toIsoDate(row.day),
      avg_walking_hr: row.avg_walking_hr,
    }),
  );
}
