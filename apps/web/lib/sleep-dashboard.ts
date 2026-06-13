import type { SleepNightDetail, SleepSegment } from "@vitals/core";

export type DeltaDirection = "up" | "down" | "flat" | "neutral";
export type SleepStageKey = "deep" | "core" | "rem" | "awake" | "unspecified" | "asleep";

export interface SleepDelta {
  value: number | null;
  direction: DeltaDirection;
  isPositive: boolean | null;
}

export interface SleepStageBreakdownItem {
  key: SleepStageKey;
  label: string;
  hours: number;
  percent: number;
}

export interface SleepScoreComponent {
  key: "duration" | "efficiency" | "consistency" | "awakenings" | "stageBalance";
  label: string;
  score: number;
  guidance: string;
}

export interface SleepScoreResult {
  value: number;
  label: "Excellent" | "Good" | "Fair" | "Needs attention";
  summary: string;
  components: SleepScoreComponent[];
  guidance: SleepScoreComponent[];
}

export interface SleepWindowSummary {
  nightsTracked: number;
  averageAsleepHours: number | null;
  averageInBedHours: number | null;
  averageEfficiency: number | null;
  averageAwakenings: number | null;
  bedtimeVariationMinutes: number | null;
  wakeVariationMinutes: number | null;
  averageBedtimeMinute: number | null;
  averageWakeMinute: number | null;
  bestNight: SleepNightDetail | null;
  stageCoverageCount: number;
  averageDeepHours: number | null;
  score: SleepScoreResult;
}

export interface SleepMetricComparisons {
  nightsTracked: SleepDelta;
  averageAsleepHours: SleepDelta;
  averageEfficiency: SleepDelta;
  sleepScore: SleepDelta;
  averageAwakenings: SleepDelta;
  averageDeepHours: SleepDelta;
  averageBedtimeMinutes: SleepDelta;
}

export interface SleepDashboardModel {
  current: SleepWindowSummary;
  prior: SleepWindowSummary;
  comparisons: SleepMetricComparisons;
}

export interface SleepLaneSegment {
  lane: "awake" | "rem" | "core" | "deep";
  label: string;
  startPercent: number;
  widthPercent: number;
  startTs: string;
  endTs: string;
}

export interface SleepInsight {
  key: "bedtime" | "awakenings" | "bestNight" | "deepSleep";
  label: string;
  value: string;
  detail: string;
  delta: SleepDelta | null;
}

const MINUTES_PER_DAY = 24 * 60;

export function buildSleepDashboardModel({
  currentNights,
  currentSegments,
  priorNights,
  priorSegments,
}: {
  currentNights: SleepNightDetail[];
  currentSegments: SleepSegment[];
  priorNights: SleepNightDetail[];
  priorSegments: SleepSegment[];
}): SleepDashboardModel {
  const current = summarizeSleepWindow(currentNights, currentSegments);
  const prior = summarizeSleepWindow(priorNights, priorSegments);
  return {
    current,
    prior,
    comparisons: compareSleepWindows(current, prior),
  };
}

