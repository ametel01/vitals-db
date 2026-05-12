import { type SleepNightPoint, SleepNightPointSchema } from "@vitals/core";
import type { Db } from "@vitals/db";
import { type DateRange, normalizeRangeEnd, normalizeRangeStart, toIsoDate } from "./dates";

// Spec §4.5 — additive to `getSleepSummary`. One row per night, keyed by the
// UTC DATE of each night's first `asleep` start. `asleep_hours` is the raw sum
// of asleep segment durations (see `sleep.ts` for why the union is not taken).
// `in_bed_hours` uses explicit InBed coverage when present, otherwise it falls
// back to asleep + awake coverage so stage-only Apple exports still graph a
// useful night duration without inflating across long gaps.
export async function getSleepNightly(db: Db, range: DateRange): Promise<SleepNightPoint[]> {
  const upper = normalizeRangeEnd(range.to);
  const sql = `WITH filtered AS (
                 SELECT
                   DATE(start_ts - INTERVAL 12 HOUR) AS day,
                   start_ts,
                   end_ts,
                   state,
                   date_diff('second', start_ts, end_ts) / 3600.0 AS duration_hours
                 FROM sleep
                 WHERE start_ts >= ? AND start_ts ${upper.operator} ?
               ),
               grouped AS (
                 SELECT
                   day,
                   SUM(CASE WHEN state = 'asleep' THEN duration_hours ELSE 0 END)::DOUBLE AS asleep_hours,
                   SUM(CASE WHEN state = 'in_bed' THEN duration_hours ELSE 0 END)::DOUBLE AS explicit_in_bed_hours,
                   SUM(CASE WHEN state = 'awake' THEN duration_hours ELSE 0 END)::DOUBLE AS awake_hours
                 FROM filtered
                 GROUP BY day
               )
               SELECT
                 day,
                 asleep_hours,
                 CASE
                   WHEN explicit_in_bed_hours > 0 THEN explicit_in_bed_hours
                   ELSE asleep_hours + awake_hours
                 END AS in_bed_hours,
                 CASE
                   WHEN explicit_in_bed_hours > 0
                     THEN (asleep_hours / explicit_in_bed_hours)::DOUBLE
                   WHEN (asleep_hours + awake_hours) > 0
                     THEN (asleep_hours / (asleep_hours + awake_hours))::DOUBLE
                   ELSE NULL
                 END AS efficiency
               FROM grouped
               WHERE asleep_hours > 0
               ORDER BY day`;
  const from = normalizeRangeStart(range.from);
  const to = upper.value;
  const rows = await db.all<{
    day: Date;
    asleep_hours: number;
    in_bed_hours: number;
    efficiency: number | null;
  }>(sql, [from, to]);
  return rows.map((row) =>
    SleepNightPointSchema.parse({
      day: toIsoDate(row.day),
      asleep_hours: row.asleep_hours,
      in_bed_hours: row.in_bed_hours,
      efficiency: row.efficiency,
    }),
  );
}
