import type { LineSeries } from "@/components/charts/LineChart";
import type { FetchResult } from "@/lib/api";
import { formatDuration, formatIsoDate, formatNumber, formatPercentValue } from "@/lib/format";
import { buildPerformanceMechanicsRows } from "@/lib/performance-mechanics";
import type {
  AdvancedCompositeReport,
  CompositeResult,
  HRVPoint,
  LoadRow,
  RestingHRRollingPoint,
  RunningDynamicsPoint,
  VO2MaxPoint,
  WorkoutDetail,
  WorkoutEfficiency,
  WorkoutEvent,
  WorkoutMetadata,
  WorkoutPerformanceRunRow,
  WorkoutRecoveryRow,
  WorkoutRoute,
  WorkoutStat,
  ZoneTimeDistributionRow,
} from "@vitals/core";
import type { CSSProperties } from "react";

export type Tone = "success" | "warning" | "danger" | "neutral";
export type Accent = "lime" | "coral" | "violet" | "ice" | "amber" | "chlorophyll";

export interface PerformanceRunRow {
  workout: WorkoutPerformanceRunRow["workout"];
  detail: FetchResult<WorkoutDetail>;
  efficiency: FetchResult<WorkoutEfficiency>;
  stats: FetchResult<WorkoutStat[]>;
  events: FetchResult<WorkoutEvent[]>;
  metadata: FetchResult<WorkoutMetadata[]>;
  routes: FetchResult<WorkoutRoute[]>;
}

export interface InsightCardModel {
  title: string;
  answer: string;
  meta: string;
  status: string;
  tone: Tone;
  accent: Accent;
  visual: "line" | "bars" | "flags";
  values: number[];
  footer: string;
}

export interface MetricSparklineModel {
  title: string;
  value: string;
  unit: string;
  sub: string;
  tip: string;
  accent: Accent;
  series: LineSeries[];
}

export interface BenchmarkRow {
  id: string;
  date: string;
  workout: string;
  duration: string;
  distance: string;
  avgHr: string;
  drift: string;
  load: string;
  loadClass: string;
  tone: Tone;
}

export interface GuidanceModel {
  changed: string;
  meaning: string;
  actions: string[];
  footer: string;
}

export interface DashboardModel {
  dateRangeLabel: string;
  forecast: {
    label: string;
    recommendation: string;
    tone: Tone;
    values: number[];
  };
  insightCards: InsightCardModel[];
  metricCards: MetricSparklineModel[];
  primaryTrendSeries: LineSeries[];
  primaryInsight: string;
  driftSummary: { avg: number | null; count: number; series: LineSeries[] };
  decouplingSummary: { avg: number | null; count: number; series: LineSeries[] };
  cardiacFlags: { count: number; series: LineSeries[] };
  mechanics: Array<{ label: string; value: string; series: number[] }>;
  zoneShare: { z2Ratio: number | null; totalDuration: number; rows: ZoneBarRow[] };
  overlap: { value: number | null; series: LineSeries[] };
  benchmarkRows: BenchmarkRow[];
  guidance: GuidanceModel;
}

export interface ZoneBarRow {
  zone: string;
  ratio: number;
  minutes: number;
}

export interface BuildDashboardModelInput {
  chartFrom: string;
  to: string;
  reportResult: FetchResult<AdvancedCompositeReport>;
  rollingResult: FetchResult<RestingHRRollingPoint[]>;
  vo2Result: FetchResult<VO2MaxPoint[]>;
  hrvResult: FetchResult<HRVPoint[]>;
  dynamicsResult: FetchResult<RunningDynamicsPoint[]>;
  loadResult: FetchResult<LoadRow[]>;
  zoneTimeResult: FetchResult<ZoneTimeDistributionRow[]>;
  recoveryTimesResult: FetchResult<WorkoutRecoveryRow[]>;
  performanceRunsResult: FetchResult<WorkoutPerformanceRunRow[]>;
  chartWindowDays: number;
}

