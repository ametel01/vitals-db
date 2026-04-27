import { type CompositeResult, CompositeResultSchema } from "@vitals/core";
import type { Db } from "@vitals/db";
import { type TrendDirection, buildCompositeWindows, classifyTrend } from "./composite_windows";
import type { DateRange } from "./dates";
import { getHRVDaily } from "./hrv";
import { getLoadForRange } from "./load";
import { getRestingHRDaily } from "./resting_hr";

export async function getTrainingStrainVsRecovery(
  db: Db,
  range: DateRange,
): Promise<CompositeResult> {
  const windows = buildCompositeWindows(range);
  const [acuteLoad, chronicLoad, currentRhr, baselineRhr, currentHrv, baselineHrv] =
    await Promise.all([
      totalLoad(db, windows.acute7d),
      totalLoad(db, windows.chronic28d),
      averageRestingHR(db, windows.acute7d),
      averageRestingHR(db, windows.baseline),
      averageHRV(db, windows.acute7d),
      averageHRV(db, windows.baseline),
    ]);

  const chronicWeeklyLoad = chronicLoad === null ? null : chronicLoad / 4;
  const loadRatio =
    acuteLoad === null || chronicWeeklyLoad === null || chronicWeeklyLoad === 0
      ? null
      : acuteLoad / chronicWeeklyLoad;
  const rhrTrend = classifyTrend(currentRhr, baselineRhr, { higherIsBetter: false });
  const hrvTrend = classifyTrend(currentHrv, baselineHrv, { higherIsBetter: true });
  const recoveryPenalty =
    recoverySignalPenalty(rhrTrend.direction) + recoverySignalPenalty(hrvTrend.direction);
  const state = classifyStrain(loadRatio, recoveryPenalty);
  const sampleQuality = strainSampleQuality(
    loadRatio,
    currentRhr,
    baselineRhr,
    currentHrv,
    baselineHrv,
  );

  return CompositeResultSchema.parse({
    answer: `Training stress is ${state}`,
    evidence: [
      {
        label: "Acute:chronic load",
        value: loadRatio === null ? null : Number(loadRatio.toFixed(2)),
        detail: "Seven-day load compared with the athlete's 28-day weekly load baseline.",
      },
      {
        label: "Recovery penalty",
        value: recoveryPenalty,
        detail: "Penalty points from elevated resting HR and suppressed HRV versus baseline.",
      },
      {
        label: "Resting HR",
        value: formatTrend(currentRhr, baselineRhr, " bpm"),
        detail: "Higher resting HR than baseline increases the recovery penalty.",
      },
      {
        label: "HRV",
        value: formatTrend(currentHrv, baselineHrv, " ms"),
        detail: "Lower HRV than baseline increases the recovery penalty.",
      },
    ],
    action: strainAction(state),
    confidence: sampleQuality === "high" ? "high" : sampleQuality === "mixed" ? "medium" : "low",
    sample_quality: sampleQuality,
    claim_strength: "suggests",
  });
}

function classifyStrain(loadRatio: number | null, recoveryPenalty: number): string {
  if (loadRatio === null) return "unclear";
  if (loadRatio > 1.3 || recoveryPenalty >= 2 || (loadRatio > 1.1 && recoveryPenalty >= 1)) {
    return "excessive";
  }
  if (loadRatio >= 0.8 && loadRatio <= 1.3 && recoveryPenalty === 0) {
    return "productive";
  }
  return "moderate";
}

function strainAction(state: string): CompositeResult["action"] {
  if (state === "productive") {
    return {
      kind: "push",
      recommendation: "A normal training week is reasonable if workout execution stays controlled.",
    };
  }
  if (state === "excessive") {
    return {
      kind: "reduce_intensity",
      recommendation: "Reduce intensity or volume until load and recovery signals settle.",
    };
  }
  return {
    kind: "maintain",
    recommendation:
      "Maintain training load and avoid adding intensity until the signal is clearer.",
  };
}

function strainSampleQuality(
  loadRatio: number | null,
  currentRhr: number | null,
  baselineRhr: number | null,
  currentHrv: number | null,
  baselineHrv: number | null,
): CompositeResult["sample_quality"] {
  if (loadRatio === null) return "poor";
  if (currentRhr === null || baselineRhr === null || currentHrv === null || baselineHrv === null) {
    return "mixed";
  }
  return "high";
}

function recoverySignalPenalty(direction: TrendDirection): number {
  return direction === "declining" ? 1 : 0;
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

function formatTrend(current: number | null, baseline: number | null, unit: string): string | null {
  if (current === null || baseline === null) return null;
  const delta = current - baseline;
  return `${delta > 0 ? "+" : ""}${delta.toFixed(1)}${unit}`;
}
