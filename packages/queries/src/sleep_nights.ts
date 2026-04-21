import { type SleepNightDetail, SleepNightDetailSchema } from "@vitals/core";
import type { Db } from "@vitals/db";
import {
  type DateRange,
  normalizeRangeEnd,
  normalizeRangeStart,
  toIsoDate,
  toIsoDateTime,
} from "./dates";

const NIGHT_KEY_SQL = "DATE(start_ts - INTERVAL 12 HOUR)";

export async function getSleepNights(db: Db, range: DateRange): Promise<SleepNightDetail[]> {
  const upper = normalizeRangeEnd(range.to);
  const sql = `WITH filtered AS (
                 SELECT
                   ${NIGHT_KEY_SQL} AS night,
                   start_ts,
                   end_ts,
                   state,
                   raw_state,
                   date_diff('second', start_ts, end_ts) / 3600.0 AS duration_hours
                 FROM sleep
                 WHERE start_ts >= ? AND start_ts ${upper.operator} ?
               ),
               grouped AS (
                 SELECT
                   night,
                   MIN(start_ts) AS bedtime,
                   MAX(end_ts) AS wake_time,
                   SUM(CASE WHEN state = 'asleep' THEN duration_hours ELSE 0 END)::DOUBLE AS asleep_hours,
                   SUM(CASE WHEN state = 'in_bed' THEN duration_hours ELSE 0 END)::DOUBLE AS in_bed_hours,
                   SUM(CASE WHEN state = 'awake' THEN duration_hours ELSE 0 END)::DOUBLE AS awake_hours,
                   SUM(CASE WHEN raw_state = 'HKCategoryValueSleepAnalysisAsleepCore' THEN duration_hours ELSE 0 END)::DOUBLE AS core_hours_value,
                   SUM(CASE WHEN raw_state = 'HKCategoryValueSleepAnalysisAsleepDeep' THEN duration_hours ELSE 0 END)::DOUBLE AS deep_hours_value,
                   SUM(CASE WHEN raw_state = 'HKCategoryValueSleepAnalysisAsleepREM' THEN duration_hours ELSE 0 END)::DOUBLE AS rem_hours_value,
                   SUM(CASE WHEN raw_state = 'HKCategoryValueSleepAnalysisAsleepUnspecified' THEN duration_hours ELSE 0 END)::DOUBLE AS unspecified_hours_value,
                   SUM(
                     CASE
                       WHEN raw_state IN (
                         'HKCategoryValueSleepAnalysisAsleepCore',
                         'HKCategoryValueSleepAnalysisAsleepDeep',
                         'HKCategoryValueSleepAnalysisAsleepREM',
                         'HKCategoryValueSleepAnalysisAsleepUnspecified'
                       )
                       THEN 1
                       ELSE 0
                     END
                   )::INTEGER AS stage_row_count
                 FROM filtered
                 GROUP BY night
               )
               SELECT
                 night AS day,
                 bedtime,
                 wake_time,
                 asleep_hours,
                 in_bed_hours,
                 awake_hours,
                 CASE
                   WHEN in_bed_hours = 0 THEN NULL
                   ELSE (asleep_hours / in_bed_hours)::DOUBLE
                 END AS efficiency,
                 CASE WHEN stage_row_count = 0 THEN NULL ELSE core_hours_value END AS core_hours,
                 CASE WHEN stage_row_count = 0 THEN NULL ELSE deep_hours_value END AS deep_hours,
                 CASE WHEN stage_row_count = 0 THEN NULL ELSE rem_hours_value END AS rem_hours,
                 CASE
                   WHEN stage_row_count = 0 THEN NULL
                   ELSE unspecified_hours_value
                 END AS unspecified_hours
               FROM grouped
               ORDER BY day`;
  const rows = await db.all<{
    day: Date;
    bedtime: Date;
    wake_time: Date;
    asleep_hours: number;
    in_bed_hours: number;
    awake_hours: number;
    efficiency: number | null;
    core_hours: number | null;
    deep_hours: number | null;
    rem_hours: number | null;
    unspecified_hours: number | null;
  }>(sql, [normalizeRangeStart(range.from), upper.value]);
  return rows.map((row) =>
    SleepNightDetailSchema.parse({
      day: toIsoDate(row.day),
      bedtime: toIsoDateTime(row.bedtime),
      wake_time: toIsoDateTime(row.wake_time),
      asleep_hours: row.asleep_hours,
      in_bed_hours: row.in_bed_hours,
      awake_hours: row.awake_hours,
      efficiency: row.efficiency,
      core_hours: row.core_hours,
      deep_hours: row.deep_hours,
      rem_hours: row.rem_hours,
      unspecified_hours: row.unspecified_hours,
    }),
  );
}
