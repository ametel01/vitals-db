import { type PowerPoint, PowerPointSchema } from "@vitals/core";
import type { Db } from "@vitals/db";
import { type DateRange, normalizeRangeEnd, normalizeRangeStart, toIsoDate } from "./dates";

// Spec §1.F. The `performance` table stores one sparse row per source
// identifier (vo2max/speed/power), so filtering to NOT NULL gives the
// power-only slice. Mirrors the filter pattern in `vo2max.ts`.
export async function getPowerDaily(db: Db, range: DateRange): Promise<PowerPoint[]> {
  const upper = normalizeRangeEnd(range.to);
  const sql = `SELECT DATE(ts) AS day, AVG(power) AS avg_power
               FROM performance
               WHERE power IS NOT NULL AND ts >= ? AND ts ${upper.operator} ?
               GROUP BY DATE(ts)
               ORDER BY day`;
  const rows = await db.all<{ day: Date; avg_power: number }>(sql, [
    normalizeRangeStart(range.from),
    upper.value,
  ]);
  return rows.map((row) =>
    PowerPointSchema.parse({
      day: toIsoDate(row.day),
      avg_power: row.avg_power,
    }),
  );
}