const EMPTY_VALUE = "—";

function okResult<T>(data: T): FetchResult<T> {
  return { ok: true, data };
}

export function toPerformanceRunRow(row: WorkoutPerformanceRunRow): PerformanceRunRow {
  return {
    workout: row.workout,
    detail: okResult(row.detail),
    efficiency: okResult(row.efficiency),
    stats: okResult(row.stats),
    events: okResult(row.events),
    metadata: okResult(row.metadata),
    routes: okResult(row.routes),
  };
}

export function buildDashboardModel(input: BuildDashboardModelInput): DashboardModel {
  const {
    chartFrom,
    to,
    reportResult,
    rollingResult,
    vo2Result,
    hrvResult,
    dynamicsResult,
    loadResult,
    zoneTimeResult,
    recoveryTimesResult,
    performanceRunsResult,
    chartWindowDays,
  } = input;

  const runRows = performanceRunsResult.ok
    ? performanceRunsResult.data.map(toPerformanceRunRow)
    : [];

  const primaryTrendSeries = [
    lineSeries(vo2Result, "VO2 Max", "avg_vo2max", "#D8FF3D"),
    lineSeries(rollingResult, "Resting HR", "avg_rhr_7d", "#FF6B4A", 1),
    lineSeries(hrvResult, "HRV", "avg_hrv", "#BFA6FF", 2),
    loadSeries(loadResult),
  ].filter(isSeries);

  const driftSummary = runMetricSummary(runRows, "HR drift", "#D8FF3D", (row) =>
    row.detail.ok ? row.detail.data.drift_pct : null,
  );
  const decouplingSummary = runMetricSummary(runRows, "Decoupling", "#D8FF3D", (row) =>
    row.efficiency.ok ? row.efficiency.data.decoupling.decoupling_pct : null,
  );
  const cardiacFlags = buildCardiacFlags(runRows);

  return {
    dateRangeLabel: `${formatDateShort(chartFrom)} - ${formatDateShort(to)}`,
    forecast: buildForecast(reportResult),
    insightCards: buildInsightCards(reportResult),
    metricCards: buildMetricCards({
      vo2Result,
      rollingResult,
      hrvResult,
      loadResult,
      chartWindowDays,
    }),
    primaryTrendSeries,
    primaryInsight: buildPrimaryInsight(reportResult, loadResult, hrvResult, rollingResult),
    driftSummary,
    decouplingSummary,
    cardiacFlags,
    mechanics: buildMechanics(dynamicsResult),
    zoneShare: buildZoneShare(zoneTimeResult),
    overlap: buildRecoveryOverlap(loadResult, recoveryTimesResult),
    benchmarkRows: buildBenchmarkRows(runRows),
    guidance: buildGuidance(reportResult, driftSummary.avg, decouplingSummary.avg),
  };
}

export function buildForecast(
  result: FetchResult<AdvancedCompositeReport>,
): DashboardModel["forecast"] {
  if (!result.ok) {
    return {
      label: "Next week intensity",
      recommendation: "Report unavailable.",
      tone: "warning",
      values: [14, 18, 16, 22, 19, 28, 30, 26, 24, 25],
    };
  }
  const action = result.data.next_week_recommendation;
  return {
    label: "Next week intensity",
    recommendation: action.recommendation.replace(/^Next week:\s*/i, ""),
    tone: actionTone(action.kind),
    values:
      action.kind === "push"
        ? [12, 15, 18, 22, 26, 24, 29, 35, 38, 34]
        : [32, 30, 24, 26, 22, 21, 18, 20, 17, 16],
  };
}

