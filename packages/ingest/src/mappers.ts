import { createHash } from "node:crypto";
import {
  type HKIdentifier,
  SLEEP_STATE_MAP,
  canonicalWorkoutType,
  isRawSleepState,
} from "@vitals/core";
import type { ParsedRecord, ParsedWorkout } from "./parser";

export type AnalyticsTable =
  | "heart_rate"
  | "resting_hr"
  | "hrv"
  | "walking_hr"
  | "steps"
  | "distance"
  | "energy"
  | "performance"
  | "sleep"
  | "workouts";

export type RowValue = string | number | null;

export interface MappedInsert {
  table: AnalyticsTable;
  values: RowValue[];
  dedupKey: string;
  recordType: string;
  startTs: string;
  endTs: string;
  startTsMs: number;
  endTsMs: number;
  source: string | null;
}

// Apple Health timestamps look like "YYYY-MM-DD HH:MM:SS ±HHMM". DuckDB
// TIMESTAMP columns are wall-clock without zone; we normalize every sample to
// UTC at ingest so that later analytics queries can treat DATE(ts) as a UTC day.
export function hkDateToMs(input: string): number {
  const trimmed = input.trim();
  if (trimmed === "") throw new Error(`invalid HK date: "${input}"`);
  // Apple format: "YYYY-MM-DD HH:MM:SS ±HHMM". Collapse the offset first (it is
  // separated by whitespace and uses no colon) before swapping the date/time
  // space for the ISO `T`.
  const withColonOffset = trimmed.replace(/\s+([+-]\d{2})(\d{2})$/, "$1:$2");
  const withT = withColonOffset.replace(" ", "T");
  const hasOffset = /(?:Z|[+-]\d{2}:\d{2})$/.test(withT);
  const isoCandidate = hasOffset ? withT : `${withT}Z`;
  const ms = Date.parse(isoCandidate);
  if (Number.isNaN(ms)) throw new Error(`invalid HK date: "${input}"`);
  return ms;
}

