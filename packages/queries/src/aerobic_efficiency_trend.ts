import { type CompositeResult, CompositeResultSchema } from "@vitals/core";
import type { Db } from "@vitals/db";
import { buildCompositeWindows, classifyTrend } from "./composite_windows";
import type { DateRange } from "./dates";
import { getWorkoutEfficiency } from "./efficiency";
import { getRestingHRDaily } from "./resting_hr";
import { listWorkouts } from "./workouts";
import { getZones } from "./zones";

interface EfficiencyAverages {
  paceSecPerKm: number | null;
  decouplingPct: number | null;
  workoutCount: number;
}

export async function getAerobicEfficiencyTrend(
  db: Db,
  range: DateRange,
): Promise<CompositeResult> {
  const windows = buildCompositeWindows(range);
  const current = await getEfficiencyAverages(db, windows.current);
  const baseline = await getEfficiencyAverages(db, windows.baseline);
  const paceTrend = classifyTrend(current.paceSecPerKm, baseline.paceSecPerKm, {
    higherIsBetter: false,
    flatPercentThreshold: 0.02,
  });
  const currentZones = await getZones(db, windows.current);
  const currentRhr = await averageRestingHR(db, windows.current);
  const baselineRhr = await averageRestingHR(db, windows.baseline);
  const rhrTrend = classifyTrend(currentRhr, baselineRhr, { higherIsBetter: false });

  const answer = answerForTrend(paceTrend.direction);
  const sampleQuality =
    current.paceSecPerKm === null || baseline.paceSecPerKm === null
      ? "poor"
      : current.workoutCount < 2 || baseline.workoutCount < 2
        ? "mixed"
        : "high";
  const confidence =
    sampleQuality === "high" ? "high" : sampleQuality === "mixed" ? "medium" : "low";

  return CompositeResultSchema.parse({
    answer,
    evidence: [
      {
        label: "Fixed-HR pace",
        value: formatPaceDelta(paceTrend.delta),
        detail: `Current average ${formatPace(current.paceSecPerKm)} vs baseline ${formatPace(
          baseline.paceSecPerKm,
        )}.`,
      },
      {
        label: "Decoupling",
        value: formatPercent(current.decouplingPct),
        detail: "Average first-hour efficiency drop across current-window runs.",
      },
      {
        label: "Z2 share",
        value: formatRatio(currentZones.z2_ratio),
        detail: "Share of heart-rate samples in Z2 during the current window.",
      },
      {
        label: "Resting HR",
        value: formatTrend(rhrTrend.delta, " bpm"),
        detail: `Current average ${formatNumber(currentRhr)} bpm vs baseline ${formatNumber(
          baselineRhr,
        )} bpm.`,
      },
    ],
    action: actionForTrend(paceTrend.direction),
    confidence,
    sample_quality: sampleQuality,
    claim_strength: paceTrend.direction === "insufficient_data" ? "worth_watching" : "suggests",
  });
}

async function getEfficiencyAverages(db: Db, range: DateRange): Promise<EfficiencyAverages> {
  const workouts = await listWorkouts(db, { type: "Running", from: range.from, to: range.to });
  const efficiencies = await Promise.all(
    workouts.map((workout) => getWorkoutEfficiency(db, workout.id)),
  );
  return {
    paceSecPerKm: average(
      efficiencies
        .map((efficiency) => efficiency?.pace_at_hr.pace_sec_per_km ?? null)
        .filter((value): value is number => value !== null),
    ),
    decouplingPct: average(
      efficiencies
        .map((efficiency) => efficiency?.decoupling.decoupling_pct ?? null)
        .filter((value): value is number => value !== null),
    ),
    workoutCount: efficiencies.filter(
      (efficiency) => efficiency?.pace_at_hr.pace_sec_per_km !== null,
    ).length,
  };
}

async function averageRestingHR(db: Db, range: DateRange): Promise<number | null> {
  const rows = await getRestingHRDaily(db, range);
  return average(rows.map((row) => row.avg_rhr));
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function answerForTrend(direction: string): string {
  if (direction === "improving") return "Aerobic efficiency suggests improvement";
  if (direction === "declining") return "Aerobic efficiency suggests regression";
  if (direction === "flat") return "Aerobic efficiency looks flat";
  return "Aerobic efficiency needs more aligned run data";
}

function actionForTrend(direction: string): CompositeResult["action"] {
  if (direction === "improving") {
    return { kind: "maintain", recommendation: "Keep easy-run intensity controlled next week." };
  }
  if (direction === "declining") {
    return {
      kind: "run_easier",
      recommendation: "Reduce easy-run intensity until HR drift settles.",
    };
  }
  if (direction === "flat") {
    return {
      kind: "maintain",
      recommendation: "Hold the current aerobic workload and watch the trend.",
    };
  }
  return {
    kind: "retest",
    recommendation: "Collect more steady runs with aligned HR and speed samples.",
  };
}

function formatPace(value: number | null): string {
  if (value === null) return "unknown";
  const minutes = Math.floor(value / 60);
  const seconds = Math.round(value % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}/km`;
}

function formatPaceDelta(value: number | null): string | null {
  if (value === null) return null;
  return `${value > 0 ? "+" : ""}${Math.round(value)} sec/km`;
}

function formatPercent(value: number | null): string | null {
  if (value === null) return null;
  return `${value.toFixed(1)}%`;
}

function formatRatio(value: number | null): string | null {
  if (value === null) return null;
  return `${Math.round(value * 100)}%`;
}

function formatTrend(value: number | null, unit: string): string | null {
  if (value === null) return null;
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}${unit}`;
}

function formatNumber(value: number | null): string {
  if (value === null) return "unknown";
  return value.toFixed(1);
}
