import { type CompositeResult, CompositeResultSchema } from "@vitals/core";
import type { Db } from "@vitals/db";
import { getWeeklyActivity } from "./activity";
import { buildCompositeWindows, classifyTrend } from "./composite_windows";
import type { DateRange } from "./dates";
import { getRestingHRDaily } from "./resting_hr";
import { getSleepSummary } from "./sleep";
import { getStepsDaily } from "./steps";

interface ConsistencyInputs {
  workoutCount: number;
  workoutMinutes: number;
  avgSteps: number | null;
  sleepStddevMinutes: number | null;
  rhrStddev: number | null;
}

export async function getConsistencyIndex(db: Db, range: DateRange): Promise<CompositeResult> {
  const windows = buildCompositeWindows(range);
  const [current, baseline] = await Promise.all([
    getConsistencyInputs(db, windows.current),
    getConsistencyInputs(db, windows.baseline),
  ]);
  const currentScore = consistencyScore(current);
  const baselineScore = consistencyScore(baseline);
  const trend = classifyTrend(currentScore, baselineScore, {
    higherIsBetter: true,
    flatPercentThreshold: 0.05,
  });
  const state = consistencyState(currentScore);
  const sampleQuality = consistencySampleQuality(current, baseline);

  return CompositeResultSchema.parse({
    answer: `Consistency signals suggest ${state}; direction is ${trend.direction}`,
    evidence: [
      {
        label: "Consistency score",
        value: Math.round(currentScore),
        detail: `Current score vs baseline ${Math.round(baselineScore)}.`,
      },
      {
        label: "Training rhythm",
        value: `${current.workoutCount} workouts, ${Math.round(current.workoutMinutes)} min`,
        detail: "Weekly workout count and total duration support consistency.",
      },
      {
        label: "Daily basics",
        value: current.avgSteps === null ? null : Math.round(current.avgSteps),
        detail: "Average daily step count in the current window.",
      },
      {
        label: "Recovery stability",
        value: formatStability(current.sleepStddevMinutes, current.rhrStddev),
        detail: "Sleep timing variability and resting-HR variability limit trend confidence.",
      },
    ],
    action: actionForConsistency(state),
    confidence: sampleQuality === "high" ? "high" : sampleQuality === "mixed" ? "medium" : "low",
    sample_quality: sampleQuality,
    claim_strength: "suggests",
  });
}

function consistencySampleQuality(
  current: ConsistencyInputs,
  baseline: ConsistencyInputs,
): CompositeResult["sample_quality"] {
  if (current.avgSteps === null && current.workoutCount === 0) return "poor";
  if (baseline.avgSteps === null && baseline.workoutCount === 0) return "mixed";
  return "high";
}

async function getConsistencyInputs(db: Db, range: DateRange): Promise<ConsistencyInputs> {
  const [activity, steps, sleep, rhrRows] = await Promise.all([
    getWeeklyActivity(db, range),
    getStepsDaily(db, range),
    getSleepSummary(db, range),
    getRestingHRDaily(db, range),
  ]);
  return {
    workoutCount: activity.reduce((sum, row) => sum + row.workout_count, 0),
    workoutMinutes: activity.reduce((sum, row) => sum + row.total_duration_sec / 60, 0),
    avgSteps: average(steps.map((row) => row.total_steps)),
    sleepStddevMinutes: sleep.consistency_stddev === null ? null : sleep.consistency_stddev / 60,
    rhrStddev: stddev(rhrRows.map((row) => row.avg_rhr)),
  };
}

function consistencyScore(inputs: ConsistencyInputs): number {
  return (
    scoreCap(inputs.workoutCount / 3, 25) +
    scoreCap(inputs.workoutMinutes / 150, 25) +
    scoreCap((inputs.avgSteps ?? 0) / 7000, 20) +
    inverseScore(inputs.sleepStddevMinutes, 45, 15) +
    inverseScore(inputs.rhrStddev, 3, 15)
  );
}

function consistencyState(score: number): string {
  if (score >= 75) return "strong";
  if (score >= 50) return "mixed";
  return "inconsistent";
}

function actionForConsistency(state: string): CompositeResult["action"] {
  if (state === "strong") {
    return {
      kind: "maintain",
      recommendation: "Use the performance trends with normal confidence.",
    };
  }
  if (state === "mixed") {
    return {
      kind: "watch",
      recommendation: "Improve one basic routine before over-reading performance changes.",
    };
  }
  return {
    kind: "maintain",
    recommendation:
      "Stabilize training rhythm, sleep timing, or daily movement before adding load.",
  };
}

function scoreCap(ratio: number, maxPoints: number): number {
  return Math.min(1, Math.max(0, ratio)) * maxPoints;
}

function inverseScore(value: number | null, threshold: number, maxPoints: number): number {
  if (value === null) return 0;
  return scoreCap(1 - value / threshold, maxPoints);
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stddev(values: number[]): number | null {
  if (values.length < 2) return null;
  const avg = average(values);
  if (avg === null) return null;
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function formatStability(
  sleepStddevMinutes: number | null,
  rhrStddev: number | null,
): string | null {
  if (sleepStddevMinutes === null && rhrStddev === null) return null;
  const sleep =
    sleepStddevMinutes === null ? "sleep unknown" : `${Math.round(sleepStddevMinutes)} min sleep`;
  const rhr = rhrStddev === null ? "RHR unknown" : `${rhrStddev.toFixed(1)} bpm RHR`;
  return `${sleep}, ${rhr}`;
}
