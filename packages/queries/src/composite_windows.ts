import type { DateRange } from "./dates";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type TrendDirection = "improving" | "flat" | "declining" | "insufficient_data";

export interface CompositeWindows {
  current: DateRange;
  baseline: DateRange;
  acute7d: DateRange;
  chronic28d: DateRange;
  longTrend12w: DateRange;
}

export interface TrendClassification {
  direction: TrendDirection;
  delta: number | null;
  percent_change: number | null;
}

export interface TrendOptions {
  higherIsBetter?: boolean;
  flatPercentThreshold?: number;
}

export function buildCompositeWindows(range: DateRange): CompositeWindows {
  const currentStart = startOfUtcDay(parseDateInput(range.from));
  const currentEnd = startOfUtcDay(parseDateInput(range.to));
  if (currentEnd < currentStart) {
    throw new Error("Date range end must be on or after start");
  }

  const currentDays = daysInclusive(currentStart, currentEnd);
  const baselineEnd = addDays(currentStart, -1);
  const baselineStart = addDays(baselineEnd, -(currentDays - 1));

  return {
    current: toDateRange(currentStart, currentEnd),
    baseline: toDateRange(baselineStart, baselineEnd),
    acute7d: trailingWindow(currentEnd, 7),
    chronic28d: trailingWindow(currentEnd, 28),
    longTrend12w: trailingWindow(currentEnd, 84),
  };
}

export function classifyTrend(
  current: number | null,
  baseline: number | null,
  options: TrendOptions = {},
): TrendClassification {
  if (
    current === null ||
    baseline === null ||
    !Number.isFinite(current) ||
    !Number.isFinite(baseline)
  ) {
    return { direction: "insufficient_data", delta: null, percent_change: null };
  }

  const delta = current - baseline;
  const percentChange = baseline === 0 ? null : delta / Math.abs(baseline);
  if (percentChange === null) {
    return { direction: delta === 0 ? "flat" : "insufficient_data", delta, percent_change: null };
  }

  const threshold = options.flatPercentThreshold ?? 0.03;
  if (Math.abs(percentChange) < threshold) {
    return { direction: "flat", delta, percent_change: percentChange };
  }

  const higherIsBetter = options.higherIsBetter ?? true;
  const improved = higherIsBetter ? delta > 0 : delta < 0;
  return {
    direction: improved ? "improving" : "declining",
    delta,
    percent_change: percentChange,
  };
}

function trailingWindow(end: Date, days: number): DateRange {
  return toDateRange(addDays(end, -(days - 1)), end);
}

function parseDateInput(value: string): Date {
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00.000Z`)
    : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date input: ${value}`);
  }
  return parsed;
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function daysInclusive(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY) + 1;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

function toDateRange(from: Date, to: Date): DateRange {
  return { from: toIsoDate(from), to: toIsoDate(to) };
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
