import { describe, expect, test } from "bun:test";
import { formatDuckTs, hkDateToMs, mapRecord, mapWorkout, parseHKDate } from "../mappers";
import type { ParsedRecord, ParsedWorkout } from "../parser";

function record(
  type: ParsedRecord["type"],
  value: string,
  overrides: Partial<ParsedRecord> = {},
): ParsedRecord {
  return {
    kind: "record",
    type,
    startDate: "2024-06-01 08:00:00 +0000",
    endDate: "2024-06-01 08:00:00 +0000",
    value,
    sourceName: "Apple Watch",
    unit: null,
    ...overrides,
  };
}

describe("parseHKDate", () => {
  test("converts Apple-offset dates to UTC wall-clock strings", () => {
    expect(parseHKDate("2024-01-15 07:23:11 +0100")).toBe("2024-01-15 06:23:11.000");
  });

  test("handles Z-less input by assuming UTC", () => {
    expect(parseHKDate("2024-01-15 06:23:11 +0000")).toBe("2024-01-15 06:23:11.000");
  });

  test("round-trips via hkDateToMs + formatDuckTs", () => {
    const ms = hkDateToMs("2024-06-01 08:30:15 -0500");
    expect(formatDuckTs(ms)).toBe("2024-06-01 13:30:15.000");
  });

  test("rejects empty input", () => {
    expect(() => parseHKDate("")).toThrow();
  });
});

describe("mapRecord", () => {
  test("HeartRate → heart_rate row", () => {
    const m = mapRecord(record("HKQuantityTypeIdentifierHeartRate", "72"));
    expect(m).not.toBeNull();
    expect(m?.table).toBe("heart_rate");
    expect(m?.values).toEqual(["2024-06-01 08:00:00.000", 72, "Apple Watch"]);
    expect(m?.recordType).toBe("HKQuantityTypeIdentifierHeartRate");
  });

  test("RestingHR → resting_hr row", () => {
    const m = mapRecord(record("HKQuantityTypeIdentifierRestingHeartRate", "55"));
    expect(m?.table).toBe("resting_hr");
    expect(m?.values).toEqual(["2024-06-01 08:00:00.000", 55]);
  });

  test("HRV SDNN → hrv row", () => {
    const m = mapRecord(record("HKQuantityTypeIdentifierHeartRateVariabilitySDNN", "42.5"));
    expect(m?.table).toBe("hrv");
    expect(m?.values).toEqual(["2024-06-01 08:00:00.000", 42.5]);
  });

  test("WalkingHeartRateAverage → walking_hr row", () => {
    const m = mapRecord(record("HKQuantityTypeIdentifierWalkingHeartRateAverage", "88"));
    expect(m?.table).toBe("walking_hr");
    expect(m?.values).toEqual(["2024-06-01 08:00:00.000", 88]);
  });

  test("StepCount → steps row", () => {
    const m = mapRecord(record("HKQuantityTypeIdentifierStepCount", "120"));
    expect(m?.table).toBe("steps");
    expect(m?.values).toEqual(["2024-06-01 08:00:00.000", 120]);
  });

  test("DistanceWalkingRunning → distance row", () => {
    const m = mapRecord(
      record("HKQuantityTypeIdentifierDistanceWalkingRunning", "102.3", { unit: "m" }),
    );
    expect(m?.table).toBe("distance");
    expect(m?.values).toEqual(["2024-06-01 08:00:00.000", 102.3]);
  });

  test("DistanceWalkingRunning converts km to meters", () => {
    const m = mapRecord(
      record("HKQuantityTypeIdentifierDistanceWalkingRunning", "1.2", { unit: "km" }),
    );
    expect(m?.values).toEqual(["2024-06-01 08:00:00.000", 1200]);
  });

  test("ActiveEnergyBurned → energy (sparse, active column)", () => {
    const m = mapRecord(
      record("HKQuantityTypeIdentifierActiveEnergyBurned", "3.5", { unit: "kcal" }),
    );
    expect(m?.table).toBe("energy");
    expect(m?.values).toEqual(["2024-06-01 08:00:00.000", 3.5, null]);
  });

  test("ActiveEnergyBurned converts kJ to kcal", () => {
    const m = mapRecord(
      record("HKQuantityTypeIdentifierActiveEnergyBurned", "4.184", { unit: "kJ" }),
    );
    expect(m?.values).toEqual(["2024-06-01 08:00:00.000", 1, null]);
  });

  test("BasalEnergyBurned → energy (sparse, basal column)", () => {
    const m = mapRecord(
      record("HKQuantityTypeIdentifierBasalEnergyBurned", "1.1", { unit: "kcal" }),
    );
    expect(m?.table).toBe("energy");
    expect(m?.values).toEqual(["2024-06-01 08:00:00.000", null, 1.1]);
  });

  test("VO2Max → performance (sparse, vo2max column)", () => {
    const m = mapRecord(record("HKQuantityTypeIdentifierVO2Max", "48.2"));
    expect(m?.table).toBe("performance");
    expect(m?.values).toEqual(["2024-06-01 08:00:00.000", 48.2, null, null]);
  });

  test("RunningSpeed → performance (sparse, speed column)", () => {
    const m = mapRecord(record("HKQuantityTypeIdentifierRunningSpeed", "3.2", { unit: "m/s" }));
    expect(m?.table).toBe("performance");
    expect(m?.values).toEqual(["2024-06-01 08:00:00.000", null, 3.2, null]);
  });

  test("RunningSpeed converts km/h to m/s", () => {
    const m = mapRecord(record("HKQuantityTypeIdentifierRunningSpeed", "10.8", { unit: "km/hr" }));
    expect(m?.values).toEqual(["2024-06-01 08:00:00.000", null, 3, null]);
  });

  test("unknown distance unit yields null mapping", () => {
    const m = mapRecord(
      record("HKQuantityTypeIdentifierDistanceWalkingRunning", "1.2", { unit: "league" }),
    );
    expect(m).toBeNull();
  });

  test("RunningPower → performance (sparse, power column)", () => {
    const m = mapRecord(record("HKQuantityTypeIdentifierRunningPower", "210"));
    expect(m?.table).toBe("performance");
    expect(m?.values).toEqual(["2024-06-01 08:00:00.000", null, null, 210]);
  });

  test("SleepAnalysis → sleep row with normalized state", () => {
    const m = mapRecord(
      record("HKCategoryTypeIdentifierSleepAnalysis", "HKCategoryValueSleepAnalysisAsleepCore", {
        startDate: "2024-06-01 23:00:00 +0000",
        endDate: "2024-06-02 06:30:00 +0000",
      }),
    );
    expect(m?.table).toBe("sleep");
    expect(m?.values).toEqual(["2024-06-01 23:00:00.000", "2024-06-02 06:30:00.000", "asleep"]);
  });

  test("SleepAnalysis drops unknown category values", () => {
    const m = mapRecord(
      record("HKCategoryTypeIdentifierSleepAnalysis", "HKCategoryValueSleepAnalysisMystery"),
    );
    expect(m).toBeNull();
  });

  test("non-numeric quantity value yields null mapping", () => {
    const m = mapRecord(record("HKQuantityTypeIdentifierHeartRate", "NaN"));
    expect(m).toBeNull();
  });

  test("blank quantity value yields null mapping", () => {
    const m = mapRecord(record("HKQuantityTypeIdentifierHeartRate", "   "));
    expect(m).toBeNull();
  });

  test("partially numeric quantity value yields null mapping", () => {
    const m = mapRecord(record("HKQuantityTypeIdentifierHeartRate", "72bpm"));
    expect(m).toBeNull();
  });
});

