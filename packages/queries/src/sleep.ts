import { type SleepSummary, SleepSummarySchema } from "@vitals/core";
import type { Db } from "@vitals/db";
import { type DateRange, normalizeRangeEnd, normalizeRangeStart } from "./dates";

// Spec §4.5 decisions:
//   * total_hours = sum of `asleep`-state segment durations. We deliberately
//     do NOT take the union across overlapping segments; Apple rarely emits
//     overlapping sleep-stage records within the same source, and a raw sum
//     keeps the SQL a single scan. If a future provider emits overlaps the
//     efficiency value can exceed 1.0 — the DTO Ratio validator would catch it
//     and we revisit then.
//   * efficiency = sum(asleep) / sum(in_bed). Same raw-sum choice.
//   * consistency_stddev = sample stddev of per-night earliest asleep start
//     expressed as seconds-past-UTC-midnight. Known limitation: does not model
//     midnight-wraparound (11pm vs 1am look 2h apart in a 24h circle but 22h
//     apart here). For v0.1 we accept that; the chart is a trend, not a
//     medical value.
export async function getSleepSummary(db: Db, range: DateRange): Promise<SleepSummary> {
  const upper = normalizeRangeEnd(range.to);
  const sql = `WITH night_starts AS (
                 SELECT
                   DATE(start_ts - INTERVAL 12 HOUR) AS day,
                   MIN(start_ts) AS first_asleep
                 FROM sleep
                 WHERE state = 'asleep' AND start_ts >= ? AND start_ts ${upper.operator} ?
                 GROUP BY DATE(start_ts - INTERVAL 12 HOUR)
               )
               SELECT
                 COALESCE(
                   (SELECT SUM(date_diff('second', start_ts, end_ts))
                      FROM sleep
                      WHERE state = 'asleep' AND start_ts >= ? AND start_ts ${upper.operator}
                        ?) / 3600.0,
                   0
                 )::DOUBLE AS total_hours,
                 (SELECT STDDEV_SAMP(EXTRACT(EPOCH FROM first_asleep) % 86400)
                    FROM night_starts)::DOUBLE AS consistency_stddev,
                 CASE
                   WHEN (SELECT SUM(date_diff('second', start_ts, end_ts))
                           FROM sleep
                           WHERE state = 'in_bed' AND start_ts >= ? AND start_ts ${upper.operator}
                             ?) IS NULL
                     OR (SELECT SUM(date_diff('second', start_ts, end_ts))
                           FROM sleep
                           WHERE state = 'in_bed' AND start_ts >= ? AND start_ts ${upper.operator}
                             ?) = 0
                   THEN NULL
                   ELSE
                     (SELECT SUM(date_diff('second', start_ts, end_ts))
                        FROM sleep
                        WHERE state = 'asleep' AND start_ts >= ? AND start_ts ${upper.operator}
                          ?)::DOUBLE
                     / (SELECT SUM(date_diff('second', start_ts, end_ts))
                          FROM sleep
                          WHERE state = 'in_bed' AND start_ts >= ? AND start_ts ${upper.operator}
                            ?)::DOUBLE
                 END AS efficiency`;
  const from = normalizeRangeStart(range.from);
  const to = upper.value;
  const params = [
    from,
    to, // night_starts CTE
    from,
    to, // total_hours
    from,
    to, // in_bed null check
    from,
    to, // in_bed zero check
    from,
    to, // efficiency numerator
    from,
    to, // efficiency denominator
  ];
  const row = await db.get<{
    total_hours: number | null;
    consistency_stddev: number | null;
    efficiency: number | null;
  }>(sql, params);
  return SleepSummarySchema.parse({
    total_hours: row?.total_hours ?? 0,
    consistency_stddev: row?.consistency_stddev ?? null,
    efficiency: row?.efficiency ?? null,
  });
}
