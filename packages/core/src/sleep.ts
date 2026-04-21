import { z } from "zod";

export const SLEEP_STATES = ["asleep", "in_bed", "awake"] as const;
export type SleepState = (typeof SLEEP_STATES)[number];
export const SleepStateSchema = z.enum(SLEEP_STATES);

export const RAW_SLEEP_STATES = [
  "Asleep",
  "HKCategoryValueSleepAnalysisAsleep",
  "HKCategoryValueSleepAnalysisAsleepCore",
  "HKCategoryValueSleepAnalysisAsleepDeep",
  "HKCategoryValueSleepAnalysisAsleepREM",
  "HKCategoryValueSleepAnalysisAsleepUnspecified",
  "InBed",
  "HKCategoryValueSleepAnalysisInBed",
  "Awake",
  "HKCategoryValueSleepAnalysisAwake",
] as const;
export type RawSleepState = (typeof RAW_SLEEP_STATES)[number];
export const RawSleepStateSchema = z.enum(RAW_SLEEP_STATES);

export const SLEEP_STAGE_DETAILS = ["core", "deep", "rem", "unspecified"] as const;
export type SleepStageDetail = (typeof SLEEP_STAGE_DETAILS)[number];
export const SleepStageDetailSchema = z.enum(SLEEP_STAGE_DETAILS);

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
} as const satisfies Record<RawSleepState, SleepState>;

export const SLEEP_STAGE_DETAIL_MAP: Partial<Record<RawSleepState, SleepStageDetail>> = {
  HKCategoryValueSleepAnalysisAsleepCore: "core",
  HKCategoryValueSleepAnalysisAsleepDeep: "deep",
  HKCategoryValueSleepAnalysisAsleepREM: "rem",
  HKCategoryValueSleepAnalysisAsleepUnspecified: "unspecified",
};

export function isRawSleepState(raw: string): raw is RawSleepState {
  return Object.hasOwn(SLEEP_STATE_MAP, raw);
}

export function normalizeSleepState(raw: string): SleepState | null {
  return isRawSleepState(raw) ? SLEEP_STATE_MAP[raw] : null;
}

export function normalizeSleepStageDetail(raw: string): SleepStageDetail | null {
  return isRawSleepState(raw) ? (SLEEP_STAGE_DETAIL_MAP[raw] ?? null) : null;
}
