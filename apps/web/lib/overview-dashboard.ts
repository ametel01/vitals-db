import type { LineSeries } from "@/components/charts/LineChart";
import type { FetchResult } from "@/lib/api";
import { deriveWeeklyActivity } from "@/lib/api";
import type { ActivityPoint, RecoveryFlag, WorkoutSummary } from "@vitals/core";

export type Tone = "good" | "bad" | "neutral" | "warning";

export interface MetricDisplay {
  value: string;
  average: string;
  delta: string;
  deltaTone: Tone;
  series: LineSeries;
  xAxisType?: "time" | "category";
}

export function buildMetricFromPoints<T extends { day: string }>(params: {
  points: T[];
  value: (point: T) => number;
  label: string;
  unit: string;
  color: string;
  decimals: number;
  avgDecimals: number;
  lowerIsBetter?: boolean;
  deltaOverride?: number | null | undefined;
}): MetricDisplay {
  return buildMetricFromDailyValues({
    points: dailyValuePoints(params.points, params.value),
    label: params.label,
    unit: params.unit,
    color: params.color,
    decimals: params.decimals,
    avgDecimals: params.avgDecimals,
    lowerIsBetter: params.lowerIsBetter ?? false,
    deltaOverride: params.deltaOverride,
  });
}

export function buildMetricFromDailyValues({
  points,
  label,
  unit,
  color,
  decimals,
  avgDecimals,
  lowerIsBetter = false,
  deltaOverride,
  xAxisType = "time",
}: {
  points: Array<{ day: string; value: number }>;
  label: string;
  unit: string;
  color: string;
  decimals: number;
  avgDecimals: number;
  lowerIsBetter?: boolean;
  deltaOverride?: number | null | undefined;
  xAxisType?: "time" | "category" | undefined;
}): MetricDisplay {
  if (points.length === 0) {
    return {
      value: "—",
      average: "—",
      delta: "—",
      deltaTone: "neutral",
      series: { name: label, color, data: [] },
      xAxisType,
    };
  }

  const latest = points.at(-1);
  if (latest === undefined) {
    return {
      value: "—",
      average: "—",
      delta: "—",
      deltaTone: "neutral",
      series: { name: label, color, data: [] },
      xAxisType,
    };
  }
  const average = points.reduce((sum, point) => sum + point.value, 0) / points.length;
  const delta = deltaOverride ?? latest.value - average;
  const tone =
    delta === 0
      ? "neutral"
      : lowerIsBetter
        ? delta < 0
          ? "good"
          : "bad"
        : delta > 0
          ? "good"
          : "bad";

  return {
    value: formatValue(latest.value, unit, decimals),
    average: formatValue(average, unit, avgDecimals),
    delta: formatDelta(delta, unit, decimals),
    deltaTone: tone,
    series: makeSeries(label, points, color, xAxisType),
    xAxisType,
  };
}

function dailyValuePoints<T extends { day: string }>(
  points: T[],
  value: (point: T) => number,
): Array<{ day: string; value: number }> {
  return points.map((point) => ({ day: point.day, value: value(point) }));
}

export function makeSeries(
  name: string,
  points: Array<{ day: string; value: number }>,
  color: string,
  xAxisType: "time" | "category" = "time",
): LineSeries {
  return {
    name,
    color,
    data: points.map((point) => [
      xAxisType === "time" ? `${point.day}T00:00:00Z` : point.day,
      point.value,
    ]),
  };
}

export function metricSummary(values: number[], unit: string, decimals: number): string {
  const latest = values.at(-1);
  if (latest === undefined) return "—";
  return formatValue(latest, unit, decimals);
}

function formatValue(value: number, unit: string, decimals: number): string {
  const formatted = value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return unit.length === 0 ? formatted : `${formatted} ${unit}`;
}

export function formatDelta(value: number, unit: string, decimals: number): string {
  const sign = value > 0 ? "+" : "";
  const formatted = `${sign}${value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
  return unit.length === 0 ? formatted : `${formatted} ${unit}`;
}

export function flagTone(flag: RecoveryFlag["flag"]): "success" | "warning" | "danger" {
  if (flag === "green") return "success";
  if (flag === "yellow") return "warning";
  return "danger";
}

export function statusFromDelta(
  delta: number | null,
  lowerIsBetter: boolean,
  goodLabel: string,
  badLabel: string,
): { label: string; tone: Tone } {
  if (delta === null) return { label: "Insufficient data", tone: "neutral" };
  if (Math.abs(delta) < 0.1) return { label: "Balanced", tone: "neutral" };
  const isGood = lowerIsBetter ? delta < 0 : delta > 0;
  return { label: isGood ? goodLabel : badLabel, tone: isGood ? "good" : "warning" };
}

export function sleepStatusFromFlag(flag: RecoveryFlag): { label: string; tone: Tone } {
  if (flag.sleep_hours_per_day === null) return { label: "Unknown", tone: "neutral" };
  if (flag.sleep_hours_per_day >= 7) return { label: "Consistent", tone: "good" };
  if (flag.sleep_hours_per_day >= 6) return { label: "Fair", tone: "warning" };
  return { label: "Short", tone: "bad" };
}

export function loadStatusFromFlag(flag: RecoveryFlag): { label: string; tone: Tone } {
  const ratio = flag.acute_chronic_load_ratio;
  if (ratio === null) return { label: "Unknown", tone: "neutral" };
  if (ratio >= 0.8 && ratio <= 1.3) return { label: "Optimal", tone: "good" };
  if (ratio > 1.3 && ratio <= 1.6) return { label: "Elevated", tone: "warning" };
  return { label: "Watch", tone: "bad" };
}

export function scoreLabel(flag: RecoveryFlag): string {
  if (flag.flag === "green") return "Good";
  if (flag.flag === "yellow") return "Watch";
  return "Reduce";
}

export function resolveWeeklyActivity(
  activity: FetchResult<ActivityPoint[]>,
  workouts: FetchResult<WorkoutSummary[]>,
): FetchResult<ActivityPoint[]> {
  if (activity.ok) return { ok: true, data: activity.data };
  if (workouts.ok) return { ok: true, data: deriveWeeklyActivity(workouts.data) };
  return { ok: false, status: activity.status, message: activity.message };
}

export function activityBreakdown(workouts: WorkoutSummary[]): Array<{
  type: string;
  durationSec: number;
  ratio: number;
}> {
  const totals = new Map<string, number>();
  for (const workout of workouts) {
    totals.set(workout.type, (totals.get(workout.type) ?? 0) + workout.duration_sec);
  }
  const totalDuration = Array.from(totals.values()).reduce((sum, duration) => sum + duration, 0);
  if (totalDuration <= 0) return [];
  return Array.from(totals.entries())
    .map(([type, durationSec]) => ({ type, durationSec, ratio: durationSec / totalDuration }))
    .sort((a, b) => b.durationSec - a.durationSec)
    .slice(0, 4);
}

export function compactDateLabel(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function formatWorkoutType(type: string): string {
  return type
    .replace(/^HKWorkoutActivityType/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .trim();
}

export function lastOf<T>(items: T[]): T | undefined {
  return items[items.length - 1];
}
