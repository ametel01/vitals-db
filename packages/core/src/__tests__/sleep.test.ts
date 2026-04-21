import { describe, expect, test } from "bun:test";
import {
  RawSleepStateSchema,
  SLEEP_STAGE_DETAIL_MAP,
  SLEEP_STATE_MAP,
  SleepStageDetailSchema,
  SleepStateSchema,
  normalizeSleepStageDetail,
  normalizeSleepState,
} from "../sleep";

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

describe("normalizeSleepStageDetail", () => {
  test("maps raw Apple sleep stages to stage detail labels", () => {
    expect(normalizeSleepStageDetail("HKCategoryValueSleepAnalysisAsleepCore")).toBe("core");
    expect(normalizeSleepStageDetail("HKCategoryValueSleepAnalysisAsleepDeep")).toBe("deep");
    expect(normalizeSleepStageDetail("HKCategoryValueSleepAnalysisAsleepREM")).toBe("rem");
    expect(normalizeSleepStageDetail("HKCategoryValueSleepAnalysisAsleepUnspecified")).toBe(
      "unspecified",
    );
  });

  test("returns null for normalized-only or non-stage values", () => {
    expect(normalizeSleepStageDetail("HKCategoryValueSleepAnalysisAsleep")).toBeNull();
    expect(normalizeSleepStageDetail("HKCategoryValueSleepAnalysisInBed")).toBeNull();
    expect(normalizeSleepStageDetail("Awake")).toBeNull();
    expect(normalizeSleepStageDetail("")).toBeNull();
  });

  test("uses a single exported stage mapping source", () => {
    expect(SLEEP_STAGE_DETAIL_MAP.HKCategoryValueSleepAnalysisAsleepCore).toBe("core");
    expect(SLEEP_STAGE_DETAIL_MAP.HKCategoryValueSleepAnalysisAsleepREM).toBe("rem");
  });
});

describe("RawSleepStateSchema", () => {
  test("accepts Apple and legacy raw sleep values", () => {
    expect(RawSleepStateSchema.parse("HKCategoryValueSleepAnalysisAsleepCore")).toBe(
      "HKCategoryValueSleepAnalysisAsleepCore",
    );
    expect(RawSleepStateSchema.parse("InBed")).toBe("InBed");
  });
});

describe("SleepStageDetailSchema", () => {
  test("round-trips stage detail labels", () => {
    for (const stage of ["core", "deep", "rem", "unspecified"] as const) {
      expect(SleepStageDetailSchema.parse(stage)).toBe(stage);
    }
  });

  test("rejects non-stage labels", () => {
    expect(() => SleepStageDetailSchema.parse("asleep")).toThrow();
  });
});
