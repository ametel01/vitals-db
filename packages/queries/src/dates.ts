// DuckDB TIMESTAMP and DATE columns deserialize to JS Date. All analytics
// tables are populated in UTC (see packages/ingest mappers.ts); "day"/"week"
// buckets are therefore UTC days.

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function toIsoDateTime(d: Date): string {
  return d.toISOString();
}

export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export interface DateRange {
  /** ISO 8601 date (`YYYY-MM-DD`) or datetime; non-date inputs are normalized to UTC wall-clock format before SQL binding. */
  from: string;
  /** ISO 8601 date (`YYYY-MM-DD`) or datetime; non-date inputs are normalized to UTC wall-clock format before SQL binding. */
  to: string;
}

function normalizeDateTimeForDuckDb(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.toISOString().slice(0, 10)} ${date.toISOString().slice(11, 23)}`;
}

export function normalizeRangeStart(value: string): string {
  return isDateOnly(value) ? `${value} 00:00:00` : normalizeDateTimeForDuckDb(value);
}

export function normalizeRangeEnd(value: string): { operator: "<" | "<="; value: string } {
  if (!isDateOnly(value)) {
    return { operator: "<=", value: normalizeDateTimeForDuckDb(value) };
  }

  const parts = value.split("-");
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  const nextDay = new Date(Date.UTC(year, month - 1, day + 1));
  const nextDayText = [
    nextDay.getUTCFullYear(),
    String(nextDay.getUTCMonth() + 1).padStart(2, "0"),
    String(nextDay.getUTCDate()).padStart(2, "0"),
  ].join("-");

  return { operator: "<", value: `${nextDayText} 00:00:00` };
}

function isDateOnly(value: string): boolean {
  return DATE_ONLY_RE.test(value);
}
