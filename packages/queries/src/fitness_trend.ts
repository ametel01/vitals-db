import { type CompositeResult, CompositeResultSchema } from "@vitals/core";
import type { Db } from "@vitals/db";
import { type TrendDirection, buildCompositeWindows, classifyTrend } from "./composite_windows";
import type { DateRange } from "./dates";
import { getWorkoutEfficiency } from "./efficiency";
import { getPowerDaily } from "./power";
import { getRestingHRDaily } from "./resting_hr";
import { getVO2MaxDaily } from "./vo2max";
import { listWorkouts } from "./workouts";

interface FitnessInputs {
  vo2: TrendDirection;
  pace: TrendDirection;
  power: TrendDirection;
  restingHr: TrendDirection;
}

interface EfficiencyAverages {
  paceSecPerKm: number | null;
  workoutCount: number;
}

export async function getFitnessTrend(db: Db, range: DateRange): Promise<CompositeResult> {
  const windows = buildCompositeWindows(range);
  const [
    currentVo2,
    baselineVo2,
    currentEfficiency,
    baselineEfficiency,
    currentPower,
    baselinePower,
    currentRhr,
    baselineRhr,
  ] = await Promise.all([
    averageVO2(db, windows.current),
    averageVO2(db, windows.baseline),
    getEfficiencyAverages(db, windows.current),
    getEfficiencyAverages(db, windows.baseline),
    averagePower(db, windows.current),
    averagePower(db, windows.baseline),
    averageRestingHR(db, windows.current),
    averageRestingHR(db, windows.baseline),
  ]);
  const vo2Trend = classifyTrend(currentVo2, baselineVo2, { higherIsBetter: true });
  const paceTrend = classifyTrend(currentEfficiency.paceSecPerKm, baselineEfficiency.paceSecPerKm, {
    higherIsBetter: false,
    flatPercentThreshold: 0.02,
  });
  const powerTrend = classifyTrend(currentPower, baselinePower, { higherIsBetter: true });
  const rhrTrend = classifyTrend(currentRhr, baselineRhr, { higherIsBetter: false });
  const inputs = {
    vo2: vo2Trend.direction,
    pace: paceTrend.direction,
    power: powerTrend.direction,
    restingHr: rhrTrend.direction,
  };
  const trend = classifyFitnessTrend(inputs);
  const vo2Support = classifyVo2Support(inputs);
  const sampleQuality = fitnessSampleQuality(
    currentVo2,
    baselineVo2,
    currentEfficiency,
    baselineEfficiency,
  );

  return CompositeResultSchema.parse({
    answer: `Fitness trend is ${trend}; VO2 Max ${vo2Support}`,
    evidence: [
      {
        label: "VO2 Max",
        value: formatTrend(vo2Trend.delta, ""),
        detail: `Current average ${formatNumber(currentVo2)} vs baseline ${formatNumber(
          baselineVo2,
        )}.`,
      },
      {
        label: "Fixed-HR pace",
        value: formatPaceDelta(paceTrend.delta),
        detail: `Current average ${formatPace(
          currentEfficiency.paceSecPerKm,
        )} vs baseline ${formatPace(baselineEfficiency.paceSecPerKm)}.`,
      },
      {
        label: "Power",
        value: formatTrend(powerTrend.delta, " W"),
        detail: `Current average ${formatNumber(currentPower)} W vs baseline ${formatNumber(
          baselinePower,
        )} W.`,
      },
      {
        label: "Resting HR",
        value: formatTrend(rhrTrend.delta, " bpm"),
        detail: `Current average ${formatNumber(currentRhr)} bpm vs baseline ${formatNumber(
          baselineRhr,
        )} bpm.`,
      },
    ],
    action: actionForTrend(trend, vo2Support),
    confidence: sampleQuality === "high" ? "high" : sampleQuality === "mixed" ? "medium" : "low",
    sample_quality: sampleQuality,
    claim_strength: trend === "Unclear" ? "worth_watching" : "suggests",
  });
}

