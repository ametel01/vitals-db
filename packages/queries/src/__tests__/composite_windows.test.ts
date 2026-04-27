import { describe, expect, test } from "bun:test";
import { buildCompositeWindows, classifyTrend } from "../composite_windows";

describe("composite window helpers", () => {
  test("buildCompositeWindows returns current, baseline, acute, chronic, and long trend windows", () => {
    expect(buildCompositeWindows({ from: "2024-06-08", to: "2024-06-14" })).toEqual({
      current: { from: "2024-06-08", to: "2024-06-14" },
      baseline: { from: "2024-06-01", to: "2024-06-07" },
      acute7d: { from: "2024-06-08", to: "2024-06-14" },
      chronic28d: { from: "2024-05-18", to: "2024-06-14" },
      longTrend12w: { from: "2024-03-23", to: "2024-06-14" },
    });
  });

  test("buildCompositeWindows normalizes datetime bounds to UTC dates", () => {
    expect(
      buildCompositeWindows({
        from: "2024-06-08T15:30:00.000Z",
        to: "2024-06-10T03:00:00.000Z",
      }),
    ).toMatchObject({
      current: { from: "2024-06-08", to: "2024-06-10" },
      baseline: { from: "2024-06-05", to: "2024-06-07" },
    });
  });

  test("buildCompositeWindows rejects reversed ranges", () => {
    expect(() => buildCompositeWindows({ from: "2024-06-14", to: "2024-06-08" })).toThrow();
  });

  test("classifyTrend handles higher-is-better and lower-is-better metrics", () => {
    expect(classifyTrend(105, 100)).toEqual({
      direction: "improving",
      delta: 5,
      percent_change: 0.05,
    });
    expect(classifyTrend(95, 100, { higherIsBetter: false })).toEqual({
      direction: "improving",
      delta: -5,
      percent_change: -0.05,
    });
  });

  test("classifyTrend treats small changes and missing data conservatively", () => {
    expect(classifyTrend(102, 100)).toEqual({
      direction: "flat",
      delta: 2,
      percent_change: 0.02,
    });
    expect(classifyTrend(null, 100)).toEqual({
      direction: "insufficient_data",
      delta: null,
      percent_change: null,
    });
  });
});
