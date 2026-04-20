import { z } from "zod";

export const SLEEP_STATES = ["asleep", "in_bed", "awake"] as const;
export type SleepState = (typeof SLEEP_STATES)[number];
export const SleepStateSchema = z.enum(SLEEP_STATES);

export const SLEEP_STATE_MAP = {
  Asleep: "asleep",
  HKCategoryValueSleepAnalysisAsleep: "asleep",
  HKCategoryValueSleepAnalysisAsleepCore: "asleep",
  HKCategoryValueSleepAnalysisAsleepDeep: "asleep",
  HKCategoryValueSleepAnalysisAsleepREM: "asleep",
  HKCategoryValueSleepAnalysisAsleepUnspecified: "asleep",
  InBed: "in_bed",
  HKCategoryValueSleepAnalysisInBed: "in_bed",
  Awake: "awake",
  HKCategoryValueSleepAnalysisAwake: "awake",
} as const satisfies Record<string, SleepState>;

export type RawSleepState = keyof typeof SLEEP_STATE_MAP;

export function isRawSleepState(raw: string): raw is RawSleepState {
  return Object.hasOwn(SLEEP_STATE_MAP, raw);
}

export function normalizeSleepState(raw: string): SleepState | null {
  return isRawSleepState(raw) ? SLEEP_STATE_MAP[raw] : null;
}