function classifyFitnessTrend(inputs: FitnessInputs): string {
  const score =
    trendScore(inputs.vo2) +
    trendScore(inputs.pace) +
    trendScore(inputs.power) +
    trendScore(inputs.restingHr);
  if (score >= 2) return "Improving";
  if (score <= -2) return "Declining";
  if (Object.values(inputs).every((direction) => direction === "insufficient_data"))
    return "Unclear";
  return "Flat";
}

function classifyVo2Support(inputs: FitnessInputs): string {
  if (inputs.vo2 !== "improving") return "is not leading the trend";
  if (
    inputs.pace === "improving" ||
    inputs.power === "improving" ||
    inputs.restingHr === "improving"
  ) {
    return "is supported by workout efficiency";
  }
  return "looks isolated from workout efficiency";
}

function actionForTrend(trend: string, vo2Support: string): CompositeResult["action"] {
  if (trend === "Improving" && vo2Support === "is supported by workout efficiency") {
    return {
      kind: "maintain",
      recommendation: "Keep the current aerobic workload and avoid forcing extra intensity.",
    };
  }
  if (trend === "Declining") {
    return {
      kind: "run_easier",
      recommendation: "Reduce easy-run intensity and watch whether efficiency rebounds.",
    };
  }
  if (vo2Support === "looks isolated from workout efficiency") {
    return {
      kind: "watch",
      recommendation: "Treat VO2 Max as provisional until pace, power, or resting HR confirms it.",
    };
  }
  return {
    kind: "maintain",
    recommendation: "Hold the current workload until the fitness signals align.",
  };
}

function fitnessSampleQuality(
  currentVo2: number | null,
  baselineVo2: number | null,
  currentEfficiency: EfficiencyAverages,
  baselineEfficiency: EfficiencyAverages,
): CompositeResult["sample_quality"] {
  if (currentVo2 === null && currentEfficiency.paceSecPerKm === null) return "poor";
  if (baselineVo2 === null || baselineEfficiency.paceSecPerKm === null) return "mixed";
  if (currentEfficiency.workoutCount < 2 || baselineEfficiency.workoutCount < 2) return "mixed";
  return "high";
}

async function getEfficiencyAverages(db: Db, range: DateRange): Promise<EfficiencyAverages> {
  const workouts = await listWorkouts(db, { type: "Running", from: range.from, to: range.to });
  const efficiencies = await Promise.all(
    workouts.map((workout) => getWorkoutEfficiency(db, workout.id)),
  );
  const paces = efficiencies
    .map((efficiency) => efficiency?.pace_at_hr.pace_sec_per_km ?? null)
    .filter((value): value is number => value !== null);
  return {
    paceSecPerKm: average(paces),
    workoutCount: paces.length,
  };
}

async function averageVO2(db: Db, range: DateRange): Promise<number | null> {
  return average((await getVO2MaxDaily(db, range)).map((row) => row.avg_vo2max));
}

async function averagePower(db: Db, range: DateRange): Promise<number | null> {
  return average((await getPowerDaily(db, range)).map((row) => row.avg_power));
}

async function averageRestingHR(db: Db, range: DateRange): Promise<number | null> {
  return average((await getRestingHRDaily(db, range)).map((row) => row.avg_rhr));
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function trendScore(direction: TrendDirection): number {
  if (direction === "improving") return 1;
  if (direction === "declining") return -1;
  return 0;
}

function formatTrend(value: number | null, unit: string): string | null {
  if (value === null) return null;
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}${unit}`;
}

function formatPaceDelta(value: number | null): string | null {
  if (value === null) return null;
  return `${value > 0 ? "+" : ""}${Math.round(value)} sec/km`;
}

function formatPace(value: number | null): string {
  if (value === null) return "unknown";
  const minutes = Math.floor(value / 60);
  const seconds = Math.round(value % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}/km`;
}

function formatNumber(value: number | null): string {
  if (value === null) return "unknown";
  return value.toFixed(1);
}