export function formatDuckTs(ms: number): string {
  const iso = new Date(ms).toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 23)}`;
}

export function parseHKDate(input: string): string {
  return formatDuckTs(hkDateToMs(input));
}

function dedupKey(
  type: string,
  startTs: string,
  endTs: string,
  value: string,
  source: string | null,
): string {
  return `${type}|${startTs}|${endTs}|${value}|${source ?? ""}`;
}

function workoutIdOf(rawType: string, startTs: string, endTs: string): string {
  return createHash("sha1").update(`${rawType}|${startTs}|${endTs}`).digest("hex");
}

function parseFiniteNumber(raw: string | null): number | null {
  if (raw === null) return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function normalizeUnit(unit: string | null): string | null {
  return unit?.trim().toLowerCase() ?? null;
}

function convertDistanceToMeters(value: number, unit: string | null): number | null {
  switch (normalizeUnit(unit)) {
    case null:
    case "m":
    case "meter":
    case "meters":
      return value;
    case "km":
    case "kilometer":
    case "kilometers":
      return value * 1000;
    case "mi":
    case "mile":
    case "miles":
      return value * 1609.344;
    case "ft":
    case "foot":
    case "feet":
      return value * 0.3048;
    default:
      return null;
  }
}

function convertEnergyToKcal(value: number, unit: string | null): number | null {
  switch (normalizeUnit(unit)) {
    case null:
    case "kcal":
    case "cal":
      return value;
    case "kj":
      return value / 4.184;
    default:
      return null;
  }
}

function convertSpeedToMetersPerSecond(value: number, unit: string | null): number | null {
  switch (normalizeUnit(unit)) {
    case null:
    case "m/s":
      return value;
    case "km/h":
    case "km/hr":
      return value / 3.6;
    case "mph":
    case "mi/h":
    case "mi/hr":
      return value * 0.44704;
    default:
      return null;
  }
}

function makeMapped(
  table: AnalyticsTable,
  values: RowValue[],
  rawType: string,
  valueToken: string,
  startTs: string,
  endTs: string,
  startTsMs: number,
  endTsMs: number,
  source: string | null,
): MappedInsert {
  return {
    table,
    values,
    dedupKey: dedupKey(rawType, startTs, endTs, valueToken, source),
    recordType: rawType,
    startTs,
    endTs,
    startTsMs,
    endTsMs,
    source,
  };
}

export function mapRecord(rec: ParsedRecord): MappedInsert | null {
  const startTsMs = hkDateToMs(rec.startDate);
  const endTsMs = hkDateToMs(rec.endDate);
  const startTs = formatDuckTs(startTsMs);
  const endTs = formatDuckTs(endTsMs);
  const source = rec.sourceName;
  const rawValue = rec.value ?? "";

  const byType: Record<HKIdentifier, () => MappedInsert | null> = {
    HKQuantityTypeIdentifierHeartRate: () => {
      const bpm = parseFiniteNumber(rec.value);
      if (bpm === null) return null;
      return makeMapped(
        "heart_rate",
        [startTs, bpm, source],
        rec.type,
        rawValue,
        startTs,
        endTs,
        startTsMs,
        endTsMs,
        source,
      );
    },
    HKQuantityTypeIdentifierRestingHeartRate: () => {
      const bpm = parseFiniteNumber(rec.value);
      if (bpm === null) return null;
      return makeMapped(
        "resting_hr",
        [startTs, bpm],
        rec.type,
        rawValue,
        startTs,
        endTs,
        startTsMs,
        endTsMs,
        source,
      );
    },
    HKQuantityTypeIdentifierHeartRateVariabilitySDNN: () => {
      const v = parseFiniteNumber(rec.value);
      if (v === null) return null;
      return makeMapped(
        "hrv",
        [startTs, v],
        rec.type,
        rawValue,
        startTs,
        endTs,
        startTsMs,
        endTsMs,
        source,
      );
    },
    HKQuantityTypeIdentifierWalkingHeartRateAverage: () => {
      const bpm = parseFiniteNumber(rec.value);
      if (bpm === null) return null;
      return makeMapped(
        "walking_hr",
        [startTs, bpm],
        rec.type,
        rawValue,
        startTs,
        endTs,
        startTsMs,
        endTsMs,
        source,
      );
    },
    HKQuantityTypeIdentifierStepCount: () => {
      const n = parseFiniteNumber(rec.value);
      if (n === null) return null;
      return makeMapped(
        "steps",
        [startTs, n],
        rec.type,
        rawValue,
        startTs,
        endTs,
        startTsMs,
        endTsMs,
        source,
      );
    },
    HKQuantityTypeIdentifierDistanceWalkingRunning: () => {
      const rawMeters = parseFiniteNumber(rec.value);
      const m = rawMeters === null ? null : convertDistanceToMeters(rawMeters, rec.unit);
      if (m === null) return null;
      return makeMapped(
        "distance",
        [startTs, m],
        rec.type,
        rawValue,
        startTs,
        endTs,
        startTsMs,
        endTsMs,
        source,
      );
    },
    HKQuantityTypeIdentifierActiveEnergyBurned: () => {
      const rawKcal = parseFiniteNumber(rec.value);
      const kcal = rawKcal === null ? null : convertEnergyToKcal(rawKcal, rec.unit);
      if (kcal === null) return null;
      return makeMapped(
        "energy",
        [startTs, kcal, null],
        rec.type,
        rawValue,
        startTs,
        endTs,
        startTsMs,
        endTsMs,
        source,
      );
    },
    HKQuantityTypeIdentifierBasalEnergyBurned: () => {
      const rawKcal = parseFiniteNumber(rec.value);
      const kcal = rawKcal === null ? null : convertEnergyToKcal(rawKcal, rec.unit);
      if (kcal === null) return null;
      return makeMapped(
        "energy",
        [startTs, null, kcal],
        rec.type,
        rawValue,
        startTs,
        endTs,
        startTsMs,
        endTsMs,
        source,
      );
    },
    HKQuantityTypeIdentifierVO2Max: () => {
      const v = parseFiniteNumber(rec.value);
      if (v === null) return null;
      return makeMapped(
        "performance",
        [startTs, v, null, null],
        rec.type,
        rawValue,
        startTs,
        endTs,
        startTsMs,
        endTsMs,
        source,
      );
    },
    HKQuantityTypeIdentifierRunningSpeed: () => {
      const rawSpeed = parseFiniteNumber(rec.value);
      const v = rawSpeed === null ? null : convertSpeedToMetersPerSecond(rawSpeed, rec.unit);
      if (v === null) return null;
      return makeMapped(
        "performance",
        [startTs, null, v, null],
        rec.type,
        rawValue,
        startTs,
        endTs,
        startTsMs,
        endTsMs,
        source,
      );
    },
    HKQuantityTypeIdentifierRunningPower: () => {
      const v = parseFiniteNumber(rec.value);
      if (v === null) return null;
      return makeMapped(
        "performance",
        [startTs, null, null, v],
        rec.type,
        rawValue,
        startTs,
        endTs,
        startTsMs,
        endTsMs,
        source,
      );
    },
    HKCategoryTypeIdentifierSleepAnalysis: () => {
      if (rec.value === null) return null;
      if (!isRawSleepState(rec.value)) return null;
      const state = SLEEP_STATE_MAP[rec.value];
      return makeMapped(
        "sleep",
        [startTs, endTs, state, rec.value],
        rec.type,
        rawValue,
        startTs,
        endTs,
        startTsMs,
        endTsMs,
        source,
      );
    },
  };

  return byType[rec.type]();
}

function durationUnitToSeconds(unit: string | null): number | null {
  if (unit === null) return null;
  switch (unit) {
    case "s":
    case "sec":
      return 1;
    case "min":
      return 60;
    case "hr":
    case "h":
      return 3600;
    default:
      return null;
  }
}

function computeWorkoutDurationSec(w: ParsedWorkout, startTsMs: number, endTsMs: number): number {
  if (w.duration !== null) {
    const d = Number.parseFloat(w.duration);
    const factor = durationUnitToSeconds(w.durationUnit);
    if (Number.isFinite(d) && factor !== null) return Math.max(0, d * factor);
  }
  return Math.max(0, (endTsMs - startTsMs) / 1000);
}

export function mapWorkout(w: ParsedWorkout): MappedInsert {
  const startTsMs = hkDateToMs(w.startDate);
  const endTsMs = hkDateToMs(w.endDate);
  const startTs = formatDuckTs(startTsMs);
  const endTs = formatDuckTs(endTsMs);
  const source = w.sourceName;
  const canonicalType = canonicalWorkoutType(w.workoutActivityType);
  const durationSec = computeWorkoutDurationSec(w, startTsMs, endTsMs);
  const id = workoutIdOf(w.workoutActivityType, startTs, endTs);

  return makeMapped(
    "workouts",
    [id, canonicalType, startTs, endTs, durationSec, source],
    w.workoutActivityType,
    String(durationSec),
    startTs,
    endTs,
    startTsMs,
    endTsMs,
    source,
  );
}

export function mapNode(node: ParsedRecord | ParsedWorkout): MappedInsert | null {
  return node.kind === "record" ? mapRecord(node) : mapWorkout(node);
}