export function buildInsightCards(
  result: FetchResult<AdvancedCompositeReport>,
): InsightCardModel[] {
  const fallbackTitles = ["Fitness direction", "Load quality", "Recovery debt", "Workout flags"];
  if (!result.ok) {
    return fallbackTitles.map((title, index) => ({
      title,
      answer: "Signal unavailable.",
      meta: "report offline",
      status: "loading",
      tone: "warning",
      accent: insightAccent(index),
      visual: index === 1 ? "bars" : index === 3 ? "flags" : "line",
      values: generatedVisualValues(index),
      footer: "Awaiting samples",
    }));
  }

  return result.data.sections.map((section, index) => {
    const evidence = section.result.evidence.find((item) => item.value !== null);
    return {
      title: insightTitle(section),
      answer: section.result.answer,
      meta:
        evidence === undefined
          ? section.result.claim_strength.replaceAll("_", " ")
          : String(evidence.value),
      status: section.result.confidence,
      tone: tagTone(section.result.confidence),
      accent: insightAccent(index),
      visual: index === 1 ? "bars" : index === 3 ? "flags" : "line",
      values: generatedVisualValues(index),
      footer: `${sampleLabel(section.result.sample_quality)} · ${section.result.claim_strength.replaceAll("_", " ")}`,
    };
  });
}

export function buildMetricCards({
  vo2Result,
  rollingResult,
  hrvResult,
  loadResult,
  chartWindowDays,
}: {
  vo2Result: FetchResult<VO2MaxPoint[]>;
  rollingResult: FetchResult<RestingHRRollingPoint[]>;
  hrvResult: FetchResult<HRVPoint[]>;
  loadResult: FetchResult<LoadRow[]>;
  chartWindowDays: number;
}): MetricSparklineModel[] {
  return [
    {
      title: "VO2 Max",
      value: latestMetric(vo2Result, "avg_vo2max", (value) => formatNumber(value, 1)),
      unit: "mL/kg/min",
      sub: trendText(vo2Result, "avg_vo2max", "vs first point"),
      tip: "Apple Health cardio fitness readings averaged by UTC day.",
      accent: "lime",
      series: [lineSeries(vo2Result, "VO2 Max", "avg_vo2max", "#D8FF3D")].filter(isSeries),
    },
    {
      title: "Resting HR",
      value: latestMetric(rollingResult, "avg_rhr_7d", (value) => formatNumber(value, 1)),
      unit: "bpm",
      sub: `${chartWindowDays}-day rolling view`,
      tip: "7-day rolling resting heart rate. Lower is usually better only when recovery and training context agree.",
      accent: "coral",
      series: [lineSeries(rollingResult, "Resting HR", "avg_rhr_7d", "#FF6B4A")].filter(isSeries),
    },
    {
      title: "HRV",
      value: latestMetric(hrvResult, "avg_hrv", (value) => formatNumber(value, 1)),
      unit: "ms",
      sub: trendText(hrvResult, "avg_hrv", "vs first point"),
      tip: "Daily average SDNN HRV from Apple Health.",
      accent: "violet",
      series: [lineSeries(hrvResult, "HRV", "avg_hrv", "#BFA6FF")].filter(isSeries),
    },
    {
      title: "Training Load",
      value: loadResult.ok ? formatNumber(sumLoad(loadResult.data), 0) : EMPTY_VALUE,
      unit: "",
      sub: loadResult.ok ? `${loadResult.data.length} loaded workouts` : "Unavailable",
      tip: "Workout duration multiplied by average HR for workouts with HR coverage.",
      accent: "ice",
      series: [loadSeries(loadResult)].filter(isSeries),
    },
  ];
}

