import { type SleepSegment, SleepSegmentSchema } from "@vitals/core";
import type { Db } from "@vitals/db";
import {
  type DateRange,
  normalizeRangeEnd,
  normalizeRangeStart,
  toIsoDate,
  toIsoDateTime,
} from "./dates";

const NIGHT_KEY_SQL = "DATE(start_ts - INTERVAL 12 HOUR)";

export async function getSleepSegments(db: Db, range: DateRange): Promise<SleepSegment[]> {
  const upper = normalizeRangeEnd(range.to);
  const sql = `SELECT
                 ${NIGHT_KEY_SQL} AS night,
                 start_ts,
                 end_ts,
                 state,
                 raw_state,
                 CASE
                   WHEN raw_state = 'HKCategoryValueSleepAnalysisAsleepCore' THEN 'core'
                   WHEN raw_state = 'HKCategoryValueSleepAnalysisAsleepDeep' THEN 'deep'
                   WHEN raw_state = 'HKCategoryValueSleepAnalysisAsleepREM' THEN 'rem'
                   WHEN raw_state = 'HKCategoryValueSleepAnalysisAsleepUnspecified' THEN 'unspecified'
                   ELSE NULL
                 END AS stage,
                 (date_diff('second', start_ts, end_ts) / 3600.0)::DOUBLE AS duration_hours
               FROM sleep
               WHERE start_ts >= ? AND start_ts ${upper.operator} ?
               ORDER BY start_ts, end_ts`;
  const rows = await db.all<{
    night: Date;
    start_ts: Date;
    end_ts: Date;
    state: "asleep" | "in_bed" | "awake";
    raw_state: string | null;
    stage: "core" | "deep" | "rem" | "unspecified" | null;
    duration_hours: number;
  }>(sql, [normalizeRangeStart(range.from), upper.value]);
  return rows.map((row) =>
    SleepSegmentSchema.parse({
      night: toIsoDate(row.night),
      start_ts: toIsoDateTime(row.start_ts),
      end_ts: toIsoDateTime(row.end_ts),
      state: row.state,
      raw_state: row.raw_state,
      stage: row.stage,
      duration_hours: row.duration_hours,
    }),
  );
}
