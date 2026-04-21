import { type RestingHRRollingPoint, RestingHRRollingPointSchema } from "@vitals/core";
import type { Db } from "@vitals/db";
import type { DateRange } from "./dates";
import { getRestingHRDaily } from "./resting_hr";

const WINDOW_DAYS = 7;

function addUtcDays(isoDateOrDateTime: string, deltaDays: number): string {
  const value =
    isoDateOrDateTime.length === 10 ? `${isoDateOrDateTime}T00:00:00Z` : isoDateOrDateTime;
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}

// 0.9.0 KPI surface: rolling resting HR is computed over the shipped daily
// resting-HR series, not a second raw aggregation path over `resting_hr`.
// Each emitted row keeps the existing UTC day key and averages only the daily
// points whose day falls in the trailing 7-day window ending on that row.
export async function getRestingHRRolling7d(
  db: Db,
  range: DateRange,
): Promise<RestingHRRollingPoint[]> {
  const expandedFrom = addUtcDays(range.from, -(WINDOW_DAYS - 1));
  const daily = await getRestingHRDaily(db, { from: expandedFrom, to: range.to });

  return daily
    .filter((row) => row.day >= range.from.slice(0, 10) && row.day <= range.to.slice(0, 10))
    .map((row, index, rows) => {
      const windowStart = addUtcDays(row.day, -(WINDOW_DAYS - 1));
      const windowRows = daily.filter(
        (candidate) => candidate.day >= windowStart && candidate.day <= row.day,
      );
      const avg =
        windowRows.reduce((sum, candidate) => sum + candidate.avg_rhr, 0) / windowRows.length;
      return RestingHRRollingPointSchema.parse({
        day: rows[index]?.day ?? row.day,
        avg_rhr_7d: avg,
      });
    });
}
