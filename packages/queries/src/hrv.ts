import { type HRVPoint, HRVPointSchema } from "@vitals/core";
import type { Db } from "@vitals/db";
import { type DateRange, normalizeRangeEnd, normalizeRangeStart, toIsoDate } from "./dates";

// Spec §1.A / §9. DATE(ts) buckets are UTC days (see dates.ts invariant).
export async function getHRVDaily(db: Db, range: DateRange): Promise<HRVPoint[]> {
  const upper = normalizeRangeEnd(range.to);
  const sql = `SELECT DATE(ts) AS day, AVG(value) AS avg_hrv
               FROM hrv
               WHERE ts >= ? AND ts ${upper.operator} ?
               GROUP BY DATE(ts)
               ORDER BY day`;
  const rows = await db.all<{ day: Date; avg_hrv: number }>(sql, [
    normalizeRangeStart(range.from),
    upper.value,
  ]);
  return rows.map((row) =>
    HRVPointSchema.parse({
      day: toIsoDate(row.day),
      avg_hrv: row.avg_hrv,
    }),
  );
}
