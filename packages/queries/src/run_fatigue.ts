import {
  type CompositeEvidence,
  type CompositeResult,
  type RunFatigueDiagnosis,
  type RunFatigueFlag,
  RunFatigueFlagSchema,
} from "@vitals/core";
import type { Db } from "@vitals/db";
import { classifyTrend } from "./composite_windows";
import type { DateRange } from "./dates";
import { getWorkoutDrift } from "./drift";
import { getWorkoutEfficiency } from "./efficiency";
import { getHRVDaily } from "./hrv";
import { getRestingHRDaily } from "./resting_hr";
import { getWorkoutSampleQuality } from "./sample_quality";
import { getWorkoutContextSummary } from "./workout_context";
import { getWorkoutSummary, listWorkouts } from "./workouts";

interface FadeMetrics {
  speed_fade_pct: number | null;
  power_fade_pct: number | null;
}

export async function getRunFatigueFlag(db: Db, workoutId: string): Promise<RunFatigueFlag | null> {
  const workout = await getWorkoutSummary(db, workoutId);
  if (workout === null) return null;

  const [quality, drift, efficiency, context, fade, recovery] = await Promise.all([
    getWorkoutSampleQuality(db, workoutId),
    getWorkoutDrift(db, workoutId),
    getWorkoutEfficiency(db, workoutId),
    getWorkoutContextSummary(db, workoutId),
    getFadeMetrics(db, workoutId),
    getPreRunRecovery(db, workout.start_ts),
  ]);
  const diagnosis = classifyRunFatigue({
    sampleQuality: quality?.sample_quality ?? "poor",
    driftPct: drift.drift_pct,
    decouplingPct: efficiency?.decoupling.decoupling_pct ?? null,
    speedFadePct: fade.speed_fade_pct,
    powerFadePct: fade.power_fade_pct,
    recoveryFlagged: recovery.flagged,
  });
  const result = buildResult({
    diagnosis,
    sampleQuality: quality?.sample_quality ?? "poor",
    driftPct: drift.drift_pct,
    decouplingPct: efficiency?.decoupling.decoupling_pct ?? null,
    speedFadePct: fade.speed_fade_pct,
    powerFadePct: fade.power_fade_pct,
    recoveryDetail: recovery.detail,
    contextLabel: context?.context_label ?? "unknown",
  });

  return RunFatigueFlagSchema.parse({
    workout_id: workout.id,
    start_ts: workout.start_ts,
    diagnosis,
    result,
  });
}

export async function listRunFatigueFlags(db: Db, range: DateRange): Promise<RunFatigueFlag[]> {
  const workouts = await listWorkouts(db, { type: "Running", from: range.from, to: range.to });
  const flags = await Promise.all(workouts.map((workout) => getRunFatigueFlag(db, workout.id)));
  return flags.filter((flag): flag is RunFatigueFlag => flag !== null);
}

function classifyRunFatigue(input: {
  sampleQuality: CompositeResult["sample_quality"];
  driftPct: number | null;
  decouplingPct: number | null;
  speedFadePct: number | null;
  powerFadePct: number | null;
  recoveryFlagged: boolean;
}): RunFatigueDiagnosis {
  if (input.sampleQuality === "poor") return "poor_sample_quality";
  if (input.driftPct !== null && input.driftPct >= 6) return "cardiac_drift";
  if (input.decouplingPct !== null && input.decouplingPct >= 6) return "cardiac_drift";
  if (isFade(input.speedFadePct) || isFade(input.powerFadePct)) return "pacing_fade";
  if (input.recoveryFlagged) return "under_recovered";
  return "clean_aerobic";
}

function buildResult(input: {
  diagnosis: RunFatigueDiagnosis;
  sampleQuality: CompositeResult["sample_quality"];
  driftPct: number | null;
  decouplingPct: number | null;
  speedFadePct: number | null;
  powerFadePct: number | null;
  recoveryDetail: string;
  contextLabel: string;
}): CompositeResult {
  const evidence: CompositeEvidence[] = [
    {
      label: "HR drift",
      value: formatPct(input.driftPct),
      detail: "Whole-run heart rate drift; high values suggest the effort stopped staying aerobic.",
    },
    {
      label: "Decoupling",
      value: formatPct(input.decouplingPct),
      detail: "Fixed-duration speed-per-heartbeat fade across the first workout hour.",
    },
    {
      label: "Pace/power fade",
      value: formatFade(input.speedFadePct, input.powerFadePct),
      detail: "Second-half speed or power drop while the run is still in progress.",
    },
    {
      label: "Pre-run recovery",
      value: input.recoveryDetail,
      detail: `Recovery signal before the run; context is ${input.contextLabel}.`,
    },
  ];

  return {
    answer: diagnosisAnswer(input.diagnosis),
    evidence,
    action: diagnosisAction(input.diagnosis),
    confidence:
      input.sampleQuality === "high" ? "high" : input.sampleQuality === "mixed" ? "medium" : "low",
    sample_quality: input.sampleQuality,
    claim_strength: "suggests",
  };
}

