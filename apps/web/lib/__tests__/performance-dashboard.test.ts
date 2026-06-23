import { describe, expect, test } from "bun:test";
import type { ZoneTimeDistributionRow } from "@vitals/core";
import {
  actionTone,
  buildForecast,
  buildGuidance,
  buildInsightCards,
  buildZoneShare,
} from "../performance-dashboard";

describe("performance-dashboard helpers", () => {
  test("returns fallback forecast values when the report is unavailable", () => {
    const forecast = buildForecast({ ok: false, status: null, message: "upstream error" });

    expect(forecast.label).toBe("Next week intensity");
    expect(forecast.recommendation).toBe("Report unavailable.");
    expect(forecast.tone).toBe("warning");
    expect(forecast.values).toEqual([14, 18, 16, 22, 19, 28, 30, 26, 24, 25]);
  });

  test("returns deterministic fallback insight cards with stable titles", () => {
    const cards = buildInsightCards({ ok: false, status: null, message: "unavailable" });

    expect(cards).toHaveLength(4);
    expect(cards.map((card) => card.title)).toEqual([
      "Fitness direction",
      "Load quality",
      "Recovery debt",
      "Workout flags",
    ]);
    expect(cards.every((card) => card.answer === "Signal unavailable.")).toBe(true);
    expect(cards.map((card) => card.status)).toEqual(["loading", "loading", "loading", "loading"]);
  });

  test("maps composite action intent into tone", () => {
    expect(actionTone("reduce_intensity")).toBe("danger");
    expect(actionTone("push")).toBe("success");
    expect(actionTone("watch")).toBe("warning");
  });

  test("builds zone-share series from zone rows with duration conversion", () => {
    const fallback = buildZoneShare({ ok: false, status: null, message: "unavailable" });
    expect(fallback).toEqual({ z2Ratio: null, totalDuration: 0, rows: [] });

    const rows = buildZoneShare({
      ok: true,
      data: [
        { zone: "Z2", duration_sec: 600, ratio: 0.42 } as ZoneTimeDistributionRow,
        { zone: "Z3", duration_sec: 300, ratio: 0.21 } as ZoneTimeDistributionRow,
        { zone: "Z1", duration_sec: 100, ratio: 0.07 } as ZoneTimeDistributionRow,
      ],
    });

    expect(rows.z2Ratio).toBeCloseTo(0.42);
    expect(rows.totalDuration).toBe(1000);
    expect(rows.rows).toEqual([
      { zone: "Z2", ratio: 0.42, minutes: 10 },
      { zone: "Z3", ratio: 0.21, minutes: 5 },
      { zone: "Z1", ratio: 0.07, minutes: 1.6666666666666667 },
    ]);
  });

  test("uses a fallback guidance message when report data is missing", () => {
    const guidance = buildGuidance({ ok: false, status: null, message: "unavailable" }, 4.2, null);

    expect(guidance.changed).toBe("The report is unavailable.");
    expect(guidance.footer).toBe("Re-evaluate after the report endpoint recovers.");
    expect(guidance.actions).toEqual([
      "Review source samples",
      "Re-run the report once the API is reachable",
    ]);
  });
});