describe("mapWorkout", () => {
  const baseWorkout: ParsedWorkout = {
    kind: "workout",
    workoutActivityType: "HKWorkoutActivityTypeRunning",
    startDate: "2024-06-01 08:00:00 +0000",
    endDate: "2024-06-01 08:30:00 +0000",
    duration: "30",
    durationUnit: "min",
    sourceName: "Apple Watch",
  };

  test("produces workouts row with canonical type and duration in seconds", () => {
    const m = mapWorkout(baseWorkout);
    expect(m.table).toBe("workouts");
    const [id, type, start, end, durationSec, source] = m.values;
    expect(typeof id).toBe("string");
    expect((id as string).length).toBe(40);
    expect(type).toBe("Running");
    expect(start).toBe("2024-06-01 08:00:00.000");
    expect(end).toBe("2024-06-01 08:30:00.000");
    expect(durationSec).toBe(1800);
    expect(source).toBe("Apple Watch");
  });

  test("falls back to end-start when duration unit is unknown", () => {
    const m = mapWorkout({ ...baseWorkout, duration: null, durationUnit: null });
    expect(m.values[4]).toBe(1800);
  });

  test("clamps negative duration attributes to zero", () => {
    const m = mapWorkout({ ...baseWorkout, duration: "-30", durationUnit: "min" });
    expect(m.values[4]).toBe(0);
  });

  test("workout id is stable across runs", () => {
    const a = mapWorkout(baseWorkout);
    const b = mapWorkout(baseWorkout);
    const idA = a.values[0];
    const idB = b.values[0];
    expect(typeof idA).toBe("string");
    expect(idA).toBe(idB ?? null);
  });
});

describe("dedup keys", () => {
  test("identical records produce identical dedup keys", () => {
    const a = mapRecord(record("HKQuantityTypeIdentifierHeartRate", "72"));
    const b = mapRecord(record("HKQuantityTypeIdentifierHeartRate", "72"));
    expect(a?.dedupKey).toBe(b?.dedupKey ?? "");
  });

  test("differing value changes the dedup key", () => {
    const a = mapRecord(record("HKQuantityTypeIdentifierHeartRate", "72"));
    const b = mapRecord(record("HKQuantityTypeIdentifierHeartRate", "73"));
    expect(a?.dedupKey).not.toBe(b?.dedupKey);
  });

  test("differing source changes the dedup key", () => {
    const a = mapRecord(record("HKQuantityTypeIdentifierHeartRate", "72"));
    const b = mapRecord(
      record("HKQuantityTypeIdentifierHeartRate", "72", { sourceName: "iPhone" }),
    );
    expect(a?.dedupKey).not.toBe(b?.dedupKey);
  });
});
