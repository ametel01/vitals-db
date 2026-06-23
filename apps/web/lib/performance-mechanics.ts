import type { RunningDynamicsPoint } from "@vitals/core";
import { formatNumber } from "./format";

export interface PerformanceMechanicsRow {
  label: string;
  value: string;
  series: number[];
}

const EMPTY_VALUE = "—";

export function buildPerformanceMechanicsRows(
  rows: RunningDynamicsPoint[],
): PerformanceMechanicsRow[] {
  return [
    mechanicsRow(
      rows,
      "Ground contact time",
      "avg_ground_contact_time_ms",
      (value) => `${formatNumber(value, 0)} ms`,
    ),
    mechanicsRow(
      rows,
      "Stride length",
      "avg_stride_length_m",
      (value) => `${formatNumber(value, 2)} m`,
    ),
    mechanicsRow(
      rows,
      "Vert. oscillation",
      "avg_vertical_oscillation_cm",
      (value) => `${formatNumber(value, 1)} cm`,
    ),
  ].filter((row) => row.series.length > 0);
}

function mechanicsRow<K extends keyof RunningDynamicsPoint>(
  rows: Array<Record<K, number | null>>,
  label: string,
  key: K,
  format: (value: number) => string,
): PerformanceMechanicsRow {
  const series = rows
    .map((row) => row[key])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const latest = series[series.length - 1];

  return {
    label,
    value: latest === undefined ? EMPTY_VALUE : format(latest),
    series,
  };
}
