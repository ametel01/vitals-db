import { type CompositeResult, CompositeResultSchema } from "@vitals/core";
import type { Db } from "@vitals/db";
import { buildCompositeWindows, classifyTrend } from "./composite_windows";
import type { DateRange } from "./dates";
import { getHRVDaily } from "./hrv";
import { getLoadForRange } from "./load";
import { getRestingHRDaily } from "./resting_hr";
import { getSleepSummary } from "./sleep";

export async function getReadinessScore(db: Db, range: DateRange): Promise<CompositeResult> {
  const windows = buildCompositeWindows(range);
  const [
    currentRhr,
    baselineRhr,
    currentHrv,
    baselineHrv,
    currentSleep,
    currentLoad,
    baselineLoad,
  ] = await Promise.all([
    averageRestingHR(db, windows.current),
    averageRestingHR(db, windows.baseline),
    averageHRV(db, windows.current),
    averageHRV(db, windows.baseline),
    getSleepSummary(db, windows.current),
    totalLoad(db, windows.current),
    totalLoad(db, windows.baseline),
  ]);

  const rhrTrend = classifyTrend(currentRhr, baselineRhr, { higherIsBetter: false });
  const hrvTrend = classifyTrend(currentHrv, baselineHrv, { higherIsBetter: true });
  const loadTrend = classifyTrend(currentLoad, baselineLoad, { higherIsBetter: false });
  const sleepHoursPerDay = currentSleep.total_hours / rangeDays(windows.current);
  const sleepPoor =
    sleepHoursPerDay < 7 || (currentSleep.efficiency !== null && currentSleep.efficiency < 0.85);

  const score =
    signalScore(rhrTrend.direction, "declining") +
    signalScore(hrvTrend.direction, "declining") +
    (sleepPoor ? 1 : sleepHoursPerDay >= 8 ? -1 : 0) +
    signalScore(loadTrend.direction, "declining");
  const state = score >= 2 ? "Strained" : score <= -1 ? "Fresh" : "Normal";
  const sampleQuality = readinessSampleQuality(currentRhr, baselineRhr, currentHrv, baselineHrv);

  return CompositeResultSchema.parse({
    answer: `Readiness signals suggest ${state}`,
    evidence: [
      {
        label: "Resting HR",
        value: formatTrend(currentRhr, baselineRhr, " bpm"),
        detail: "Lower resting HR versus baseline supports readiness; elevation suggests strain.",
      },
      {
        label: "HRV",
        value: formatTrend(currentHrv, baselineHrv, " ms"),
        detail: "Higher HRV versus baseline supports readiness; suppression suggests strain.",
      },
      {
        label: "Sleep",
        value: `${sleepHoursPerDay.toFixed(1)} h/night`,
        detail: `Efficiency ${formatRatio(currentSleep.efficiency)} across the current window.`,
      },
      {
        label: "Training load",
        value: formatTrend(currentLoad, baselineLoad, ""),
        detail: "Current-window load compared with the matched baseline window.",
      },
    ],
    action: readinessAction(state),
    confidence: sampleQuality === "high" ? "high" : sampleQuality === "mixed" ? "medium" : "low",
    sample_quality: sampleQuality,
    claim_strength: "suggests",
  });
}

function readinessSampleQuality(
  currentRhr: number | null,
  baselineRhr: number | null,
  currentHrv: number | null,
  baselineHrv: number | null,
): CompositeResult["sample_quality"] {
  if (currentRhr === null || currentHrv === null) return "poor";
  if (baselineRhr === null || baselineHrv === null) return "mixed";
  return "high";
}

function readinessAction(state: string): CompositeResult["action"] {
  if (state === "Fresh") {
    return {
      kind: "push",
      recommendation: "A normal planned workout is reasonable if legs feel good.",
    };
  }
  if (state === "Strained") {
    return {
      kind: "reduce_intensity",
      recommendation: "Keep intensity low until recovery signals normalize.",
    };
  }
  return {
    kind: "maintain",
    recommendation: "Stay with the planned workload and monitor recovery.",
  };
}

async function averageRestingHR(db: Db, range: DateRange): Promise<number | null> {
  return average((await getRestingHRDaily(db, range)).map((row) => row.avg_rhr));
}

async function averageHRV(db: Db, range: DateRange): Promise<number | null> {
  return average((await getHRVDaily(db, range)).map((row) => row.avg_hrv));
}

async function totalLoad(db: Db, range: DateRange): Promise<number | null> {
  const values = (await getLoadForRange(db, range))
    .map((row) => row.load)
    .filter((value): value is number => value !== null);
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0);
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function signalScore(direction: string, badDirection: string): number {
  if (direction === "insufficient_data" || direction === "flat") return 0;
  return direction === badDirection ? 1 : -1;
}

function rangeDays(range: DateRange): number {
  const from = Date.parse(`${range.from}T00:00:00.000Z`);
  const to = Date.parse(`${range.to}T00:00:00.000Z`);
  return Math.round((to - from) / (24 * 60 * 60 * 1000)) + 1;
}

function formatTrend(current: number | null, baseline: number | null, unit: string): string | null {
  if (current === null || baseline === null) return null;
  const delta = current - baseline;
  return `${delta > 0 ? "+" : ""}${delta.toFixed(1)}${unit}`;
}

function formatRatio(value: number | null): string {
  if (value === null) return "unknown";
  return `${Math.round(value * 100)}%`;
}
