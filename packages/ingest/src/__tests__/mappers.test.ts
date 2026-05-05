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

describe("mappers edge cases", () => {
  test("normalizes Apple Health dates to UTC", () => {
    expect(parseHKDate("2024-01-15 07:23:11 +0100")).toBe("2024-01-15 06:23:11.000");
    const ms = hkDateToMs("2024-06-01 08:30:15 -0500");
    expect(formatDuckTs(ms)).toBe("2024-06-01 13:30:15.000");
  });

  test("maps energy records with sparse columns", () => {
    const active = mapRecord(
      record("HKQuantityTypeIdentifierActiveEnergyBurned", "3.5", { unit: "kcal" }),
    );
    const basal = mapRecord(
      record("HKQuantityTypeIdentifierBasalEnergyBurned", "1.1", { unit: "kcal" }),
    );
    expect(active?.table).toBe("energy");
    expect(active?.values).toEqual(["2024-06-01 08:00:00.000", 3.5, null]);
    expect(basal?.values).toEqual(["2024-06-01 08:00:00.000", null, 1.1]);
  });

  test("drops unsupported or malformed record values", () => {
    expect(
      mapRecord(
        record("HKQuantityTypeIdentifierDistanceWalkingRunning", "1.2", { unit: "league" }),
      ),
    ).toBeNull();
    expect(mapRecord(record("HKQuantityTypeIdentifierHeartRate", "72bpm"))).toBeNull();
  });

  test("workout id remains stable for identical workouts", () => {
    const workout: ParsedWorkout = {
      kind: "workout",
      workoutActivityType: "HKWorkoutActivityTypeRunning",
      startDate: "2024-06-01 08:00:00 +0000",
      endDate: "2024-06-01 08:30:00 +0000",
      duration: "30",
      durationUnit: "min",
      sourceName: "Apple Watch",
      statistics: [],
      events: [],
      metadata: [],
      routes: [],
    };
    const a = mapWorkout(workout);
    const b = mapWorkout(workout);
    expect(a.values[0]).toBe((b.values[0] as string | number | null) ?? null);
  });
});
