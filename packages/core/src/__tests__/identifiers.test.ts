import { describe, expect, test } from "bun:test";
import {
  HKIdentifierSchema,
  HK_CATEGORY_IDENTIFIERS,
  HK_IDENTIFIERS,
  HK_QUANTITY_IDENTIFIERS,
  WorkoutActivityTypeSchema,
  canonicalWorkoutType,
  isHKIdentifier,
} from "../identifiers";

describe("HK identifier enum", () => {
  test("includes WalkingHeartRateAverage per spec §3.2", () => {
    expect(HK_QUANTITY_IDENTIFIERS).toContain("HKQuantityTypeIdentifierWalkingHeartRateAverage");
  });

  test("combined enum covers quantity + category sets", () => {
    const total: number = HK_IDENTIFIERS.length;
    const parts: number = HK_QUANTITY_IDENTIFIERS.length + HK_CATEGORY_IDENTIFIERS.length;
    expect(total).toBe(parts);
  });

  test("round-trip parse of a known identifier", () => {
    const parsed = HKIdentifierSchema.parse("HKQuantityTypeIdentifierHeartRate");
    expect(parsed).toBe("HKQuantityTypeIdentifierHeartRate");
  });

  test("rejects an out-of-scope identifier", () => {
    expect(() => HKIdentifierSchema.parse("HKQuantityTypeIdentifierBodyMass")).toThrow();
  });

  test("isHKIdentifier narrows unknown strings", () => {
    expect(isHKIdentifier("HKCategoryTypeIdentifierSleepAnalysis")).toBe(true);
    expect(isHKIdentifier("not-a-hk-identifier")).toBe(false);
  });
});

describe("WorkoutActivityType", () => {
  test("accepts any HKWorkoutActivityType* value", () => {
    expect(WorkoutActivityTypeSchema.parse("HKWorkoutActivityTypeRunning")).toBe(
      "HKWorkoutActivityTypeRunning",
    );
    expect(WorkoutActivityTypeSchema.parse("HKWorkoutActivityTypeCrossCountrySkiing")).toBe(
      "HKWorkoutActivityTypeCrossCountrySkiing",
    );
  });

  test("rejects values missing the prefix or suffix", () => {
    expect(() => WorkoutActivityTypeSchema.parse("Running")).toThrow();
    expect(() => WorkoutActivityTypeSchema.parse("HKWorkoutActivityType")).toThrow();
  });

  test("canonicalWorkoutType strips the prefix", () => {
    expect(canonicalWorkoutType("HKWorkoutActivityTypeRunning")).toBe("Running");
    expect(canonicalWorkoutType("already-short")).toBe("already-short");
  });
});
