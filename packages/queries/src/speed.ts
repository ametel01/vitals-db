import { type SpeedPoint, SpeedPointSchema } from "@vitals/core";
import type { Db } from "@vitals/db";
import { type DateRange, normalizeRangeEnd, normalizeRangeStart, toIsoDate } from "./dates";

// Spec §1.F. The `performance` table stores one sparse row per source
// identifier (vo2max/speed/power), so filtering to NOT NULL gives the
// speed-only slice. Mirrors the filter pattern in `vo2max.ts`.
export async function getSpeedDaily(db: Db, range: DateRange): Promise<SpeedPoint[]> {
  const upper = normalizeRangeEnd(range.to);
  const sql = `SELECT DATE(ts) AS day, AVG(speed) AS avg_speed
               FROM performance
               WHERE speed IS NOT NULL AND ts >= ? AND ts ${upper.operator} ?
               GROUP BY DATE(ts)
               ORDER BY day`;
  const rows = await db.all<{ day: Date; avg_speed: number }>(sql, [
    normalizeRangeStart(range.from),
    upper.value,
  ]);
  return rows.map((row) =>
    SpeedPointSchema.parse({
      day: toIsoDate(row.day),
      avg_speed: row.avg_speed,
    }),
  );
}
