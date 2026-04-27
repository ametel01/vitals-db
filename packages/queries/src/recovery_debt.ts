import { type CompositeResult, CompositeResultSchema } from "@vitals/core";
import type { Db } from "@vitals/db";
import { buildCompositeWindows, classifyTrend } from "./composite_windows";
import type { DateRange } from "./dates";
import { getHRVDaily } from "./hrv";
import { getLoadForRange } from "./load";
import { getRestingHRDaily } from "./resting_hr";
import { getSleepSummary } from "./sleep";

const TARGET_SLEEP_HOURS_PER_NIGHT = 8;

export async function getRecoveryDebt(db: Db, range: DateRange): Promise<CompositeResult> {
  const windows = buildCompositeWindows(range);
  const [sleep, currentRhr, baselineRhr, currentHrv, baselineHrv, acuteLoad, chronicLoad] =
    await Promise.all([
      getSleepSummary(db, windows.acute7d),
      averageRestingHR(db, windows.acute7d),
      averageRestingHR(db, windows.baseline),
      averageHRV(db, windows.acute7d),
      averageHRV(db, windows.baseline),
      totalLoad(db, windows.acute7d),
      totalLoad(db, windows.chronic28d),
    ]);
  const sleepDebtHours = Math.max(
    0,
    TARGET_SLEEP_HOURS_PER_NIGHT * rangeDays(windows.acute7d) - sleep.total_hours,
  );
  const rhrDelta = delta(currentRhr, baselineRhr);
  const hrvDelta = delta(currentHrv, baselineHrv);
  const loadRatio = weeklyLoadRatio(acuteLoad, chronicLoad);
  const debtScore =
    sleepDebtHours +
    Math.max(0, rhrDelta ?? 0) / 2 +
    Math.max(0, -(hrvDelta ?? 0)) / 5 +
    Math.max(0, (loadRatio ?? 1) - 1) * 4;
  const fatigueSignals = countFatigueSignals(sleepDebtHours, rhrDelta, hrvDelta, loadRatio);
  const state = classifyDebt(debtScore, fatigueSignals);
  const sampleQuality = recoveryDebtSampleQuality(currentRhr, baselineRhr, currentHrv, baselineHrv);

  return CompositeResultSchema.parse({
    answer: `Recovery debt is ${state}`,
    evidence: [
      {
        label: "Debt score",
        value: Number(debtScore.toFixed(1)),
        detail: "Seven-day rolling score from sleep deficit, recovery markers, and recent load.",
      },
      {
        label: "Sleep deficit",
        value: `${sleepDebtHours.toFixed(1)} h`,
        detail: `Measured against ${TARGET_SLEEP_HOURS_PER_NIGHT} h/night over the last 7 days.`,
      },
      {
        label: "Recovery markers",
        value: formatRecoveryMarkers(rhrDelta, hrvDelta),
        detail: "Resting HR above baseline and HRV below baseline increase recovery debt.",
      },
      {
        label: "Training load",
        value: loadRatio === null ? null : Number(loadRatio.toFixed(2)),
        detail: "Seven-day load compared with the 28-day weekly load baseline.",
      },
    ],
    action: actionForDebt(state),
    confidence: sampleQuality === "high" ? "high" : sampleQuality === "mixed" ? "medium" : "low",
    sample_quality: sampleQuality,
    claim_strength: "suggests",
  });
}

function classifyDebt(score: number, fatigueSignals: number): string {
  if (score >= 7 && fatigueSignals >= 2) return "accumulating";
  if (score >= 3 && fatigueSignals <= 1) return "short-term dip";
  if (score >= 3) return "moderate";
  return "low";
}

function weeklyLoadRatio(acuteLoad: number | null, chronicLoad: number | null): number | null {
  const chronicWeeklyLoad = chronicLoad === null ? null : chronicLoad / 4;
  if (acuteLoad === null || chronicWeeklyLoad === null || chronicWeeklyLoad === 0) return null;
  return acuteLoad / chronicWeeklyLoad;
}

function countFatigueSignals(
  sleepDebtHours: number,
  rhrDelta: number | null,
  hrvDelta: number | null,
  loadRatio: number | null,
): number {
  return [
    sleepDebtHours >= 4,
    (rhrDelta ?? 0) >= 3,
    (hrvDelta ?? 0) <= -8,
    (loadRatio ?? 0) >= 1.2,
  ].filter(Boolean).length;
}

function actionForDebt(state: string): CompositeResult["action"] {
  if (state === "accumulating") {
    return {
      kind: "reduce_intensity",
      recommendation: "Reduce intensity or volume until multiple recovery signals normalize.",
    };
  }
  if (state === "short-term dip") {
    return {
      kind: "add_sleep",
      recommendation: "Prioritize sleep and keep the next hard session optional.",
    };
  }
  if (state === "moderate") {
    return {
      kind: "run_easier",
      recommendation: "Keep the next workout easy and watch whether debt continues to build.",
    };
  }
  return {
    kind: "maintain",
    recommendation: "Maintain the plan while monitoring sleep and recovery markers.",
  };
}

function recoveryDebtSampleQuality(
  currentRhr: number | null,
  baselineRhr: number | null,
  currentHrv: number | null,
  baselineHrv: number | null,
): CompositeResult["sample_quality"] {
  if (currentRhr === null && currentHrv === null) return "poor";
  if (baselineRhr === null || baselineHrv === null) return "mixed";
  return "high";
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

function delta(current: number | null, baseline: number | null): number | null {
  const trend = classifyTrend(current, baseline);
  return trend.delta;
}

function formatRecoveryMarkers(rhrDelta: number | null, hrvDelta: number | null): string | null {
  if (rhrDelta === null && hrvDelta === null) return null;
  const rhr = rhrDelta === null ? "RHR unknown" : `RHR ${formatSigned(rhrDelta)} bpm`;
  const hrv = hrvDelta === null ? "HRV unknown" : `HRV ${formatSigned(hrvDelta)} ms`;
  return `${rhr}, ${hrv}`;
}

function formatSigned(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}`;
}

function rangeDays(range: DateRange): number {
  const from = Date.parse(`${range.from}T00:00:00.000Z`);
  const to = Date.parse(`${range.to}T00:00:00.000Z`);
  return Math.round((to - from) / (24 * 60 * 60 * 1000)) + 1;
}
