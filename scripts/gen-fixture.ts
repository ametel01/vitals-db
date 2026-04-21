#!/usr/bin/env bun
// Generates `fixtures/sample.xml`: a compact Apple Health export covering the
// MVP surfaces (workouts + HR-per-workout, resting HR trend, sleep duration,
// weekly activity). Run via `bun run scripts/gen-fixture.ts`.

import { writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = join(import.meta.dir, "..", "fixtures", "sample.xml");

const fmt = (d: Date): string => {
  const pad = (n: number, w = 2): string => String(n).padStart(w, "0");
  const y = d.getUTCFullYear();
  const mo = pad(d.getUTCMonth() + 1);
  const da = pad(d.getUTCDate());
  const h = pad(d.getUTCHours());
  const mi = pad(d.getUTCMinutes());
  const s = pad(d.getUTCSeconds());
  return `${y}-${mo}-${da} ${h}:${mi}:${s} +0000`;
};

const addMinutes = (d: Date, m: number): Date => new Date(d.getTime() + m * 60_000);
const addSeconds = (d: Date, s: number): Date => new Date(d.getTime() + s * 1000);
const addDays = (d: Date, days: number): Date => new Date(d.getTime() + days * 86_400_000);

const records: string[] = [];
const workouts: string[] = [];
const rec = (attrs: Record<string, string>): void => {
  const a = Object.entries(attrs)
    .map(([k, v]) => `${k}="${v}"`)
    .join(" ");
  records.push(`  <Record ${a}/>`);
};
const workout = (attrs: Record<string, string>): void => {
  const a = Object.entries(attrs)
    .map(([k, v]) => `${k}="${v}"`)
    .join(" ");
  // Keep workouts after records so the generated fixture matches the export DTD.
  workouts.push(`  <Workout ${a}/>`);
};

// Anchor the fixture to the current date so the dashboard's "last 30 days"
// window always contains data. Re-run this script to refresh if the fixture
// ages out of that window.
const DAYS = 14;
const now = new Date();
const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
const START = addDays(today, -DAYS);

// Daily resting HR (one reading per morning, small variance around 55 bpm).
for (let i = 0; i < DAYS; i++) {
  const ts = addMinutes(addDays(START, i), 5 * 60); // 05:00 UTC
  const bpm = 55 + ((i * 7) % 5) - 2; // 53..57
  rec({
    type: "HKQuantityTypeIdentifierRestingHeartRate",
    sourceName: "Apple Watch",
    unit: "count/min",
    startDate: fmt(ts),
    endDate: fmt(ts),
    value: String(bpm),
  });
}

// Nightly sleep: one InBed interval + one AsleepCore interval per night.
// Night N covers 22:00 of day N-1 to 06:00 of day N.
for (let i = 1; i < DAYS; i++) {
  const inBedStart = addMinutes(addDays(START, i - 1), 22 * 60); // 22:00 prev day
  const inBedEnd = addMinutes(addDays(START, i), 6 * 60); // 06:00 current
  const asleepStart = addMinutes(inBedStart, 15); // 22:15
  const asleepEnd = addMinutes(inBedEnd, -30); // 05:30
  rec({
    type: "HKCategoryTypeIdentifierSleepAnalysis",
    sourceName: "Apple Watch",
    startDate: fmt(inBedStart),
    endDate: fmt(inBedEnd),
    value: "HKCategoryValueSleepAnalysisInBed",
  });
  rec({
    type: "HKCategoryTypeIdentifierSleepAnalysis",
    sourceName: "Apple Watch",
    startDate: fmt(asleepStart),
    endDate: fmt(asleepEnd),
    value: "HKCategoryValueSleepAnalysisAsleepCore",
  });
}

// Three running workouts spread over two ISO weeks (days 1, 5, 10; 0-indexed).
const workoutDayIndices = [1, 5, 10] as const;
for (const dayIdx of workoutDayIndices) {
  const start = addMinutes(addDays(START, dayIdx), 8 * 60); // 08:00 UTC
  const end = addMinutes(start, 30);
  workout({
    workoutActivityType: "HKWorkoutActivityTypeRunning",
    duration: "30",
    durationUnit: "min",
    sourceName: "Apple Watch",
    startDate: fmt(start),
    endDate: fmt(end),
  });

  // HR samples every 30s during the workout; trending up to show positive drift.
  // First half ~140 bpm, second half ~155 bpm → ~10% drift (classified "high").
  for (let s = 0; s <= 30 * 60; s += 30) {
    const ts = addSeconds(start, s);
    const frac = s / (30 * 60);
    const baseline = 138 + frac * 18; // 138 → 156
    const jitter = ((s / 30) % 3) - 1; // -1, 0, +1
    const bpm = Math.round(baseline + jitter);
    rec({
      type: "HKQuantityTypeIdentifierHeartRate",
      sourceName: "Apple Watch",
      unit: "count/min",
      startDate: fmt(ts),
      endDate: fmt(ts),
      value: String(bpm),
    });
  }

  // Activity context for the workout window: steps, distance, active energy.
  rec({
    type: "HKQuantityTypeIdentifierStepCount",
    sourceName: "Apple Watch",
    unit: "count",
    startDate: fmt(start),
    endDate: fmt(end),
    value: "3600",
  });
  rec({
    type: "HKQuantityTypeIdentifierDistanceWalkingRunning",
    sourceName: "Apple Watch",
    unit: "km",
    startDate: fmt(start),
    endDate: fmt(end),
    value: "4.8",
  });
  rec({
    type: "HKQuantityTypeIdentifierActiveEnergyBurned",
    sourceName: "Apple Watch",
    unit: "kcal",
    startDate: fmt(start),
    endDate: fmt(end),
    value: "310",
  });

  // VO2Max reading around each workout.
  rec({
    type: "HKQuantityTypeIdentifierVO2Max",
    sourceName: "Apple Watch",
    unit: "ml/kg·min",
    startDate: fmt(addMinutes(end, 5)),
    endDate: fmt(addMinutes(end, 5)),
    value: String(46 + dayIdx * 0.1),
  });
}

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE HealthData [
<!ELEMENT HealthData (ExportDate?, Me?, Record*, Workout*)>
]>
<HealthData locale="en_GB">
${records.join("\n")}
${workouts.join("\n")}
</HealthData>
`;

writeFileSync(OUT, xml);
process.stdout.write(`wrote ${records.length} records + ${workouts.length} workouts → ${OUT}\n`);