export function buildPrimaryInsight(
  reportResult: FetchResult<AdvancedCompositeReport>,
  loadResult: FetchResult<LoadRow[]>,
  hrvResult: FetchResult<HRVPoint[]>,
  rollingResult: FetchResult<RestingHRRollingPoint[]>,
): string {
  if (reportResult.ok) {
    return reportResult.data.next_week_recommendation.recommendation;
  }
  const loadDelta = numericDelta(loadResult, "load");
  const hrvDelta = numericDelta(hrvResult, "avg_hrv");
  const rhrDelta = numericDelta(rollingResult, "avg_rhr_7d");
  if (loadDelta !== null && hrvDelta !== null && rhrDelta !== null) {
    return `Training load moved ${formatSigned(loadDelta)} while HRV moved ${formatSigned(hrvDelta)} and resting HR moved ${formatSigned(rhrDelta)}.`;
  }
  return "Collect more recent samples to connect fitness, recovery, and load into one interpretation.";
}

export function buildCardiacFlags(rows: PerformanceRunRow[]): {
  count: number;
  series: LineSeries[];
} {
  const data: Array<[string, number]> = [];
  let count = 0;
  for (const row of chronologicalRows(rows)) {
    const drift = row.detail.ok ? row.detail.data.drift_pct : null;
    if (drift !== null && Number.isFinite(drift)) {
      data.push([row.workout.start_ts, drift]);
      if (drift > 8) count += 1;
    }
  }
  return {
    count,
    series: data.length === 0 ? [] : [{ name: "Drift", color: "#FF6B4A", data }],
  };
}

export function buildMechanics(
  result: FetchResult<RunningDynamicsPoint[]>,
): DashboardModel["mechanics"] {
  return result.ok ? buildPerformanceMechanicsRows(result.data) : [];
}

export function buildZoneShare(
  result: FetchResult<ZoneTimeDistributionRow[]>,
): DashboardModel["zoneShare"] {
  if (!result.ok) return { z2Ratio: null, totalDuration: 0, rows: [] };
  const totalDuration = result.data.reduce((sum, row) => sum + row.duration_sec, 0);
  const z2 = result.data.find((row) => row.zone === "Z2") ?? null;
  return {
    z2Ratio: z2?.ratio ?? null,
    totalDuration,
    rows: result.data.map((row) => ({
      zone: row.zone,
      ratio: row.ratio,
      minutes: row.duration_sec / 60,
    })),
  };
}

export function buildRecoveryOverlap(
  loadResult: FetchResult<LoadRow[]>,
  recoveryResult: FetchResult<WorkoutRecoveryRow[]>,
): DashboardModel["overlap"] {
  if (!loadResult.ok || !recoveryResult.ok) return { value: null, series: [] };
  const loadByWorkout = new Map(loadResult.data.map((row) => [row.workout_id, row.load] as const));
  const data: Array<[string, number]> = [];
  for (const recovery of recoveryResult.data) {
    const load = loadByWorkout.get(recovery.workout_id) ?? null;
    if (
      load === null ||
      recovery.recovery_duration_sec === null ||
      recovery.recovery_duration_sec <= 0
    ) {
      continue;
    }
    data.push([recovery.start_ts, load / recovery.recovery_duration_sec / 10]);
  }
  const value = data.length === 0 ? null : average(data.map((item) => item[1]));
  return {
    value,
    series: data.length === 0 ? [] : [{ name: "Overlap", color: "#D8FF3D", data }],
  };
}

export function buildBenchmarkRows(rows: PerformanceRunRow[]): BenchmarkRow[] {
  return rows.slice(0, 5).map((row) => {
    const drift = row.detail.ok ? row.detail.data.drift_pct : null;
    const load = row.detail.ok ? row.detail.data.load : null;
    return {
      id: row.workout.id,
      date: shortDate(row.workout.start_ts),
      workout: classifyRun(row),
      duration: formatDuration(row.workout.duration_sec),
      distance: formatWorkoutStat(row, "HKQuantityTypeIdentifierDistanceWalkingRunning"),
      avgHr: formatWorkoutStat(row, "HKQuantityTypeIdentifierHeartRate", "average"),
      drift: drift === null ? EMPTY_VALUE : formatPercentValue(drift, 1),
      load: load === null ? EMPTY_VALUE : formatNumber(load / 1000, 0),
      loadClass: loadClass(load),
      tone: drift !== null && drift > 8 ? "danger" : "success",
    };
  });
}

