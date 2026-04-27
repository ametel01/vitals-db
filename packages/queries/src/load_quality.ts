import { type CompositeResult, CompositeResultSchema } from "@vitals/core";
import type { Db } from "@vitals/db";
import { buildCompositeWindows } from "./composite_windows";
import type { DateRange } from "./dates";
import { getWorkoutEfficiency } from "./efficiency";
import { getLoadForRange } from "./load";
import { listWorkouts } from "./workouts";
import { getZones } from "./zones";

interface LoadQualityInputs {
  loadRatio: number | null;
  z2Ratio: number | null;
  avgDecoupling: number | null;
  runCount: number;
  avgDurationSec: number | null;
}

export async function getLoadQuality(db: Db, range: DateRange): Promise<CompositeResult> {
  const windows = buildCompositeWindows(range);
  const [currentLoad, chronicLoad, zones, workouts, avgDecoupling] = await Promise.all([
    totalLoad(db, windows.current),
    totalLoad(db, windows.chronic28d),
    getZones(db, windows.current),
    listWorkouts(db, { from: windows.current.from, to: windows.current.to }),
    averageDecoupling(db, windows.current),
  ]);
  const chronicWeeklyLoad = chronicLoad === null ? null : chronicLoad / 4;
  const loadRatio =
    currentLoad === null || chronicWeeklyLoad === null || chronicWeeklyLoad === 0
      ? null
      : currentLoad / chronicWeeklyLoad;
  const runWorkouts = workouts.filter((workout) => workout.type === "Running");
  const avgDurationSec = average(runWorkouts.map((workout) => workout.duration_sec));
  const inputs = {
    loadRatio,
    z2Ratio: zones.z2_ratio,
    avgDecoupling,
    runCount: runWorkouts.length,
    avgDurationSec,
  };
  const quality = classifyLoadQuality(inputs);
  const sampleQuality = loadSampleQuality(inputs);

  return CompositeResultSchema.parse({
    answer: `Load quality signals suggest ${quality}`,
    evidence: [
      {
        label: "Acute:chronic load",
        value: loadRatio === null ? null : Number(loadRatio.toFixed(2)),
        detail: "Current load compared with the 28-day weekly load baseline.",
      },
      {
        label: "Z2 share",
        value: formatRatio(zones.z2_ratio),
        detail: "Share of heart-rate samples that stayed in the aerobic Z2 band.",
      },
      {
        label: "Decoupling",
        value: formatPercent(avgDecoupling),
        detail: "Average first-hour efficiency drop across current-window running workouts.",
      },
      {
        label: "Run consistency",
        value: runWorkouts.length,
        detail: `Average running duration ${formatDuration(avgDurationSec)} in the current window.`,
      },
    ],
    action: actionForQuality(quality),
    confidence: sampleQuality === "high" ? "high" : sampleQuality === "mixed" ? "medium" : "low",
    sample_quality: sampleQuality,
    claim_strength: "suggests",
  });
}

function classifyLoadQuality(inputs: LoadQualityInputs): string {
  if (inputs.loadRatio === null || inputs.z2Ratio === null) return "unclear";
  if (
    inputs.loadRatio > 1.3 ||
    (inputs.z2Ratio < 0.45 && inputs.avgDecoupling !== null && inputs.avgDecoupling >= 6)
  ) {
    return "high-strain low-quality";
  }
  if (inputs.z2Ratio < 0.45) return "junk intensity";
  if (inputs.z2Ratio >= 0.6 && (inputs.avgDecoupling === null || inputs.avgDecoupling < 6)) {
    return "productive aerobic";
  }
  return "mixed";
}

function actionForQuality(quality: string): CompositeResult["action"] {
  if (quality === "productive aerobic") {
    return {
      kind: "maintain",
      recommendation: "Maintain volume and keep easy sessions controlled.",
    };
  }
  if (quality === "junk intensity") {
    return {
      kind: "run_easier",
      recommendation: "Shift more load into controlled aerobic work before adding intensity.",
    };
  }
  if (quality === "high-strain low-quality") {
    return {
      kind: "reduce_intensity",
      recommendation: "Reduce volume or intensity until load quality improves.",
    };
  }
  return {
    kind: "watch",
    recommendation: "Collect more well-sampled runs before changing the plan.",
  };
}

function loadSampleQuality(inputs: LoadQualityInputs): CompositeResult["sample_quality"] {
  if (inputs.loadRatio === null || inputs.z2Ratio === null || inputs.runCount === 0) return "poor";
  if (inputs.avgDecoupling === null || inputs.runCount < 2) return "mixed";
  return "high";
}

async function averageDecoupling(db: Db, range: DateRange): Promise<number | null> {
  const workouts = await listWorkouts(db, { type: "Running", from: range.from, to: range.to });
  const efficiencies = await Promise.all(
    workouts.map((workout) => getWorkoutEfficiency(db, workout.id)),
  );
  return average(
    efficiencies
      .map((efficiency) => efficiency?.decoupling.decoupling_pct ?? null)
      .filter((value): value is number => value !== null),
  );
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

function formatRatio(value: number | null): string | null {
  if (value === null) return null;
  return `${Math.round(value * 100)}%`;
}

function formatPercent(value: number | null): string | null {
  if (value === null) return null;
  return `${value.toFixed(1)}%`;
}

function formatDuration(value: number | null): string {
  if (value === null) return "unknown";
  return `${Math.round(value / 60)} min`;
}
