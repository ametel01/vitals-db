import { describe, expect, test } from "bun:test";
import {
  ActivityPointSchema,
  HRPointSchema,
  HRVPointSchema,
  LoadRowSchema,
  RestingHRPointSchema,
  SleepSummarySchema,
  VO2MaxPointSchema,
  WorkoutDetailSchema,
  WorkoutSummarySchema,
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

  test("RestingHRPoint", () => {
    const fixture = { day: "2024-06-01", avg_rhr: 52.4 };
    expect(RestingHRPointSchema.parse(fixture)).toEqual(fixture);
  });

  test("RestingHRPoint rejects non-ISO day", () => {
    expect(() => RestingHRPointSchema.parse({ day: "06/01/2024", avg_rhr: 52 })).toThrow();
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
});