export function buildGuidance(
  result: FetchResult<AdvancedCompositeReport>,
  driftAvg: number | null,
  decouplingAvg: number | null,
): GuidanceModel {
  if (!result.ok) {
    return {
      changed: "The report is unavailable.",
      meaning:
        "The dashboard can still show raw trends, but coaching guidance needs the composite report.",
      actions: ["Review source samples", "Re-run the report once the API is reachable"],
      footer: "Re-evaluate after the report endpoint recovers.",
    };
  }
  const sections = result.data.sections;
  const fitness = sectionByKey(sections, "fitness_direction");
  const recovery = sectionByKey(sections, "recovery_state");
  const load = sectionByKey(sections, "easy_run_quality");
  const actions = [
    result.data.next_week_recommendation.recommendation.replace(/^Next week:\s*/i, ""),
    driftAvg !== null && driftAvg > 8
      ? "Keep the next comparable run easier and watch whether drift improves."
      : "Keep one repeatable aerobic benchmark in the next 10-12 days.",
    decouplingAvg !== null && decouplingAvg > 5
      ? "Prioritize Zone 2 and easy recovery runs until decoupling settles."
      : "Maintain current easy-run quality and avoid adding intensity too quickly.",
  ];

  return {
    changed: fitness?.result.answer ?? "Fitness direction needs more samples.",
    meaning:
      recovery?.result.answer ??
      load?.result.answer ??
      "Recovery and load signals are still forming.",
    actions,
    footer: "Re-evaluate after your next 10-12 training days.",
  };
}

export function sectionByKey(
  sections: Array<{ key: string } & { result: CompositeResult }>,
  key: string,
): { result: CompositeResult } | null {
  return (
    (sections.find((section) => section.key === key) as { result: CompositeResult } | undefined) ??
    null
  );
}

export function insightTitle(section: { key: string }): string {
  const titles: Record<string, string> = {
    fitness_direction: "Fitness direction",
    easy_run_quality: "Load quality",
    recovery_state: "Recovery debt",
    workout_diagnoses: "Workout flags",
  };
  return titles[section.key] ?? "Workout flags";
}

export function lineSeries<T extends { day?: string; week?: string }, K extends keyof T>(
  result: FetchResult<T[]>,
  name: string,
  key: K,
  color: string,
  yAxisIndex = 0,
): LineSeries | null {
  if (!result.ok) return null;
  const data: Array<[string, number]> = [];
  for (const point of result.data) {
    const date = point.day ?? point.week;
    const value = point[key];
    if (typeof date === "string" && typeof value === "number" && Number.isFinite(value)) {
      data.push([`${date}T00:00:00Z`, value]);
    }
  }
  return data.length === 0 ? null : { name, color, data, yAxisIndex };
}

export function loadSeries(result: FetchResult<LoadRow[]>, yAxisIndex = 0): LineSeries | null {
  if (!result.ok) return null;
  const data: Array<[string, number]> = [];
  for (const row of result.data) {
    if (row.start_ts.length > 0 && row.load !== null && Number.isFinite(row.load)) {
      data.push([row.start_ts, row.load]);
    }
  }
  return data.length === 0 ? null : { name: "Training Load", color: "#3E9BFF", data, yAxisIndex };
}

export function hrAtPaceSeries(
  result: FetchResult<Array<{ start_ts: string; avg_hr: number | null }>>,
): LineSeries | null {
  if (!result.ok) return null;
  const data: Array<[string, number]> = [];
  for (const row of result.data) {
    if (row.avg_hr !== null && Number.isFinite(row.avg_hr)) {
      data.push([row.start_ts, row.avg_hr]);
    }
  }
  return data.length === 0 ? null : { name: "HR @ 9:00/km", color: "#D8FF3D", data };
}

