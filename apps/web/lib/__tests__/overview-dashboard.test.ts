import { describe, expect, test } from "bun:test";
import type { WorkoutSummary } from "@vitals/core";
import { activityBreakdown, resolveWeeklyActivity, statusFromDelta } from "../overview-dashboard";

function workout(overrides: Partial<WorkoutSummary>): WorkoutSummary {
  return {
    id: "run-1",
    type: "HKWorkoutActivityTypeRunning",
    source: "apple-watch",
    start_ts: "2024-06-03T08:00:00.000Z",
    end_ts: "2024-06-03T08:30:00.000Z",
    duration_sec: 1_800,
    ...overrides,
  } as WorkoutSummary;
}

describe("overview-dashboard helpers", () => {
  test("falls back to derived weekly activity when activity API fails", () => {
    const resolved = resolveWeeklyActivity(
      { ok: false, status: null, message: "activity missing" },
      {
        ok: true,
        data: [
          workout({ start_ts: "2024-06-03T08:00:00.000Z", duration_sec: 1_800 }),
          workout({ id: "walk-1", type: "HKWorkoutActivityTypeWalking", duration_sec: 900 }),
        ],
      },
    );

    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.data).toEqual([
        {
          week: "2024-06-03",
          workout_count: 2,
          total_duration_sec: 2_700,
        },
      ]);
    }
  });

  test("maps delta direction into status labels and tone", () => {
    expect(statusFromDelta(null, true, "Balanced", "Watch")).toEqual({
      label: "Insufficient data",
      tone: "neutral",
    });
    expect(statusFromDelta(-3, true, "Recovery improved", "Watch")).toEqual({
      label: "Recovery improved",
      tone: "good",
    });
    expect(statusFromDelta(3, false, "Positive", "Negative")).toEqual({
      label: "Positive",
      tone: "good",
    });
    expect(statusFromDelta(0.05, true, "Improved", "Declined")).toEqual({
      label: "Balanced",
      tone: "neutral",
    });
  });

  test("limits breakdown to top duration buckets and reports ratios", () => {
    const breakdown = activityBreakdown([
      workout({ id: "run-1", duration_sec: 300, type: "HKWorkoutActivityTypeRunning" }),
      workout({ id: "run-2", duration_sec: 200, type: "HKWorkoutActivityTypeRunning" }),
      workout({ id: "walk-1", duration_sec: 150, type: "HKWorkoutActivityTypeWalking" }),
      workout({ id: "cycle-1", duration_sec: 100, type: "HKWorkoutActivityTypeCycling" }),
      workout({ id: "bike-1", duration_sec: 80, type: "HKWorkoutActivityTypeCycling" }),
      workout({ id: "swim-1", duration_sec: 20, type: "HKWorkoutActivityTypeSwimming" }),
    ]);

    expect(breakdown).toHaveLength(4);
    expect(breakdown[0]).toEqual({
      type: "HKWorkoutActivityTypeRunning",
      durationSec: 500,
      ratio: 500 / 850,
    });
    expect(breakdown.reduce((sum, item) => sum + item.ratio, 0)).toBeLessThanOrEqual(1);
    expect(breakdown.every((item) => item.durationSec > 0)).toBe(true);
  });

  test("reports the best-effort duration-ratio coverage after filtering", () => {
    const breakdown = activityBreakdown([
      workout({ id: "run-1", duration_sec: 300, type: "HKWorkoutActivityTypeRunning" }),
      workout({ id: "run-2", duration_sec: 300, type: "HKWorkoutActivityTypeRunning" }),
    ]);

    expect(breakdown).toEqual([
      { type: "HKWorkoutActivityTypeRunning", durationSec: 600, ratio: 1 },
    ]);
  });
});
