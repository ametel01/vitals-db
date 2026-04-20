import { describe, expect, test } from "bun:test";
import { SLEEP_STATE_MAP, SleepStateSchema, normalizeSleepState } from "../sleep";

describe("normalizeSleepState", () => {
  test("maps all asleep variants to 'asleep'", () => {
    for (const raw of [
      "HKCategoryValueSleepAnalysisAsleep",
      "HKCategoryValueSleepAnalysisAsleepCore",
      "HKCategoryValueSleepAnalysisAsleepDeep",
      "HKCategoryValueSleepAnalysisAsleepREM",
      "HKCategoryValueSleepAnalysisAsleepUnspecified",
    ]) {
      expect(normalizeSleepState(raw)).toBe("asleep");
    }
  });

  test("maps InBed and Awake suffixes", () => {
    expect(normalizeSleepState("HKCategoryValueSleepAnalysisInBed")).toBe("in_bed");
    expect(normalizeSleepState("HKCategoryValueSleepAnalysisAwake")).toBe("awake");
  });

  test("maps legacy short values from the spec table", () => {
    expect(normalizeSleepState("Asleep")).toBe("asleep");
    expect(normalizeSleepState("InBed")).toBe("in_bed");
    expect(normalizeSleepState("Awake")).toBe("awake");
  });

  test("returns null for unknown suffixes", () => {
    expect(normalizeSleepState("HKCategoryValueSleepAnalysisSomethingElse")).toBeNull();
    expect(normalizeSleepState("NotAsleep")).toBeNull();
    expect(normalizeSleepState("NotAwake")).toBeNull();
    expect(normalizeSleepState("")).toBeNull();
  });

  test("uses a single exported mapping source", () => {
    expect(SLEEP_STATE_MAP.HKCategoryValueSleepAnalysisAsleepREM).toBe("asleep");
    expect(SLEEP_STATE_MAP.HKCategoryValueSleepAnalysisInBed).toBe("in_bed");
    expect(SLEEP_STATE_MAP.HKCategoryValueSleepAnalysisAwake).toBe("awake");
  });
});

describe("SleepStateSchema", () => {
  test("round-trips normalized states", () => {
    for (const state of ["asleep", "in_bed", "awake"] as const) {
      expect(SleepStateSchema.parse(state)).toBe(state);
    }
  });

  test("rejects raw Apple values", () => {
    expect(() => SleepStateSchema.parse("HKCategoryValueSleepAnalysisAsleep")).toThrow();
  });
});