function diagnosisAnswer(diagnosis: RunFatigueDiagnosis): string {
  const labels: Record<RunFatigueDiagnosis, string> = {
    clean_aerobic: "Run signal suggests clean aerobic execution",
    cardiac_drift: "Run signal suggests cardiac drift",
    under_recovered: "Run signal suggests under-recovered execution",
    pacing_fade: "Run signal suggests pacing fade",
    poor_sample_quality: "Run signal is limited by poor sample quality",
  };
  return labels[diagnosis];
}

function diagnosisAction(diagnosis: RunFatigueDiagnosis): CompositeResult["action"] {
  if (diagnosis === "clean_aerobic") {
    return {
      kind: "maintain",
      recommendation: "Repeat similar easy-run execution before adding intensity.",
    };
  }
  if (diagnosis === "poor_sample_quality") {
    return {
      kind: "retest",
      recommendation: "Use a better-sampled run before treating this as a training signal.",
    };
  }
  return {
    kind: "run_easier",
    recommendation: "Keep the next comparable run easier and watch whether the signal repeats.",
  };
}

async function getFadeMetrics(db: Db, workoutId: string): Promise<FadeMetrics> {
  const row = await db.get<{
    first_speed: number | null;
    second_speed: number | null;
    first_power: number | null;
    second_power: number | null;
  }>(
    `WITH
       w AS (
         SELECT start_ts, end_ts,
           EXTRACT(EPOCH FROM start_ts) AS s_s,
           EXTRACT(EPOCH FROM end_ts) AS e_s
         FROM workouts
         WHERE id = ?
       ),
       p AS (
         SELECT p.speed, p.power, EXTRACT(EPOCH FROM p.ts) AS t_s, w.s_s, w.e_s
         FROM performance p, w
         WHERE p.ts BETWEEN w.start_ts AND w.end_ts
       )
     SELECT
       AVG(CASE WHEN t_s < (s_s + e_s) / 2 THEN speed END) AS first_speed,
       AVG(CASE WHEN t_s >= (s_s + e_s) / 2 THEN speed END) AS second_speed,
       AVG(CASE WHEN t_s < (s_s + e_s) / 2 THEN power END) AS first_power,
       AVG(CASE WHEN t_s >= (s_s + e_s) / 2 THEN power END) AS second_power
     FROM p`,
    [workoutId],
  );

  return {
    speed_fade_pct: declinePct(row?.first_speed ?? null, row?.second_speed ?? null),
    power_fade_pct: declinePct(row?.first_power ?? null, row?.second_power ?? null),
  };
}

async function getPreRunRecovery(
  db: Db,
  workoutStartTs: string,
): Promise<{ flagged: boolean; detail: string }> {
  const runDay = workoutStartTs.slice(0, 10);
  const preRun = { from: runDay, to: runDay };
  const baseline = { from: addDays(runDay, -7), to: addDays(runDay, -1) };
  const [currentRhr, baselineRhr, currentHrv, baselineHrv] = await Promise.all([
    average((await getRestingHRDaily(db, preRun)).map((row) => row.avg_rhr)),
    average((await getRestingHRDaily(db, baseline)).map((row) => row.avg_rhr)),
    average((await getHRVDaily(db, preRun)).map((row) => row.avg_hrv)),
    average((await getHRVDaily(db, baseline)).map((row) => row.avg_hrv)),
  ]);
  const rhrTrend = classifyTrend(currentRhr, baselineRhr, { higherIsBetter: false });
  const hrvTrend = classifyTrend(currentHrv, baselineHrv, { higherIsBetter: true });
  const flagged = rhrTrend.direction === "declining" || hrvTrend.direction === "declining";
  return {
    flagged,
    detail:
      currentRhr === null && currentHrv === null
        ? "unknown"
        : `RHR ${formatTrend(currentRhr, baselineRhr, " bpm") ?? "unknown"}, HRV ${
            formatTrend(currentHrv, baselineHrv, " ms") ?? "unknown"
          }`,
  };
}

function isFade(value: number | null): boolean {
  return value !== null && value >= 5;
}

function declinePct(first: number | null, second: number | null): number | null {
  if (first === null || second === null || first <= 0) return null;
  return ((first - second) / first) * 100;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function addDays(day: string, offset: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function formatTrend(current: number | null, baseline: number | null, unit: string): string | null {
  if (current === null || baseline === null) return null;
  const delta = current - baseline;
  return `${delta > 0 ? "+" : ""}${delta.toFixed(1)}${unit}`;
}

function formatPct(value: number | null): string | null {
  return value === null ? null : `${value.toFixed(1)}%`;
}

function formatFade(speedFadePct: number | null, powerFadePct: number | null): string | null {
  const parts = [
    speedFadePct === null ? null : `speed ${speedFadePct.toFixed(1)}%`,
    powerFadePct === null ? null : `power ${powerFadePct.toFixed(1)}%`,
  ].filter((part): part is string => part !== null);
  return parts.length === 0 ? null : parts.join(", ");
}
