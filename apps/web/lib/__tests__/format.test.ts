import { describe, expect, test } from "bun:test";
import {
  chartDataKey,
  formatIsoDateTime,
  formatPace,
  formatPercentValue,
  formatSleepConsistencyMinutes,
  formatTimeOfDay,
  windowStartIso,
} from "../format";

describe("web format helpers", () => {
  test("formatIsoDateTime renders timestamps in UTC for stable server output", () => {
    expect(formatIsoDateTime("2024-06-01T08:00:00.000Z")).toContain("08:00");
    expect(formatIsoDateTime("2024-06-01T08:00:00.000Z")).toContain("UTC");
  });

  test("formatSleepConsistencyMinutes converts seconds to minutes", () => {
    expect(formatSleepConsistencyMinutes(90)).toBe("1.5 min");
    expect(formatSleepConsistencyMinutes(1800)).toBe("30.0 min");
  });

  test("formatTimeOfDay renders UTC times for stable sleep labels", () => {
    expect(formatTimeOfDay("2024-06-01T22:30:00.000Z")).toContain("10:30");
  });

  test("windowStartIso returns an inclusive UTC window start", () => {
    const now = new Date();
    const expected = new Date(now);
    expected.setUTCDate(expected.getUTCDate() - 29);
    expect(windowStartIso(30)).toBe(expected.toISOString().slice(0, 10));
  });

  test("chartDataKey is stable for the same payload", () => {
    const payload = [{ day: "2024-06-01", value: 52 }];
    expect(chartDataKey("rhr", payload)).toBe(chartDataKey("rhr", payload));
  });

  test("formatPace renders mm:ss per kilometer", () => {
    expect(formatPace(277.77777777777777)).toBe("4:38 /km");
    expect(formatPace(null)).toBe("—");
  });

  test("formatPercentValue treats the input as an already-scaled percent", () => {
    expect(formatPercentValue(6.6666667, 1)).toBe("6.7%");
    expect(formatPercentValue(-0.00001, 1)).toBe("0.0%");
  });
});
