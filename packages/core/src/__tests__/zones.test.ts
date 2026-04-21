import { describe, expect, test } from "bun:test";
import { HR_ZONES, HR_ZONE_ORDER } from "../zones";

describe("HR_ZONES", () => {
  test("Z2 matches spec §4.1 (115-125 bpm) — unchanged by 0.5.0", () => {
    expect(HR_ZONES.Z2).toEqual({ min: 115, max: 125 });
  });

  test("covers Z1..Z5 in ascending order", () => {
    expect(HR_ZONE_ORDER).toEqual(["Z1", "Z2", "Z3", "Z4", "Z5"]);
  });

  test("pins the chosen Z1/Z3/Z4/Z5 boundaries", () => {
    expect(HR_ZONES.Z1).toEqual({ min: 0, max: 114 });
    expect(HR_ZONES.Z3).toEqual({ min: 126, max: 140 });
    expect(HR_ZONES.Z4).toEqual({ min: 141, max: 155 });
    expect(HR_ZONES.Z5).toEqual({ min: 156, max: 1000 });
  });

  test("zones are contiguous with no gaps and no overlap (inclusive BETWEEN)", () => {
    for (let i = 1; i < HR_ZONE_ORDER.length; i++) {
      const prev = HR_ZONES[HR_ZONE_ORDER[i - 1] as keyof typeof HR_ZONES];
      const curr = HR_ZONES[HR_ZONE_ORDER[i] as keyof typeof HR_ZONES];
      expect(curr.min as number).toBe(prev.max + 1);
    }
  });
});