export function isSeries(series: LineSeries | null): series is LineSeries {
  return series !== null;
}

export function hasRows<T>(result: FetchResult<T[]>): boolean {
  return result.ok && result.data.length > 0;
}

export function hasPaceRows(result: FetchResult<{ avg_hr: number | null }[]>): boolean {
  return result.ok && result.data.some((row) => row.avg_hr !== null);
}

export function latestMetric<T extends object, K extends keyof T>(
  result: FetchResult<T[]>,
  key: K,
  formatter: (value: number) => string,
): string {
  if (!result.ok || result.data.length === 0) return EMPTY_VALUE;
  const latest = result.data[result.data.length - 1];
  const value = latest?.[key];
  return typeof value === "number" && Number.isFinite(value) ? formatter(value) : EMPTY_VALUE;
}

export function trendText<T extends object, K extends keyof T>(
  result: FetchResult<T[]>,
  key: K,
  suffix: string,
): string {
  const delta = numericDelta(result, key);
  if (delta === null) return "Trend unavailable";
  return `${formatSigned(delta)} ${suffix}`;
}

function numericDelta<T extends object, K extends keyof T>(
  result: FetchResult<T[]>,
  key: K,
): number | null {
  if (!result.ok || result.data.length < 2) return null;
  const firstValue = result.data[0]?.[key];
  const lastValue = result.data[result.data.length - 1]?.[key];
  if (
    typeof firstValue !== "number" ||
    typeof lastValue !== "number" ||
    !Number.isFinite(firstValue) ||
    !Number.isFinite(lastValue)
  ) {
    return null;
  }
  return lastValue - firstValue;
}

export function runMetricSummary(
  rows: PerformanceRunRow[],
  name: string,
  color: string,
  value: (row: PerformanceRunRow) => number | null,
): { avg: number | null; count: number; series: LineSeries[] } {
  const data: Array<[string, number]> = [];
  const values: number[] = [];
  for (const row of chronologicalRows(rows)) {
    const metric = value(row);
    if (metric !== null && Number.isFinite(metric)) {
      values.push(metric);
      data.push([row.workout.start_ts, metric]);
    }
  }
  return {
    avg: values.length === 0 ? null : average(values),
    count: values.length,
    series: data.length === 0 ? [] : [{ name, color, data }],
  };
}

export function formatRunMetricCoverage(count: number): string {
  if (count === 0) return "No qualifying runs";
  if (count === 1) return "1 qualifying run";
  return `${count} qualifying runs`;
}

export function formatNullablePercent(value: number | null): string {
  return value === null ? EMPTY_VALUE : formatPercentValue(value, 1);
}

export function formatNullableNumber(value: number | null, fractionDigits: number): string {
  return value === null ? EMPTY_VALUE : formatNumber(value, fractionDigits);
}

export function thresholdTone(
  value: number | null,
  threshold: number,
  highTone: Tone,
  lowTone: Tone,
): Tone {
  return value !== null && value > threshold ? highTone : lowTone;
}

export function sumLoad(rows: LoadRow[]): number {
  return rows.reduce((sum, row) => sum + (row.load ?? 0), 0);
}

export function getStat(row: PerformanceRunRow, type: string): WorkoutStat | null {
  if (!row.stats.ok) return null;
  return row.stats.data.find((stat) => stat.type === type) ?? null;
}

export function formatWorkoutStat(
  row: PerformanceRunRow,
  type: string,
  field: "average" | "sum" = "sum",
): string {
  const stat = getStat(row, type);
  if (stat === null) return EMPTY_VALUE;
  const value = stat[field];
  if (value === null || !Number.isFinite(value)) return EMPTY_VALUE;
  if (type === "HKQuantityTypeIdentifierHeartRate") return `${formatNumber(value, 0)} bpm`;
  if (type === "HKQuantityTypeIdentifierRunningPower") return `${formatNumber(value, 0)} W`;
  if (type === "HKQuantityTypeIdentifierDistanceWalkingRunning") {
    return stat.unit === "km"
      ? `${formatNumber(value, 2)} km`
      : `${formatNumber(value, 1)} ${stat.unit ?? ""}`.trim();
  }
  return stat.unit === null ? formatNumber(value, 1) : `${formatNumber(value, 1)} ${stat.unit}`;
}

