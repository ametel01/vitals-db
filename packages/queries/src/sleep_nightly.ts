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
                   DATE(start_ts - INTERVAL 12 HOUR) AS day,
                   SUM(date_diff('second', start_ts, end_ts)) / 3600.0 AS asleep_hours
                 FROM sleep
                 WHERE state = 'asleep' AND start_ts >= ? AND start_ts ${upper.operator} ?
                 GROUP BY DATE(start_ts - INTERVAL 12 HOUR)
               ),
               in_bed AS (
                 SELECT
                   DATE(start_ts - INTERVAL 12 HOUR) AS day,
                   SUM(date_diff('second', start_ts, end_ts)) / 3600.0 AS in_bed_hours
                 FROM sleep
                 WHERE state = 'in_bed' AND start_ts >= ? AND start_ts ${upper.operator} ?
                 GROUP BY DATE(start_ts - INTERVAL 12 HOUR)
               )
               SELECT
                 a.day AS day,
                 a.asleep_hours::DOUBLE AS asleep_hours,
                 COALESCE(b.in_bed_hours, 0)::DOUBLE AS in_bed_hours,
                 COALESCE(w.awake_hours, 0)::DOUBLE AS awake_hours,
                 CASE
                   WHEN b.in_bed_hours IS NOT NULL AND b.in_bed_hours > 0
                     THEN (a.asleep_hours / b.in_bed_hours)::DOUBLE
                   WHEN (a.asleep_hours + COALESCE(w.awake_hours, 0)) > 0
                     THEN (a.asleep_hours / (a.asleep_hours + COALESCE(w.awake_hours, 0)))::DOUBLE
                   ELSE NULL
                 END AS efficiency
               FROM asleep a
               LEFT JOIN in_bed b ON a.day = b.day
               LEFT JOIN (
                 SELECT
                   DATE(start_ts - INTERVAL 12 HOUR) AS day,
                   SUM(date_diff('second', start_ts, end_ts)) / 3600.0 AS awake_hours
                 FROM sleep
                 WHERE state = 'awake' AND start_ts >= ? AND start_ts ${upper.operator} ?
                 GROUP BY DATE(start_ts - INTERVAL 12 HOUR)
               ) w ON a.day = w.day
               ORDER BY a.day`;
  const from = normalizeRangeStart(range.from);
  const to = upper.value;
  const rows = await db.all<{
    day: Date;
    asleep_hours: number;
    in_bed_hours: number;
    efficiency: number | null;
  }>(sql, [from, to, from, to, from, to]);
  return rows.map((row) =>
    SleepNightPointSchema.parse({
      day: toIsoDate(row.day),
      asleep_hours: row.asleep_hours,
      in_bed_hours: row.in_bed_hours,
      efficiency: row.efficiency,
    }),
  );
}
