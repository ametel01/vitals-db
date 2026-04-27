import { z } from "zod";

export const HK_QUANTITY_IDENTIFIERS = [
  "HKQuantityTypeIdentifierHeartRate",
  "HKQuantityTypeIdentifierRestingHeartRate",
  "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
  "HKQuantityTypeIdentifierWalkingHeartRateAverage",
  "HKQuantityTypeIdentifierStepCount",
  "HKQuantityTypeIdentifierDistanceWalkingRunning",
  "HKQuantityTypeIdentifierActiveEnergyBurned",
  "HKQuantityTypeIdentifierBasalEnergyBurned",
  "HKQuantityTypeIdentifierVO2Max",
  "HKQuantityTypeIdentifierRunningSpeed",
  "HKQuantityTypeIdentifierRunningPower",
  "HKQuantityTypeIdentifierRunningVerticalOscillation",
  "HKQuantityTypeIdentifierRunningGroundContactTime",
  "HKQuantityTypeIdentifierRunningStrideLength",
] as const;

export const HK_CATEGORY_IDENTIFIERS = ["HKCategoryTypeIdentifierSleepAnalysis"] as const;

export const HK_IDENTIFIERS = [...HK_QUANTITY_IDENTIFIERS, ...HK_CATEGORY_IDENTIFIERS] as const;

export type HKQuantityIdentifier = (typeof HK_QUANTITY_IDENTIFIERS)[number];
export type HKCategoryIdentifier = (typeof HK_CATEGORY_IDENTIFIERS)[number];
export type HKIdentifier = (typeof HK_IDENTIFIERS)[number];

export const HKQuantityIdentifierSchema = z.enum(HK_QUANTITY_IDENTIFIERS);
export const HKCategoryIdentifierSchema = z.enum(HK_CATEGORY_IDENTIFIERS);
export const HKIdentifierSchema = z.enum(HK_IDENTIFIERS);

const HK_IDENTIFIER_SET: ReadonlySet<string> = new Set(HK_IDENTIFIERS);

export function isHKIdentifier(value: string): value is HKIdentifier {
  return HK_IDENTIFIER_SET.has(value);
}

const WORKOUT_ACTIVITY_PREFIX = "HKWorkoutActivityType";

export const WorkoutActivityTypeSchema = z
  .string()
  .refine(
    (v) => v.startsWith(WORKOUT_ACTIVITY_PREFIX) && v.length > WORKOUT_ACTIVITY_PREFIX.length,
    { message: `Must start with "${WORKOUT_ACTIVITY_PREFIX}" and carry a suffix` },
  );

export type WorkoutActivityType = z.infer<typeof WorkoutActivityTypeSchema>;

export function canonicalWorkoutType(raw: string): string {
  return raw.startsWith(WORKOUT_ACTIVITY_PREFIX) ? raw.slice(WORKOUT_ACTIVITY_PREFIX.length) : raw;
}
