import { describe, expect, test } from "bun:test";
import {
  ActivityPointSchema,
  AdvancedCompositeReportSchema,
  CompositeResultSchema,
  DistancePointSchema,
  EnergyPointSchema,
  HRPointSchema,
  HRVPointSchema,
  LoadRowSchema,
  PowerPointSchema,
  RestingHRPointSchema,
  RestingHRRollingPointSchema,
  RunFatigueFlagSchema,
  SleepNightDetailSchema,
  SleepNightPointSchema,
  SleepSegmentSchema,
  SleepSummarySchema,
  SpeedPointSchema,
  StepsPointSchema,
  VO2MaxPointSchema,
  WalkingHRPointSchema,
  WorkoutContextSummarySchema,
  WorkoutDecouplingSchema,
  WorkoutDetailSchema,
  WorkoutEfficiencySchema,
  WorkoutPaceAtHRSchema,
  type WorkoutSampleQualityIssue,
  WorkoutSampleQualitySchema,
  WorkoutSummarySchema,
  WorkoutZoneBreakdownListSchema,
  WorkoutZoneBreakdownRowSchema,
  ZoneTimeDistributionListSchema,
  ZoneTimeDistributionRowSchema,
  ZonesRowSchema,
} from "../dto";

describe("DTO round-trip parsing", () => {
  test("WorkoutSummary", () => {
    const fixture = {
      id: "abc123",
      type: "HKWorkoutActivityTypeRunning",
      start_ts: "2024-06-01T08:00:00.000Z",
      end_ts: "2024-06-01T09:00:00.000Z",
      duration_sec: 3600,
      source: "Apple Watch",
    };
    expect(WorkoutSummarySchema.parse(fixture)).toEqual(fixture);
  });

  test("WorkoutDetail extends Summary with drift + load + z2_ratio", () => {
    const fixture = {
      id: "abc123",
      type: "HKWorkoutActivityTypeRunning",
      start_ts: "2024-06-01T08:00:00.000Z",
      end_ts: "2024-06-01T09:00:00.000Z",
      duration_sec: 3600,
      source: null,
      drift_pct: 2.4,
      drift_classification: "stable" as const,
      load: 7200,
      z2_ratio: 0.42,
    };
    expect(WorkoutDetailSchema.parse(fixture)).toEqual(fixture);
  });

  test("WorkoutDetail accepts null drift with 'unknown' classification", () => {
    const fixture = {
      id: "no-hr",
      type: "HKWorkoutActivityTypeWalking",
      start_ts: "2024-06-01T08:00:00.000Z",
      end_ts: "2024-06-01T08:30:00.000Z",
      duration_sec: 1800,
      source: null,
      drift_pct: null,
      drift_classification: "unknown" as const,
      load: null,
      z2_ratio: null,
    };
    expect(WorkoutDetailSchema.parse(fixture)).toEqual(fixture);
  });

  test("HRPoint", () => {
    const fixture = { ts: "2024-06-01T08:30:15.000Z", bpm: 142, source: "Apple Watch" };
    expect(HRPointSchema.parse(fixture)).toEqual(fixture);
  });

  test("ZonesRow", () => {
    const fixture = { z2_ratio: 0.37 };
    expect(ZonesRowSchema.parse(fixture)).toEqual(fixture);
  });

  test("ZonesRow accepts null for empty HR ranges but rejects invalid ratios", () => {
    expect(ZonesRowSchema.parse({ z2_ratio: null })).toEqual({ z2_ratio: null });
    expect(() => ZonesRowSchema.parse({ z2_ratio: -0.01 })).toThrow();
    expect(() => ZonesRowSchema.parse({ z2_ratio: 1.01 })).toThrow();
  });

  test("WorkoutZoneBreakdownRow round-trips for each zone name", () => {
    for (const zone of ["Z1", "Z2", "Z3", "Z4", "Z5"] as const) {
      const fixture = { zone, sample_count: 12, ratio: 0.4 };
      expect(WorkoutZoneBreakdownRowSchema.parse(fixture)).toEqual(fixture);
    }
  });

  test("WorkoutZoneBreakdownRow rejects non-integer sample_count and out-of-range ratio", () => {
    expect(() =>
      WorkoutZoneBreakdownRowSchema.parse({ zone: "Z2", sample_count: 1.5, ratio: 0.2 }),
    ).toThrow();
    expect(() =>
      WorkoutZoneBreakdownRowSchema.parse({ zone: "Z2", sample_count: -1, ratio: 0.2 }),
    ).toThrow();
    expect(() =>
      WorkoutZoneBreakdownRowSchema.parse({ zone: "Z2", sample_count: 3, ratio: 1.01 }),
    ).toThrow();
  });

  test("WorkoutZoneBreakdownRow rejects unknown zone labels", () => {
    expect(() =>
      WorkoutZoneBreakdownRowSchema.parse({ zone: "Z6", sample_count: 1, ratio: 0.1 }),
    ).toThrow();
  });

  test("WorkoutZoneBreakdownList accepts the empty list (no HR samples case)", () => {
    expect(WorkoutZoneBreakdownListSchema.parse([])).toEqual([]);
  });

  test("ZoneTimeDistributionRow round-trips time-in-zone values", () => {
    const fixture = { zone: "Z2" as const, duration_sec: 1800, ratio: 0.5 };
    expect(ZoneTimeDistributionRowSchema.parse(fixture)).toEqual(fixture);
    expect(ZoneTimeDistributionListSchema.parse([fixture])).toEqual([fixture]);
  });

  test("RestingHRPoint", () => {
    const fixture = { day: "2024-06-01", avg_rhr: 52.4 };
    expect(RestingHRPointSchema.parse(fixture)).toEqual(fixture);
  });

  test("RestingHRPoint rejects non-ISO day", () => {
    expect(() => RestingHRPointSchema.parse({ day: "06/01/2024", avg_rhr: 52 })).toThrow();
  });

  test("RestingHRRollingPoint", () => {
    const fixture = { day: "2024-06-07", avg_rhr_7d: 54.2 };
    expect(RestingHRRollingPointSchema.parse(fixture)).toEqual(fixture);
  });

  test("SleepSummary", () => {
    const fixture = { total_hours: 7.25, consistency_stddev: 18.3, efficiency: 0.91 };
    expect(SleepSummarySchema.parse(fixture)).toEqual(fixture);
  });

  test("SleepSummary rejects invalid efficiency ratios", () => {
    expect(() =>
      SleepSummarySchema.parse({ total_hours: 7.25, consistency_stddev: 18.3, efficiency: 1.2 }),
    ).toThrow();
  });

  test("ActivityPoint", () => {
    const fixture = { week: "2024-06-03", workout_count: 4, total_duration_sec: 12_600 };
    expect(ActivityPointSchema.parse(fixture)).toEqual(fixture);
  });

  test("ActivityPoint rejects negative totals", () => {
    expect(() =>
      ActivityPointSchema.parse({ week: "2024-06-03", workout_count: -1, total_duration_sec: -60 }),
    ).toThrow();
  });

  test("LoadRow", () => {
    const fixture = { workout_id: "abc123", duration_sec: 3600, avg_hr: 144, load: 518_400 };
    expect(LoadRowSchema.parse(fixture)).toEqual(fixture);
  });

  test("VO2MaxPoint", () => {
    const fixture = { day: "2024-06-01", avg_vo2max: 48.2 };
    expect(VO2MaxPointSchema.parse(fixture)).toEqual(fixture);
  });

  test("HRVPoint", () => {
    const fixture = { day: "2024-06-01", avg_hrv: 64.5 };
    expect(HRVPointSchema.parse(fixture)).toEqual(fixture);
  });

  test("HRVPoint rejects non-ISO day", () => {
    expect(() => HRVPointSchema.parse({ day: "06/01/2024", avg_hrv: 60 })).toThrow();
  });

  test("HRVPoint rejects non-positive avg", () => {
    expect(() => HRVPointSchema.parse({ day: "2024-06-01", avg_hrv: 0 })).toThrow();
  });

  test("StepsPoint", () => {
    const fixture = { day: "2024-06-01", total_steps: 8421 };
    expect(StepsPointSchema.parse(fixture)).toEqual(fixture);
  });

  test("StepsPoint rejects negative totals and non-ISO day", () => {
    expect(() => StepsPointSchema.parse({ day: "2024-06-01", total_steps: -1 })).toThrow();
    expect(() => StepsPointSchema.parse({ day: "06/01/2024", total_steps: 100 })).toThrow();
  });

  test("DistancePoint", () => {
    const fixture = { day: "2024-06-01", total_meters: 5421.7 };
    expect(DistancePointSchema.parse(fixture)).toEqual(fixture);
  });

  test("DistancePoint rejects negative totals", () => {
    expect(() => DistancePointSchema.parse({ day: "2024-06-01", total_meters: -10 })).toThrow();
  });

  test("EnergyPoint", () => {
    const fixture = { day: "2024-06-01", active_kcal: 420.5, basal_kcal: 1680.2 };
    expect(EnergyPointSchema.parse(fixture)).toEqual(fixture);
  });

  test("EnergyPoint rejects negative components", () => {
    expect(() =>
      EnergyPointSchema.parse({ day: "2024-06-01", active_kcal: -1, basal_kcal: 1000 }),
    ).toThrow();
    expect(() =>
      EnergyPointSchema.parse({ day: "2024-06-01", active_kcal: 200, basal_kcal: -1 }),
    ).toThrow();
  });

  test("WalkingHRPoint", () => {
    const fixture = { day: "2024-06-01", avg_walking_hr: 88.5 };
    expect(WalkingHRPointSchema.parse(fixture)).toEqual(fixture);
  });

  test("WalkingHRPoint rejects non-positive avg and non-ISO day", () => {
    expect(() => WalkingHRPointSchema.parse({ day: "2024-06-01", avg_walking_hr: 0 })).toThrow();
    expect(() => WalkingHRPointSchema.parse({ day: "06/01/2024", avg_walking_hr: 80 })).toThrow();
  });

  test("SpeedPoint", () => {
    const fixture = { day: "2024-06-01", avg_speed: 3.42 };
    expect(SpeedPointSchema.parse(fixture)).toEqual(fixture);
  });

  test("SpeedPoint rejects negative averages", () => {
    expect(() => SpeedPointSchema.parse({ day: "2024-06-01", avg_speed: -0.1 })).toThrow();
  });

  test("PowerPoint", () => {
    const fixture = { day: "2024-06-01", avg_power: 245.5 };
    expect(PowerPointSchema.parse(fixture)).toEqual(fixture);
  });

  test("PowerPoint rejects negative averages", () => {
    expect(() => PowerPointSchema.parse({ day: "2024-06-01", avg_power: -1 })).toThrow();
  });

  test("WorkoutPaceAtHR", () => {
    const fixture = {
      hr_min: 120,
      hr_max: 130,
      sample_count: 4,
      avg_speed_mps: 3.8,
      pace_sec_per_km: 263.1578947368421,
    };
    expect(WorkoutPaceAtHRSchema.parse(fixture)).toEqual(fixture);
  });

  test("WorkoutPaceAtHR accepts null metrics when no aligned samples qualify", () => {
    const fixture = {
      hr_min: 120,
      hr_max: 130,
      sample_count: 0,
      avg_speed_mps: null,
      pace_sec_per_km: null,
    };
    expect(WorkoutPaceAtHRSchema.parse(fixture)).toEqual(fixture);
  });

  test("WorkoutDecoupling", () => {
    const fixture = {
      window_duration_sec: 3600,
      sample_count: 8,
      first_half_efficiency: 0.03,
      second_half_efficiency: 0.028,
      decoupling_pct: 6.666666666666667,
    };
    expect(WorkoutDecouplingSchema.parse(fixture)).toEqual(fixture);
  });

  test("WorkoutEfficiency", () => {
    const fixture = {
      pace_at_hr: {
        hr_min: 120,
        hr_max: 130,
        sample_count: 2,
        avg_speed_mps: 3.9,
        pace_sec_per_km: 256.4102564102564,
      },
      decoupling: {
        window_duration_sec: 3600,
        sample_count: 8,
        first_half_efficiency: 0.03,
        second_half_efficiency: 0.028,
        decoupling_pct: 6.666666666666667,
      },
    };
    expect(WorkoutEfficiencySchema.parse(fixture)).toEqual(fixture);
  });

  test("CompositeResult", () => {
    const fixture = {
      answer: "Aerobic efficiency likely improved",
      evidence: [
        {
          label: "Fixed-HR pace",
          value: "5:20/km",
          detail: "Pace at 120-130 bpm improved against baseline.",
        },
        {
          label: "Sample quality",
          value: 0.92,
          detail: "Most runs had aligned HR and speed samples.",
        },
      ],
      action: {
        kind: "maintain" as const,
        recommendation: "Keep easy runs easy next week.",
      },
      confidence: "medium" as const,
      sample_quality: "mixed" as const,
      claim_strength: "likely" as const,
    };
    expect(CompositeResultSchema.parse(fixture)).toEqual(fixture);
  });

  test("CompositeResult pins conservative evidence and action shape", () => {
    const base = {
      answer: "Readiness suggests an easier day",
      evidence: [
        {
          label: "HRV",
          value: "below baseline",
          detail: "HRV is lower than the comparison window.",
        },
      ],
      action: {
        kind: "run_easier" as const,
        recommendation: "Keep intensity low today.",
      },
      confidence: "low" as const,
      sample_quality: "poor" as const,
      claim_strength: "suggests" as const,
    };
    expect(CompositeResultSchema.parse(base)).toEqual(base);
    expect(() => CompositeResultSchema.parse({ ...base, evidence: [] })).toThrow();
    expect(() =>
      CompositeResultSchema.parse({
        ...base,
        evidence: [
          ...base.evidence,
          ...base.evidence,
          ...base.evidence,
          ...base.evidence,
          ...base.evidence,
        ],
      }),
    ).toThrow();
    expect(() => CompositeResultSchema.parse({ ...base, claim_strength: "diagnoses" })).toThrow();
  });

  test("AdvancedCompositeReport groups the paid report sections", () => {
    const result = {
      answer: "Fitness is improving",
      evidence: [
        {
          label: "VO2 Max",
          value: "+2.0",
          detail: "VO2 Max improved against baseline.",
        },
      ],
      action: {
        kind: "maintain" as const,
        recommendation: "Keep the current aerobic workload.",
      },
      confidence: "medium" as const,
      sample_quality: "mixed" as const,
      claim_strength: "suggests" as const,
    };
    const fixture = {
      from: "2024-06-01",
      to: "2024-06-07",
      sections: [
        { key: "fitness_direction" as const, title: "Fitness direction", result },
        { key: "easy_run_quality" as const, title: "Easy-run quality", result },
        { key: "recovery_state" as const, title: "Recovery state", result },
        { key: "workout_diagnoses" as const, title: "Workout diagnoses", result },
      ],
      next_week_recommendation: {
        kind: "maintain" as const,
        recommendation: "Keep the current aerobic workload.",
      },
    };
    expect(AdvancedCompositeReportSchema.parse(fixture)).toEqual(fixture);
    expect(() =>
      AdvancedCompositeReportSchema.parse({
        ...fixture,
        sections: fixture.sections.slice(0, 3),
      }),
    ).toThrow();
  });

  test("WorkoutSampleQuality", () => {
    const fixture = {
      workout_id: "wk-running-2024-06-01",
      sample_quality: "mixed" as const,
      issues: ["missing_power", "missing_route"] satisfies WorkoutSampleQualityIssue[],
      duration_sec: 3600,
      hr_samples: 12,
      speed_samples: 12,
      power_samples: 0,
      aligned_speed_hr_samples: 12,
      route_count: 0,
      context_count: 2,
    };
    expect(WorkoutSampleQualitySchema.parse(fixture)).toEqual(fixture);
  });

  test("WorkoutSampleQuality rejects unknown issues and negative counts", () => {
    const fixture = {
      workout_id: "wk-running-2024-06-01",
      sample_quality: "poor" as const,
      issues: ["missing_hr"] satisfies WorkoutSampleQualityIssue[],
      duration_sec: 3600,
      hr_samples: 0,
      speed_samples: 12,
      power_samples: 12,
      aligned_speed_hr_samples: 0,
      route_count: 1,
      context_count: 1,
    };
    expect(WorkoutSampleQualitySchema.parse(fixture)).toEqual(fixture);
    expect(() => WorkoutSampleQualitySchema.parse({ ...fixture, issues: ["bad_data"] })).toThrow();
    expect(() => WorkoutSampleQualitySchema.parse({ ...fixture, hr_samples: -1 })).toThrow();
  });

  test("RunFatigueFlag", () => {
    const fixture = {
      workout_id: "wk-running-2024-06-01",
      start_ts: "2024-06-01T08:00:00.000Z",
      diagnosis: "cardiac_drift" as const,
      result: {
        answer: "Run likely shows cardiac drift",
        evidence: [
          {
            label: "HR drift",
            value: "8.0%",
            detail: "Heart rate rose across the workout.",
          },
        ],
        action: {
          kind: "run_easier" as const,
          recommendation: "Keep the next easy run controlled.",
        },
        confidence: "medium" as const,
        sample_quality: "mixed" as const,
        claim_strength: "suggests" as const,
      },
    };
    expect(RunFatigueFlagSchema.parse(fixture)).toEqual(fixture);
    expect(() => RunFatigueFlagSchema.parse({ ...fixture, diagnosis: "injury" })).toThrow();
  });

  test("WorkoutContextSummary", () => {
    const fixture = {
      workout_id: "wk-running-2024-06-01",
      context_label: "outdoor_route" as const,
      route_count: 1,
      stat_count: 2,
      pause_count: 1,
      segment_count: 3,
      metadata_count: 2,
      has_weather: true,
      has_elevation: false,
    };
    expect(WorkoutContextSummarySchema.parse(fixture)).toEqual(fixture);
    expect(() =>
      WorkoutContextSummarySchema.parse({ ...fixture, context_label: "road" }),
    ).toThrow();
    expect(() => WorkoutContextSummarySchema.parse({ ...fixture, route_count: -1 })).toThrow();
  });

  test("SleepNightPoint", () => {
    const fixture = {
      day: "2024-06-01",
      asleep_hours: 7.25,
      in_bed_hours: 8.0,
      efficiency: 0.9,
    };
    expect(SleepNightPointSchema.parse(fixture)).toEqual(fixture);
  });

  test("SleepNightPoint accepts null efficiency (no in-bed coverage)", () => {
    const fixture = {
      day: "2024-06-01",
      asleep_hours: 7.25,
      in_bed_hours: 0,
      efficiency: null,
    };
    expect(SleepNightPointSchema.parse(fixture)).toEqual(fixture);
  });

  test("SleepNightPoint rejects out-of-range efficiency and negative hours", () => {
    expect(() =>
      SleepNightPointSchema.parse({
        day: "2024-06-01",
        asleep_hours: 7,
        in_bed_hours: 8,
        efficiency: 1.2,
      }),
    ).toThrow();
    expect(() =>
      SleepNightPointSchema.parse({
        day: "2024-06-01",
        asleep_hours: -1,
        in_bed_hours: 8,
        efficiency: 0.9,
      }),
    ).toThrow();
  });

  test("SleepNightDetail", () => {
    const fixture = {
      day: "2024-06-01",
      bedtime: "2024-06-01T22:30:00.000Z",
      wake_time: "2024-06-02T06:30:00.000Z",
      asleep_hours: 7,
      in_bed_hours: 8,
      awake_hours: 0.5,
      efficiency: 0.875,
      core_hours: 4,
      deep_hours: 1,
      rem_hours: 1,
      unspecified_hours: 1,
    };
    expect(SleepNightDetailSchema.parse(fixture)).toEqual(fixture);
  });

  test("SleepNightDetail allows null stage totals for pre-0.8.0 rows", () => {
    const fixture = {
      day: "2024-06-01",
      bedtime: "2024-06-01T22:30:00.000Z",
      wake_time: "2024-06-02T06:30:00.000Z",
      asleep_hours: 7,
      in_bed_hours: 8,
      awake_hours: 0,
      efficiency: 0.875,
      core_hours: null,
      deep_hours: null,
      rem_hours: null,
      unspecified_hours: null,
    };
    expect(SleepNightDetailSchema.parse(fixture)).toEqual(fixture);
  });

  test("SleepSegment", () => {
    const fixture = {
      night: "2024-06-01",
      start_ts: "2024-06-01T23:00:00.000Z",
      end_ts: "2024-06-02T01:30:00.000Z",
      state: "asleep" as const,
      raw_state: "HKCategoryValueSleepAnalysisAsleepCore" as const,
      stage: "core" as const,
      duration_hours: 2.5,
    };
    expect(SleepSegmentSchema.parse(fixture)).toEqual(fixture);
  });

  test("SleepSegment allows null raw stage detail for older data", () => {
    const fixture = {
      night: "2024-06-01",
      start_ts: "2024-06-01T22:30:00.000Z",
      end_ts: "2024-06-01T23:00:00.000Z",
      state: "in_bed" as const,
      raw_state: null,
      stage: null,
      duration_hours: 0.5,
    };
    expect(SleepSegmentSchema.parse(fixture)).toEqual(fixture);
  });
});