export function summarizeSleepWindow(
  nights: SleepNightDetail[],
  segments: SleepSegment[] = [],
): SleepWindowSummary {
  const nightsNewestFirst = nights.toSorted((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
  const averageAsleepHours = average(nightsNewestFirst.map((night) => night.asleep_hours));
  const averageInBedHours = average(nightsNewestFirst.map((night) => night.in_bed_hours));
  const averageEfficiency = average(
    nightsNewestFirst.flatMap((night) => (night.efficiency === null ? [] : [night.efficiency])),
  );
  const awakenings = nightsNewestFirst.map((night) =>
    countAwakeningsForNight(segmentsForNight(segments, night.day)),
  );
  const bedtimeMinutes = nightsNewestFirst.map((night) => minuteOfDayUtc(night.bedtime));
  const wakeMinutes = nightsNewestFirst.map((night) => minuteOfDayUtc(night.wake_time));
  const stageCoverageCount = nightsNewestFirst.filter(hasStageDetail).length;
  const summaryBase = {
    nightsTracked: nightsNewestFirst.length,
    averageAsleepHours,
    averageInBedHours,
    averageEfficiency,
    averageAwakenings: nightsNewestFirst.length === 0 ? null : average(awakenings),
    bedtimeVariationMinutes: circularVariationMinutes(bedtimeMinutes),
    wakeVariationMinutes: circularVariationMinutes(wakeMinutes),
    averageBedtimeMinute: circularAverageMinute(bedtimeMinutes),
    averageWakeMinute: circularAverageMinute(wakeMinutes),
    bestNight: bestSleepNight(nightsNewestFirst),
    stageCoverageCount,
    averageDeepHours: average(
      nightsNewestFirst.flatMap((night) => (night.deep_hours === null ? [] : [night.deep_hours])),
    ),
  };
  return {
    ...summaryBase,
    score: scoreSleepWindow(summaryBase),
  };
}

export function compareSleepWindows(
  current: SleepWindowSummary,
  prior: SleepWindowSummary,
): SleepMetricComparisons {
  return {
    nightsTracked: compareMetric(current.nightsTracked, prior.nightsTracked, true),
    averageAsleepHours: compareMetric(current.averageAsleepHours, prior.averageAsleepHours, true),
    averageEfficiency: compareMetric(current.averageEfficiency, prior.averageEfficiency, true),
    sleepScore: compareMetric(current.score.value, prior.score.value, true),
    averageAwakenings: compareMetric(current.averageAwakenings, prior.averageAwakenings, false),
    averageDeepHours: compareMetric(current.averageDeepHours, prior.averageDeepHours, true),
    averageBedtimeMinutes: compareCircularMetric(
      current.averageBedtimeMinute,
      prior.averageBedtimeMinute,
      false,
    ),
  };
}

export function compareMetric(
  current: number | null,
  prior: number | null,
  higherIsPositive: boolean,
): SleepDelta {
  if (current === null || prior === null) {
    return { value: null, direction: "neutral", isPositive: null };
  }
  const value = current - prior;
  return {
    value,
    direction: directionFromDelta(value),
    isPositive: Math.abs(value) < 0.0001 ? null : higherIsPositive ? value > 0 : value < 0,
  };
}

export function stageBreakdownForNight(night: SleepNightDetail): SleepStageBreakdownItem[] {
  const rawItems = hasStageDetail(night)
    ? [
        stageItem("deep", "Deep", night.deep_hours ?? 0),
        stageItem("core", "Core", night.core_hours ?? 0),
        stageItem("rem", "REM", night.rem_hours ?? 0),
        stageItem("awake", "Awake", night.awake_hours),
        stageItem("unspecified", "Unspecified", night.unspecified_hours ?? 0),
      ]
    : [
        stageItem("asleep", "Asleep", night.asleep_hours),
        stageItem("awake", "Awake", night.awake_hours),
      ];
  return withPercentages(rawItems.filter((item) => item.hours > 0));
}

export function countAwakeningsForNight(segments: SleepSegment[]): number {
  return segments.filter((segment) => segment.state === "awake").length;
}

export function buildLaneSegments(
  night: SleepNightDetail,
  segments: SleepSegment[],
): SleepLaneSegment[] {
  const startMs = Date.parse(night.bedtime);
  const endMs = Date.parse(night.wake_time);
  const spanMs = Math.max(endMs - startMs, 1);
  return segments
    .map((segment): SleepLaneSegment | null => {
      const lane = segmentLane(segment);
      if (lane === null) return null;
      const segmentStart = Math.max(Date.parse(segment.start_ts), startMs);
      const segmentEnd = Math.min(Date.parse(segment.end_ts), endMs);
      if (segmentEnd <= segmentStart) return null;
      return {
        lane,
        label: laneLabel(lane),
        startPercent: clamp(((segmentStart - startMs) / spanMs) * 100, 0, 100),
        widthPercent: clamp(((segmentEnd - segmentStart) / spanMs) * 100, 0.8, 100),
        startTs: segment.start_ts,
        endTs: segment.end_ts,
      };
    })
    .filter((segment): segment is SleepLaneSegment => segment !== null);
}

export function buildSleepInsights(
  current: SleepWindowSummary,
  comparisons: SleepMetricComparisons,
): SleepInsight[] {
  return [
    {
      key: "bedtime",
      label: "Late bedtime drift",
      value:
        comparisons.averageBedtimeMinutes.value === null
          ? "Stable"
          : signedMinutes(comparisons.averageBedtimeMinutes.value),
      detail:
        comparisons.averageBedtimeMinutes.value !== null &&
        comparisons.averageBedtimeMinutes.value > 0
          ? "Your average bedtime is getting later. Aim for a steadier wind-down."
          : "Your average bedtime is holding steady across the window.",
      delta: comparisons.averageBedtimeMinutes,
    },
    {
      key: "awakenings",
      label: "Average awakenings",
      value:
        current.averageAwakenings === null
          ? "No data"
          : `${roundTo(current.averageAwakenings, 1)} / night`,
      detail:
        current.averageAwakenings !== null && current.averageAwakenings <= 1.5
          ? "Fewer awake segments are supporting deeper sleep continuity."
          : "Reducing overnight awake periods may improve recovery.",
      delta: comparisons.averageAwakenings,
    },
    {
      key: "bestNight",
      label: "Best recovery night",
      value: current.bestNight?.day ?? "No night",
      detail:
        current.bestNight === null
          ? "Track sleep to identify your strongest recovery pattern."
          : `${roundTo(current.bestNight.asleep_hours, 1)}h sleep with ${
              current.bestNight.efficiency === null
                ? "unknown efficiency"
                : `${Math.round(current.bestNight.efficiency * 100)}% efficiency`
            }.`,
      delta: null,
    },
    {
      key: "deepSleep",
      label: "Deep sleep trend",
      value:
        comparisons.averageDeepHours.value === null
          ? "No trend"
          : signedMinutes(comparisons.averageDeepHours.value * 60),
      detail:
        comparisons.averageDeepHours.value !== null && comparisons.averageDeepHours.value >= 0
          ? "Great job, your deep sleep is increasing."
          : "Deep-stage totals are lower than your prior window.",
      delta: comparisons.averageDeepHours,
    },
  ];
}

export function circularVariationMinutes(values: number[]): number | null {
  const center = circularAverageMinute(values);
  if (center === null) return null;
  return average(values.map((value) => circularDistanceMinutes(value, center)));
}

function scoreSleepWindow(summary: Omit<SleepWindowSummary, "score">): SleepScoreResult {
  const durationScore =
    summary.averageAsleepHours === null
      ? 0
      : 100 * (1 - clamp(Math.abs(summary.averageAsleepHours - 7.5) / 3, 0, 1));
  const efficiencyScore =
    summary.averageEfficiency === null ? 55 : 100 * clamp(summary.averageEfficiency / 0.9, 0, 1);
  const consistencyMinutes = averageNullable([
    summary.bedtimeVariationMinutes,
    summary.wakeVariationMinutes,
  ]);
  const consistencyScore =
    consistencyMinutes === null ? 55 : 100 * (1 - clamp(consistencyMinutes / 150, 0, 1));
  const awakeningScore =
    summary.averageAwakenings === null
      ? 60
      : 100 * (1 - clamp(summary.averageAwakenings / 4, 0, 1));
  const stageBalanceScore = scoreStageBalance(summary);
  const components: SleepScoreComponent[] = [
    {
      key: "duration",
      label: "Sleep duration",
      score: durationScore,
      guidance: "Aim for roughly seven and a half hours asleep.",
    },
    {
      key: "efficiency",
      label: "Sleep efficiency",
      score: efficiencyScore,
      guidance: "Keep time asleep above 85% of time in bed.",
    },
    {
      key: "consistency",
      label: "Sleep consistency",
      score: consistencyScore,
      guidance: "Keep bedtime and wake time inside a 30 minute window.",
    },
    {
      key: "awakenings",
      label: "Awakenings",
      score: awakeningScore,
      guidance: "Limit overnight awake segments.",
    },
    {
      key: "stageBalance",
      label: "Stage balance",
      score: stageBalanceScore,
      guidance: "Protect deep and REM sleep with a calmer wind-down.",
    },
  ];
  const value = clampInteger(
    durationScore * 0.3 +
      efficiencyScore * 0.25 +
      consistencyScore * 0.2 +
      awakeningScore * 0.15 +
      stageBalanceScore * 0.1,
    0,
    100,
  );
  return {
    value,
    label: scoreLabel(value),
    summary: scoreSummary(value),
    components,
    guidance: components.toSorted((a, b) => a.score - b.score).slice(0, 3),
  };
}

function scoreStageBalance(summary: Omit<SleepWindowSummary, "score">): number {
  if (summary.stageCoverageCount === 0 || summary.averageDeepHours === null) return 70;
  const deepScore = 100 * (1 - clamp(Math.abs(summary.averageDeepHours - 1.35) / 1.35, 0, 1));
  return clamp(deepScore, 35, 100);
}

function hasStageDetail(night: SleepNightDetail): boolean {
  return (
    night.core_hours !== null ||
    night.deep_hours !== null ||
    night.rem_hours !== null ||
    night.unspecified_hours !== null
  );
}

function bestSleepNight(nights: SleepNightDetail[]): SleepNightDetail | null {
  return (
    nights.toSorted((a, b) => {
      const scoreDiff = singleNightRank(b) - singleNightRank(a);
      if (Math.abs(scoreDiff) > 0.0001) return scoreDiff;
      return a.day < b.day ? 1 : a.day > b.day ? -1 : 0;
    })[0] ?? null
  );
}

function singleNightRank(night: SleepNightDetail): number {
  const efficiency = night.efficiency ?? 0.7;
  return night.asleep_hours + efficiency * 2 - night.awake_hours * 0.25;
}

function compareCircularMetric(
  current: number | null,
  prior: number | null,
  higherIsPositive: boolean,
): SleepDelta {
  if (current === null || prior === null) {
    return { value: null, direction: "neutral", isPositive: null };
  }
  const value = signedCircularDeltaMinutes(current, prior);
  return {
    value,
    direction: directionFromDelta(value),
    isPositive: Math.abs(value) < 0.0001 ? null : higherIsPositive ? value > 0 : value < 0,
  };
}

function directionFromDelta(value: number): DeltaDirection {
  if (Math.abs(value) < 0.0001) return "flat";
  return value > 0 ? "up" : "down";
}

function withPercentages(items: SleepStageBreakdownItem[]): SleepStageBreakdownItem[] {
  const total = items.reduce((sum, item) => sum + item.hours, 0);
  if (total <= 0) return [];
  return items.map((item) => ({ ...item, percent: item.hours / total }));
}

function stageItem(key: SleepStageKey, label: string, hours: number): SleepStageBreakdownItem {
  return { key, label, hours, percent: 0 };
}

function segmentsForNight(segments: SleepSegment[], night: string): SleepSegment[] {
  return segments.filter((segment) => segment.night === night);
}

function segmentLane(segment: SleepSegment): SleepLaneSegment["lane"] | null {
  if (segment.state === "awake") return "awake";
  switch (segment.stage) {
    case "rem":
      return "rem";
    case "deep":
      return "deep";
    case "core":
    case "unspecified":
      return "core";
    default:
      return null;
  }
}

function laneLabel(lane: SleepLaneSegment["lane"]): string {
  switch (lane) {
    case "awake":
      return "Awake";
    case "rem":
      return "REM";
    case "core":
      return "Core";
    case "deep":
      return "Deep";
  }
}

function circularAverageMinute(values: number[]): number | null {
  if (values.length === 0) return null;
  let sin = 0;
  let cos = 0;
  for (const value of values) {
    const angle = (normalizeMinute(value) / MINUTES_PER_DAY) * Math.PI * 2;
    sin += Math.sin(angle);
    cos += Math.cos(angle);
  }
  const angle = Math.atan2(sin / values.length, cos / values.length);
  const normalized = angle < 0 ? angle + Math.PI * 2 : angle;
  return (normalized / (Math.PI * 2)) * MINUTES_PER_DAY;
}

function circularDistanceMinutes(a: number, b: number): number {
  const diff = Math.abs(normalizeMinute(a) - normalizeMinute(b));
  return Math.min(diff, MINUTES_PER_DAY - diff);
}

function signedCircularDeltaMinutes(current: number, prior: number): number {
  const raw = normalizeMinute(current) - normalizeMinute(prior);
  if (raw > MINUTES_PER_DAY / 2) return raw - MINUTES_PER_DAY;
  if (raw < -MINUTES_PER_DAY / 2) return raw + MINUTES_PER_DAY;
  return raw;
}

function minuteOfDayUtc(iso: string): number {
  const date = new Date(iso);
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

function normalizeMinute(value: number): number {
  return ((value % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function averageNullable(values: Array<number | null>): number | null {
  return average(values.flatMap((value) => (value === null ? [] : [value])));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.round(clamp(value, min, max));
}

function scoreLabel(value: number): SleepScoreResult["label"] {
  if (value >= 85) return "Excellent";
  if (value >= 70) return "Good";
  if (value >= 55) return "Fair";
  return "Needs attention";
}

function scoreSummary(value: number): string {
  if (value >= 85) return "Your sleep quality is strong and consistent.";
  if (value >= 70) return "Your sleep quality is good, with a few clear tuning points.";
  if (value >= 55) return "Your sleep has useful recovery, but consistency can improve.";
  return "Your recent sleep is fragmented or short enough to deserve attention.";
}

function roundTo(value: number, digits: number): string {
  return value.toFixed(digits);
}

function signedMinutes(value: number): string {
  const rounded = Math.round(value);
  return `${rounded >= 0 ? "+" : ""}${rounded} min`;
}
