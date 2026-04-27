import { describe, expect, test } from "bun:test";
import {
  ActivityPointSchema,
  DistancePointSchema,
  EnergyPointSchema,
  HRPointSchema,
  HRVPointSchema,
  LoadRowSchema,
  PowerPointSchema,
  RestingHRPointSchema,
  RestingHRRollingPointSchema,
  SleepNightDetailSchema,
  SleepNightPointSchema,
  SleepSegmentSchema,
  SleepSummarySchema,
  SpeedPointSchema,
  StepsPointSchema,
  VO2MaxPointSchema,
  WalkingHRPointSchema,
  WorkoutDecouplingSchema,
  WorkoutDetailSchema,
  WorkoutEfficiencySchema,
  WorkoutPaceAtHRSchema,
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
