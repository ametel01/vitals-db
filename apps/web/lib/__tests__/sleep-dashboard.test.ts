import { describe, expect, test } from "bun:test";
import type { SleepNightDetail, SleepSegment } from "@vitals/core";
import {
  buildLaneSegments,
  buildSleepDashboardModel,
  circularVariationMinutes,
  compareMetric,
  countAwakeningsForNight,
  stageBreakdownForNight,
  summarizeSleepWindow,
} from "../sleep-dashboard";

function night(overrides: Partial<SleepNightDetail> = {}): SleepNightDetail {
  return {
    day: "2024-06-01",
    bedtime: "2024-06-01T23:30:00.000Z",
    wake_time: "2024-06-02T07:30:00.000Z",
    asleep_hours: 7,
    in_bed_hours: 8,
    awake_hours: 0.5,
    efficiency: 0.875,
    core_hours: 4.5,
    deep_hours: 1.1,
    rem_hours: 1.4,
    unspecified_hours: 0,
    ...overrides,
  };
}

function segment(overrides: Partial<SleepSegment> = {}): SleepSegment {
  return {
    night: "2024-06-01",
    start_ts: "2024-06-02T00:00:00.000Z",
    end_ts: "2024-06-02T01:00:00.000Z",
    state: "asleep",
    raw_state: "HKCategoryValueSleepAnalysisAsleepCore",
    stage: "core",
    duration_hours: 1,
    ...overrides,
  };
}

describe("sleep dashboard analytics", () => {
  test("summarizes null efficiency and zero-night windows without breaking score bounds", () => {
    const empty = summarizeSleepWindow([]);
    expect(empty.nightsTracked).toBe(0);
    expect(empty.averageEfficiency).toBeNull();
    expect(empty.score.value).toBeGreaterThanOrEqual(0);
    expect(empty.score.value).toBeLessThanOrEqual(100);

    const summary = summarizeSleepWindow([night({ efficiency: null })]);
    expect(summary.averageEfficiency).toBeNull();
    expect(summary.score.value).toBeGreaterThanOrEqual(0);
    expect(summary.score.value).toBeLessThanOrEqual(100);
  });

  test("counts awake segments as selected-night awakenings", () => {
    const segments = [
      segment({ state: "awake", raw_state: "HKCategoryValueSleepAnalysisAwake", stage: null }),
      segment({ start_ts: "2024-06-02T02:00:00.000Z", end_ts: "2024-06-02T03:00:00.000Z" }),
      segment({
        start_ts: "2024-06-02T04:00:00.000Z",
        end_ts: "2024-06-02T04:10:00.000Z",
        state: "awake",
        raw_state: "HKCategoryValueSleepAnalysisAwake",
        stage: null,
        duration_hours: 1 / 6,
      }),
    ];
    expect(countAwakeningsForNight(segments)).toBe(2);
  });

  test("keeps overnight bedtime variation circular around midnight", () => {
    const variation = circularVariationMinutes([23 * 60 + 50, 0 * 60 + 10, 23 * 60 + 55]);
    expect(variation).not.toBeNull();
    expect(variation ?? 999).toBeLessThan(15);
  });

  test("provides a useful stage fallback when raw stage detail is missing", () => {
    const breakdown = stageBreakdownForNight(
      night({
        core_hours: null,
        deep_hours: null,
        rem_hours: null,
        unspecified_hours: null,
      }),
    );
    expect(breakdown.map((item) => item.key)).toEqual(["asleep", "awake"]);
    expect(breakdown.reduce((sum, item) => sum + item.percent, 0)).toBeCloseTo(1, 6);
  });

  test("computes prior-window deltas with positive and inverse-positive directions", () => {
    expect(compareMetric(7.5, 7, true)).toEqual({
      value: 0.5,
      direction: "up",
      isPositive: true,
    });
    expect(compareMetric(1.2, 1.8, false)).toEqual({
      value: -0.6000000000000001,
      direction: "down",
      isPositive: true,
    });
    expect(compareMetric(null, 1, true)).toEqual({
      value: null,
      direction: "neutral",
      isPositive: null,
    });
  });

  test("builds dashboard model with bounded current and prior sleep scores", () => {
    const model = buildSleepDashboardModel({
      currentNights: [
        night({ day: "2024-06-01" }),
        night({
          day: "2024-06-02",
          bedtime: "2024-06-02T23:45:00.000Z",
          wake_time: "2024-06-03T07:25:00.000Z",
          asleep_hours: 7.2,
          in_bed_hours: 7.8,
          efficiency: 7.2 / 7.8,
        }),
      ],
      currentSegments: [
        segment({ night: "2024-06-01" }),
        segment({
          night: "2024-06-02",
          start_ts: "2024-06-03T02:00:00.000Z",
          end_ts: "2024-06-03T02:15:00.000Z",
          state: "awake",
          raw_state: "HKCategoryValueSleepAnalysisAwake",
          stage: null,
          duration_hours: 0.25,
        }),
      ],
      priorNights: [night({ day: "2024-05-31", asleep_hours: 6.5, efficiency: 0.82 })],
      priorSegments: [],
    });
    expect(model.current.score.value).toBeGreaterThanOrEqual(0);
    expect(model.current.score.value).toBeLessThanOrEqual(100);
    expect(model.prior.score.value).toBeGreaterThanOrEqual(0);
    expect(model.prior.score.value).toBeLessThanOrEqual(100);
    expect(model.comparisons.averageAsleepHours.direction).toBe("up");
  });

  test("positions lane timeline segments by bedtime-to-wake offset", () => {
    const lanes = buildLaneSegments(night(), [
      segment({
        start_ts: "2024-06-02T01:30:00.000Z",
        end_ts: "2024-06-02T03:30:00.000Z",
        stage: "deep",
        raw_state: "HKCategoryValueSleepAnalysisAsleepDeep",
        duration_hours: 2,
      }),
    ]);
    expect(lanes).toHaveLength(1);
    expect(lanes[0]?.lane).toBe("deep");
    expect(lanes[0]?.startPercent).toBeCloseTo(25, 1);
    expect(lanes[0]?.widthPercent).toBeCloseTo(25, 1);
  });
});
