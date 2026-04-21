import { type SleepNightPoint, SleepNightPointSchema } from "@vitals/core";
import type { Db } from "@vitals/db";
import { type DateRange, normalizeRangeEnd, normalizeRangeStart, toIsoDate } from "./dates";

// Spec §4.5 — additive to `getSleepSummary`. One row per night, keyed by the
// UTC DATE of each night's first `asleep` start. `asleep_hours` and
// `in_bed_hours` are raw sums of segment durations (see `sleep.ts` for why
// the union is not taken). `efficiency` is null when the night has no
// `in_bed` coverage, matching the 30-day summary's null contract.
export async function getSleepNightly(db: Db, range: DateRange): Promise<SleepNightPoint[]> {
  const upper = normalizeRangeEnd(range.to);
  const sql = `WITH asleep AS (
                 SELECT
                   DATE(start_ts) AS day,
                   SUM(date_diff('second', start_ts, end_ts)) / 3600.0 AS asleep_hours
                 FROM sleep
                 WHERE state = 'asleep' AND start_ts >= ? AND start_ts ${upper.operator} ?
                 GROUP BY DATE(start_ts)
               ),
               in_bed AS (
                 SELECT
                   DATE(start_ts) AS day,
                   SUM(date_diff('second', start_ts, end_ts)) / 3600.0 AS in_bed_hours
                 FROM sleep
                 WHERE state = 'in_bed' AND start_ts >= ? AND start_ts ${upper.operator} ?
                 GROUP BY DATE(start_ts)
               )
               SELECT
                 a.day AS day,
                 a.asleep_hours::DOUBLE AS asleep_hours,
                 COALESCE(b.in_bed_hours, 0)::DOUBLE AS in_bed_hours,
                 CASE
                   WHEN b.in_bed_hours IS NULL OR b.in_bed_hours = 0 THEN NULL
                   ELSE (a.asleep_hours / b.in_bed_hours)::DOUBLE
                 END AS efficiency
               FROM asleep a
               LEFT JOIN in_bed b ON a.day = b.day
               ORDER BY a.day`;
  const from = normalizeRangeStart(range.from);
  const to = upper.value;
  const rows = await db.all<{
    day: Date;
    asleep_hours: number;
    in_bed_hours: number;
    efficiency: number | null;
  }>(sql, [from, to, from, to]);
  return rows.map((row) =>
    SleepNightPointSchema.parse({
      day: toIsoDate(row.day),
      asleep_hours: row.asleep_hours,
      in_bed_hours: row.in_bed_hours,
      efficiency: row.efficiency,
    }),
  );
}
