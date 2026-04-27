import {
  type AdvancedCompositeReport,
  AdvancedCompositeReportSchema,
  type AdvancedCompositeReportSection,
  type CompositeAction,
  type CompositeResult,
  CompositeResultSchema,
  type RunFatigueFlag,
} from "@vitals/core";
import type { Db } from "@vitals/db";
import { getAerobicEfficiencyTrend } from "./aerobic_efficiency_trend";
import type { DateRange } from "./dates";
import { getFitnessTrend } from "./fitness_trend";
import { getLoadQuality } from "./load_quality";
import { getReadinessScore } from "./readiness";
import { getRecoveryDebt } from "./recovery_debt";
import { getRunEconomyScore } from "./run_economy";
import { listRunFatigueFlags } from "./run_fatigue";
import { getTrainingStrainVsRecovery } from "./training_strain";

export async function getAdvancedCompositeReport(
  db: Db,
  range: DateRange,
): Promise<AdvancedCompositeReport> {
  const [
    fitnessTrend,
    aerobicEfficiency,
    loadQuality,
    runEconomy,
    readiness,
    recoveryDebt,
    trainingStrain,
    fatigueFlags,
  ] = await Promise.all([
    getFitnessTrend(db, range),
    getAerobicEfficiencyTrend(db, range),
    getLoadQuality(db, range),
    getRunEconomyScore(db, range),
    getReadinessScore(db, range),
    getRecoveryDebt(db, range),
    getTrainingStrainVsRecovery(db, range),
    listRunFatigueFlags(db, range),
  ]);

  const sections: AdvancedCompositeReportSection[] = [
    section("fitness_direction", "Fitness direction", fitnessTrend),
    section(
      "easy_run_quality",
      "Easy-run quality",
      strongestResult([aerobicEfficiency, loadQuality, runEconomy]),
    ),
    section(
      "recovery_state",
      "Recovery state",
      strongestResult([readiness, recoveryDebt, trainingStrain]),
    ),
    section("workout_diagnoses", "Workout diagnoses", summarizeWorkoutDiagnoses(fatigueFlags)),
  ];

  return AdvancedCompositeReportSchema.parse({
    from: range.from,
    to: range.to,
    sections,
    next_week_recommendation: nextWeekRecommendation(sections.map((item) => item.result)),
  });
}

function section(
  key: AdvancedCompositeReportSection["key"],
  title: string,
  result: CompositeResult,
): AdvancedCompositeReportSection {
  return { key, title, result };
}

function strongestResult(results: CompositeResult[]): CompositeResult {
  const [strongest] = [...results].sort((left, right) => resultRank(right) - resultRank(left));
  if (strongest === undefined) {
    throw new Error("At least one composite result is required");
  }
  return strongest;
}

function summarizeWorkoutDiagnoses(flags: RunFatigueFlag[]): CompositeResult {
  if (flags.length === 0) {
    return CompositeResultSchema.parse({
      answer: "No workout diagnoses are available",
      evidence: [
        {
          label: "Diagnosed runs",
          value: 0,
          detail: "No running workouts in the report window had enough context for diagnosis.",
        },
      ],
      action: {
        kind: "retest",
        recommendation:
          "Collect a well-sampled steady run before treating workout diagnoses as signal.",
      },
      confidence: "low",
      sample_quality: "poor",
      claim_strength: "worth_watching",
    });
  }

  const strongest = [...flags].sort((left, right) => {
    const diagnosisDelta = diagnosisSeverity(right) - diagnosisSeverity(left);
    if (diagnosisDelta !== 0) return diagnosisDelta;
    return resultRank(right.result) - resultRank(left.result);
  })[0];
  if (strongest === undefined) {
    throw new Error("At least one workout diagnosis is required");
  }
  const counts = diagnosisCounts(flags);

  return CompositeResultSchema.parse({
    answer: strongest.result.answer,
    evidence: [
      {
        label: "Strongest diagnosis",
        value: strongest.diagnosis.replaceAll("_", " "),
        detail: `Workout ${strongest.workout_id} on ${strongest.start_ts.slice(0, 10)} carried the strongest diagnosis.`,
      },
      {
        label: "Diagnosed runs",
        value: flags.length,
        detail: "Number of running workouts checked in the report window.",
      },
      {
        label: "Diagnosis mix",
        value: counts,
        detail: "Counts by diagnosis across the report window.",
      },
      strongest.result.evidence[0],
    ],
    action: strongest.result.action,
    confidence: strongest.result.confidence,
    sample_quality: strongest.result.sample_quality,
    claim_strength: strongest.result.claim_strength,
  });
}

function nextWeekRecommendation(results: CompositeResult[]): CompositeAction {
  const strongest = strongestResult(results);
  return {
    kind: strongest.action.kind,
    recommendation: `Next week: ${strongest.action.recommendation}`,
  };
}

function resultRank(result: CompositeResult): number {
  return (
    actionSeverity(result.action.kind) * 100 +
    confidenceScore(result.confidence) * 10 +
    sampleQualityScore(result.sample_quality) * 4 +
    claimStrengthScore(result.claim_strength) +
    nonNullEvidenceCount(result) / 10
  );
}

function actionSeverity(kind: CompositeAction["kind"]): number {
  const scores: Record<CompositeAction["kind"], number> = {
    reduce_intensity: 7,
    run_easier: 6,
    add_sleep: 5,
    retest: 4,
    watch: 3,
    maintain: 2,
    push: 1,
  };
  return scores[kind];
}

function confidenceScore(confidence: CompositeResult["confidence"]): number {
  const scores: Record<CompositeResult["confidence"], number> = { high: 3, medium: 2, low: 1 };
  return scores[confidence];
}

function sampleQualityScore(sampleQuality: CompositeResult["sample_quality"]): number {
  const scores: Record<CompositeResult["sample_quality"], number> = { high: 3, mixed: 2, poor: 1 };
  return scores[sampleQuality];
}

function claimStrengthScore(claimStrength: CompositeResult["claim_strength"]): number {
  const scores: Record<CompositeResult["claim_strength"], number> = {
    measured: 4,
    likely: 3,
    suggests: 2,
    worth_watching: 1,
  };
  return scores[claimStrength];
}

function nonNullEvidenceCount(result: CompositeResult): number {
  return result.evidence.filter((item) => item.value !== null).length;
}

function diagnosisSeverity(flag: RunFatigueFlag): number {
  const scores: Record<RunFatigueFlag["diagnosis"], number> = {
    cardiac_drift: 5,
    under_recovered: 4,
    pacing_fade: 3,
    poor_sample_quality: 2,
    clean_aerobic: 1,
  };
  return scores[flag.diagnosis];
}

function diagnosisCounts(flags: RunFatigueFlag[]): string {
  const counts = new Map<RunFatigueFlag["diagnosis"], number>();
  for (const flag of flags) {
    counts.set(flag.diagnosis, (counts.get(flag.diagnosis) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([diagnosis, count]) => `${diagnosis.replaceAll("_", " ")}: ${count}`)
    .join(", ");
}
