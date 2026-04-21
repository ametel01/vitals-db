import { type StepsPoint, StepsPointSchema } from "@vitals/core";
import type { Db } from "@vitals/db";
import { type DateRange, normalizeRangeEnd, normalizeRangeStart, toIsoDate } from "./dates";

// Spec §1.B. DATE(ts) buckets are UTC days (see dates.ts invariant).
export async function getStepsDaily(db: Db, range: DateRange): Promise<StepsPoint[]> {
  const upper = normalizeRangeEnd(range.to);
  const sql = `SELECT DATE(ts) AS day, COALESCE(SUM(count), 0) AS total_steps
               FROM steps
               WHERE ts >= ? AND ts ${upper.operator} ?
               GROUP BY DATE(ts)
               ORDER BY day`;
  const rows = await db.all<{ day: Date; total_steps: number }>(sql, [
    normalizeRangeStart(range.from),
    upper.value,
  ]);
  return rows.map((row) =>
    StepsPointSchema.parse({
      day: toIsoDate(row.day),
      total_steps: row.total_steps,
    }),
  );
}