export function classifyRun(row: PerformanceRunRow): string {
  const duration = row.workout.duration_sec;
  const drift = row.detail.ok ? row.detail.data.drift_pct : null;
  const z2 = row.detail.ok ? row.detail.data.z2_ratio : null;
  const avgHr = statNumber(row, "HKQuantityTypeIdentifierHeartRate", "average");
  if (drift !== null && drift > 10) return "Threshold Intervals";
  if (duration >= 5400) return "Long Run";
  if (z2 !== null && z2 >= 0.5) return "Zone 2 Run";
  if (avgHr !== null && avgHr >= 150) return "Tempo Run";
  return "Easy Run";
}

export function statNumber(
  row: PerformanceRunRow,
  type: string,
  field: "average" | "sum",
): number | null {
  const stat = getStat(row, type);
  const value = stat?.[field] ?? null;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function loadClass(load: number | null): string {
  if (load === null) return "No data";
  if (load >= 350_000) return "High";
  if (load >= 180_000) return "Medium";
  return "Low";
}

export function actionTone(kind: CompositeResult["action"]["kind"]): Tone {
  if (kind === "reduce_intensity" || kind === "run_easier") return "danger";
  if (kind === "add_sleep" || kind === "retest" || kind === "watch") return "warning";
  if (kind === "push") return "success";
  return "neutral";
}

export function tagTone(confidence: CompositeResult["confidence"]): Tone {
  if (confidence === "high") return "success";
  if (confidence === "medium") return "warning";
  return "danger";
}

export function sampleLabel(sampleQuality: CompositeResult["sample_quality"]): string {
  if (sampleQuality === "high") return "high sample";
  if (sampleQuality === "mixed") return "mixed sample";
  return "poor sample";
}

export function insightAccent(index: number): Accent {
  const accents: Accent[] = ["lime", "chlorophyll", "amber", "coral"];
  return accents[index] ?? "lime";
}

export function generatedVisualValues(index: number): number[] {
  const values = [
    [31, 29, 35, 33, 39, 36, 38, 34, 35, 32, 31, 33, 32, 31],
    [12, 22, 28, 34, 38, 20, 16, 28, 30, 36, 42, 39, 44, 41],
    [24, 32, 28, 25, 24, 22, 23, 21, 20, 17, 18, 19, 30, 28],
    [10, 22, 15, 26, 12, 30, 18, 8, 35, 20, 28, 32, 18, 24],
  ];
  return values[index] ?? values[0] ?? [];
}

export function sparklinePoints(values: number[]): string {
  if (values.length === 0) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values
    .map((value, index) => {
      const x = values.length === 1 ? 60 : (index / (values.length - 1)) * 118 + 1;
      const y = 39 - ((value - min) / span) * 34;
      return `${formatNumber(x, 2)},${formatNumber(y, 2)}`;
    })
    .join(" ");
}

export function barStyle(value: number): CSSProperties {
  const height = Math.max(10, Math.min(100, value * 100));
  return { "--bar-height": `${height}%` } as CSSProperties;
}

export function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function formatSigned(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatNumber(value, 1)}`;
}

export function formatDateShort(isoDate: string): string {
  return formatIsoDate(isoDate).replace(/, \d{4}$/, "");
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function chronologicalRows(rows: PerformanceRunRow[]): PerformanceRunRow[] {
  return rows.toSorted(
    (left, right) => Date.parse(left.workout.start_ts) - Date.parse(right.workout.start_ts),
  );
}
